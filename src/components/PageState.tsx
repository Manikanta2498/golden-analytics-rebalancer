"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import type { RebalancePlan } from "@/lib/domain/rebalance";
import type { PortfolioStore } from "@/lib/domain/types";
import { useStore } from "./StoreProvider";

interface Props {
  children: (context: {
    store: PortfolioStore;
    plan: RebalancePlan;
  }) => ReactNode;
}

export function PageState({ children }: Props) {
  const { store, plan, status, error, resetToSample } = useStore();

  if (status === "error" && (!store || !plan)) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
        <p className="font-semibold">Something went wrong</p>
        <p className="mt-1 text-sm">{error}</p>
        <button
          type="button"
          onClick={() => void resetToSample()}
          className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
        >
          Reload sample portfolio
        </button>
      </div>
    );
  }

  if (!store || !plan) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex items-center gap-3 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading portfolio…
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {children({ store, plan })}
    </div>
  );
}

export function PageHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">
        {title}
      </h1>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  );
}
