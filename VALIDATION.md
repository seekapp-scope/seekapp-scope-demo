# Local validation receipt

Date: 8 October 2026. Environment: Windows, PowerShell Core 7.6.6, Node.js 22.14.0, Wrangler 4.148.0, Playwright 1.64.0.

| Check | Result | What this establishes |
|---|---|---|
| `npm run check` | Pass | Backend and browser JavaScript parse |
| `npm test` | 10 tests pass | Mocked provider pipeline, English/Vietnamese request selection, origin/method/body validation, consent, server-side verification checks, error handling, concurrency and budget admission |
| `npm run test:browser` | 6 tests pass | Real local Worker serving assets; desktop/mobile Chrome interaction, language switch, generated fields with mocked provider data, editing, Markdown download, errors, no horizontal overflow |
| Local runtime test | 1 test passes | Real SQLite Durable Object admits two simultaneous reservations and enforces the global daily cap after releases |
| `npm run build` | Dry run passes | Deployable Worker bundle, static assets and Durable Object bindings |

The automated browser/API tests intentionally substitute fixture responses. They **do not** establish actual Claude reasoning quality, account model access, live Turnstile acceptance or public deployment. The separately authorized paid checks below establish actual Claude generation. No production deployment, account setting change or GitHub push was performed.

Runtime entrypoint validation exposed an unsupported constant export in an early version; the deployed entrypoint now exports only the default Worker and Durable Object class. An early Miniflare invocation used the previous constructor format; the committed runtime test uses the installed version's compatibility conversion and passes.

Production does not include a mock endpoint, sample output fallback, Turnstile bypass or browser API key. Deployment starts with live mode disabled. Review the source/configuration before publishing; this receipt is producer evidence, not independent operator acceptance.

## Next acceptance boundary

Owner review of the local Git commit, then authorization for GitHub publication and Cloudflare deployment. Configure real server secrets and the exact allowed hostname, and validate the public UI with real Turnstile. Paid backend verification has been completed separately; public browser-to-provider verification is still pending.

## Authorized live API check — 9 October 2026 Vietnam

The owner explicitly authorized using `seekapp-scope/api.txt` for API tests. The key was read only inside the paid test process; it was not printed, copied to browser configuration or committed.

Four real Anthropic Messages requests were made: two English cases succeeded, the initial Vietnamese response was incomplete and rejected by the Worker, and the Vietnamese retry succeeded after increasing its output allowance to 3,600 tokens. All three final cases returned demo HTTP 200 using `claude-sonnet-5-5`.

The successful calls used 3,139 input tokens and 6,478 output tokens combined. The failed initial Vietnamese call also may incur fees; its token usage was not captured, so these totals are **not** the entire paid run. No dollar cost is inferred here.

The live check used the production Worker handler and real Claude transport. Siteverify alone was replaced with a test response; budget storage was in memory in this script. Public Turnstile, deployment and browser-to-live-provider operation are not established by this result. See [validation/LIVE-EVALUATION.md](validation/LIVE-EVALUATION.md) and the JSON receipts for actual outputs and timestamps. Syntax and ten backend tests passed again after the token-limit change.
