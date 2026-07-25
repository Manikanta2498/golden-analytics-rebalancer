import type { Position, SymbolMapping } from "./types";

export interface ClassAllocation {
  assetClassId: string;
  currentDollars: number;
  currentPct: number;
  targetDollars: number;
  targetPct: number;
  driftDollars: number;
  driftPct: number;
}

export interface AllocationSummary {
  total: number;
  investableTotal: number;
  unmappedDollars: number;
  unmappedSymbols: string[];
  byClass: Map<string, number>;
}

export function mappingIndex(
  mappings: SymbolMapping[],
): Map<string, string | null> {
  return new Map(
    mappings.map((mapping) => [mapping.symbol, mapping.assetClassId]),
  );
}

export function summarize(
  positions: Position[],
  mappings: SymbolMapping[],
): AllocationSummary {
  const index = mappingIndex(mappings);
  const byClass = new Map<string, number>();
  const unmappedSymbols = new Set<string>();

  let total = 0;
  let unmappedDollars = 0;

  for (const position of positions) {
    total += position.marketValue;
    const assetClassId = index.get(position.symbol) ?? null;

    if (!assetClassId) {
      unmappedDollars += position.marketValue;
      unmappedSymbols.add(position.symbol);
      continue;
    }

    byClass.set(
      assetClassId,
      (byClass.get(assetClassId) ?? 0) + position.marketValue,
    );
  }

  return {
    total,
    investableTotal: total - unmappedDollars,
    unmappedDollars,
    unmappedSymbols: [...unmappedSymbols],
    byClass,
  };
}

export function pct(value: number, total: number): number {
  if (total === 0) return 0;
  return (value / total) * 100;
}

export function buildAllocations(
  summary: AllocationSummary,
  targetWeights: Map<string, number>,
  assetClassIds: string[],
): ClassAllocation[] {
  return assetClassIds.map((assetClassId) => {
    const currentDollars = summary.byClass.get(assetClassId) ?? 0;
    const targetPct = targetWeights.get(assetClassId) ?? 0;
    const targetDollars = (targetPct / 100) * summary.investableTotal;

    return {
      assetClassId,
      currentDollars,
      currentPct: pct(currentDollars, summary.investableTotal),
      targetDollars,
      targetPct,
      driftDollars: targetDollars - currentDollars,
      driftPct:
        pct(targetDollars, summary.investableTotal) -
        pct(currentDollars, summary.investableTotal),
    };
  });
}
