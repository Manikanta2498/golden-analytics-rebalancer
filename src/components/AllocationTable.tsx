"use client";

import type { ClassAllocation } from "@/lib/domain/allocate";
import type { AssetClass } from "@/lib/domain/types";
import { fmtMoney, fmtPct, fmtSignedPct } from "@/lib/format";

interface Props {
  allocations: ClassAllocation[];
  assetClasses: AssetClass[];
  withinBandClassIds: string[];
}

export function AllocationTable({
  allocations,
  assetClasses,
  withinBandClassIds,
}: Props) {
  const nameById = new Map(assetClasses.map((cls) => [cls.id, cls.name]));
  const inBand = new Set(withinBandClassIds);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3 font-medium">Asset class</th>
            <th className="px-4 py-3 text-right font-medium">Current</th>
            <th className="px-4 py-3 text-right font-medium">Target</th>
            <th className="px-4 py-3 text-right font-medium">Drift</th>
            <th className="w-56 px-4 py-3 font-medium">Current vs target</th>
          </tr>
        </thead>
        <tbody>
          {allocations.map((allocation) => {
            const drifting = !inBand.has(allocation.assetClassId);
            const over = allocation.driftPct < 0;

            return (
              <tr
                key={allocation.assetClassId}
                className="border-b border-slate-100 last:border-0"
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">
                    {nameById.get(allocation.assetClassId) ??
                      allocation.assetClassId}
                  </div>
                  {!drifting && (
                    <div className="text-xs text-slate-400">within band</div>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  <div className="text-slate-900">
                    {fmtPct(allocation.currentPct)}
                  </div>
                  <div className="text-xs text-slate-400">
                    {fmtMoney(allocation.currentDollars)}
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  <div className="text-slate-900">
                    {fmtPct(allocation.targetPct)}
                  </div>
                  <div className="text-xs text-slate-400">
                    {fmtMoney(allocation.targetDollars)}
                  </div>
                </td>
                <td
                  className={`px-4 py-3 text-right tabular-nums font-medium ${
                    !drifting
                      ? "text-slate-400"
                      : over
                        ? "text-amber-600"
                        : "text-sky-600"
                  }`}
                >
                  {fmtSignedPct(-allocation.driftPct)}
                  <div className="text-xs font-normal text-slate-400">
                    {fmtMoney(Math.abs(allocation.driftDollars))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="relative h-2 w-full rounded-full bg-slate-100">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-slate-800"
                      style={{
                        width: `${Math.min(100, allocation.currentPct)}%`,
                      }}
                    />
                    <div
                      className="absolute -top-1 h-4 w-0.5 bg-sky-500"
                      style={{
                        left: `${Math.min(100, allocation.targetPct)}%`,
                      }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
