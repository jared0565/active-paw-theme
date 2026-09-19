"""Catalog dash scrub. DRY by default; pass --apply to write via Admin API.
Replaces em-dash (U+2014), en-dash (U+2013), and horizontal bar (U+2015) -> hyphen
in product title, descriptionHtml, and SEO description (matches the worker's
sanitizeOutbound and the import strip_dashes; all read as an AI tell)."""
import sys

import shopify_admin as sa

DASHES = (0x2014, 0x2013, 0x2015)  # em, en, horizontal bar
APPLY = "--apply" in sys.argv


def fix(s):
    if not s:
        return s, False
    n = s
    for cp in DASHES:
        n = n.replace(chr(cp), "-")
    return n, (n != s)


Q = """query($c:String){ products(first:100, after:$c){
  pageInfo{ hasNextPage endCursor }
  nodes{ id title descriptionHtml seo{ description } }
} }"""

# API 2026-04: productUpdate takes `product: ProductUpdateInput!` (the legacy
# `input: ProductInput!` arg was removed). Verified by introspection 2026-06-23.
M = """mutation($product: ProductUpdateInput!){
  productUpdate(product:$product){ product{ id } userErrors{ field message } }
}"""

def main():
    cursor = None
    total = 0
    affected = []
    while True:
        r = sa.admin_graphql(Q, {"c": cursor})
        p = r["products"]
        for n in p["nodes"]:
            total += 1
            t, tc = fix(n.get("title"))
            d, dc = fix(n.get("descriptionHtml"))
            seo = (n.get("seo") or {}).get("description")
            s2, sc = fix(seo)
            if tc or dc or sc:
                affected.append((n["id"], n.get("title"), tc, dc, sc))
                if APPLY:
                    inp = {"id": n["id"]}
                    if tc:
                        inp["title"] = t
                    if dc:
                        inp["descriptionHtml"] = d
                    if sc:
                        inp["seo"] = {"description": s2}
                    res = sa.admin_graphql(M, {"product": inp})
                    errs = res["productUpdate"]["userErrors"]
                    if errs:
                        print("ERR", n["id"], errs)
        if not p["pageInfo"]["hasNextPage"]:
            break
        cursor = p["pageInfo"]["endCursor"]

    print(f"total={total}  affected={len(affected)}  (title/desc/seo per row)")
    for a in affected[:80]:
        print(f"  - title_dash={a[2]} desc_dash={a[3]} seo_dash={a[4]} :: {a[1][:60]}")
    print("APPLIED (catalog written)" if APPLY else "DRY RUN (no writes made)")


if __name__ == "__main__":
    main()
