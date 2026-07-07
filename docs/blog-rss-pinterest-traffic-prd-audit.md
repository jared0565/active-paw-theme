# Audit & Revised Architecture: Blog + RSS + Pinterest Traffic Channel

Companion to `blog-rss-pinterest-traffic-prd.md`. Written 2026-07-07 after the
owner asked for the feature to be **fully automated with two agents** (one that
creates blog posts, one that pushes them to Pinterest "or whatever platform is
determined later"). Audits the existing PRD against that requirement and against
the patterns already established in `pawscout-worker`, then proposes a concrete
architecture. No code written yet - this is a design document.

---

## Bottom line up front

**The PRD is not wrong; it is incomplete for the new requirement. Do not rewrite
it as automation-first. Extend it.**

The PRD's "manual v1" describes the *vessel* - a themed blog that renders
on-brand, with correct OG images and share behaviour. That vessel must exist
before any automation has somewhere to write, and its correctness is
independent of who writes the posts. **Keep 100% of the PRD's theme work
unchanged.** The automation is purely additive and lives entirely in the worker.

**The single most important recommendation:** do **NOT** auto-publish
AI-written articles. Auto-*draft* them; require a human to review and press
publish; let syndication trigger *off the publish event*. This is not timidity -
it is the only design that (a) matches every other AI surface in this project,
(b) makes the fabrication risk tolerable for permanent public content, and (c)
makes the "publish agent" trivially correct because it only ever sees real,
live, human-approved articles. Details in Q3 below.

If the owner reads only one paragraph, it is that one.

---

## What the PRD got right (preserve as-is)

- **Theme-only vessel.** The blog/article templates, the OG-image extension,
  and the share-button reuse are all correct and required regardless of
  automation. Nothing about "make it automated" changes the theme layer. Ship
  it as written.
- **Reuse mandates.** Extending `snippets/meta-tags.liquid` for `article.image`
  and reusing the `shareStoreLink` (title + URL, no text payload) pattern are
  correct and should stay as hard requirements - an independently-built article
  share button would re-open the exact Facebook Messenger card bug fixed on
  2026-07-06.
- **RSS is plumbing, not a channel.** The framing that RSS's value is feeding a
  syndication pipeline (not direct subscribers) is correct.
- **Reuse-and-rename the `news` blog.** Correct - it is already in the sitemap
  under a broken URL; renaming fixes that URL instead of orphaning a second blog.
- **Grounded topic list tied to the five real collections.** Correct - every
  post must have a real product/collection to funnel into.
- **The theme change process guardrails** (pull-to-reconcile, preview theme,
  cookie-jar the `preview_theme_id`, explicit go before live). Non-negotiable,
  keep verbatim.

## Where the automation ask breaks the PRD (must change)

Three of the PRD's Non-Goals directly conflict with "automated, in the worker,
two agents" and must be revised:

| PRD Non-Goal | Conflict | Resolution |
|---|---|---|
| "Do not add this as an automated pawscout-worker job in v1" | The whole point is now worker automation | Flip for Phase 2+. But keep it TRUE for Phase 1 (the vessel ships manual). |
| "Do not fabricate or AI-generate customer-facing claims without human review" | Owner wants AI-generated content | Keep the *human-review* half absolutely. AI drafts; a human still approves. The word to delete is not "human review" - it is "do not AI-generate". |
| "Do not build a native Pinterest API integration in v1" | Worker-native syndication needs it | Nuanced - see Q5/Q6. Zapier/Make can still do syndication with zero worker code; worker-native Pinterest is a real cost with a real OAuth blocker. |

Everything else in the PRD survives.

---

## The seven questions, answered

### Q1 - Where does the automation live, and at what cadence?

**Not an unconditional nightly cron.** A blog posts weekly-or-slower; a nightly
generator would produce 365 drafts a year. Three options, in order of
recommendation:

1. **On-demand console action (recommended for v2 / first automation).** The
   owner opens a new console "Content" view and clicks "Draft a new post"
   (optionally picking a topic from a queue). The content agent runs once,
   produces a Shopify draft article + a worker staging row, and the owner
   reviews. This matches the console-action convention already used for
   campaigns ("Send now"), policy apply, and event enable - cadence stays a
   human decision, which the PRD correctly identified as editorial.
2. **Paced queue + gated nightly stage (recommended for v3, once quality is
   trusted).** The owner seeds a topic queue; a nightly `DAILY_SHOP_STAGES`
   stage drafts the next queued topic *at most once every N days* (guarded on a
   "last drafted" timestamp, the same way the `retention` stage is env-gated and
   mostly no-ops). Still drafts only - never publishes.
3. **Unconditional nightly generation.** Rejected. Wrong cadence, and it removes
   the human from topic selection.

Start with (1). It is the smallest correct step, puts the owner in control of
volume while the model's output quality is still unproven, and reuses the exact
`DailyStage` / console-action machinery already in the codebase. Graduate to (2)
only after several human-reviewed posts confirm the drafts are consistently
good.

### Q2 - The two agents' inputs, outputs, and handoff

The owner's "two agents" instinct is right, but the boundary should fall at the
**human publish event**, not at "content agent finishes." Precise spec:

**Agent 1 - Content drafter** (worker, reuses `LlmClient` + `resolveChain(cfg,
'text')` exactly as the inbox drafter does):
- *Input:* a topic (from the queue or owner-picked) + a **grounded fact pack**:
  the target collection's real products (titles, prices, stock, real delivery
  bands from the existing metafields), pulled deterministically via the Admin
  API - the blog equivalent of the inbox agent's `ground(ctx)` step.
