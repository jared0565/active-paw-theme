# Graphify — Zero-LLM Incremental Knowledge Graph Builder

Graphify scans any codebase and builds an interactive, explorable knowledge graph without calling a single LLM. It is deterministic, fast (~1s for a single-file change), and produces two primary artifacts:

1. **`graph.html`** — an interactive D3 force-directed graph you open in a browser
2. **`GRAPH_REPORT.md`** — a Markdown summary of communities, node counts, and file clusters

## Installation

Graphify lives inside this repo under the `graphify/` package. It requires Python 3.10+.

```bash
# 1. Install dependencies (NetworkX + python-louvain for community detection)
pip install networkx>=3.0 python-louvain>=0.16

# 2. Install the CLI entry point so `graphify` is on your PATH
pip install -e .
```

After `pip install -e .`, the `graphify` command is available globally in your environment.

## Quick Start

```bash
# Build the graph for the current directory
cd F:\Projects\Shopify\demo-store2
graphify build .

# Serve it locally and open http://localhost:8080/graph.html
graphify serve . -p 8080
```

Output lands in `<project>/graphify-out/`:

```
graphify-out/
  graph.json              # Raw node/edge/hyperedge data
  graph.html              # Interactive D3 visualization
  GRAPH_REPORT.md         # Human-readable community summary
  .graphify_manifest.json # SHA256 manifest for incremental builds
  .graphify_labels.json   # Auto-generated community labels
  .graphify_extraction.json # Last extraction snapshot
```

## CLI Commands

### `graphify build [PATH]`

Scans the project, extracts nodes/edges from every supported file, and incrementally updates the graph.

| Flag | Default | Description |
|---|---|---|
| `PATH` | `.` | Project root to scan |
| `-o, --output` | `<PATH>/graphify-out` | Output directory |
| `--semantic` | off | Add a TF-IDF file-similarity overlay (see below) |
| `--semantic-threshold` | `0.12` | Minimum cosine similarity to emit a semantic edge |
| `--semantic-top-n` | `4` | Max strongest semantic links kept per file |

**Examples:**
```bash
graphify build .                    # default output dir
graphify build /some/repo -o /tmp/g # custom output
graphify build . --semantic         # add the cross-file similarity overlay
python -m graphify build .          # via module invocation
```

### The semantic overlay (`--semantic`)

By default graphify only records relationships it can see *structurally* (a heading contains a sub-heading, a file imports a module, a doc mentions a file in backticks). It has no way to notice that two files are *about the same thing* when neither references the other.

`--semantic` adds a low-cost recall layer: it computes a TF-IDF vector over each file's full text (docs + source — `.md/.py/.js/.css/.liquid`; data/config JSON is excluded as noise) and links the most lexically-similar files with `semantically_similar_to` edges. This is implemented in `graphify/semantic.py` — pure Python, **0 LLM tokens, fully offline, deterministic**.

