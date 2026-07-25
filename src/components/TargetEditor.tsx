"use client";

import { ArrowDown, ArrowUp, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import type {
  Account,
  AssetClass,
  Settings,
  TargetWeight,
} from "@/lib/domain/types";

interface Props {
  assetClasses: AssetClass[];
  targetWeights: TargetWeight[];
  settings: Settings;
  accounts: Account[];
  onApply: (weights: TargetWeight[], settings: Settings) => void;
  onReorderAccounts: (accountIds: string[]) => void;
  onReset: () => void;
}

export function TargetEditor({
  assetClasses,
  targetWeights,
  settings,
  accounts,
  onApply,
  onReorderAccounts,
  onReset,
}: Props) {
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      assetClasses.map((cls) => [
        cls.id,
        String(
          targetWeights.find((weight) => weight.assetClassId === cls.id)
            ?.weightPct ?? 0,
        ),
      ]),
    ),
  );
  const [bandPct, setBandPct] = useState(String(settings.driftBandPct));
  const [bandAbs, setBandAbs] = useState(String(settings.driftBandAbs));

  const total = useMemo(
    () =>
      Object.values(draft).reduce(
        (sum, value) => sum + (Number.parseFloat(value) || 0),
        0,
      ),
    [draft],
  );

  const balanced = Math.abs(total - 100) < 0.01;

  const ranked = [...accounts].sort(
    (a, b) => a.cashPreferenceRank - b.cashPreferenceRank,
  );

  function move(index: number, direction: -1 | 1) {
    const next = [...ranked];
    const swap = index + direction;
    if (swap < 0 || swap >= next.length) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    onReorderAccounts(next.map((account) => account.id));
  }

  function apply() {
    if (!balanced) return;
    const targetSetId = targetWeights[0]?.targetSetId ?? "default-target";
    onApply(
      assetClasses.map((cls) => ({
        targetSetId,
        assetClassId: cls.id,
        weightPct: Number.parseFloat(draft[cls.id]) || 0,
      })),
      {
        ...settings,
        driftBandPct: Number.parseFloat(bandPct) || 0,
        driftBandAbs: Number.parseFloat(bandAbs) || 0,
      },
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">Target allocation</h3>
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset data
          </button>
        </div>

        <div className="space-y-2">
          {assetClasses.map((cls) => (
            <div key={cls.id} className="flex items-center gap-3">
              <label
                htmlFor={`weight-${cls.id}`}
                className="flex-1 text-sm text-slate-700"
              >
                {cls.name}
              </label>
              <div className="relative">
                <input
                  id={`weight-${cls.id}`}
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={draft[cls.id] ?? "0"}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      [cls.id]: event.target.value,
                    }))
                  }
                  className="w-24 rounded-lg border border-slate-200 py-1.5 pl-3 pr-7 text-right text-sm tabular-nums outline-none transition focus:border-slate-900"
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                  %
                </span>
              </div>
            </div>
          ))}
        </div>

        <div
          className={`mt-4 flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
            balanced
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          <span>Total</span>
          <span className="font-semibold tabular-nums">
            {total.toFixed(2)}%
            {!balanced && (
              <span className="ml-2 font-normal">must equal 100%</span>
            )}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="band-pct"
              className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500"
            >
              Drift band %
            </label>
            <input
              id="band-pct"
              type="number"
              min={0}
              step={0.1}
              value={bandPct}
              onChange={(event) => setBandPct(event.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm tabular-nums outline-none transition focus:border-slate-900"
            />
          </div>
          <div>
            <label
              htmlFor="band-abs"
              className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500"
            >
              Drift band $
            </label>
            <input
              id="band-abs"
              type="number"
              min={0}
              step={100}
              value={bandAbs}
              onChange={(event) => setBandAbs(event.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm tabular-nums outline-none transition focus:border-slate-900"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={apply}
          disabled={!balanced}
          className="mt-5 w-full rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
        >
          Apply target
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="font-semibold text-slate-900">Cash preference</h3>
        <p className="mt-1 text-sm text-slate-500">
          Cash fills the most-preferred account first. Cash cannot move between
          accounts, so each one is funded only by its own money market.
        </p>

        <ol className="mt-4 space-y-2">
          {ranked.map((account, index) => (
            <li
              key={account.id}
              className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-900">
                  {account.name}
                </div>
                <div className="text-xs text-slate-400">
                  {account.type === "retirement" ? "Retirement" : "Taxable"}
                  {account.coreCashSymbol
                    ? ` · core ${account.coreCashSymbol}`
                    : ""}
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  aria-label={`Move ${account.name} up`}
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${account.name} down`}
                  onClick={() => move(index, 1)}
                  disabled={index === ranked.length - 1}
                  className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