- *Process:* LLM drafts the article body from the fact pack ONLY (see Q4), then
  the `refineUntilClean` loop runs a blog-specific quality/fabrication gate.
- *Output:* a Shopify **draft** Article (`published: false`) with featured image
  placeholder, meta title, meta description, tags = collection handle, and
  in-body links to the real products - PLUS a worker staging row
  (`blog_post_drafts`, mirroring `inbox_drafts`) for idempotency, topic-queue
  linkage, and console review.
- *Does NOT publish.* Ever.

**Human gate** (unchanged convention): owner reviews the draft in the console
(or Shopify admin), fixes anything, adds/approves the featured image, and
presses publish. This is the same review-then-act gate as inbox Approve and
campaign Send now.

**Agent 2 - Syndicator** (worker or Zapier - see Q5):
- *Trigger:* the article becoming **published** (detected via the RSS/Atom feed,
  which by definition only contains published articles, or via a published-state
  poll). This is the elegant part: an RSS-triggered syndicator is *inherently*
  gated on human publish - it is structurally impossible for it to fire on an
  unreviewed draft.
- *Input:* the now-live article's public URL + OG image + title (+ optionally an
  LLM-generated platform-native pin description).
- *Output:* a pin on the syndication target(s).

So the handoff is: **content agent → draft → human publish → syndicator.** Not
content agent → syndicator. The human sits in the middle by construction.

### Q3 - Does "automated" include auto-PUBLISHING? (the biggest decision)

**Recommendation: NO. Auto-draft, human-publish, auto-syndicate.** This is a
deliberate, argued position, not a default:

- **Every AI-generated customer-facing artifact in this project is
  human-gated before it goes public.** Inbox drafts sit `pending` until Approve;
  campaigns sit `draft` until Send now; even the recurring-events stage
  auto-*stages* an announcement but never sends it. Auto-publishing an article
  would be the *first* exception anywhere in the codebase to a completely
  consistent convention. That bar should not be cleared casually.
- **A blog post is the highest-exposure AI surface yet.** An inbox reply goes to
  one person and can be followed up. An article is public, Google-indexed,
  permanent, brand-carrying, and syndicated to Pinterest the moment it is live.
  A single fabricated pet-health claim ("cats can safely eat X") that gets
  indexed and pinned is a real reputational and potentially welfare problem, and
  it is hard to fully retract once scraped/cached.
- **The fabrication gate cannot be comprehensive for blog content** (see Q4), so
  the human review is not belt-and-suspenders here - it is the *primary* control.
