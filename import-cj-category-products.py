import json
import re
import shutil
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from cj_client import get_token, request_json
from shopify_product import compare_price, handleize, money, retail_price
from store_collections import COLLECTION_TITLES

STORE = "4qkudm-ez.myshopify.com"
ROOT = Path(__file__).resolve().parent


def powershell_executable():
    """Absolute path to PowerShell (ruff S607: never start a process from a partial path)."""
    found = shutil.which("powershell")
    if not found:
        raise RuntimeError("powershell not found on PATH; this script drives the Shopify CLI through PowerShell")
    return found

SELECTED_PRODUCTS = {
    "Pet Cleaning": [
        "1734496117636734976",
        "1436180227997962240",
        "1463810602089713664",
        "1635691225099546624",
        "1562348087937609728",
        "1648989475315396608",
        "A5D4CFCB-54E5-49D3-87B0-C7BE58354A51",
        "1561538210651066368",
    ],
    "Pet Accessories": [
        "1417723948015161344",
        "68587288-7F2C-49B8-9295-EB25914CE320",
        "1595721401296760832",
        "1637037130746703872",
        "1585221163377242112",
    ],
    "Pet Health": [
        "1621435150108209152",
        "08C75E5E-6350-47A2-8163-82AD49C772A2",
        "1657574694545412096",
        "1C312ACB-FA91-43A3-89C8-7FE714F8AC59",
        "60C670D0-C6AD-4DD8-B244-48C3E0407CC3",
        "1778298416737562624",
    ],
    "Pet Toys": [
        "1593481438610075648",
        "99ADDD0C-1658-4620-8BE2-80C3339D29F3",
        "582CB98C-B3E2-419E-8D2D-0BACDEEF4ABD",
        "1532624040173776896",
        "1448199534130892800",
        "1634099836821712896",
        "F50D3B82-7E7C-48C9-97B6-1BD9A040AFF9",
    ],
}

CATEGORY_META = {
    "Pet Cleaning": {
        "tag": "cj-cat-pet-cleaning",
        "type": "Pet cleaning",
    },
    "Pet Accessories": {
        "tag": "cj-cat-pet-accessories",
        "type": "Pet accessories",
    },
    "Pet Health": {
        "tag": "cj-cat-pet-health",
        "type": "Pet health",
    },
    "Pet Toys": {
        "tag": "cj-cat-pet-toys",
        "type": "Pet toys",
    },
}

COLLECTION_RULES = [
    {
        "title": COLLECTION_TITLES["pet-cleaning"],
        "handle": "pet-cleaning",
        "descriptionHtml": "<p>Bathing, wipes, towels, brushes, and cleaning essentials for everyday pet care.</p>",
        "tag": "cj-cat-pet-cleaning",
    },
    {
        "title": COLLECTION_TITLES["pet-accessories"],
        "handle": "pet-accessories",
        "descriptionHtml": "<p>Walking, harness, leash, travel, and utility accessories for pet owners.</p>",
        "tag": "cj-cat-pet-accessories",
    },
    {
        "title": COLLECTION_TITLES["pet-health"],
        "handle": "pet-health",
        "descriptionHtml": "<p>Dental, nail, paw, and health-support products for daily pet wellness routines.</p>",
        "tag": "cj-cat-pet-health",
    },
    {
        "title": COLLECTION_TITLES["pet-toys"],
        "handle": "pet-toys",
        "descriptionHtml": "<p>Interactive, chew, puzzle, and enrichment toys for dogs and cats.</p>",
        "tag": "cj-cat-pet-toys",
    },
    {
        "title": COLLECTION_TITLES["more-to-love"],
        "handle": "more-to-love",
        "descriptionHtml": "<p>A broad discovery collection for products worth testing in campaigns.</p>",
        "tag": "cj-monitor",
    },
]


