# Household Portfolio Rebalancer

**Live:** https://golden-analytics-rebalancer.vercel.app

A full-stack tool that turns a flat broker CSV into a household asset-allocation view, lets you edit a target allocation, and returns the exact per-account trades needed to reach it — respecting the constraint that **cash cannot move between accounts**.

```bash
npm install
npm run dev       # http://localhost:3000
npm test          # 74 unit tests
npm run build
```

No database, no environment variables, no API keys, no signup. The bundled sample portfolio (`public/portfolio.csv`) loads on first run; **Upload CSV** accepts any other export in the same format.

---

## Section A — Written analysis

**Reshaping the raw data.** The export is a flat, symbol-level list across four accounts, carrying artefacts that break naive parsing: trailing disclaimer paragraphs and a "Date downloaded" line, currency as `"$6,645.97 "`, negatives as `($10.07)`, `--` as null, alphanumeric account numbers that must stay strings, and cash rows marked by a `**` suffix with no quantity or price. Parsing stops at the first row with an empty account number, coerces the numeric columns, strips `**` while recording which symbol is that account's settlement sleeve, and synthesises `price = 1` for cash rows. Rather than trusting my own arithmetic, I reconciled every parsed row against the broker's own `Percent Of Account` column, and pinned the household total of $533,137.47 as a test fixture. The result is a domain model of `Account → Position`, with account type inferred from the account name.

**Modelling the asset-class target.** The sample data ships no ticker→class mapping; designing it was part of the problem. A hard-coded list only works for tickers you anticipated, so the map became the fast path in a five-stage pipeline: user override, then a curated seed map, then keyword heuristics over the broker's description plus a `$1.00`-NAV signal, then an OpenFIGI lookup for anything still unknown, then a human review queue. Every mapping records its source and confidence, asset classes are user-editable rather than a fixed enum, and unclassified dollars are held out of the target maths behind a visible warning instead of being silently bucketed. Two judgement calls shaped the numbers: `BIL` is Treasuries rather than Cash (classing a $67k T-bill ETF as cash would make ~32% of the household "cash" and starve the engine), and `NUKZ`/`SHLD` form a Thematic class instead of inflating US Equity.

**The rebalancing algorithm.** Targets are set at the *household* level but executed *per account*, because cash isolation means an account can only be funded by its own money market. The engine computes household target dollars, freezes any class inside the drift band, places the cash target across accounts in preference-rank order, then for each remaining class lets accounts keep what they already hold before distributing the remainder proportionally to leftover capacity. Keeping first is a deliberate trade-off: it substantially reduces churn but does not minimise trade count or tax cost, which a production system would optimise. Share quantities truncate toward zero at the precision each symbol supports, and the settlement sleeve absorbs the residual so every account nets to exactly zero cash flow. Targets that cannot be funded are reported as unreachable rather than producing an unexecutable plan.

---

## Section B — Architectural decisions and edge cases

### Key architectural decisions

**The data model.** `Account → Position`, with `SymbolMapping` as a separate household-level table keyed by symbol rather than an attribute of each position — the same ticker appears in three accounts and must classify identically in all of them. Two flags on `Position` carry the cash semantics: `isCoreCash` (the `**` settlement sleeve, structural, set by the parser) and `isCashEquivalent` (a classification result, set later). Splitting them matters because an account can hold more than one cash sleeve. Asset classes are rows, not an enum, so the taxonomy can change over time as the brief requires.

**Layering.** The domain layer (`parseCsv`, `classify`, `allocate`, `rebalance`) is pure TypeScript with no React, storage, or network imports, which is what makes 74 unit tests possible without a browser or a database. Route Handlers are thin: validate, call the domain, return JSON.

**Where state lives.** The app is deployed on Vercel but must also run locally with no infrastructure budget. SQLite cannot work on serverless (read-only filesystem outside `/tmp`, no shared state between invocations), and a hosted Postgres would mean shipping credentials in the repo or handing over a broken app. So the server computes and the browser stores: one code path, identical behaviour deployed or local, no secrets, and a household's positions are never persisted server-side. The cost is that state is per-browser and does not follow you between machines.

