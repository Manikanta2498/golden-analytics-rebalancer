# Household Portfolio Rebalancer

A full-stack tool that turns a flat broker CSV into a household asset-allocation view, lets you edit a target allocation, and returns the exact trades needed to reach it — respecting the constraint that **cash cannot move between accounts**.

## Quick start

```bash
npm install
npm run dev       # http://localhost:3000
npm test          # 70 unit tests
npm run build     # production build
```

No database, no environment variables, no API keys, no signup. The app loads the bundled sample portfolio (`public/portfolio.csv`) on first run; use **Upload CSV** to load a different export.

---

## Section A — What this does

### 1. The data isn't in a usable shape

The export is a flat, symbol-level CSV across four accounts, with broker cruft the parser has to survive:

- Trailing disclaimer paragraphs, blank rows, and a `Date downloaded …` line
- Currency as `"$6,645.97 "`, negatives as `($10.07)`, nulls as `--`
- Alphanumeric account numbers (`X483920176`, `XQMTVRWK`) that must never be parsed as integers
- Cash rows with a `**` suffix, no quantity and no price

It becomes a household model of `Account → Position → AssetClass`. Parsing is verified against the broker's own `Percent Of Account` column, and the reconciled household total is **$533,137.47**:

| Account | Value |
|---|---|
| Joint WROS | $62,364.09 |
| Alex's old brokerage | $0.21 |
| IRA (Alex) | $375,481.22 |
| IRA (Jordan) | $95,291.95 |

### 2. There's no concept of a target

Tickers map to a **user-editable** asset-class taxonomy through a five-stage pipeline, first match wins:

1. **User override** — always final
2. **Curated seed map** — mainstream tickers, bundled
3. **Description heuristics** — keyword rules over the broker's description plus a `$1.00`-NAV signal, each with a confidence score
4. **OpenFIGI lookup** — for symbols nothing else recognises
5. **Review queue** — anything still unresolved

Every mapping records its source and confidence. Unclassified dollars are **held out of the target math** behind a visible warning; they are never silently bucketed.

### 3. Rebalancing math

Given current and target allocations, the engine emits exact per-account buy/sell orders. See Section B for the algorithm.

### 4. Some accounts are more liquid than others

Each account carries a **cash preference rank**, reorderable in the UI. The household cash target fills the most-preferred account to capacity before the next receives any — so you can concentrate cash in a taxable brokerage rather than a retirement account. Default ranking puts taxable accounts first.

---

## Section B — How it works

### Architecture

```
src/lib/domain/     pure TypeScript — parseCsv, classify, allocate, rebalance
                    no React, no storage, no network. This is what the tests cover.
src/lib/server/     OpenFIGI client (batching + cache), server-only
src/app/api/        stateless Route Handlers
src/lib/storage/    typed localStorage repository
src/components/     React UI
```

All business logic runs **server-side** in Route Handlers:

| Route | Purpose |
|---|---|
| `POST /api/portfolio/parse` | CSV → accounts + positions |
| `POST /api/classify` | symbols → asset classes, with OpenFIGI fallback |
| `POST /api/figi` | OpenFIGI proxy — avoids browser CORS, batches, caches |
| `POST /api/rebalance` | positions + targets → trade plan |

The client renders and stores; it cannot produce a trade plan on its own.

### The rebalancing algorithm

1. **Household targets** — target dollars per asset class from the investable total.
2. **Drift filter** — a class inside `max(bandPct × total, bandAbs)` is frozen at its current value, *including its existing per-account distribution*, so an on-target portfolio produces zero trades.
3. **Cash placement** — the household cash target fills accounts in preference-rank order, most-preferred to capacity first.
4. **Per-account allocation** — for each out-of-band class, accounts first *keep* what they already hold (up to capacity), then any remainder is distributed proportionally to leftover capacity. Keeping first means the plan doesn't churn positions that are already in the right place.
5. **Symbol selection** — within a class, an account scales its existing holdings proportionally; if it holds nothing in that class, it buys the household's largest holding of it.
6. **Dollars → shares** — `round(delta / price, 3)`, matching the broker's observed fractional precision.
7. **Cash reconciliation** — the core money-market sleeve absorbs the residual exactly, so `Σ(trade dollars) + Δcash == 0` per account. If rounding would overspend available cash, the largest buy is trimmed.
8. **Output** — sells before buys so every buy is funded.

**Unreachable targets are reported, not hidden.** If a household target can't be funded within per-account constraints, the shortfall is surfaced in the UI.

### Design decisions and trade-offs

