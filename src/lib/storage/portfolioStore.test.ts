import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePortfolioCsv } from "@/lib/domain/parseCsv";
import {
  ASSET_CLASS_IDS,
  SCHEMA_VERSION,
  createStore,
  seedMappingsFor,
  targetWeightsSumTo100,
  DEFAULT_TARGET_WEIGHTS,
} from "@/lib/domain/seed";
import { decodeStore } from "./portfolioStore";

const csvText = readFileSync(
  join(process.cwd(), "public", "portfolio.csv"),
  "utf8",
);

const store = createStore(parsePortfolioCsv(csvText));

describe("seed data", () => {
  it("ships default targets that sum to 100%", () => {
    expect(targetWeightsSumTo100(DEFAULT_TARGET_WEIGHTS)).toBe(true);
  });

  it("maps every target weight to a real asset class", () => {
    const classIds = new Set(store.assetClasses.map((cls) => cls.id));
    for (const weight of DEFAULT_TARGET_WEIGHTS) {
      expect(classIds.has(weight.assetClassId)).toBe(true);
    }
  });

  it("seeds a mapping for every symbol in the sample portfolio", () => {
    const symbols = [...new Set(store.positions.map((p) => p.symbol))];
    const mapped = new Set(store.mappings.map((m) => m.symbol));
    for (const symbol of symbols) {
      expect(mapped.has(symbol)).toBe(true);
    }
  });

  it("classifies the sample universe as designed", () => {
    const bySymbol = Object.fromEntries(
      store.mappings.map((m) => [m.symbol, m.assetClassId]),
    );
    expect(bySymbol.FNILX).toBe(ASSET_CLASS_IDS.usEquity);
    expect(bySymbol.FZILX).toBe(ASSET_CLASS_IDS.international);
    expect(bySymbol.VGK).toBe(ASSET_CLASS_IDS.international);
    expect(bySymbol.BIL).toBe(ASSET_CLASS_IDS.treasuries);
    expect(bySymbol.IAU).toBe(ASSET_CLASS_IDS.gold);
    expect(bySymbol.NUKZ).toBe(ASSET_CLASS_IDS.thematic);
    expect(bySymbol.SHLD).toBe(ASSET_CLASS_IDS.thematic);
    expect(bySymbol.FRGXX).toBe(ASSET_CLASS_IDS.cash);
    expect(bySymbol.SPAXX).toBe(ASSET_CLASS_IDS.cash);
  });

  it("returns no mapping for unknown symbols", () => {
    expect(seedMappingsFor(["ZZZZ"])).toEqual([]);
  });
});

function omit(source: object, key: string): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(source).filter(([entryKey]) => entryKey !== key),
  );
}

describe("decodeStore", () => {
  it("reports empty when nothing is stored", () => {
    expect(decodeStore(null)).toEqual({ status: "empty" });
    expect(decodeStore("")).toEqual({ status: "empty" });
  });

  it("round-trips a saved store", () => {
    const outcome = decodeStore(JSON.stringify(store));
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.store.positions).toHaveLength(store.positions.length);
    expect(outcome.store.accounts).toHaveLength(4);
  });

  it("reports stale rather than crashing on an older schema version", () => {
    const older = JSON.stringify({ ...store, schemaVersion: SCHEMA_VERSION - 1 });
    expect(decodeStore(older)).toEqual({
      status: "stale",
      foundVersion: SCHEMA_VERSION - 1,
    });
  });

  it("reports corrupt on malformed JSON", () => {
    const outcome = decodeStore("{ not json");
    expect(outcome.status).toBe("corrupt");
  });

  it("reports corrupt when a required collection is missing", () => {
    const outcome = decodeStore(JSON.stringify(omit(store, "positions")));
    expect(outcome.status).toBe("corrupt");
    if (outcome.status !== "corrupt") return;
    expect(outcome.reason).toContain("positions");
  });

  it("reports corrupt when schemaVersion is absent", () => {
    const outcome = decodeStore(JSON.stringify(omit(store, "schemaVersion")));
    expect(outcome.status).toBe("corrupt");
  });
});
