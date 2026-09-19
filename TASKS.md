# Active Paw Task Backlog

The current programme is **production-grade and independent of PawScout**, set by the owner on 2026-09-18. Its survey, PRD, phased task list and open questions live in [docs/theme-production-grade-prd.md](docs/theme-production-grade-prd.md); that file is the task list. Do not add duplicate items here.

## Retired items (kept for history)

- ~~Build themed blog + RSS + Pinterest traffic channel.~~ The blog channel is live: `templates/article.json` and `templates/blog.json` since 2026-07-07, articles authored by the worker and published by the owner at `/blogs/guides`. See [Blog + RSS + Pinterest Traffic PRD](docs/blog-rss-pinterest-traffic-prd.md) for what was planned; RSS and Pinterest were not built and are not scheduled.
- ~~Design and build Supplier Intelligence Platform for Shopify.~~ Superseded by the PawScout worker, which is the sole operational Shopify integration (see `CLAUDE.md`, "Python scripts"). The [Supplier Intelligence Platform PRD](docs/supplier-intelligence-platform-prd.md) stays as the design record; its implementation sequence (CJ sync, availability audit fields, import gating, draft-only import, approved-products search) shipped inside the worker.
- ~~Evaluate whether MCP is useful later.~~ Both repos expose Graphite and Aramid over MCP; no further evaluation is pending.
