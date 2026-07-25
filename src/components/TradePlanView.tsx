"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import type { AccountPlan, RebalancePlan } from "@/lib/domain/rebalance";
import type { AssetClass } from "@/lib/domain/types";
import { fmtMoney, fmtShares } from "@/lib/format";

interface Props {
  plan: RebalancePlan;
  assetClasses: AssetClass[];
}

function toCsv(plan: RebalancePlan): string {
  const header = "Account,Symbol,Action,Shares,Price,Amount";
  const rows = plan.trades.map((trade) =>
    [
      `"${trade.accountName}"`,
      trade.symbol,
      trade.action.toUpperCase(),
      trade.shares,
      trade.price,
      trade.amount,
    ].join(","),
  );
  return [header, ...rows].join("\n");
}

function AccountBlock({
  accountPlan,
  nameById,
}: {
  accountPlan: AccountPlan;
  nameById: Map<string, string>;
}) {
  const buys = accountPlan.trades.filter((trade) => trade.action === "buy");
  const sells = accountPlan.trades.filter((trade) => trade.action === "sell");

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div>
          <h4 className="font-semibold text-slate-900">
            {accountPlan.accountName}
          </h4>
          <p className="text-xs text-slate-500">
            {fmtMoney(accountPlan.total)} · {sells.length} sells,{" "}
            {buys.length} buys
          </p>
        </div>
        <div className="text-right text-xs text-slate-500">
          <div>
            Cash {fmtMoney(accountPlan.startingCash)} →{" "}
            <span className="font-semibold text-slate-900">
              {fmtMoney(accountPlan.endingCash)}
            </span>
          </div>
        </div>
      </div>

      {accountPlan.skipped ? (
        <p className="px-4 py-6 text-sm text-slate-500">
          {accountPlan.skipReason}
        </p>
      ) : accountPlan.trades.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-500">
          Already within the drift band. No trades needed.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2 font-medium">Action</th>
              <th className="px-4 py-2 font-medium">Symbol</th>
              <th className="px-4 py-2 text-right font-medium">Shares</th>
              <th className="px-4 py-2 text-right font-medium">Price</th>
              <th className="px-4 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {accountPlan.trades.map((trade, tradeIndex) => (
              <tr
                key={`${trade.symbol}-${tradeIndex}`}
                className="border-b border-slate-50 last:border-0"
              >
                <td className="px-4 py-2">
                  <span
                    className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${
                      trade.action === "buy"
                        ? "bg-sky-50 text-sky-700"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {trade.action.toUpperCase()}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <div className="font-medium text-slate-900">
                    {trade.symbol}
                  </div>
                  <div className="text-xs text-slate-400">
                    {nameById.get(trade.assetClassId) ?? trade.assetClassId}
                  </div>
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-700">
                  {fmtShares(trade.shares)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                  {fmtMoney(trade.price)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-900">
                  {fmtMoney(trade.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function TradePlanView({ plan, assetClasses }: Props) {
  const [copied, setCopied] = useState(false);
  const nameById = new Map(assetClasses.map((cls) => [cls.id, cls.name]));

  async function copy() {
    await navigator.clipboard.writeText(toCsv(plan));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">Trade plan</h3>
          <p className="text-sm text-slate-500">
            {plan.trades.length} trades across{" "}
            {plan.accountPlans.filter((p) => p.trades.length > 0).length}{" "}
            accounts. Sells are listed before buys so each buy is funded.
          </p>
        </div>
        {plan.trades.length > 0 && (
          <button
            type="button"
            onClick={copy}
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-600" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {copied ? "Copied" : "Copy as CSV"}
          </button>
        )}
      </div>

      {plan.unreachable.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-semibold">Unreachable targets</p>
          <p className="mt-1">
            Cash cannot move between accounts, so part of the target could not
            be funded:
          </p>
          <ul className="mt-2 space-y-1">
            {plan.unreachable.map((item, index) => (
              <li key={`${item.assetClassId}-${index}`}>
                {nameById.get(item.assetClassId) ?? item.assetClassId} —{" "}
                {fmtMoney(item.dollars)} short
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-4">
        {plan.accountPlans.map((accountPlan) => (
          <AccountBlock
            key={accountPlan.accountId}
            accountPlan={accountPlan}
            nameById={nameById}
          />
        ))}
      </div>
    </div>
  );
}
