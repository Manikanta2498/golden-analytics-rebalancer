import { SCHEMA_VERSION } from "@/lib/domain/seed";
import type { PortfolioStore } from "@/lib/domain/types";

export const STORAGE_KEY = "household-rebalancer:store";

export type DecodeOutcome =
  | { status: "ok"; store: PortfolioStore }
  | { status: "empty" }
  | { status: "corrupt"; reason: string }
  | { status: "stale"; foundVersion: number };

const REQUIRED_KEYS: Array<keyof PortfolioStore> = [
  "accounts",
  "positions",
  "assetClasses",
  "mappings",
  "targetSets",
  "targetWeights",
  "settings",
];

export function decodeStore(raw: string | null): DecodeOutcome {
  if (raw == null || raw.trim() === "") return { status: "empty" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "corrupt", reason: "not valid JSON" };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { status: "corrupt", reason: "not an object" };
  }

  const candidate = parsed as Partial<PortfolioStore>;

  if (typeof candidate.schemaVersion !== "number") {
    return { status: "corrupt", reason: "missing schemaVersion" };
  }

  if (candidate.schemaVersion !== SCHEMA_VERSION) {
    return { status: "stale", foundVersion: candidate.schemaVersion };
  }

  for (const key of REQUIRED_KEYS) {
    if (candidate[key] === undefined) {
      return { status: "corrupt", reason: `missing ${key}` };
    }
  }

  return { status: "ok", store: candidate as PortfolioStore };
}

export function loadStore(): DecodeOutcome {
  if (typeof window === "undefined") return { status: "empty" };
  try {
    return decodeStore(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return { status: "corrupt", reason: "localStorage unavailable" };
  }
}

export function saveStore(store: PortfolioStore): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function clearStore(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