**The liquidity-preference approach.** Each account carries a `cashPreferenceRank`, reorderable in the UI and defaulting to taxable-before-retirement. The household cash target fills the most-preferred account to its capacity before the next receives any, and this happens *before* the other classes are allocated, because cash placement constrains what capacity remains for everything else. Modelling it as an ordered ranking rather than per-account cash percentages keeps the household target as the single source of truth.

### The three edge cases

**1. An account's required buys exceed what that account's own cash can fund.**

- Buys are covered by cash along with sells from the same account, and trades are done with sells first so the funds are available
- Goals for each account come from its own capability, and hence it never plans to spend more than what it has!
- In some cases, rounding causes the total amount spent to exceed the available amount by a few cents; in such a case, the largest purchase is cut back to cover for the excess.
- In case the goal is greater than the total value of the account, it is marked as unreachable

**2. A single position is over-weighted for the account it's held in, but rebalancing it there would leave that account off its own target — while a different account already meets its target for that asset class.**

- No per account targets, only household targets, so each account can be unbalanced
- Each class gets whatever is in the accounts first and only gives out the balance
- The over-weighted position is left alone unless the household is over target for that class

**3. A computed trade implies buying a fractional share of a security that doesn't support fractional trading.**

- wholeShareSymbols will be tagged with them; precision falls to 0 for those and remains at 3 decimals for all others
- Truncation is done towards zero, ensuring a buy order doesn’t round up to a share that wasn’t requested by the target
- The extra is not wasted; it gets parked in that portfolio’s money market sleeve automatically
- Honest limit: the list is manual; production would pull tradability from broker reference data

---

## Section C — AI usage log

**1. Choosing an enrichment API for unknown tickers**

- **What I asked for:** a way to classify tickers that aren't in a local list, since any new CSV can contain symbols we've never seen.
- **What the AI gave me:** a design built on the Yahoo Finance `quoteSummary` API, written into the plan as settled, citing `fundProfile.categoryName`. It had only read search results — it never called the endpoint.
- **What I did:** rejected it. I pushed back that Yahoo's unofficial endpoints are unreliable and told it to test before designing around it. The direct call returned `HTTP 429` on the first request from a clean IP, and the documented cookie+crumb workaround was equally blocked — `getcrumb` itself returns "Too Many Requests". I then researched alternatives, proposed **OpenFIGI**, and required the same test. It returned `HTTP 200` first try. **Why:** a dependency that fails 100% of the time would have failed for the evaluators too. OpenFIGI also turned out better on the merits — its normalized name for `FRGXX` is `FIDELITY INV MMKT GOVT-INST`, which is more classifiable than the broker's own description.

**2. Hard-coded asset list vs. a real lookup**

- **What I asked for:** a way to map tickers to asset classes.
- **What the AI gave me:** a static, hand-maintained ticker → asset-class map as the primary mechanism.
- **What I did:** rejected it as the primary mechanism and asked for an API-backed default instead. **Why:** a hard-coded list only covers tickers someone anticipated, goes stale immediately, and silently drops anything unfamiliar. It was kept, but demoted to a fast path inside a layered pipeline that ends in a human review queue. Separately, the AI's first seed map listed VTI, VXUS, GLD, SGOV and BND — **not one of which appears in the actual CSV** — which confirmed that generated defaults describe a generic portfolio rather than this one.

**3. Scope cuts based on a hand-coding time estimate**

- **What I asked for:** a build plan against the 120-minute budget.
- **What the AI gave me:** a minute-by-minute schedule totalling ~110 minutes, concluding the plan was over budget once the video was included, and proposing to drop the mapping queue, the per-account breakdown and the CSV export.
- **What I did:** rejected the premise and kept the full scope. **Why:** the estimates were priced as if the code were being typed by hand. With AI generation, authoring a component isn't where the time goes — verification is. I had the schedule reworked into dependency-ordered steps with an explicit correctness gate at each one instead of a clock.

**Also worth noting:** two engine bugs were caught by tests rather than by reading the generated code. In-band asset classes were still being re-placed across accounts, so a portfolio already on target produced ~$100k of pointless trades; and rounding could make an account's buys exceed its cash by a few cents, producing a settlement-sleeve sell larger than the balance held. Both looked plausible and were wrong.

---

## How it works

### Routes

