# Real Claude API evaluation

Performed with owner authorization on 9 October 2026 (Vietnam). Actual returned model: **claude-sonnet-5-5**. Briefs are fictional examples, not customer data.

| Case | Demo HTTP | Duration | Input / output tokens | Observed behavior |
|---|---:|---:|---:|---|
| Clear agency website, English | 200 | 18.653 s | 1,042 / 1,632 | Preserves the five pages, client-supplied content, mobile support, editable case studies and contact requirement. Excludes payments, customer accounts and blog. Budget and date remain unresolved. |
| Salon booking with missing details, English | 200 | 17.712 s | 1,002 / 1,656 | Asks about payment/deposits, cancellations, content, staff selection and existing scheduling tools. Does not commit to a launch date or quote. |
| Conflicting online shop, Vietnamese, retry | 200 | 20.837 s | 1,095 / 3,190 | Flags no-data-storage versus accounts/history and tomorrow launch versus next-week assets. Suggests conditional alternatives, leaves dates and prices to agreement, and responds in Vietnamese. |

The initial Vietnamese call returned provider HTTP 200 but was incomplete under the 2,400-token allowance; the Worker rejected it rather than showing a partial result. The revised Vietnamese allowance is 3,600 tokens. The first call did not capture the exact provider stop reason, so token exhaustion is an inference supported by the successful retry using 3,190 output tokens, not a directly recorded initial stop reason.

These observations are a small, producer-reviewed sample. Some lists exceed the prompt's suggested eight items; the application accepts at most twenty. The prompt limit is a preference, not a schema-enforced guarantee. Outputs need human review before quoting a client.

## Reproducible evidence

- [Initial three attempts](live-results.json): includes two successful outputs and the incomplete Vietnamese attempt.
- [Vietnamese retry](live-retry-results.json): complete output, provider request ID, actual stop reason and token metadata.
- [Paid check script](../scripts/live-check.mjs): runs the production Worker handler against the real Claude API. Siteverify is mocked only within this standalone local script, budget storage is in memory, and no key is written to the receipts.

No public deployment, real Turnstile check, production route change or GitHub push was performed. Public live mode remains disabled until configured and separately authorized.


## Follow-up workflow evaluation

| Action | Demo HTTP | Duration | Input / output tokens | Observed behavior |
|---|---:|---:|---:|---|
| Refine booking scope with three answers | 200 | 12.862 s | 3,011 / 1,829 | Adds no online payments/deposits, 24-hour cancellation policy and owner-supplied content as stated answers. Keeps staff selection, cancellation channel, launch date and content schedule unresolved. |
| Review deliberately unsupported promise | 200 | 19.458 s | 2,980 / 2,023 | Identifies the added unconditional tomorrow/$99 promise and contradiction with the conditional draft. Also returns several arguably overbroad findings. |
| Review with more precise finding criteria | 200 | 8.900 s | 3,180 / 1,156 | Still identifies the unsupported guarantee; avoids previous missing-requirement findings about unstated desirable features. Some low-severity concerns remain debatable. |

The stricter prompt distinguishes explicit missing requirements from optional questions and warns against treating labelled assumptions or conditional proposals as commitments. These two review samples do not establish reliable precision across proposals. Read the quoted evidence before acting; no automatic approval or rewrite is offered.

[Initial workflow receipt](live-workflow-results.json) · [Review retry receipt](live-workflow-review-retry.json).