Design guarantees:
- **Additive and opt-in.** Without the flag, output is unchanged. The overlay only *adds* `semantically_similar_to` edges; it never touches `contains`/`imports`/`calls`.
- **Does not affect community detection.** Edges are injected *after* clustering, so the structural community map you rely on is never reshuffled by lexical noise. They render in `graph.html` (dashed amber) and are listed in `GRAPH_REPORT.md` under "Cross-cutting semantic links" (bucketed cross-area vs. same-area, with a per-file diversity cap so hub files don't flood the list).
- **Sparse by construction.** `--semantic-top-n` caps links per file; `--semantic-threshold` filters weak matches. Defaults yield ≈2–3 edges/file.
- **Refreshed only when requested.** A plain `build` leaves an existing overlay untouched; re-run with `--semantic` to recompute it.

**Honest limitation — similarity is not reasoning.** This recovers that two files are *related* (e.g. a CJ-import script and the collection-mapping design doc both discuss `ensure_collections`/`ruleSet`/`cj-cat`). It will surface that link as an edge in `graph.json` (searchable in `graph.html`), but it **cannot rank it as the *important* one** — a genuinely critical cross-file conflict and an incidental vocabulary overlap can score the same. Reasoning-grade conflict detection still needs an LLM pass. Use this layer for *discovery hints*, not as a substitute for that judgment.

Cost note: pairwise cosine is O(N²) in the number of files in the semantic corpus — negligible for hundreds of files; revisit (inverted index) for thousands.

### `graphify serve [PATH]`

Serves `graphify-out/graph.html` via a local HTTP server.

| Flag | Default | Description |
|---|---|---|
| `PATH` | `.` | Project root (looks for `graphify-out` inside it) |
| `-p, --port` | `8080` | Port to listen on |

```bash
graphify serve . -p 3000
```

## Architecture

Graphify has four core modules:

| Module | Responsibility |
|---|---|
| **`graphify/incremental.py`** | Orchestration: file discovery, manifest diffing, graph merge, community lifecycle |
| **`graphify/extractors.py`** | Deterministic parsers for Markdown, Python, CSS, and Liquid/JSON |
| **`graphify/graph.py`** | NetworkX graph I/O, Louvain community detection, consolidation, report/HTML generation |
| **`graphify/cli.py`** | `argparse` entry point for `build` and `serve` |

### The Incremental Pipeline (`incremental.py`)

1. **Discover** — walk the project root for all files matching registered extensions (`EXTRACTORS` keys).
2. **Skip** — ignore `.git`, `node_modules`, `__pycache__`, `*.tmp`, `*.log`, `dist`, `build`, and anything starting with `.`.
3. **Hash & Diff** — compare SHA256 of every file against `.graphify_manifest.json`. Only changed files are re-extracted.
4. **Surgical Remove** — for each changed file, delete all nodes whose `source_file` matches that file.
5. **Extract** — run the file-type-specific extractor to get `(nodes, edges, hyperedges)`.
6. **Inject** — add new nodes/edges into the existing NetworkX graph, deduping by `id` and `(source, target, relation)`.
7. **Prune Orphans** — remove code-type nodes that have zero edges (usually stale imports from removed files).
8. **Community Detection** — run Louvain only if >5% of the graph changed, a bridge node changed, or this is a cold start. Otherwise assign new nodes to their neighbors' communities.
9. **Consolidate** — merge communities smaller than 10 nodes into larger neighbors or a catch-all "misc" bucket.
10. **Label** — auto-name communities from dominant file prefixes (e.g., `sections/` → "Theme Sections", `docs/` → "Docs").
11. **Emit** — write `graph.json`, `graph.html`, `GRAPH_REPORT.md`, and update the manifest.

### Extractors (`extractors.py`)

Every extractor returns a 3-tuple: `(nodes, edges, hyperedges)`.

| File type | What it extracts | Relations created |
|---|---|---|
| **Markdown (`.md`)** | H1–H6 headings (as `rationale`/`concept` nodes), inline code file mentions (`sections/main-product.liquid`) | `contains`, `references`, `rationale_for`, `implements`, `conceptually_related_to`, plus hyperedge groups under H2s |
| **Python (`.py`)** | Functions, classes, methods; `import` / `from` dependencies; intra-file function calls | `contains`, `imports`, `calls` |
| **CSS (`.css`)** | Selectors (as `concept` nodes), `@media` / `@keyframes` blocks, CSS custom properties (`--var`) | `contains`, `in_media`, `in_keyframes`, `custom_property` |
| **Liquid/JSON (`.liquid`, `.json`)** | Block names, section settings, schema definitions, nested keys | `contains`, `configures` |

All extraction is pure regex/AST. No LLM. A typical file (<10 KB) extracts in well under 1ms; the largest files in a repo (tens of KB) take ~10–15ms, dominated by Python's own `ast.parse`. There are no quadratic hot paths — Python call-graph extraction uses a single-pass child→parent map, so cost scales linearly with file size.

#### Adding a new extractor

1. Add a function `def extract_mytype(path, content) -> Tuple[List, List, List]:` in `extractors.py`.
2. Register it in the `EXTRACTORS` dict at the bottom of the file:
   ```python
   EXTRACTORS = {
       ".md": extract_markdown,
       ".py": extract_python,
       ".css": extract_css,
       ".liquid": extract_liquid,
       ".json": extract_json,
       ".mytype": extract_mytype,
   }
   ```
3. Re-run `graphify build .`

### Graph & Community Logic (`graph.py`)

#### Community Detection

- **Algorithm:** Louvain modularity optimization via `python-louvain` (`community_louvain.best_partition`).
- **Trigger:** Recompute only when `changed_ratio > 0.05`, a bridge node was removed, or the graph is new.
- **Incremental fallback:** If recomputation is skipped, new nodes are assigned to the most common community among their neighbors.
- **Consolidation:** Communities with <10 nodes are merged into their largest neighbor or a `misc` bucket, then renumbered.

#### Bridge Score

A quick proxy for "how much does this node connect different communities?" Computed as the count of distinct community IDs among a node's neighbors. Used during incremental builds to decide whether community recomputation is needed.

#### HTML Output (`graph.html`)

A self-contained D3 v7 force-directed graph with:
- **Zoom & pan**
- **Search box** — filters nodes/links by label or ID
- **Community legend** — click a community to isolate it
- **Hover tooltips** — shows label, file type, source file, community ID
- **Node sizing** — `rationale` nodes (H1/H2) are largest, `concept` next, code nodes smallest

The file has zero external dependencies beyond the D3 CDN script.

## Reading the Outputs

### `graph.html` — Interactive Graph

1. Open it directly in a browser, or run `graphify serve .`
2. Nodes are colored by community.
3. Search for any file name, function, heading, or CSS class.
4. Click a community in the sidebar to fade out everything else — this is the fastest way to see "what lives together."
5. Drag nodes to reposition. Scroll to zoom.

### `GRAPH_REPORT.md` — Text Report

Contains:
- Total nodes, edges, and community count
- A section per community with:
  - Auto-generated label (e.g., "Theme Sections Code")
  - Top 3 node types (`code`, `concept`, `rationale`)
  - Top 5 source files

Use this for quick audits: "How big is the CSS surface?" → look for the community whose top type is `concept` and top files are `.css`.

## Data Model

### Node

```json
{
  "id": "sections_main_product_liquid_add_to_cart",
  "label": "add_to_cart",
  "file_type": "code",
  "source_file": "sections/main-product.liquid",
  "source_location": "L42",
  "community": 3
}
```

### Edge

```json
{
  "source": "sections_main_product_liquid",
  "target": "sections_main_product_liquid_add_to_cart",
  "relation": "contains",
  "confidence": "EXTRACTED",
  "weight": 1.0
}
```

### Hyperedge (group)

```json
{
  "id": "docs_design_improvements_md_entry_2_group",
  "label": "Group",
  "nodes": ["node_a", "node_b"],
  "relation": "participate_in",
  "confidence": "EXTRACTED"
}
```

## Tips for Large Repos

- The skip list in `incremental.py` (`SKIP_PATTERNS`) is your friend. Add `vendor/`, `coverage/`, or generated directories there.
- Community consolidation (`min_size=10`) prevents a thousand 1-node communities. Tune it in `graph.py` if your repo structure is very flat or very deep.
- The manifest is portable. You can copy `.graphify_manifest.json` to another machine and incremental builds will still work.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `ModuleNotFoundError: No module named 'community'` | `pip install python-louvain` |
| `graphify-out does not exist` | Run `graphify build .` before `serve` |
| No nodes from `.liquid` files | Ensure the file extension is exactly `.liquid` (case-sensitive on some OSes) |
| Communities look wrong after a big refactor | Delete `.graphify_manifest.json` and re-run `build` for a full cold start |

## Development

To run graphify without installing the package:

```bash
python -m graphify build .
```

To test extraction on a single file:

```python
from graphify.extractors import extract_file
from pathlib import Path

nodes, edges, hyperedges = extract_file(Path("docs/design-improvements.md"), Path("."))
print(len(nodes), len(edges))
```
