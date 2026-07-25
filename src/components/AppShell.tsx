"use client";

import {
  ArrowLeftRight,
  Check,
  LayoutDashboard,
  Loader2,
  RotateCcw,
  Tags,
  Target,
  Upload,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { fmtMoney } from "@/lib/format";
import { useStore } from "./StoreProvider";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/targets", label: "Targets", icon: Target },
  { href: "/trades", label: "Trade plan", icon: ArrowLeftRight },
  { href: "/classifications", label: "Classifications", icon: Tags },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { store, plan, status, resetToSample, uploadCsv } = useStore();
  const fileInput = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [justReset, setJustReset] = useState(false);

  async function doReset() {
    setResetting(true);
    await resetToSample();
    setResetting(false);
    setConfirmReset(false);
    setJustReset(true);
    setTimeout(() => setJustReset(false), 2500);
  }

  const household = plan ? plan.investableTotal + plan.unmappedDollars : null;
  const needsReview =
    store?.mappings.filter((mapping) => mapping.assetClassId === null).length ??
    0;
  const tradeCount = plan?.trades.length ?? 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
              <Wallet className="h-4.5 w-4.5" />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-slate-900">
                Household Rebalancer
              </p>
              <p className="text-xs text-slate-500">
                {store ? `${store.accounts.length} accounts` : "Loading…"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {household !== null && (
              <div className="hidden text-right sm:block">
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Household
                </p>
                <p className="text-sm font-semibold tabular-nums text-slate-900">
                  {fmtMoney(household)}
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
              title="Discard your changes and reload the bundled sample portfolio"
            >
              {justReset ? (
                <Check className="h-4 w-4 text-emerald-600" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">
                {justReset ? "Reset done" : "Reset"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              {status === "loading" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Upload CSV</span>
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadCsv(file);
                event.target.value = "";
              }}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-8 px-4 py-8 sm:px-6">
        <aside className="hidden w-56 shrink-0 lg:block">
          <nav className="sticky top-24 space-y-1">
            {NAV.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              const Icon = item.icon;
              const badge =
                item.href === "/classifications"
                  ? needsReview
                  : item.href === "/trades"
                    ? tradeCount
                    : 0;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                    active
                      ? "bg-slate-900 font-medium text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="flex-1">{item.label}</span>
                  {badge > 0 && (
                    <span
                      className={`rounded-full px-1.5 text-xs font-semibold ${
                        item.href === "/classifications"
                          ? "bg-amber-100 text-amber-700"
                          : active
                            ? "bg-white/20 text-white"
                            : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      {confirmReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">
              Reset to sample data?
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              This reloads the bundled sample portfolio and discards:
            </p>
            <ul className="mt-3 space-y-1 text-sm text-slate-600">
              <li>· any CSV you uploaded</li>
              <li>· your target weights and drift band</li>
              <li>· your cash preference order</li>
              <li>· any classification overrides</li>
            </ul>
            <p className="mt-3 text-sm text-slate-500">
              Everything is stored in this browser only, so this cannot be
              undone.
            </p>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void doReset()}
                disabled={resetting}
                className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
              >
                {resetting && <Loader2 className="h-4 w-4 animate-spin" />}
                Reset data
              </button>
            </div>
          </div>
        </div>
      )}

      <nav className="sticky bottom-0 z-40 flex border-t border-slate-200 bg-white lg:hidden">
        {NAV.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-xs ${
                active ? "text-slate-900" : "text-slate-400"
              }`}
            >
              <Icon className="h-4.5 w-4.5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
