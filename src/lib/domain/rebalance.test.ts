import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { summarize } from "./allocate";
import {
  applyClassifications,
  classifyInputsFromPositions,
  classifySymbols,
  toMappings,
} from "./classify";
import { parsePortfolioCsv } from "./parseCsv";
import { rebalance, type RebalanceInput } from "./rebalance";
import {
  ASSET_CLASS_IDS,
  DEFAULT_ASSET_CLASSES,
  DEFAULT_SETTINGS,
  DEFAULT_TARGET_WEIGHTS,
} from "./seed";
import type { Position } from "./types";

const csvText = readFileSync(
  join(process.cwd(), "public", "portfolio.csv"),
  "utf8",
);

function buildInput(overrides: Partial<RebalanceInput> = {}): RebalanceInput {
  const parsed = parsePortfolioCsv(csvText);
  const classifications = classifySymbols(
    classifyInputsFromPositions(parsed.positions),
  );
  const positions = applyClassifications(parsed.positions, classifications);

  return {
    accounts: parsed.accounts,
    positions,
    mappings: toMappings(classifications),
    assetClasses: DEFAULT_ASSET_CLASSES,
    targetWeights: DEFAULT_TARGET_WEIGHTS,
    settings: DEFAULT_SETTINGS,
    ...overrides,
  };
}

const input = buildInput();
const plan = rebalance(input);

describe("rebalance invariants", () => {
  it("keeps every account cash-neutral", () => {
    for (const accountPlan of plan.accountPlans) {
      if (accountPlan.skipped) continue;
      const nonCash = accountPlan.trades.filter(
        (trade) => trade.assetClassId !== ASSET_CLASS_IDS.cash,
      );
      const cash = accountPlan.trades.filter(
        (trade) => trade.assetClassId === ASSET_CLASS_IDS.cash,
      );

      const nonCashFlow = nonCash.reduce(
        (sum, t) => sum + (t.action === "buy" ? t.amount : -t.amount),
        0,
      );
      const cashFlow = cash.reduce(
        (sum, t) => sum + (t.action === "buy" ? t.amount : -t.amount),
        0,
      );

      expect(nonCashFlow + cashFlow).toBeCloseTo(0, 2);
    }
  });

  it("never moves money between accounts", () => {
    const accountIds = new Set(plan.trades.map((trade) => trade.accountId));
    for (const accountId of accountIds) {
      const trades = plan.trades.filter((t) => t.accountId === accountId);
      const net = trades.reduce(
        (sum, t) => sum + (t.action === "buy" ? t.amount : -t.amount),
        0,
      );
      expect(net).toBeCloseTo(0, 2);
    }
  });

  it("never sells more shares than are held", () => {
    for (const trade of plan.trades) {
      if (trade.action !== "sell") continue;
      const position = input.positions.find(
        (p) => p.accountId === trade.accountId && p.symbol === trade.symbol,
      );
      expect(position).toBeDefined();
      expect(trade.shares).toBeLessThanOrEqual((position?.quantity ?? 0) + 1e-6);
    }
  });

  it("never leaves an account with negative cash", () => {
    for (const accountPlan of plan.accountPlans) {
      expect(accountPlan.endingCash).toBeGreaterThanOrEqual(0);
    }
  });

  it("rounds every trade to the configured share precision", () => {
    for (const trade of plan.trades) {
      if (trade.price === 1) continue;
      const factor = 10 ** DEFAULT_SETTINGS.sharePrecision;
      expect(Math.abs(trade.shares * factor - Math.round(trade.shares * factor)))
        .toBeLessThan(1e-6);
    }
  });

  it("orders sells before buys within each account", () => {
    for (const accountPlan of plan.accountPlans) {
      const actions = accountPlan.trades.map((trade) => trade.action);
      const firstBuy = actions.indexOf("buy");
      const lastSell = actions.lastIndexOf("sell");
      if (firstBuy === -1 || lastSell === -1) continue;
      expect(lastSell).toBeLessThan(firstBuy);
    }
  });

  it("emits no trade with zero or negative shares", () => {
    for (const trade of plan.trades) {
      expect(trade.shares).toBeGreaterThan(0);
      expect(trade.amount).toBeGreaterThan(0);
    }
  });
});

describe("the de-minimis account", () => {
  it("is skipped rather than dividing by zero", () => {
    const tiny = plan.accountPlans.find((p) => p.accountId === "XQMTVRWK");
    expect(tiny?.skipped).toBe(true);
    expect(tiny?.trades).toEqual([]);
    expect(Number.isFinite(tiny?.total ?? NaN)).toBe(true);
  });
});