def clean_title(value):
    title = re.sub(r"\s+", " ", value or "").strip()
    title = re.sub(r"\b(Pet Products|Pet Supplies|Pets Supplies)\b", "", title, flags=re.IGNORECASE).strip()
    return title[:180] or "CJ Pet Product"


def strip_dashes(s):
    """Em-dash / en-dash / horizontal-bar -> hyphen. CJ supplier copy frequently
    contains these; strip on ingest so imported descriptions never reintroduce them
    (no-em-dash rule). chr() keeps the source ASCII-clean."""
    if not s:
        return s
    for cp in (0x2014, 0x2013, 0x2015):
        s = s.replace(chr(cp), "-")
    return s


def clean_description(detail, category):
    description = detail.get("description")
    if description:
        html = "<div class=\"cj-description\">" + description + "</div>"
    else:
        html = (
            f"<p>{clean_title(detail.get('productNameEn') or detail.get('entryNameEn'))} - a practical {category.lower()} pick for happier, healthier pets.</p>"
            "<ul><li>Everyday-use pet product.</li><li>Pairs well with matching grooming and cleaning essentials.</li></ul>"
        )
    return strip_dashes(html)


def run_shopify(query_file, variables=None, label="run", mutation=False):
    args = [
        "shopify",
        "store",
        "execute",
        "--store",
        STORE,
        "--query-file",
        query_file,
        "--json",
        "--output-file",
        f".tmp-cj-category-{label}.json",
    ]
    if variables is not None:
        variable_file = ROOT / f".tmp-cj-category-{label}-vars.json"
        variable_file.write_text(json.dumps(variables, ensure_ascii=False), encoding="utf-8")
        args.extend(["--variable-file", variable_file.name])
    if mutation:
        args.append("--allow-mutations")
    command = (
        "$env:SHOPIFY_CLI_AGENT_INFO='n:codex|v:1|p:openai'; "
        "$env:SHOPIFY_CLI_AGENT_IDS='s:55406e8c-167a-451a-9ceb-c1ab1849ba0f|r:import-cj-category-products|i:codex-desktop'; "
        + " ".join(args)
    )
    completed = subprocess.run(  # noqa: S603 - argv is fixed; the command string is built from module constants and local temp-file names, never from user input
        [powershell_executable(), "-NoProfile", "-Command", command],
        cwd=ROOT,
        text=True,
        capture_output=True,
        timeout=180,
        check=False,
    )
    if completed.returncode != 0:
        print(completed.stdout)
        print(completed.stderr, file=sys.stderr)
        raise RuntimeError(f"Shopify command failed for {label}")
    return json.loads((ROOT / f".tmp-cj-category-{label}.json").read_text(encoding="utf-8"))


def fetch_detail(token, product_id):
    response = request_json(
        f"https://developers.cjdropshipping.com/api2.0/v1/product/query?pid={urllib.parse.quote(product_id)}",
        headers={"CJ-Access-Token": token},
    )
    time.sleep(1.05)
    if not response.get("result") or not response.get("data"):
        return None
    return response["data"]


def existing_product_ids():
    result = run_shopify("inspect-products-taxonomy.graphql", label="existing")
    ids = set()
    titles = set()
    for product in result["products"]["nodes"]:
        titles.add(product["title"].lower())
        for tag in product.get("tags") or []:
            if tag.startswith("cj-pid-"):
                ids.add(tag.removeprefix("cj-pid-"))
    return ids, titles


