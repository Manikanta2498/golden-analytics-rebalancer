import {
  buildAllocations,
  mappingIndex,
  summarize,
  type ClassAllocation,
} from "./allocate";
import type {
  Account,
  AssetClass,
  Position,
  Settings,
  SymbolMapping,
  TargetWeight,
} from "./types";

export interface Trade {
  accountId: string;
  accountName: string;
  symbol: string;
  assetClassId: string;
  action: "buy" | "sell";
  shares: number;
  price: number;
  amount: number;
}

export interface AccountPlan {
  accountId: string;
  accountName: string;
  total: number;
  startingCash: number;
  endingCash: number;
  trades: Trade[];
  skipped: boolean;
  skipReason?: string;
}

export interface UnreachableTarget {
  assetClassId: string;
  dollars: number;
}

export interface RebalancePlan {
  allocations: ClassAllocation[];
  accountPlans: AccountPlan[];
  trades: Trade[];
  withinBandClassIds: string[];
  unreachable: UnreachableTarget[];
  unmappedDollars: number;
  unmappedSymbols: string[];
  investableTotal: number;
}

export interface RebalanceInput {
  accounts: Account[];
  positions: Position[];
  mappings: SymbolMapping[];
  assetClasses: AssetClass[];
  targetWeights: TargetWeight[];
  settings: Settings;
}

const DE_MINIMIS_ACCOUNT_TOTAL = 1;

