# Shopify `theme dev` troubleshooting (Windows + Claude Code)

A reference for recurring issues hit while running `shopify theme dev` to verify theme changes
locally. **Read the "Fast path" for each issue and act - do not re-diagnose from scratch.**

---

## Issue 1 - "Failed to Upload Theme Files" / `*.tmp.<pid>.<hash>` sync errors

### Symptom
- Pages served by the dev server return **HTTP 500** and/or the page `<title>` is
  **"Failed to Upload Theme Files"**.
- The `theme dev` log shows lines like:
  ```
  Failed to upload file "sections/main-cart.liquid.tmp.83764.6b7d79d54ea1" to remote theme.
  "sections/...liquid.tmp.83764.6b7d79d54ea1" contains illegal characters
  Failed to delete file "sections/...liquid.tmp.83764.6b7d79d54ea1" from remote theme.
  ```
- It appears **right after editing a theme file** (via Claude Code's Edit/Write).
- `Glob **/*.tmp.*` finds **nothing on disk** (the temp files are transient).

### Root cause (confirmed - do not re-investigate)
Claude Code's Edit/Write performs **atomic writes** via a temp file named
`<path>.tmp.<pid>.<hash>`, then renames it to the real file. The `shopify theme dev` **file
watcher** catches that temp file in the split second before the rename and tries to sync it to
the remote dev theme. Shopify rejects the name (`.tmp.<pid>.<hash>` "contains illegal
characters" / "must have a .liquid extension"), which **wedges the sync** and makes the dev
server serve its error overlay.

- The `<pid>` in the temp filename is the **`claude.exe`** process (verified:
  `Get-Process -Id <pid>` → `claude.exe`). **NEVER kill that PID - it is Claude Code itself.**
- **Your real edit still syncs fine.** The same log shows `Synced » update sections/<file>.liquid`
  next to the temp-file errors. The wedge is the leftover failed temp upload, not your change.

### Fast path (resolution - ~2 commands, minimal tokens)
1. Finish **all** edits first (don't edit again until after verifying).
2. Restart the dev server - kill **only** the `node` process on port 9292 (never `claude.exe`):
   ```powershell
   $c = Get-NetTCPConnection -LocalPort 9292 -State Listen -ErrorAction SilentlyContinue
   if ($c) { $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
     if ($p.ProcessName -eq 'node') { Stop-Process -Id $c.OwningProcess -Force } }
   ```
3. Start fresh (run in background):
   ```
   shopify theme dev --store 4qkudm-ez.myshopify.com
   ```
4. Wait for readiness + verify with a **cheap curl**, not Playwright:
   ```bash
   curl -s http://127.0.0.1:9292/products/<handle> | grep -ioE "Failed to Upload|<title>[^<]*</title>"
   ```
   A real `<title>` (no "Failed to Upload") = healthy.

### Prevention (the real fix - saves the most tokens)
**Batch every edit, then start/restart `theme dev` ONCE for verification.** Do not edit files
while the watcher is running. Workflow:
1. Make all Liquid/JS/CSS edits.
2. `shopify theme check` (catches syntax/Liquid-schema only - see Issue 3).
3. Start `theme dev`, verify in browser.
4. If another edit is needed → edit → **restart** `theme dev` (one restart per edit-batch).

---

## Issue 2 - `theme dev` asks for device-code login even though `theme list` worked earlier

### Symptom
```
To run this command, log in to Shopify.
User verification code: XXXX-XXXX
👉 Open this link to start the auth process: https://accounts.shopify.com/activate-with-code?...
```

### Root cause
The CLI session token **expired** between commands. A cached token can satisfy `theme list`
and then lapse before `theme dev`.

### Fast path
This is **user-action-required** - the agent cannot complete a browser OAuth. Surface the code +
link to the user and wait. Device codes are short-lived (~15 min); if it expires, restart the
command to get a fresh one. Once the user approves, `theme dev` proceeds automatically.

---

## Issue 3 - Linters pass but the page is broken at runtime

`node --check` (JS syntax) and `shopify theme check` (Liquid/schema lint) **do not** catch:
- render-time Liquid errors (e.g. literal `{` `}` in a `{{ }}` tag → 500 on every page), or
- runtime behaviour (AJAX, JSON-LD validity, invalid HTML like `<input min="1" max="0">` that
  silently blocks form submit).

**Always do a runtime pass** for behaviour-bearing changes:
- Cheap: `curl` the page and check status + `<title>`; pipe JSON-LD through `JSON.parse` in Node.
- Full: drive `theme dev` with Playwright (see the cart-drawer verification in the git history).

---

## Notes
- `theme dev` syncs to the **development theme**, never the live theme. Deploy with
  `shopify theme push`.
- Store handle: `4qkudm-ez.myshopify.com`. Dev server: `http://127.0.0.1:9292`.