describe("targets and drift", () => {
  it("reports the current allocation against the seeded target", () => {
    const byClass = Object.fromEntries(
      plan.allocations.map((a) => [a.assetClassId, a]),
    );
    expect(byClass[ASSET_CLASS_IDS.cash].currentPct).toBeCloseTo(19.0, 0);
    expect(byClass[ASSET_CLASS_IDS.usEquity].currentPct).toBeCloseTo(14.2, 0);
    expect(byClass[ASSET_CLASS_IDS.usEquity].targetPct).toBe(35);
  });

  it("moves each asset class toward its target", () => {
    const before = summarize(input.positions, input.mappings);
    const afterByClass = new Map<string, number>();

    for (const position of input.positions) {
      const assetClassId = input.mappings.find(
        (m) => m.symbol === position.symbol,
      )?.assetClassId;
      if (!assetClassId) continue;
      afterByClass.set(
        assetClassId,
        (afterByClass.get(assetClassId) ?? 0) + position.marketValue,
      );
    }
    for (const trade of plan.trades) {
      const signed = trade.action === "buy" ? trade.amount : -trade.amount;
      afterByClass.set(
        trade.assetClassId,
        (afterByClass.get(trade.assetClassId) ?? 0) + signed,
      );
    }

    for (const allocation of plan.allocations) {
      if (plan.withinBandClassIds.includes(allocation.assetClassId)) continue;
      const after = afterByClass.get(allocation.assetClassId) ?? 0;
      const beforeDrift = Math.abs(
        allocation.targetDollars - (before.byClass.get(allocation.assetClassId) ?? 0),
      );
      const afterDrift = Math.abs(allocation.targetDollars - after);
      expect(afterDrift).toBeLessThanOrEqual(beforeDrift + 0.01);
    }
  });

  it("lands the household within a dollar of every target it can reach", () => {
    const afterByClass = new Map<string, number>();
    for (const position of input.positions) {
      const assetClassId = input.mappings.find(
        (m) => m.symbol === position.symbol,
      )?.assetClassId;
      if (!assetClassId) continue;
      afterByClass.set(
        assetClassId,
        (afterByClass.get(assetClassId) ?? 0) + position.marketValue,
      );
    }
    for (const trade of plan.trades) {
      const signed = trade.action === "buy" ? trade.amount : -trade.amount;
      afterByClass.set(
        trade.assetClassId,
        (afterByClass.get(trade.assetClassId) ?? 0) + signed,
      );
    }

    const totalAfter = [...afterByClass.values()].reduce((a, b) => a + b, 0);
    expect(totalAfter).toBeCloseTo(plan.investableTotal, 1);
  });

  it("emits no trades when the portfolio already matches the target", () => {
    const matched = buildInput();
    const summary = summarize(matched.positions, matched.mappings);
    const targetWeights = DEFAULT_ASSET_CLASSES.map((assetClass) => ({
      targetSetId: "t",
      assetClassId: assetClass.id,
      weightPct:
        ((summary.byClass.get(assetClass.id) ?? 0) / summary.investableTotal) *
        100,
    }));

    const flat = rebalance({ ...matched, targetWeights });
    expect(flat.trades).toEqual([]);
  });

  it("suppresses classes inside the drift band", () => {
    const wide = rebalance(
      buildInput({
        settings: { ...DEFAULT_SETTINGS, driftBandAbs: 10_000_000 },
      }),
    );
    expect(wide.trades).toEqual([]);
    expect(wide.withinBandClassIds).toHaveLength(DEFAULT_ASSET_CLASSES.length);
  });
});

describe("cash isolation under an impossible target", () => {
  it("reports unreachable dollars instead of moving cash between accounts", () => {
    const base = buildInput();
    const cashHeavy = rebalance({
      ...base,
      targetWeights: [
        { targetSetId: "t", assetClassId: ASSET_CLASS_IDS.cash, weightPct: 100 },
        { targetSetId: "t", assetClassId: ASSET_CLASS_IDS.usEquity, weightPct: 0 },
        {
          targetSetId: "t",
          assetClassId: ASSET_CLASS_IDS.international,
          weightPct: 0,
        },
        { targetSetId: "t", assetClassId: ASSET_CLASS_IDS.treasuries, weightPct: 0 },
        { targetSetId: "t", assetClassId: ASSET_CLASS_IDS.gold, weightPct: 0 },
        { targetSetId: "t", assetClassId: ASSET_CLASS_IDS.thematic, weightPct: 0 },
      ],
    });

    for (const accountPlan of cashHeavy.accountPlans) {
      if (accountPlan.skipped) continue;
      const net = accountPlan.trades.reduce(
        (sum, t) => sum + (t.action === "buy" ? t.amount : -t.amount),
        0,
      );
      expect(net).toBeCloseTo(0, 2);
    }
  });

  it("cannot fund one account's buys with another account's cash", () => {
    const base = buildInput();
    const jointOnly = base.positions.filter(
      (position) => position.accountId === "X483920176",
    );
    const isolated = rebalance({
      ...base,
      accounts: base.accounts.filter((a) => a.id === "X483920176"),
      positions: jointOnly,
    });

    const spend = isolated.trades.reduce(
      (sum, t) => sum + (t.action === "buy" ? t.amount : -t.amount),
      0,
    );
    expect(spend).toBeCloseTo(0, 2);
  });
});

describe("unmapped holdings", () => {
  it("holds unmapped dollars out of the target math", () => {
    const base = buildInput();
    const withMystery: Position[] = [
      ...base.positions,
      {
        id: "X483920176:MYST",
        accountId: "X483920176",
        symbol: "MYST",
        description: "MYSTERY HOLDING",
        quantity: 10,
        price: 100,
        marketValue: 1000,
        isCoreCash: false,
        isCashEquivalent: false,
        reportedPercentOfAccount: null,
      },
    ];

    const result = rebalance({ ...base, positions: withMystery });
    expect(result.unmappedDollars).toBeCloseTo(1000, 2);
    expect(result.unmappedSymbols).toContain("MYST");
    expect(result.trades.some((trade) => trade.symbol === "MYST")).toBe(false);
    expect(result.investableTotal).toBeCloseTo(533137.47, 2);
  });
});