def ensure_collections():
    existing = {
        item["handle"]: item
        for item in run_shopify("list-home-collections.graphql", label="list-collections")["collections"]["nodes"]
    }
    for collection in COLLECTION_RULES:
        payload = {
            "title": collection["title"],
            "handle": collection["handle"],
            "descriptionHtml": collection["descriptionHtml"],
            "ruleSet": {
                "appliedDisjunctively": False,
                "rules": [{"column": "TAG", "relation": "EQUALS", "condition": collection["tag"]}],
            },
        }
        if collection["handle"] in existing:
            payload["id"] = existing[collection["handle"]]["id"]
            result = run_shopify("collection-update.graphql", {"input": payload}, f"update-{collection['handle']}", True)
            errors = result["collectionUpdate"]["userErrors"]
        else:
            result = run_shopify("collection-create.graphql", {"input": payload}, f"create-{collection['handle']}", True)
            errors = result["collectionCreate"]["userErrors"]
        if errors:
            raise RuntimeError(errors)
        print(f"Collection ready: {collection['title']}")


def create_product(detail, category, index):
    variants = [variant for variant in (detail.get("variants") or []) if variant.get("variantSku")][:20]
    if not variants:
        return None

    title = clean_title(detail.get("productNameEn") or detail.get("entryNameEn"))
    meta = CATEGORY_META[category]
    option_values = []
    seen_options = set()
    for variant in variants:
        option = str(variant.get("variantKey") or variant.get("variantNameEn") or variant["variantSku"])[:255]
        if option not in seen_options:
            option_values.append({"name": option})
            seen_options.add(option)

    product_payload = {
        "title": title,
        "handle": f"{handleize(title)}-{str(detail.get('pid'))[-6:]}",
        "status": "ACTIVE",
        "vendor": "Active Paw",
        "productType": meta["type"],
        "descriptionHtml": clean_description(detail, category),
        "tags": [
            "cj-monitor",
            "cj-best-seller-proxy",
            meta["tag"],
            f"cj-pid-{detail.get('pid')}",
        ],
        "productOptions": [{"name": "Specification", "values": option_values}],
    }
    created = run_shopify("product-create.graphql", {"product": product_payload}, f"create-{index}", True)
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
                    "compareAtPrice": compare_price(first_price, 1.28),
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
        updated = run_shopify("product-variants-update.graphql", first_update, f"update-{index}", True)
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
                    "compareAtPrice": compare_price(price, 1.28),
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
            bulk = run_shopify(
                "product-variants-create.graphql",
                {"productId": product_id, "variants": remaining},
                f"variants-{index}",
                True,
            )
            if bulk["productVariantsBulkCreate"]["userErrors"]:
                raise RuntimeError(bulk["productVariantsBulkCreate"]["userErrors"])
    except Exception:
        run_shopify("product-delete-variable.graphql", {"input": {"id": product_id}}, f"rollback-{index}", True)
        raise

    return {"title": title, "handle": product["handle"], "category": category, "variants": len(variants), "cjProductId": detail.get("pid")}


def main():
    ensure_collections()
    token = get_token()
    known_ids, known_titles = existing_product_ids()
    imported = []
    skipped = []
    index = 1

    for category, product_ids in SELECTED_PRODUCTS.items():
        for product_id in product_ids:
            if product_id in known_ids:
                skipped.append({"id": product_id, "category": category, "reason": "existing CJ product id"})
                continue
            detail = fetch_detail(token, product_id)
            if not detail:
                skipped.append({"id": product_id, "category": category, "reason": "detail unavailable"})
                continue
            title = clean_title(detail.get("productNameEn") or detail.get("entryNameEn"))
            if title.lower() in known_titles:
                skipped.append({"id": product_id, "category": category, "reason": "existing title"})
                continue
            try:
                result = create_product(detail, category, index)
            except Exception as error:  # noqa: BLE001 - batch import: record the failure for the summary and carry on with the next product
                skipped.append({"id": product_id, "category": category, "reason": str(error)})
                print(f"Skipped {product_id}: {error}", file=sys.stderr)
                continue
            if result:
                imported.append(result)
                known_ids.add(product_id)
                known_titles.add(result["title"].lower())
                print(f"Imported {result['title']} -> {category} ({result['variants']} variants)")
                index += 1

    summary = {"imported": imported, "skipped": skipped}
    (ROOT / "cj-category-import-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
