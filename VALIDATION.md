# Local validation receipt

Date: 8 October 2026. Environment: Windows, PowerShell Core 7.6.6, Node.js 22.14.0, Wrangler 4.148.0, Playwright 1.64.0.

| Check | Result | What this establishes |
|---|---|---|
| `npm run check` | Pass | Backend and browser JavaScript parse |
| `npm test` | 10 tests pass | Mocked provider pipeline, English/Vietnamese request selection, origin/method/body validation, consent, server-side verification checks, error handling, concurrency and budget admission |
| `npm run test:browser` | 6 tests pass | Real local Worker serving assets; desktop/mobile Chrome interaction, language switch, generated fields with mocked provider data, editing, Markdown download, errors, no horizontal overflow |
| Local runtime test | 1 test passes | Real SQLite Durable Object admits two simultaneous reservations and enforces the global daily cap after releases |
| `npm run build` | Dry run passes | Deployable Worker bundle, static assets and Durable Object bindings |

The browser/API tests intentionally substitute fixture responses. They **do not** establish actual Claude reasoning quality, account model access, live Turnstile acceptance, public deployment or a completed paid API call. No paid Claude request, production deployment, account setting change or GitHub push was performed.

Runtime entrypoint validation exposed an unsupported constant export in an early version; the deployed entrypoint now exports only the default Worker and Durable Object class. An early Miniflare invocation used the previous constructor format; the committed runtime test uses the installed version's compatibility conversion and passes.

Production does not include a mock endpoint, sample output fallback, Turnstile bypass or browser API key. Deployment starts with live mode disabled. Review the source/configuration before publishing; this receipt is producer evidence, not independent operator acceptance.

## Next acceptance boundary

Owner review of the local Git commit, then authorization for GitHub publication, Cloudflare deployment and bounded paid validation. Configure real server secrets and the exact allowed hostname. Run the three README briefs through the real UI and record actual outputs against the evaluation criteria before describing this as a verified live integration.