function roundShares(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function accountTotals(positions: Position[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const position of positions) {
    totals.set(
      position.accountId,
      (totals.get(position.accountId) ?? 0) + position.marketValue,
    );
  }
  return totals;
}

function planCashPlacement(
  accounts: Account[],
  totals: Map<string, number>,
  householdCashTarget: number,
): Map<string, number> {
  const ranked = [...accounts].sort(
    (a, b) => a.cashPreferenceRank - b.cashPreferenceRank,
  );

  const cashByAccount = new Map<string, number>();
  let remaining = householdCashTarget;

  for (const account of ranked) {
    const capacity = totals.get(account.id) ?? 0;
    const placed = Math.max(0, Math.min(remaining, capacity));
    cashByAccount.set(account.id, placed);
    remaining -= placed;
  }

  return cashByAccount;
}

function preferredSymbolByClass(
  positions: Position[],
  index: Map<string, string | null>,
): Map<string, string> {
  const totals = new Map<string, Map<string, number>>();

  for (const position of positions) {
    const assetClassId = index.get(position.symbol);
    if (!assetClassId) continue;
    const bySymbol = totals.get(assetClassId) ?? new Map<string, number>();
    bySymbol.set(
      position.symbol,
      (bySymbol.get(position.symbol) ?? 0) + position.marketValue,
    );
    totals.set(assetClassId, bySymbol);
  }

  const preferred = new Map<string, string>();
  for (const [assetClassId, bySymbol] of totals) {
    const best = [...bySymbol.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best) preferred.set(assetClassId, best[0]);
  }
  return preferred;
}

function trimOverspend(
  trades: Trade[],
  availableCash: number,
  precision: number,
): void {
  const factor = 10 ** precision;

  for (let guard = 0; guard < 50; guard += 1) {
    const flow = trades.reduce(
      (sum, trade) =>
        sum + (trade.action === "buy" ? trade.amount : -trade.amount),
      0,
    );
    const overspend = roundMoney(flow - availableCash);
    if (overspend <= 0.005) return;

    const buys = trades
      .filter((trade) => trade.action === "buy")
      .sort((a, b) => b.amount - a.amount);
    const buy = buys[0];
    if (!buy) return;

    const reduceDollars = Math.min(buy.amount, overspend);
    const reduceShares = Math.ceil((reduceDollars / buy.price) * factor) / factor;
    const newShares = roundShares(buy.shares - reduceShares, precision);

    if (newShares <= 0) {
      trades.splice(trades.indexOf(buy), 1);
    } else {
      buy.shares = newShares;
      buy.amount = roundMoney(newShares * buy.price);
    }
  }
}

function priceForSymbol(positions: Position[], symbol: string): number {
  const match = positions.find(
    (position) => position.symbol === symbol && position.price > 0,
  );
  return match?.price ?? 1;
}

export function rebalance(input: RebalanceInput): RebalancePlan {
  const { accounts, positions, mappings, assetClasses, targetWeights, settings } =
    input;

  const index = mappingIndex(mappings);
  const summary = summarize(positions, mappings);
  const weights = new Map(
    targetWeights.map((weight) => [weight.assetClassId, weight.weightPct]),
  );
  const allocations = buildAllocations(
    summary,
    weights,
    assetClasses.map((assetClass) => assetClass.id),
  );

  const band = Math.max(
    (settings.driftBandPct / 100) * summary.investableTotal,
    settings.driftBandAbs,
  );

  const withinBandClassIds: string[] = [];
  const effectiveTargets = new Map<string, number>();

  for (const allocation of allocations) {
    if (Math.abs(allocation.driftDollars) <= band) {
      withinBandClassIds.push(allocation.assetClassId);
      effectiveTargets.set(allocation.assetClassId, allocation.currentDollars);
    } else {
      effectiveTargets.set(allocation.assetClassId, allocation.targetDollars);
    }
  }

  const totals = accountTotals(positions);
  const cashClassId = settings.cashAssetClassId;
  const inBand = new Set(withinBandClassIds);

  const currentByAccountClass = new Map<string, number>();
  for (const position of positions) {
    const assetClassId = index.get(position.symbol);
    if (!assetClassId) continue;
    const key = `${position.accountId}|${assetClassId}`;
    currentByAccountClass.set(
      key,
      (currentByAccountClass.get(key) ?? 0) + position.marketValue,
    );
  }

  const targetByAccountClass = new Map<string, number>();
  const unreachable: UnreachableTarget[] = [];

  const capacityByAccount = new Map<string, number>();
  for (const account of accounts) {
    const total = totals.get(account.id) ?? 0;
    const unmappedInAccount = positions
      .filter(
        (position) =>
          position.accountId === account.id && !index.get(position.symbol),
      )
      .reduce((sum, position) => sum + position.marketValue, 0);

    let frozen = 0;
    for (const assetClassId of inBand) {
      const key = `${account.id}|${assetClassId}`;
      const held = currentByAccountClass.get(key) ?? 0;
      targetByAccountClass.set(key, held);
      frozen += held;
    }

    capacityByAccount.set(
      account.id,
      Math.max(0, total - unmappedInAccount - frozen),
    );
  }

  if (!inBand.has(cashClassId)) {
    const cashByAccount = planCashPlacement(
      accounts,
      capacityByAccount,
      effectiveTargets.get(cashClassId) ?? 0,
    );
    for (const account of accounts) {
      const placed = cashByAccount.get(account.id) ?? 0;
      targetByAccountClass.set(`${account.id}|${cashClassId}`, placed);
      capacityByAccount.set(
        account.id,
        Math.max(0, (capacityByAccount.get(account.id) ?? 0) - placed),
      );
    }
  }

  const remainingCapacity = new Map(capacityByAccount);

  const nonCashClasses = assetClasses
    .map((assetClass) => assetClass.id)
    .filter(
      (assetClassId) =>
        assetClassId !== cashClassId && !inBand.has(assetClassId),
    );

  for (const assetClassId of nonCashClasses) {
    let need = effectiveTargets.get(assetClassId) ?? 0;

    for (const account of accounts) {
      if (need <= 0) break;
      const key = `${account.id}|${assetClassId}`;
      const held = currentByAccountClass.get(key) ?? 0;
      const capacity = remainingCapacity.get(account.id) ?? 0;
      const keep = Math.min(held, capacity, need);
      if (keep <= 0) continue;
      targetByAccountClass.set(key, (targetByAccountClass.get(key) ?? 0) + keep);
      remainingCapacity.set(account.id, capacity - keep);
      need -= keep;
    }

    if (need > 0.005) {
      const openAccounts = accounts.filter(
        (account) => (remainingCapacity.get(account.id) ?? 0) > 0,
      );
      const openCapacity = openAccounts.reduce(
        (sum, account) => sum + (remainingCapacity.get(account.id) ?? 0),
        0,
      );

      if (openCapacity <= 0) {
        unreachable.push({ assetClassId, dollars: roundMoney(need) });
        need = 0;
      } else {
        const share = Math.min(need, openCapacity);
        for (const account of openAccounts) {
          const capacity = remainingCapacity.get(account.id) ?? 0;
          const portion = (capacity / openCapacity) * share;
          const key = `${account.id}|${assetClassId}`;
          targetByAccountClass.set(
            key,
            (targetByAccountClass.get(key) ?? 0) + portion,
          );
          remainingCapacity.set(account.id, capacity - portion);
        }
        need -= share;
        if (need > 0.005) {
          unreachable.push({ assetClassId, dollars: roundMoney(need) });
        }
      }
    }
  }

  const preferred = preferredSymbolByClass(positions, index);
  const accountPlans: AccountPlan[] = [];
  const allTrades: Trade[] = [];

  for (const account of accounts) {
    const accountPositions = positions.filter(
      (position) => position.accountId === account.id,
    );
    const total = totals.get(account.id) ?? 0;
    const corePosition = accountPositions.find(
      (position) => position.isCoreCash,
    );
    const startingCash = corePosition?.marketValue ?? 0;

    if (total < DE_MINIMIS_ACCOUNT_TOTAL) {
      accountPlans.push({
        accountId: account.id,
        accountName: account.name,
        total,
        startingCash,
        endingCash: startingCash,
        trades: [],
        skipped: true,
        skipReason: "Account balance is too small to rebalance.",
      });
      continue;
    }

    const trades: Trade[] = [];
    const seenSymbols = new Set<string>();

    for (const assetClass of assetClasses) {
      const key = `${account.id}|${assetClass.id}`;
      const classTarget = targetByAccountClass.get(key) ?? 0;

      const classPositions = accountPositions.filter(
        (position) =>
          index.get(position.symbol) === assetClass.id && !position.isCoreCash,
      );

      const classCurrent = classPositions.reduce(
        (sum, position) => sum + position.marketValue,
        0,
      );

      const coreShare =
        assetClass.id === cashClassId && corePosition
          ? Math.max(0, classTarget - classCurrent)
          : 0;
      const distributable =
        assetClass.id === cashClassId && corePosition
          ? classTarget - coreShare
          : classTarget;

      if (classPositions.length === 0) {
        if (distributable <= 0.005) continue;
        const symbol = preferred.get(assetClass.id);
        if (!symbol) continue;
        const price = priceForSymbol(positions, symbol);
        const shares = roundShares(distributable / price, settings.sharePrecision);
        if (shares <= 0) continue;
        seenSymbols.add(symbol);
        trades.push({
          accountId: account.id,
          accountName: account.name,
          symbol,
          assetClassId: assetClass.id,
          action: "buy",
          shares,
          price,
          amount: roundMoney(shares * price),
        });
        continue;
      }

      for (const position of classPositions) {
        const weight =
          classCurrent > 0
            ? position.marketValue / classCurrent
            : 1 / classPositions.length;
        const symbolTarget = distributable * weight;
        const deltaDollars = symbolTarget - position.marketValue;
        let shares = roundShares(deltaDollars / position.price, settings.sharePrecision);

        if (shares < 0 && Math.abs(shares) > position.quantity) {
          shares = -position.quantity;
        }
        if (shares === 0) continue;

        seenSymbols.add(position.symbol);
        trades.push({
          accountId: account.id,
          accountName: account.name,
          symbol: position.symbol,
          assetClassId: assetClass.id,
          action: shares > 0 ? "buy" : "sell",
          shares: Math.abs(shares),
          price: position.price,
          amount: roundMoney(Math.abs(shares) * position.price),
        });
      }
    }

    if (corePosition) {
      trimOverspend(trades, startingCash, settings.sharePrecision);
    }

    const nonCashFlow = trades.reduce(
      (sum, trade) => sum + (trade.action === "buy" ? trade.amount : -trade.amount),
      0,
    );

    let endingCash = startingCash;

    if (corePosition) {
      const cashDelta = roundMoney(-nonCashFlow);
      endingCash = roundMoney(startingCash + cashDelta);

      if (endingCash < -0.005) {
        unreachable.push({
          assetClassId: cashClassId,
          dollars: roundMoney(-endingCash),
        });
        endingCash = 0;
      }

      if (Math.abs(cashDelta) >= 0.01) {
        trades.push({
          accountId: account.id,
          accountName: account.name,
          symbol: corePosition.symbol,
          assetClassId: cashClassId,
          action: cashDelta > 0 ? "buy" : "sell",
          shares: Math.abs(cashDelta),
          price: 1,
          amount: Math.abs(cashDelta),
        });
      }
    }

    trades.sort((a, b) => {
      if (a.action !== b.action) return a.action === "sell" ? -1 : 1;
      return b.amount - a.amount;
    });

    accountPlans.push({
      accountId: account.id,
      accountName: account.name,
      total,
      startingCash,
      endingCash,
      trades,
      skipped: false,
    });

    allTrades.push(...trades);
  }

  return {
    allocations,
    accountPlans,
    trades: allTrades,
    withinBandClassIds,
    unreachable,
    unmappedDollars: summary.unmappedDollars,
    unmappedSymbols: summary.unmappedSymbols,
    investableTotal: summary.investableTotal,
  };
}
