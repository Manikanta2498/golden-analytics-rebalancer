"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { RebalancePlan } from "@/lib/domain/rebalance";
import type {
  PortfolioStore,
  Settings,
  TargetWeight,
} from "@/lib/domain/types";
import { buildStoreFromCsv, loadSampleCsv } from "@/lib/storage/bootstrap";
import { clearStore, loadStore, saveStore } from "@/lib/storage/portfolioStore";

type Status = "loading" | "ready" | "error";

interface StoreContextValue {
  store: PortfolioStore | null;
  plan: RebalancePlan | null;
  status: Status;
  error: string | null;
  applyTarget: (weights: TargetWeight[], settings: Settings) => void;
  reorderAccounts: (accountIds: string[]) => void;
  overrideMapping: (symbol: string, assetClassId: string) => void;
  uploadCsv: (file: File) => Promise<void>;
  resetToSample: () => Promise<void>;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function useStore(): StoreContextValue {
  const value = useContext(StoreContext);
  if (!value) {
    throw new Error("useStore must be used inside StoreProvider");
  }
  return value;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<PortfolioStore | null>(null);
  const [plan, setPlan] = useState<RebalancePlan | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  const seedFromSample = useCallback(async () => {
    const csvText = await loadSampleCsv();
    const next = await buildStoreFromCsv(csvText);
    saveStore(next);
    setStore(next);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const outcome = loadStore();
        if (outcome.status === "ok") {
          if (!cancelled) setStore(outcome.store);
          return;
        }
        await seedFromSample();
      } catch (bootError) {
        if (cancelled) return;
        setError(
          bootError instanceof Error
            ? bootError.message
            : "Could not load the portfolio.",
        );
        setStatus("error");
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [seedFromSample]);

  useEffect(() => {
    if (!store) return;
    let cancelled = false;

    async function computePlan(current: PortfolioStore) {
      try {
        const response = await fetch("/api/rebalance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accounts: current.accounts,
            positions: current.positions,
            mappings: current.mappings,
            assetClasses: current.assetClasses,
            targetWeights: current.targetWeights,
            settings: current.settings,
          }),
        });
        const payload = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setError(payload?.error ?? "Could not build the plan.");
          setStatus("error");
          return;
        }
        setPlan(payload as RebalancePlan);
        setError(null);
        setStatus("ready");
      } catch {
        if (!cancelled) {
          setError("Could not reach the rebalance service.");
          setStatus("error");
        }
      }
    }

    void computePlan(store);
    return () => {
      cancelled = true;
    };
  }, [store]);

  const persist = useCallback((next: PortfolioStore) => {
    saveStore(next);
    setStore(next);
  }, []);

  const applyTarget = useCallback(
    (weights: TargetWeight[], settings: Settings) => {
      setStore((current) => {
        if (!current) return current;
        const next = { ...current, targetWeights: weights, settings };
        saveStore(next);
        return next;
      });
    },
    [],
  );

  const reorderAccounts = useCallback((accountIds: string[]) => {
    setStore((current) => {
      if (!current) return current;
      const rankById = new Map(accountIds.map((id, index) => [id, index]));
      const next = {
        ...current,
        accounts: current.accounts.map((account) => ({
          ...account,
          cashPreferenceRank:
            rankById.get(account.id) ?? account.cashPreferenceRank,
        })),
      };
      saveStore(next);
      return next;
    });
  }, []);

  const overrideMapping = useCallback(
    (symbol: string, assetClassId: string) => {
      setStore((current) => {
        if (!current) return current;
        const isCash = assetClassId === current.settings.cashAssetClassId;
        const next = {
          ...current,
          mappings: current.mappings.map((mapping) =>
            mapping.symbol === symbol
              ? {
                  ...mapping,
                  assetClassId,
                  source: "user" as const,
                  confidence: 1,
                }
              : mapping,
          ),
          positions: current.positions.map((position) =>
            position.symbol === symbol
              ? { ...position, isCashEquivalent: isCash }
              : position,
          ),
        };
        saveStore(next);
        return next;
      });
    },
    [],
  );

  const uploadCsv = useCallback(
    async (file: File) => {
      setStatus("loading");
      try {
        const csvText = await file.text();
        const next = await buildStoreFromCsv(csvText, store);
        persist(next);
      } catch (uploadError) {
        setError(
          uploadError instanceof Error
            ? uploadError.message
            : "Could not read that file.",
        );
        setStatus("error");
      }
    },
    [persist, store],
  );

  const resetToSample = useCallback(async () => {
    setStatus("loading");
    clearStore();
    try {
      await seedFromSample();
    } catch {
      setError("Could not reload the sample portfolio.");
      setStatus("error");
    }
  }, [seedFromSample]);

  const value = useMemo(
    () => ({
      store,
      plan,
      status,
      error,
      applyTarget,
      reorderAccounts,
      overrideMapping,
      uploadCsv,
      resetToSample,
    }),
    [
      store,
      plan,
      status,
      error,
      applyTarget,
      reorderAccounts,
      overrideMapping,
      uploadCsv,
      resetToSample,
    ],
  );

  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
}