**Where the data lives.** The app is deployed on Vercel but must also run locally with no infrastructure budget. SQLite can't work on serverless (read-only filesystem outside `/tmp`, no shared state across invocations), and a hosted Postgres would mean shipping credentials or handing over a broken app. So the server computes and the **browser stores** — one code path, identical behavior in both environments, and a household's positions are never persisted server-side. The cost, stated plainly: state is per-browser and won't follow you between machines.

**`BIL` is Treasuries, not Cash.** It's a 1–3 month T-bill ETF worth ~$67k. Classifying it as cash would make ~32% of the household "cash" and leave the engine little to work with. It's a tradeable sleeve; the money market is the funding sleeve.

**`NUKZ` and `SHLD` get their own class.** ~$54k of nuclear and defense sector ETFs. Folding them into US Equity would silently inflate that target.

**Whole-account capacity, not per-symbol optimization.** The engine doesn't solve for minimum trade count or tax cost. It reaches the target with a keep-first heuristic. See Section C.

### Things the data hides

- **`FRGXX` is a money market** with a real quantity, a `$1.00` NAV and no `**` suffix — its description reads `FIMM GOVERNMENT PORTFOLIO: INSTL CL`. A rule keyed on the suffix or on "MONEY MARKET" misses $6,307 of cash. This also proves an account can hold **multiple cash sleeves**, hence the core/settlement designation.
- **The `Type` column is a decoy** — it's the tax-lot type (`Cash`/`Margin`), not the account type and not an asset class. In the Alex IRA even `BIL` and `FNILX` are marked `Cash`. A test asserts the classifier never reads it.
- **`XQMTVRWK` holds $0.21**, a live divide-by-zero risk. It's surfaced but skipped for rebalancing.

### Testing

70 unit tests over the pure domain layer:

- **Parser** — footer stripping, currency and `--` handling, `**` sleeves, fractional shares, and reconciliation to $533,137.47 and to `Percent Of Account`
- **Classifier** — override precedence, `FRGXX` detected as cash, `Type` never consulted, and the `GLOBAL X` issuer name not mistaken for international exposure
- **Engine** — per-account cash neutrality, no shorting, no negative cash, share precision, sells before buys, the de-minimis account, drift-band suppression, unmapped dollars excluded, and cash isolation under an impossible 100%-cash target

---

## Section C — What I'd do with more time

- **Share rounding.** Three decimals matches what this export shows and is fine for a demo; it wasn't researched further. Real systems need per-instrument precision and tradability rules — fractional support varies by broker and instrument, and there are minimum increments and order sizes.
- **Tax-aware selling.** No tax lots, holding periods, wash sales, or preference for rebalancing inside retirement accounts to avoid realizing gains. A real household tool would weight trades by tax cost, not just drift.
- **Trade minimization.** The keep-first heuristic reduces churn but doesn't minimize trade count or dollar turnover; that's a proper optimization problem.
- **Live pricing.** Prices come from the CSV snapshot, so a plan computed later is stale.
- **Settlement and cash buffers.** No modelling of settlement timing between a sell and a buy, or of a cash floor for fees.
- **Order execution.** The tool outputs a trade list; it doesn't place orders or track fills.
- **Multi-device state.** Browser-local storage means no sync and no encryption at rest for genuinely sensitive data.
- **Coverage.** Unit tests cover the domain layer; end-to-end UI tests and property-based tests for the engine invariants would come next.

---

## Notes on AI usage

The build used AI throughout. Two corrections worth recording:

**A dependency was designed in without being tested.** The first plan specified the Yahoo Finance `quoteSummary` API for classifying unknown tickers, based on secondhand sources. Actually calling it returned `HTTP 429` on the first request from a clean IP, and the documented cookie+crumb workaround was equally blocked — `getcrumb` itself returns "Too Many Requests". It was replaced with **OpenFIGI**, verified by direct call before being written into the design. OpenFIGI also turned out to be the better fit: its normalized name for `FRGXX` is `FIDELITY INV MMKT GOVT-INST`, which is more classifiable than the broker's own description.

**A static list was proposed where a lookup was needed.** The initial classification design was a hard-coded ticker map — which only ever works for tickers someone thought of in advance. It became the fast path in a layered pipeline with an API-backed fallback and a human review queue.

Two further errors were caught by testing rather than by review: an initial seed map listing tickers (VTI, VXUS, GLD, SGOV, BND) of which **none appear in the actual file**, and a claim of "9 unique symbols" that is actually **11** — one past OpenFIGI's keyless per-request job limit, making batching mandatory rather than optional.