- **The owner loses almost nothing.** "Automated" in the sense that matters -
  never writing a post from scratch, never manually pinning - is fully
  delivered. The owner's only manual step is a review-and-publish click they
  already perform for every other AI output. The cost is minutes per post; the
  downside it prevents is a permanent public fabrication.

If the owner explicitly wants unattended auto-publish later, gate it behind the
same kind of per-surface opt-in switch the inbox uses (`autosend` is OFF by
default, per-agent), so it is a deliberate, reversible choice and never the
default. Do not build it as the day-one behaviour.

### Q4 - Fact-grounding mechanism for the content agent

**The existing fabrication gate does not port to blog content, and it is
important to understand why.** `claimsBusinessBiography` in `draft-quality.ts` is
a **regex blocklist of known-bad shapes** (business longevity, customer-base
scale). It works for the inbox because the failure modes there are *narrow and
enumerable*. A 600-word pet-care article makes dozens of *open-ended* factual
claims (water intake per kg, litter-change frequency, breed-specific cautions)
that **no regex can enumerate**. You cannot blocklist your way to a safe article.

Design the blog gate as three layers, strongest first:

1. **Constrain the source (primary control).** The content agent's LLM writes
   from a **curated fact pack**, not free-form knowledge - exactly the inbox
   discipline of "Grounded facts you MAY rely on for this reply." The fact pack
   is real catalog data (products, prices, stock, delivery bands) plus, for any
   health/care claims, an owner-maintained approved-claims library. The system
   prompt forbids asserting health, safety, dosage, or veterinary claims that
   are not in the fact pack - it may pose questions, describe products, and give
   general lifestyle framing, but not invent care advice.
2. **Deterministic category flags (not verification).** A blog gate should not
   try to *verify* claims - it should *flag categories that require human
   verification*: any sentence making a medical/health/safety/dosage/guarantee/
   breed-specific claim gets surfaced to the reviewer as "verify this line."
   This is the realistic analog of `findDraftIssues` - it produces reviewer
   feedback, not a pass/fail truth judgement.
3. **Human review as the terminal gate (from Q3).** Because layers 1-2 cannot be
   exhaustive, the human publish gate is the backstop that makes the whole thing
   safe. This is *why* Q3's recommendation is load-bearing rather than
   conservative.

Reuse `refineUntilClean` verbatim for the mechanical quality issues (length,
structure, has-a-product-link, has-meta-description). Add the category-flag pass
on top. Keep the `refineUntilClean` "return best candidate seen, degrade on
reviser failure" semantics - they are exactly right here too.

### Q5 - Pinterest-specific, or pluggable syndication target?

**Pluggable.** The owner already said "Pinterest or whatever platform is
determined later" - that is an explicit signal to build a `SyndicationTarget`
interface (`publish(article) -> pinId/postId`), not a Pinterest-hardcoded path.
Pinterest is the first implementation; Facebook Page, an X post, or a mailing
list are future implementations behind the same interface. The trigger,
staging, and dedup logic are target-agnostic; only the final API call differs.

**But do not over-build Agent 2.** If a syndication target just mirrors OG data
1:1, it barely needs an LLM - it is a deterministic API push, not an "agent."
The only place an LLM earns its place on the publish side is generating
*platform-native copy* (a Pinterest description that is not merely the article
title). Recommend: deterministic push for v1 (title + OG image + URL), optional
LLM-generated per-platform copy as a later refinement. Calling it an "agent"
should not lead the coder to build a reasoning loop where a `fetch` call
suffices.

### Q6 - Real-world dependencies that block automation regardless of design

Flag these as **blockers to surface to the owner**, not assumptions:

1. **Pinterest API access (hard blocker for worker-native syndication -
   verified current as of 2026-07).** Pinterest has no native "auto-publish
   from RSS" - the PRD correctly routed around that via Zapier/Make.
   **Worker-native** syndication means calling the Pinterest API v5 directly,
   and the current access model is: OAuth2 authorization-code flow (not a static
   key); **trial access does not permit write operations like creating pins**;
   production pin-writes require **Standard access, granted per-use-case via an
   app review** that demands a demo video showing the full OAuth flow plus the
   write action. Approval is not instant and is outside our control. **This is
   the single biggest reason to keep Zapier/Make as the v1 syndicator** - it
   holds its *own* already-approved Pinterest connection, so we inherit zero
   OAuth and zero app review. (Verify at build time that Zapier/Make still expose
   a "Create Pin" action - it does today, but confirm before committing to it.)
   Only go worker-native if Zapier's limits actually bite, and budget the
   Standard-access review as a real, owner-blocking lead time when you do.
