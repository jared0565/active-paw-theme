import json
import os
import random
import shutil
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from cj_client import get_token, request_json
from shopify_product import compare_price, handleize, money, retail_price

STORE = "4qkudm-ez.myshopify.com"
ROOT = Path(__file__).resolve().parent


def powershell_executable():
    """Absolute path to PowerShell (ruff S607: never start a process from a partial path)."""
    found = shutil.which("powershell")
    if not found:
        raise RuntimeError("powershell not found on PATH; this script drives the Shopify CLI through PowerShell")
    return os.path.abspath(found)  # which() can answer relative to the cwd on Windows
KEYWORDS = ["pet grooming", "dog grooming", "pet brush", "dog bath", "pet cleaning"]
MAX_PRODUCTS = 10
MAX_ATTEMPTS = 24


def strip_dashes(s):
    """Em-dash / en-dash / horizontal-bar -> hyphen. CJ supplier copy frequently
    contains these; strip on ingest so imported descriptions never reintroduce them
    (no-em-dash rule). chr() keeps the source ASCII-clean."""
    if not s:
        return s
    for cp in (0x2014, 0x2013, 0x2015):
        s = s.replace(chr(cp), "-")
    return s


def clean_description(detail):
    description = detail.get("description")
    if description:
        html = (
            "<div class=\"cj-description\">"
            + description
            + "<p><strong>Supplier:</strong> CJ Dropshipping. This product is imported for demo-store dropshipping testing and should be monitored for inventory, price, and listing status before paid traffic is scaled.</p>"
            + "</div>"
        )
    else:
        html = (
            f"<p>{detail.get('productNameEn', 'CJ pet grooming product')} imported from CJ Dropshipping for demo-store testing.</p>"
            "<ul><li>Configured with supplier SKU and CJ product identifiers.</li><li>Suitable for product-page, bundle, and paid-ad landing page testing.</li></ul>"
        )
    return strip_dashes(html)


def run_shopify(query_file, variables, label):
    var_file = ROOT / f".tmp-cj-{label}.json"
    out_file = ROOT / f".tmp-cj-{label}-out.json"
    var_file.write_text(json.dumps(variables, ensure_ascii=False), encoding="utf-8")
    env_prefix = (
        "$env:SHOPIFY_CLI_AGENT_INFO='n:codex|v:1|p:openai'; "
        "$env:SHOPIFY_CLI_AGENT_IDS='s:55406e8c-167a-451a-9ceb-c1ab1849ba0f|r:import-cj-products|i:codex-desktop'; "
    )
    cmd = (
        env_prefix
        + f"shopify store execute --store {STORE} --query-file {query_file} "
        + f"--variable-file {var_file.name} --allow-mutations --json --output-file {out_file.name}"
    )
    completed = subprocess.run(  # noqa: S603 - argv is fixed; the command string is built from module constants and local temp-file names, never from user input
        [powershell_executable(), "-NoProfile", "-Command", cmd],
        cwd=ROOT,
        text=True,
        capture_output=True,
        timeout=160,
        check=False,
    )
    if completed.returncode != 0:
        print(completed.stdout)
        print(completed.stderr, file=sys.stderr)
        raise RuntimeError(f"Shopify command failed for {label}")
    return json.loads(out_file.read_text(encoding="utf-8"))


def find_candidates(token):
    found = {}
    for keyword in KEYWORDS:
        pages = list(range(1, 8))
        random.shuffle(pages)
        for page in pages[:3]:
            params = urllib.parse.urlencode({"page": page, "size": 20, "keyWord": keyword})
            response = request_json(
                f"https://developers.cjdropshipping.com/api2.0/v1/product/listV2?{params}",
                headers={"CJ-Access-Token": token},
            )
            blocks = response.get("data", {}).get("content") or []
            for block in blocks:
                for product in block.get("productList", []):
                    if product.get("saleStatus") == "3" and product.get("id"):
                        found[product["id"]] = product
            time.sleep(1.05)
    candidates = list(found.values())
    random.shuffle(candidates)
    return candidates


def fetch_detail(token, product_id):
    detail = request_json(
        f"https://developers.cjdropshipping.com/api2.0/v1/product/query?pid={urllib.parse.quote(product_id)}",
        headers={"CJ-Access-Token": token},
    )
    time.sleep(1.05)
    if not detail.get("result") or not detail.get("data"):
        return None
    return detail["data"]


