"use client";

import type { AssetClass, Position, SymbolMapping } from "@/lib/domain/types";
import { fmtMoney } from "@/lib/format";

interface Props {
  mappings: SymbolMapping[];
  assetClasses: AssetClass[];
  positions: Position[];
  onOverride: (symbol: string, assetClassId: string) => void;
}

const SOURCE_LABEL: Record<string, string> = {
  seed: "Seed map",
  inferred: "Description",
  figi: "OpenFIGI",
  user: "You",
};

export function ClassificationsTable({
  mappings,
  assetClasses,
  positions,
  onOverride,
}: Props) {
  const dollarsBySymbol = new Map<string, number>();
  for (const position of positions) {
    dollarsBySymbol.set(
      position.symbol,
      (dollarsBySymbol.get(position.symbol) ?? 0) + position.marketValue,
    );
  }

  const descriptionBySymbol = new Map(
    positions.map((position) => [position.symbol, position.description]),
  );

  const sorted = [...mappings].sort((a, b) => {
    const aUnmapped = a.assetClassId === null ? 0 : 1;
    const bUnmapped = b.assetClassId === null ? 0 : 1;
    if (aUnmapped !== bUnmapped) return aUnmapped - bUnmapped;
    return (
      (dollarsBySymbol.get(b.symbol) ?? 0) - (dollarsBySymbol.get(a.symbol) ?? 0)
    );
  });

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3 font-medium">Symbol</th>
            <th className="px-4 py-3 text-right font-medium">Value</th>
            <th className="px-4 py-3 font-medium">Classified by</th>
            <th className="w-56 px-4 py-3 font-medium">Asset class</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((mapping) => (
            <tr
              key={mapping.symbol}
              className="border-b border-slate-100 last:border-0"
            >
              <td className="px-4 py-3">
                <div className="font-medium text-slate-900">
                  {mapping.symbol}
                </div>
                <div className="max-w-md truncate text-xs text-slate-400">
                  {descriptionBySymbol.get(mapping.symbol)}
                </div>
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                {fmtMoney(dollarsBySymbol.get(mapping.symbol) ?? 0)}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${
                    mapping.assetClassId === null
                      ? "bg-amber-50 text-amber-700"
                      : mapping.source === "user"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {mapping.assetClassId === null
                    ? "Needs review"
                    : (SOURCE_LABEL[mapping.source] ?? mapping.source)}
                </span>
                {mapping.assetClassId !== null && mapping.confidence < 1 && (
                  <span className="ml-2 text-xs text-slate-400">
                    {Math.round(mapping.confidence * 100)}% confidence
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <select
                  aria-label={`Asset class for ${mapping.symbol}`}
                  value={mapping.assetClassId ?? ""}
                  onChange={(event) =>
                    onOverride(mapping.symbol, event.target.value)
                  }
                  className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none transition focus:border-slate-900"
                >
                  <option value="" disabled>
                    Choose a class…
                  </option>
                  {assetClasses.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