2. **Pinterest Business account + domain claim + Rich Pins.** Owner must create
   the Business account, verify `activepaw.co.uk`, and enable Article Rich Pins.
   Prerequisite for *any* syndication path. Owner-owned task.
3. **Admin API content-write scope (CONFIRMED blocker for worker-authored
   drafts).** Checked against the live tenant record 2026-07-07: the worker's 10
   granted Shopify scopes are `read_customers, write_draft_orders,
   write_inventory, read_locations, write_markets,
   write_merchant_managed_fulfillment_orders, read_orders, write_products,
   write_publications, write_shipping` - **none of which is a content-write
   scope.** Creating draft Articles via the Admin API needs one (a
   `write_content`-class scope; confirm the exact current name at build time
   against the target API version). This is an app-permission change + merchant
   re-auth, exactly like the `read/write_legal_policies` grant on 2026-07-05.
   Plan for it as a certainty, not a maybe.
4. **Credential storage.** Any Zapier webhook secret or Pinterest OAuth
   token/refresh-token goes through the existing sealed `supplier_credentials`
   vault pattern (`Vault.fromMasterKey(env.PAWSCOUT_MASTER_KEY)`), never logged,
   never in theme JS - same discipline as the CJ and Resend credentials.
5. **Featured image generation.** Auto-drafting text is easy; a *good featured
   image* (the thing Pinterest actually needs) is not. An auto-draft with no
   image, or a generic stock image, produces a low-performing pin. Decide the
   image source: owner supplies per post (keeps a human in the loop, recommended),
   a product photo is reused, or an image is generated. The PRD already makes
   featured-image publish-blocking - keep that, and note it means the owner's
   review step must include supplying/approving the image.

### Q7 - Other PRD sections the automation requirement changes

- **Primary Users:** add the content agent and syndicator as system actors; the
  owner shifts from "first-pass writer" to "reviewer/approver."
- **MVP Scope:** split explicitly into Phase 1 (theme vessel + hand-written seed
  posts, unchanged) and Phase 2+ (worker automation). The current MVP list is
  Phase 1 and is correct as such.
- **Risks:** add (a) fabrication-at-scale (mitigated by Q3 + Q4), (b) Pinterest
  API-access blocker (mitigated by Zapier-first), (c) thin-AI-content-penalty -
  Google's guidance penalises mass-produced unhelpful content, so the human
  review must enforce genuine usefulness, not merely wave drafts through.
- **Future Enhancements:** the "AI-assisted first-draft generation" bullet is no
  longer future - it is now Phase 2. The Traffic-board eighth-channel tracking
  stays future.

---

## Revised architecture (concrete)

### Phasing (the key structural change)

- **Phase 1 - Vessel (theme-only, = the current PRD, unchanged).** Blog +
  article templates, OG extension, share-button reuse, rename `news`. Hand-write
  3-5 seed posts. **Ship and validate this before building any automation** -
  you cannot automate a channel you have not confirmed converts, and the seed
  posts are the training-by-example reference for the content agent's voice.
- **Phase 2 - Content automation (worker).** Console "Content" view + "Draft a
  new post" action → content agent (ground → LLM draft → quality/fabrication
  gate → Shopify draft Article + `blog_post_drafts` staging row). Human reviews
  and publishes. Delivers "never write from scratch."
- **Phase 3 - Syndication automation.** Publish-triggered syndicator behind a
  `SyndicationTarget` interface. **Zapier/Make Pinterest connection first**
  (no worker OAuth, sidesteps the API-access blocker); worker-native Pinterest
  only if Zapier's limits bite. Delivers "never manually pin."