def create_product(detail, index):
    variants = detail.get("variants") or []
    variants = [variant for variant in variants if variant.get("variantSku")][:20]
    if not variants:
        return None
    title = detail.get("productNameEn") or detail.get("entryNameEn") or f"CJ Pet Product {index}"
    option_values = []
    seen_options = set()
    for variant in variants:
        option = variant.get("variantKey") or variant.get("variantNameEn") or variant["variantSku"]
        option = str(option)[:255]
        if option not in seen_options:
            option_values.append({"name": option})
            seen_options.add(option)
    handle = f"{handleize(title)}-{str(detail.get('pid'))[-6:]}"
    product_payload = {
        "title": title,
        "handle": handle,
        "status": "ACTIVE",
        "vendor": "CJ Dropshipping",
        "productType": "Pet grooming dropship",
        "descriptionHtml": clean_description(detail),
        "tags": [
            "cj-dropshipping",
            "cj-monitor",
            "pet-grooming",
            f"cj-pid-{detail.get('pid')}",
        ],
        "productOptions": [{"name": "Specification", "values": option_values}],
    }
    created = run_shopify("product-create.graphql", {"product": product_payload}, f"create-{index}")
    payload = created["productCreate"]
    if payload["userErrors"]:
        raise RuntimeError(payload["userErrors"])
    product = payload["product"]
    product_id = product["id"]
    try:
        first_variant_id = product["variants"]["nodes"][0]["id"]
        first = variants[0]
        first_price = retail_price(first)
        first_update = {
            "productId": product_id,
            "variants": [
                {
                    "id": first_variant_id,
                    "price": first_price,
                    "compareAtPrice": compare_price(first_price),
                    "mediaSrc": [first.get("variantImage") or detail.get("bigImage")],
                    "inventoryItem": {"sku": first["variantSku"], "tracked": True},
                    "metafields": [
                        {"namespace": "cjd", "key": "product_id", "type": "single_line_text_field", "value": str(detail.get("pid"))},
                        {"namespace": "cjd", "key": "variant_id", "type": "single_line_text_field", "value": str(first.get("vid"))},
                        {"namespace": "cjd", "key": "variant_sell_price", "type": "number_decimal", "value": money(first.get("variantSellPrice"), 0)},
                    ],
                }
            ],
        }
        updated = run_shopify("product-variants-update.graphql", first_update, f"update-{index}")
        if updated["productVariantsBulkUpdate"]["userErrors"]:
            raise RuntimeError(updated["productVariantsBulkUpdate"]["userErrors"])
        remaining = []
        for variant in variants[1:]:
            price = retail_price(variant)
            remaining.append(
                {
                    "optionValues": [
                        {
                            "name": str(variant.get("variantKey") or variant.get("variantNameEn") or variant["variantSku"])[:255],
                            "optionName": "Specification",
                        }
                    ],
                    "price": price,
                    "compareAtPrice": compare_price(price),
                    "mediaSrc": [variant.get("variantImage") or detail.get("bigImage")],
                    "inventoryItem": {"sku": variant["variantSku"], "tracked": True},
                    "metafields": [
                        {"namespace": "cjd", "key": "product_id", "type": "single_line_text_field", "value": str(detail.get("pid"))},
                        {"namespace": "cjd", "key": "variant_id", "type": "single_line_text_field", "value": str(variant.get("vid"))},
                        {"namespace": "cjd", "key": "variant_sell_price", "type": "number_decimal", "value": money(variant.get("variantSellPrice"), 0)},
                    ],
                }
            )
        if remaining:
            created_variants = run_shopify(
                "product-variants-create.graphql",
                {"productId": product_id, "variants": remaining},
                f"variants-{index}",
            )
            if created_variants["productVariantsBulkCreate"]["userErrors"]:
                raise RuntimeError(created_variants["productVariantsBulkCreate"]["userErrors"])
    except Exception:
        run_shopify("product-delete-variable.graphql", {"input": {"id": product_id}}, f"rollback-{index}")
        raise
    return {"title": title, "handle": product["handle"], "variants": len(variants), "cjProductId": detail.get("pid")}


def main():
    token = get_token()
    candidates = find_candidates(token)
    imported = []
    used_titles = set()
    attempts = 0
    for candidate in candidates:
        if len(imported) >= MAX_PRODUCTS:
            break
        attempts += 1
        if attempts > MAX_ATTEMPTS:
            break
        detail = fetch_detail(token, candidate["id"])
        if not detail:
            continue
        title = detail.get("productNameEn")
        if not title or title in used_titles:
            continue
        used_titles.add(title)
        try:
            result = create_product(detail, len(imported) + 1)
        except Exception as error:  # noqa: BLE001 - batch import: record the failure for the summary and carry on with the next product
            print(f"Skipped {title}: {error}", file=sys.stderr)
            continue
        if result:
            imported.append(result)
            print(f"Imported {result['title']} ({result['variants']} variants)")
    (ROOT / "cj-import-summary.json").write_text(json.dumps(imported, indent=2), encoding="utf-8")
    print(json.dumps(imported, indent=2))


if __name__ == "__main__":
    main()
