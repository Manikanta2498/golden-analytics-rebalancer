"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { AllocationCharts } from "@/components/AllocationCharts";
import { AllocationTable } from "@/components/AllocationTable";
import { PageHeader, PageState } from "@/components/PageState";
import { fmtMoney, fmtMoneyCompact } from "@/lib/format";

export function OverviewPage() {
  return (
    <PageState>
      {({ store, plan }) => (
        <>
          <PageHeader
            title="Overview"
            description={`${store.accounts.length} accounts · ${store.positions.length} positions · household ${fmtMoney(
              plan.investableTotal + plan.unmappedDollars,
            )}`}
          />

          {plan.unmappedDollars > 0 && (
            <Link
              href="/classifications"
              className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 transition hover:bg-amber-100"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <span className="font-semibold">
                  {fmtMoney(plan.unmappedDollars)} is unclassified
                </span>{" "}
                ({plan.unmappedSymbols.join(", ")}) and is excluded from every
                target. Classify it →
              </span>
            </Link>
          )}

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {store.accounts.map((account) => {
              const accountPlan = plan.accountPlans.find(
                (item) => item.accountId === account.id,
              );
              return (
                <div
                  key={account.id}
                  className="rounded-xl border border-slate-200 bg-white p-4"
                >
                  <p className="truncate text-sm font-medium text-slate-900">
                    {account.name}
                  </p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
                    {fmtMoneyCompact(accountPlan?.total ?? 0)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {account.type === "retirement" ? "Retirement" : "Taxable"}
                    {" · cash "}
                    {fmtMoneyCompact(accountPlan?.startingCash ?? 0)}
                  </p>
                  <p className="mt-2 text-xs text-slate-400">
                    Cash priority #{account.cashPreferenceRank + 1}
                    {account.coreCashSymbol
                      ? ` · ${account.coreCashSymbol}`
                      : ""}
                  </p>
                </div>
              );
            })}
          </section>

          <section className="space-y-3">
            <h2 className="font-semibold text-slate-900">Allocation</h2>
            <AllocationCharts
              allocations={plan.allocations}
              assetClasses={store.assetClasses}
              accountPlans={plan.accountPlans}
              investableTotal={plan.investableTotal}
            />
          </section>

          <section className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold text-slate-900">
                Current vs target
              </h2>
              <Link
                href="/targets"
                className="text-sm text-slate-500 underline-offset-4 hover:text-slate-900 hover:underline"
              >
                Edit target
              </Link>
            </div>
            <AllocationTable
              allocations={plan.allocations}
              assetClasses={store.assetClasses}
              withinBandClassIds={plan.withinBandClassIds}
            />
          </section>
        </>
      )}
    </PageState>
  );
}
