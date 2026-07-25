"use client";

import type { ClassAllocation } from "@/lib/domain/allocate";
import type { AccountPlan } from "@/lib/domain/rebalance";
import type { AssetClass } from "@/lib/domain/types";
import { colorForClass } from "@/lib/colors";
import { fmtMoneyCompact, fmtPct, fmtSignedPct } from "@/lib/format";
import { DonutChart, type DonutSegment } from "./DonutChart";

interface Props {
  allocations: ClassAllocation[];
  assetClasses: AssetClass[];
  accountPlans: AccountPlan[];
  investableTotal: number;
}

export function AllocationCharts({
  allocations,
  assetClasses,
  accountPlans,
  investableTotal,
}: Props) {
  const nameById = new Map(assetClasses.map((cls) => [cls.id, cls.name]));

  const current: DonutSegment[] = allocations.map((allocation, index) => ({
    id: `current-${allocation.assetClassId}`,
    label: nameById.get(allocation.assetClassId) ?? allocation.assetClassId,
    value: allocation.currentDollars,
    color: colorForClass(allocation.assetClassId, index),
  }));

  const target: DonutSegment[] = allocations.map((allocation, index) => ({
    id: `target-${allocation.assetClassId}`,
    label: nameById.get(allocation.assetClassId) ?? allocation.assetClassId,
    value: allocation.targetDollars,
    color: colorForClass(allocation.assetClassId, index),
  }));

  const accountTotal = accountPlans.reduce((sum, plan) => sum + plan.total, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-start justify-center gap-6">
          <DonutChart
            segments={current}
            title="Current"
            centerLabel={fmtMoneyCompact(investableTotal)}
          />
          <DonutChart
            segments={target}
            title="Target"
            centerLabel={fmtMoneyCompact(investableTotal)}
          />
        </div>

        <ul className="mt-5 space-y-1.5">
          {allocations.map((allocation, index) => (
            <li
              key={allocation.assetClassId}
              className="flex items-center gap-2.5 text-sm"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{
                  backgroundColor: colorForClass(allocation.assetClassId, index),
                }}
              />
              <span className="flex-1 truncate text-slate-700">
                {nameById.get(allocation.assetClassId)}
              </span>
              <span className="tabular-nums text-slate-500">
                {fmtPct(allocation.currentPct)}
              </span>
              <span
                className={`w-16 text-right tabular-nums text-xs font-medium ${
                  Math.abs(allocation.driftPct) < 0.05
                    ? "text-slate-300"
                    : allocation.driftPct < 0
                      ? "text-amber-600"
                      : "text-sky-600"
                }`}
              >
                {fmtSignedPct(-allocation.driftPct)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-slate-900">
          Where the money sits
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Each account rebalances on its own — cash never crosses between them.
        </p>

        <div className="mt-4 space-y-4">
          {accountPlans.map((accountPlan) => {
            const width =
              accountTotal > 0 ? (accountPlan.total / accountTotal) * 100 : 0;
            const cashWidth =
              accountPlan.total > 0
                ? (accountPlan.startingCash / accountPlan.total) * 100
                : 0;
            const endingCashWidth =
              accountPlan.total > 0
                ? (accountPlan.endingCash / accountPlan.total) * 100
                : 0;

            return (
              <div key={accountPlan.accountId}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="truncate font-medium text-slate-800">
                    {accountPlan.accountName}
                  </span>
                  <span className="tabular-nums text-slate-500">
                    {fmtMoneyCompact(accountPlan.total)}
                  </span>
                </div>

                <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-slate-800"
                    style={{ width: `${width}%` }}
                  />
                </div>

                <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                  <span className="w-10 shrink-0">Cash</span>
                  <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-slate-300"
                      style={{ width: `${cashWidth}%` }}
                    />
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-emerald-500"
                      style={{ width: `${endingCashWidth}%` }}
                    />
                  </div>
                  <span className="w-32 shrink-0 text-right tabular-nums">
                    {fmtMoneyCompact(accountPlan.startingCash)} →{" "}
                    <span className="font-medium text-slate-900">
                      {fmtMoneyCompact(accountPlan.endingCash)}
                    </span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
