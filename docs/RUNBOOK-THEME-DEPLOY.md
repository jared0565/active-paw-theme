# Runbook: changing the live theme

`shopify-deploy` is the single live branch. Shopify's GitHub integration deploys every push to it, so a merge into that branch is a deploy and a revert on it is a rollback. Set by the owner on 2026-09-19 (PRD decision 5a, `docs/theme-production-grade-prd.md`); first release `release-2026-09-19-1`, merge `c1e2d93`.

Agents open pull requests. The owner merges. Nobody pushes the live theme with the CLI.

## 0. One-time setup on a machine

1. Fresh clone: `npm install`, then `python -P bootstrap-agent-tooling.py` (arms the Aramid and Graphite hooks; see `CLAUDE.md`, "Fresh clone").
2. Shopify CLI 4.8.0 (`npm install -g @shopify/cli@4.8.0`). The first `shopify theme list` asks for a device-code login, which only a person can complete. `shopify theme check` needs no login.

## 1. Start a change

```sh
git switch shopify-deploy
git pull
git switch -c <type>/<short-slug>      # feat/, fix/, docs/, chore/
```

Pull first: Theme Editor edits on live come back as "Update from Shopify" commits on `shopify-deploy`, and `config/settings_data.json` lives there.

## 2. Edit and run the fast checks locally

The same three checks CI runs on every push (`.github/workflows/theme-ci.yml`):

```sh
npx eslint .
shopify theme check --fail-level error
python -m unittest discover -s tests -t .
```

Then `aramid check --staged` before committing. Never pass `--no-verify` to git; armed repos reject it, and it would switch off the secret scan.

Every code change gets an entry in `docs/design-improvements.md` (what, why, how, verification). A change that touches a worker touchpoint also updates `docs/theme-worker-contract.md` and is announced on the agent channel.

## 3. Preview the change on an unpublished theme

```sh
shopify theme push --unpublished --theme "preview/<branch>" --json
```

The JSON answer carries the theme `id` and a `preview_url`. Look at the pages you changed there. Then run the independence check against that theme, both modes:

```sh
PREVIEW_THEME_ID=<id> node tests/independence.cjs
BLOCK=0 PREVIEW_THEME_ID=<id> node tests/independence.cjs
```

The script visits `?preview_theme_id=<id>` once to set Shopify's preview cookie and then asserts `Shopify.theme.id` on every page, so a run that silently fell back to live fails. Blocked mode must end with 0 hard failures. Results: `output/playwright/independence-<mode>.json` and one screenshot per page.

Delete the preview once the pull request is merged: `shopify theme delete --theme <id> --force`. Preview themes are the only theme copies an agent creates; anything else in the theme list is the owner's.

## 4. Pull request

```sh
git push -u origin <branch>
gh pr create --base shopify-deploy
```

The pull request says what changed, why, and what was verified on the preview (theme id, independence results). CI must be green. The owner merges with a merge commit; that merge is the deploy.

## 5. After the merge: verify and tag

Shopify redeploys within about a minute of the push. Check, in this order:

1. CI on `shopify-deploy` is green (`gh run list --branch shopify-deploy --limit 1`).
2. Live equals the branch. Either pull live over a clean worktree of the merge commit and expect an empty status:
   ```sh
   git worktree add --detach /tmp/live-check shopify-deploy
   shopify theme pull --live --path /tmp/live-check --force
   git -C /tmp/live-check status --porcelain     # empty = identical
   git worktree remove --force /tmp/live-check
   ```
   or compare one changed file's `checksumMd5` from the Admin API with its local md5. Compiled assets (`assets/manifest.json` from `manifest.json.liquid`) are not written by the pull and are not a difference.
3. Independence run against live: `node tests/independence.cjs` (blocked mode, 0 hard failures expected; 2026-09-19 baseline 71 of 72, the informational affiliate page being the one non-pass).
4. Tag the release and push the tag:
   ```sh
   git tag -a release-<yyyy-mm-dd>-<n> <merge-sha> -m "<one line>"
   git push origin release-<yyyy-mm-dd>-<n>
   ```

## 6. Rollback

A rollback is a revert of the deployed merge, pushed to the same branch:

```sh
git switch -c fix/revert-<slug> shopify-deploy
git revert -m 1 <merge-sha>
git push -u origin fix/revert-<slug>
gh pr create --base shopify-deploy
```

The owner merges; Shopify redeploys the previous content; tag it (`release-<date>-<n>`). In an emergency the same revert may be committed on `shopify-deploy` and pushed directly, then written up in `docs/design-improvements.md`.

Rehearsed 2026-09-19: `git revert -m 1 --no-commit c1e2d93` in a throwaway worktree produced a tree identical to the pre-merge branch tip `994d44a` (14 theme files would change).

**Never revert `c1e2d93` itself.** Before that merge the branch held stale June sync-backs, not what was live, so reverting it would deploy old content. The rollback target for the first release is the tag `release-2026-09-19-1`, whose tree is what was live. From that tag onward the branch and live are equal, so reverting any later merge restores the previous live state.

## 7. Things that do not happen

- `shopify theme push --live` or `--allow-live`. The CLI pushes only to unpublished preview themes.
- Editing live in Shopify's code editor, except in an emergency, and then the branch is pulled straight after.
- Deleting or publishing any theme other than a preview an agent created.
- `git push --force` to `shopify-deploy`, or rewriting a tagged commit.

## 8. Where things are

- CI: `.github/workflows/theme-ci.yml` (fast checks). The pull-request preview job and the post-deploy run are PRD task T5 and need a Theme Access token in the repository secrets (T4).
- Independence check: `tests/independence.cjs`.
- Contract with the worker: `docs/theme-worker-contract.md`.
- Programme and task list: `docs/theme-production-grade-prd.md`.
- `theme dev` troubleshooting: `docs/shopify-theme-dev-troubleshooting.md`.