| Route | Purpose |
|---|---|
| `POST /api/portfolio/parse` | CSV → accounts + positions |
| `POST /api/classify` | symbols → asset classes, with OpenFIGI fallback |
| `POST /api/figi` | OpenFIGI proxy — avoids browser CORS, batches, caches |
| `POST /api/rebalance` | positions + targets → trade plan |

### Reconciled sample data

| Account | Value |
|---|---|
| Joint WROS | $62,364.09 |
| Alex's old brokerage | $0.21 |
| IRA (Alex) | $375,481.22 |
| IRA (Jordan) | $95,291.95 |
| **Household** | **$533,137.47** |

### Things the data hides

- **`FRGXX` is a money market** with a real quantity, a `$1.00` NAV and no `**` suffix; its description reads `FIMM GOVERNMENT PORTFOLIO: INSTL CL`. A rule keyed on the suffix or on "MONEY MARKET" misses $6,307 of cash.
- **The `Type` column is a decoy** — it is the tax-lot type (`Cash`/`Margin`), not the account type and not an asset class. In the Alex IRA even `BIL` and `FNILX` are marked `Cash`. A test asserts the classifier never reads it.
- **`XQMTVRWK` holds $0.21**, a live divide-by-zero risk. It is surfaced but skipped for rebalancing.
- **"Global X" is an issuer, not a geography** — matching on "global" would misfile `SHLD` as international.

### Tests

74 unit tests over the pure domain layer: parser reconciliation, classifier precedence and the traps above, and engine invariants — per-account cash neutrality, no shorting, no negative cash, share precision, sells before buys, drift-band suppression, unmapped dollars excluded, whole-share-only securities, and cash isolation under an impossible 100%-cash target.

---

## Known limitations and what production would need

This is a 120-minute build scoped to the modelling problem. The domain logic is tested and I'd defend it; everything a real financial product needs *around* that logic is absent, and I'd rather name it than let it look overlooked.

### Financial modelling

- **No tax awareness** — no lots, holding periods, wash sales, or preference for trading inside retirement accounts.
- **Prices are a CSV snapshot**, so a plan computed later is stale. Production needs a live quote feed and a staleness guard that refuses to plan on old prices.
- **No settlement modelling** between a sell and a dependent buy.
- **Trade minimisation is heuristic**, not optimal. Which account keeps a contested holding depends on iteration order rather than an optimisation.
- **Whole-share support is a manual list** rather than sourced from a broker's tradability reference data.
- **No trade execution** — the plan is the output; nothing is routed to a broker.

### Security and privacy

- **No authentication or authorisation.** Anyone with the URL has the full app. There are no users, no sessions, no multi-tenancy.
- **Holdings are stored unencrypted in `localStorage`**, readable by any script on the origin. A single XSS would expose a household's entire financial position. Production needs server-side storage with encryption at rest, per-user isolation, and a real session model.
- **Broker exports contain account numbers.** They're sent to the server for parsing — never persisted there — but they are PII and would need handling as such.
- **`/api/figi` is an open, unauthenticated proxy** with no rate limiting and no payload cap, so it can be used to drive traffic at OpenFIGI. The same is true of the parse and rebalance routes: no request size limit, so a large upload is a trivial denial-of-service.
- **No security headers** — no CSP, HSTS, or frame protections configured.
- **No audit trail.** A tool that recommends financial transactions needs an immutable record of who changed a target, when, and what plan was produced. Nothing is recorded.

### Operations

- **No structured logging**, request IDs, or error tracking. A failure in production is currently invisible.
- **No metrics, uptime monitoring, or alerting**, and no health-check endpoint.
- **No analytics**, so there's no signal on whether the classification queue is actually being used or silently abandoned.
- **No CI pipeline.** Tests exist but nothing runs them on push, and Vercel deploys on merge without a passing-test gate — the most valuable thing to add first, since the suite already exists.
- **No staging environment** and no migration strategy for the `localStorage` schema, so a shape change breaks existing users' saved state.

### Testing

74 unit tests cover the pure domain layer well. Not covered:

- **Integration tests** for the route handlers.
- **End-to-end tests** (Playwright) for upload → classify → target → plan.
- **Accessibility testing** — keyboard navigation and screen-reader labels are unverified.
- **Graceful degradation** when OpenFIGI is unavailable is by design (unknown symbols fall through to the review queue) but is not tested.