- **Phase 4 - Paced queue + tracking (optional).** Topic queue with a gated
  nightly drafter (once trust is established) + the Traffic-board eighth channel.

### Component map (reuse, do not rebuild)

| New piece | Reuses existing pattern |
|---|---|
| Content agent grounding | inbox `agent.ground(ctx)` - deterministic, never throws, miss → not-confident |
| Content agent LLM call | `LlmClient` + `resolveChain(cfg, 'text')` + `llm.jsonChain({chain, system, user, validate})` |
| "Facts you MAY rely on" prompt | `buildDraftSystem`'s grounded-facts + STORE_FACTS scaffolding |
| Quality/fabrication gate | `refineUntilClean` + a blog-specific `findBlogIssues` (mechanical) + category-flag pass |
| Staging row | `inbox_drafts` table shape + status lifecycle (draft/pending/published/discarded) |
| Draft-then-approve | `approveDraft` flow; console "Content" view mirrors the Inbox draft card |
| Auto-stage, never auto-act | `recurring-events` stage staging a campaign draft it never sends |
| Nightly gating (Phase 4) | `retention` stage's env-gated mostly-no-op shape |
| Credential storage | `Vault.fromMasterKey` + `supplier_credentials` sealed rows |
| Syndication trigger | the Shopify Atom feed (published-only by construction) |

### Data model (new)

- `blog_post_drafts` (worker D1): `shop, id, topic, collection_handle,
  shopify_article_id (null until created), status, body_md, meta_title,
  meta_description, quality_flags_json, model, created_at, published_at`. Mirrors
  `inbox_drafts`. One row per drafted post; idempotency + console review + links
  the topic queue to the eventual live article.
- `blog_topics` (optional, Phase 4): the seeded topic queue.
- No theme data-model changes.

---

### Measurement is a gate, not a Phase-4 nice-to-have

This matters *more* because the content is auto-generated. Google's Helpful
Content system penalises **sitewide**, not just per-page, for mass-produced
unhelpful content - so scaling up auto-generation raises whole-store ranking
risk, not merely per-post risk. That changes what measurement is for: it is not
a reporting luxury, it is the **feedback signal that must exist before the
generator is allowed to run paced/unattended** (Phase 4).

Concretely: put UTM parameters on the in-article product/collection links and
track Pinterest referral traffic from Phase 2's very first published post, so
each post has per-post attribution (did it bring sessions? did those sessions
reach a product?). The rule that falls out of this: **do not graduate from
on-demand generation (Phase 2) to queued/paced generation (Phase 4) until the
measurement shows the human-reviewed posts are actually earning traffic and not
dragging site quality.** Measurement gates the cadence increase. Without it, you
are scaling a channel blind, which is exactly how the thin-content sitewide
penalty gets triggered.

## What to change in the PRD document itself

Rather than rewrite it, add an "Automation (Phase 2+)" section and:
1. Reframe the current "MVP Scope" as "Phase 1 - Vessel," explicitly the
   prerequisite, explicitly still shipped with hand-written seed posts.
2. Flip the three conflicting Non-Goals as tabulated above, keeping the
   human-review half of the fabrication Non-Goal absolutely intact.
3. Add the Phase 2-4 breakdown, the two-agent spec with the human-publish
   boundary, and the blocker list from Q6.
4. Record the Q3 decision (auto-draft, human-publish, auto-syndicate) as a
   settled architectural decision with its rationale, so it is not silently
   re-litigated into auto-publish later.

---

## One disagreement stated plainly

The owner framed this as "two agents, automated." I am recommending something
one notch less automated than a literal reading of that - a human publish click
stays in the loop. I am flagging that explicitly rather than quietly building
the safer thing: **if the owner's intent is genuinely unattended
publish-and-pin with no human in the loop, that is a specific, reversible
decision they should make with the fabrication risk in front of them - not a
default a coder infers from the word "automated."** My strong recommendation is
the human-gated version, for the reasons in Q3; but the call is the owner's, and
it should be made consciously. The architecture above supports either - the only
difference is whether the publish step is a console click or an automatic
transition - so nothing here is wasted if the owner chooses differently.
