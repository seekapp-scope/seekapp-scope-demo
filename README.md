# SeekApp Scope live demo

A small Claude application for freelancers and web agencies serving US clients: brief → scope/questions/proposal → clarification answers → updated draft → review with evidence and suggestions. English and Vietnamese output; copy/download Markdown; no automatic delivery to clients.

**Current state:** source is published on [GitHub](https://github.com/seekapp-scope/seekapp-scope-demo). Three synthetic briefs, a clarification update and proposal reviews have passed the production handler using the real Claude Sonnet 5.5 API; see [the live evaluation](validation/LIVE-EVALUATION.md). The public demo is deployed at [seekapp.net/demo](https://seekapp.net/demo), with real Turnstile and live mode enabled in the separate production configuration. HTTP/config/security-guard checks passed. The actual Chrome → Worker → Turnstile → Claude workflow passed generation, clarification update and review; see [the public workflow receipt](validation/public-workflow-results.json). Local development remains disabled by default. There are no prepared output fallbacks in the production code.

Founder: Truong Can Em, Roseville, California, US · contact@seekapp.net · [SeekApp](https://seekapp.net).

## Processing placement

The demo API uses `placement.region = "aws:us-east-1"`, a Cloudflare placement hint near US East, not a US-only data residency guarantee. Static assets remain on the global CDN. The existing rate-limit Durable Object and its counters are preserved; its location is not changed by Worker placement. Anthropic processing locations are governed separately. The config endpoint exposes `X-Worker-Placement` for deployment verification; `CF-Ray` identifies the ingress edge rather than the API compute location.

## Run locally

Requires Node.js 22 or newer, npm and Chrome (for browser tests).

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:8787/demo. Sample selectors load brief text; analysis remains disabled until the service is configured. The local development server does not read keys from any other project.

```sh
npm run check
npm test
npm run test:browser
npm run test:runtime
npm run build
```

`build` is a **dry run**, not a production deployment. `test` injects mock Siteverify/Claude transports; browser tests mock provider results only inside the test runner. Browser tests use an isolated headless Chrome profile. They do not open your personal browser session. They do not charge Anthropic.

`test:runtime` validates the actual SQLite Durable Object in local workerd, without external provider calls. The locked Miniflare development dependency follows the version supplied with the installed Wrangler; it is not shipped to browsers or included in the deployed Worker.

## How Claude is used

1. The browser submits the brief, output language, consent and Turnstile token to `POST /api/scope` on its own origin.
2. The Worker checks origin, method, content type, bounded body length and input; validates Turnstile success, hostname and action server-side.
3. A singleton SQLite Durable Object atomically reserves the daily and per-source budget and a concurrent-request lease.
4. The Worker calls `https://api.anthropic.com/v1/messages`, using `claude-sonnet-5-5` by default and JSON-schema structured output. The model is configurable; the account must have access to it.
5. A complete validated response becomes editable fields. Truncated, refused, malformed or failed responses become errors, never canned results. The response records the returned model, generation time and a demo request ID. This ID is for troubleshooting; it is not an independent proof of authenticity.

The prompt separates facts from assumptions, highlights contradictions and avoids inventing prices, schedules or promises. Each explicit action makes one Claude call, without browsing, tools, MCP, repository ingestion or external actions. Model outputs still need human review.

### Clarification and review

- Answer any of the generated questions, then select **Update scope and proposal**. The Worker sends the original brief, current edited draft and submitted answer history. Empty answers remain unresolved; previous answers are retained in the page across updates.
- Select **Check with Claude** to compare the current draft against the brief and answers. The report identifies missing requirements, unconfirmed assumptions, unsupported commitments and contradictions, with evidence and suggested changes. It does not automatically edit or approve the draft.
- Editing a draft or answer hides its previous review. Changing the brief clears the previous workflow. All state is page-local and disappears on reload.
- Answers: at most 20 across updates, 1,000 characters each, 6,000 answer characters combined. Draft context: at most 20,000 serialized characters. The entire request is still capped at 40,000 bytes. Large briefs/drafts may need shortening.
- Generate, update and check each require fresh Turnstile verification and consume one of the shared rate/budget allowances. A three-step workflow uses three calls; no step starts automatically.

## Limits and secrets

- Brief: 20–8,000 characters; request body at most 40,000 bytes; output at most 2,400 tokens in English or 3,600 in Vietnamese.
- Default: **20 admitted API attempts per UTC day**, **3 attempts per source-IP hash per fixed ten-minute window**, at most **2 active reservations** globally. A boundary between windows can allow more than three calls in a rolling ten-minute period.
- Failed upstream calls still consume reservations. There are no automatic retries. Reservations expire after 90 seconds; the upstream timeout is 45 seconds.
- Shared office/mobile IPs share a source allowance. These are request caps, not a guaranteed dollar spending limit; also set a spending limit in the Anthropic Console.
- Turnstile is mandatory for live calls. Failed verification does not reach Anthropic. No unsafe bypass flag is provided.
- `ANTHROPIC_API_KEY`, `TURNSTILE_SECRET_KEY` and `RATE_LIMIT_SALT` are server secrets, never browser configuration. Durable storage contains salted IP hashes and counters, not briefs or proposals. Logs intentionally omit prompt/output text.
- No API key, `.env`, `.dev.vars`, local account credentials or third-party project files should be committed. Use the committed `.dev.vars.example` only as a blank template.

## Deployment after owner approval

Production deployment, domain routes, GitHub push and paid API validation are separate operator-approved steps. Do not overwrite the existing SeekApp homepage Worker with this project.

### Prepared deployment for seekapp.net

The founder authorized completing publication on 9 October 2026. `scripts/deploy.mjs` targets the existing SeekApp Cloudflare account and zone specifically. It reads the existing ignored `../seekapp-scope/.env.cloudflare` and the authorized `../seekapp-scope/api.txt` in memory. No credential is passed as a command argument or written into the public configuration.

Required token permissions: Account **Workers Scripts Edit**, **Account Settings Read**, **Turnstile Edit**; Zone **Workers Routes Edit** and **Zone Read** for `seekapp.net`. The founder supplied updated permissions on 9 October 2026. Worker deployment, Turnstile creation, secret storage and main-domain route creation all succeeded, establishing the required write permissions in practice. No temporary account was used.

```sh
node scripts/deploy.mjs --check
# Publishes to the owner's account; only run with owner authorization:
node scripts/deploy.mjs --execute
```

The read-only check inventories existing routes, Workers and Turnstile widgets. Execution holds on conflicting routes or an unrelated Worker, deploys disabled on the account's workers.dev hostname, creates a non-interactive Turnstile widget for the exact two hosts, stores secrets through stdin, and validates public assets/config and API guards before adding `/demo*` and `/api/scope*` routes. It generates `wrangler.production.jsonc` containing public settings only and an ignored `.wrangler/deployment-receipt.json`. It preserves any existing rate-limit salt and refuses to repeat initial setup over an already live Worker. Actual browser Turnstile-to-Claude validation is a separate check; successful static checks do not establish it.

### Subsequent production updates

Use `wrangler deploy --config wrangler.production.jsonc` with the authorized Cloudflare token supplied through the process environment. Keep production secrets in Cloudflare. The default `wrangler.jsonc` remains a disabled local-development configuration; deploying it to the production Worker would disable the live demo. The initial-setup helper intentionally refuses to run over an already live Worker.

Production routes are only `seekapp.net/demo*` and `seekapp.net/api/scope*`; the existing homepage Worker was not uploaded or replaced. The demo has its own linked privacy and terms notices. See [validation/public-deployment.json](validation/public-deployment.json) for public HTTP checks.

### Initial deployment sequence (reference)

1. Publish this **Worker with Static Assets**, initially with `LIVE_ENABLED=false`, to a new Workers preview hostname. This is not a static-only Pages upload; the API and Durable Object require a Worker deployment.
2. Create a Turnstile widget permitting the exact demo hostname(s). Configure `TURNSTILE_SITE_KEY`; keep the widget action `scope-demo`.
3. Set `ALLOWED_ORIGINS` to the exact deployed HTTPS origin(s), comma-separated; no trailing slash. Keep localhost only for local development.
4. Store the three secrets using `wrangler secret put ANTHROPIC_API_KEY`, `wrangler secret put TURNSTILE_SECRET_KEY` and `wrangler secret put RATE_LIMIT_SALT`. Use a randomly generated salt. Enter secrets interactively; never put them in shell history or this README.
5. After approval for API costs, set `LIVE_ENABLED=true`, redeploy and run the three evaluation briefs below through the live UI. Record actual observations, not mocked results.
6. Once accepted, add same-zone Worker routes `seekapp.net/demo*` and `seekapp.net/api/scope*`. All demo assets and demo legal pages use `/demo…` paths. Leave the existing homepage and its assets on the separate `seekapp-scope` Worker. Review routes against any existing Workers routes before changing them.
7. Set `SOURCE_URL` to the actual public GitHub repo URL to expose the **Source on GitHub** link. It stays hidden until configured; no invented repository link is shown.

The demo uses `/demo-privacy` and `/demo-terms` for disclosures specific to live processing. Before public release, update the existing site's privacy policy to link to the live-demo notice and remove any claim that all public demo briefs remain exclusively in the browser. Landing-page wording should describe only the live checks actually completed.

### Evaluation briefs

| Case | What to inspect in the real output |
|---|---|
| Clear agency website | Five requested pages preserved; no invented budget/date; payments/accounts/blog excluded |
| Salon booking with missing details | Questions about payments, cancellations, staff availability and content; no invented launch commitment |
| Contradictory online shop | Flags customer-history versus no-data-storage conflict and tomorrow launch versus next-week assets; no unconditional promise |

Use fictional examples. Never publish a customer's brief, provider keys or unreviewed output as an evaluation artifact.

## Git and GitHub

This folder is a standalone Git repository. The local commit author is Truong Can Em <contact@seekapp.net>. Public source: https://github.com/seekapp-scope/seekapp-scope-demo.

The owner authorized completing publication on 9 October 2026. Tracked files and all existing commits were scanned for Anthropic keys and credential files before publication. The application works without a public source repository; the source link is for transparency, not an Anthropic program requirement.

## Documentation

- [Claude structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [Cloudflare Worker assets routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/)
- [Server-side Turnstile validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Durable Objects](https://developers.cloudflare.com/durable-objects/)

See [VALIDATION.md](VALIDATION.md) for the validation receipt and pending public deployment verification.

### Explicit paid API check

Only run this after approving API costs. The key file is read in memory and never copied into the repository. At most three generation calls are attempted, with no automatic retries. `--case conflicting-shop-vi` limits a run to that one case. This entrypoint is not part of automated tests or the deployed Worker.

```sh
node scripts/live-check.mjs --allow-paid --key-file /path/to/api.txt
```

The script exercises the production request handler with real Claude responses, while replacing only Siteverify with a local test response and using an in-memory instance of the budget class. That substitution exists only in the explicitly invoked script, not in the public API. The separate runtime test validates real SQLite budget storage. Receipts contain only fictional briefs, outputs and provider metadata, not credentials.

Use `--workflow` to run two checks using the recorded successful booking brief: a clarification update and a review of a deliberately unsupported delivery/price promise. It writes a separate receipt rather than overwriting the original three-brief evaluation.

The production Turnstile widget now uses **Non-Interactive** mode: visitors are not asked to click a verification checkbox. Server-side success/hostname/action checks and the existing request limits remain enforced. The founder explicitly requested this configuration change; the site key and secret were retained.
