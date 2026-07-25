# Working in this repository

Context for anyone — human or AI agent — changing this code. This is a financial tool: a wrong number is worse than a missing feature, and most of the rules below exist because something plausible-looking turned out to be wrong.

## Domain invariants

These are load-bearing. Breaking one produces a plan that looks reasonable and cannot be executed.

**Cash never crosses accounts.** Each account is funded only by its own money-market sleeve. Every account's trades must satisfy `Σ(buys) − Σ(sells) + Δcash == 0` independently. If you find yourself summing cash across accounts, stop.

**Targets are household-level; execution is per-account.** There are deliberately no per-account targets. An individual account is allowed to look unbalanced so long as the household hits its target. Do not "fix" this by balancing each account — it would make most household targets unreachable.

**Unreachable is a valid outcome.** When a target cannot be funded within the constraints, report it in `plan.unreachable`. Never silently emit a plan that cannot be executed.

**Share quantities truncate toward zero**, never round up. A buy must not overshoot into a share the target didn't call for, and a sell must never exceed the holding. The settlement sleeve absorbs the residual.

**Unclassified dollars stay out of the target maths.** They are surfaced as a warning, never bucketed into a default class.

## Architectural boundaries

```
src/lib/domain/     pure TypeScript — no React, no storage, no network, no I/O
src/lib/server/     server-only (outbound HTTP); never imported by domain
src/lib/storage/    browser-only localStorage repository
src/app/api/        thin route handlers: validate → call domain → return JSON
src/components/     presentational; state lives in StoreProvider
```

The domain layer's purity is why 74 tests run in ~20ms with no browser and no database. Adding an import of `fetch`, `window` or a database client into `src/lib/domain/` breaks that property — put it in a route handler or the storage layer instead.

Route handlers are **stateless by design**. The client owns the data and sends what each call needs. This is what lets the same code run on Vercel and on a laptop with no database and no environment variables. Do not introduce server-side session state.

## Traps in the broker data

Each of these was found by reconciling against the real export. Tests pin all of them.

| Trap | Why it bites |
|---|---|
| `FRGXX` is a money market | `$1.00` NAV, real quantity, no `**` suffix, description reads `FIMM GOVERNMENT PORTFOLIO: INSTL CL`. Suffix-or-keyword rules miss $6,307 of cash. An account can hold **more than one** cash sleeve. |
| The `Type` column | It is the tax-lot type (`Cash`/`Margin`), not account type and not asset class. In the Alex IRA even `BIL` and `FNILX` read `Cash`. Never feed it to classification. |
| `GLOBAL X FDS DEFENSE TECH ETF` | "Global" is the issuer, not a geography. Matching it files `SHLD` as international. |
| `FIMM GOVERNMENT PORTFOLIO` | Contains "GOVERNMENT"; cash rules must run before treasury rules. |
| `XQMTVRWK` holds $0.21 | Divide-by-zero risk in every percentage. Surfaced, skipped for rebalancing. |
| Account numbers | Alphanumeric (`X483920176`). String keys only — never parse as integers. |
| 11 unique symbols | One past OpenFIGI's keyless limit of 10 jobs per request, so batching is mandatory, not optional. |

## Verification gates

Run all three before considering a change done:

```bash
npm test          # 74 unit tests
npx tsc --noEmit
npm run lint
```

Reference figures the tests assert — if a parser change moves these, the change is wrong:

- Household total **$533,137.47**, across 4 accounts and 26 positions, parsed with **zero warnings**
- Per-account: Joint WROS $62,364.09 · old brokerage $0.21 · IRA (Alex) $375,481.22 · IRA (Jordan) $95,291.95
- Every position's recomputed share must match the broker's own `Percent Of Account` column

Do not weaken or delete an assertion to make a change pass. Two real bugs were caught this way: in-band asset classes being re-placed across accounts (~$100k of pointless trades on an already-on-target portfolio), and rounding letting buys exceed available cash by cents (a settlement-sleeve sell larger than the balance held).

## Conventions

- Prefer a minimal upstream fix over a downstream workaround; find the root cause first.
- No code comments unless explicitly requested — names and structure should carry the meaning.
- New engine behaviour needs a test that would fail without it.
- Keep the pure domain layer testable without mocks; if something needs a mock, it probably belongs in a different layer.
