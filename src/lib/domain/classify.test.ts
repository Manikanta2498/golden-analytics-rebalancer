import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyClassifications,
  classifyInputsFromPositions,
  classifySymbol,
  classifySymbols,
  matchHeuristics,
  unresolvedSymbols,
} from "./classify";
import { parsePortfolioCsv } from "./parseCsv";
import { ASSET_CLASS_IDS } from "./seed";

const csvText = readFileSync(
  join(process.cwd(), "public", "portfolio.csv"),
  "utf8",
);

const parsed = parsePortfolioCsv(csvText);
const classifications = classifySymbols(classifyInputsFromPositions(parsed.positions));
const bySymbol = Object.fromEntries(
  classifications.map((classification) => [classification.symbol, classification]),
);

describe("classifying the real portfolio", () => {
  it("resolves every symbol in the sample file", () => {
    expect(unresolvedSymbols(classifications)).toEqual([]);
  });

  it("sends nothing to the review queue", () => {
    const review = classifications.filter((c) => c.needsReview);
    expect(review).toEqual([]);
  });

  it("assigns the designed asset classes", () => {
    expect(bySymbol.FNILX.assetClassId).toBe(ASSET_CLASS_IDS.usEquity);
    expect(bySymbol.FZILX.assetClassId).toBe(ASSET_CLASS_IDS.international);
    expect(bySymbol.VGK.assetClassId).toBe(ASSET_CLASS_IDS.international);
    expect(bySymbol.BIL.assetClassId).toBe(ASSET_CLASS_IDS.treasuries);
    expect(bySymbol.IAU.assetClassId).toBe(ASSET_CLASS_IDS.gold);
    expect(bySymbol.NUKZ.assetClassId).toBe(ASSET_CLASS_IDS.thematic);
    expect(bySymbol.SHLD.assetClassId).toBe(ASSET_CLASS_IDS.thematic);
  });

  it("treats all four money markets as cash", () => {
    for (const symbol of ["FZFXX", "SPAXX", "FCASH", "FRGXX"]) {
      expect(bySymbol[symbol].assetClassId).toBe(ASSET_CLASS_IDS.cash);
      expect(bySymbol[symbol].isCashEquivalent).toBe(true);
    }
  });

  it("promotes FRGXX to a cash equivalent on the positions", () => {
    const applied = applyClassifications(parsed.positions, classifications);
    const frgxx = applied.find((p) => p.id === "8043672915:FRGXX");
    expect(frgxx?.isCashEquivalent).toBe(true);
    expect(frgxx?.isCoreCash).toBe(false);
  });

  it("leaves non-cash positions untouched", () => {
    const applied = applyClassifications(parsed.positions, classifications);
    const bil = applied.find((p) => p.id === "X483920176:BIL");
    expect(bil?.isCashEquivalent).toBe(false);
  });
});

describe("heuristics without the seed map", () => {
  const infer = (description: string, price = 50) =>
    matchHeuristics(description, price);

  it("detects a money market from its description alone", () => {
    expect(infer("FIMM GOVERNMENT PORTFOLIO: INSTL CL", 1)?.assetClassId).toBe(
      ASSET_CLASS_IDS.cash,
    );
    expect(infer("FIDELITY INV MMKT GOVT-INST", 1)?.assetClassId).toBe(
      ASSET_CLASS_IDS.cash,
    );
  });

  it("uses the $1.00 NAV signal for fund-like names", () => {
    const match = infer("SOME CASH SWEEP PORTFOLIO", 1);
    expect(match?.assetClassId).toBe(ASSET_CLASS_IDS.cash);
  });

  it("does not call a $1.00 stock a money market", () => {
    expect(infer("PENNY MINING CORP COMMON STOCK", 1)?.assetClassId).not.toBe(
      ASSET_CLASS_IDS.cash,
    );
  });

  it("does not mistake a government money market for treasuries", () => {
    expect(infer("FIMM GOVERNMENT PORTFOLIO: INSTL CL", 1)?.assetClassId).toBe(
      ASSET_CLASS_IDS.cash,
    );
  });

  it("does not mistake the Global X issuer name for international exposure", () => {
    expect(infer("GLOBAL X FDS DEFENSE TECH ETF")?.assetClassId).toBe(
      ASSET_CLASS_IDS.thematic,
    );
  });

  it("classifies treasuries, gold, international and US equity", () => {
    expect(
      infer("SPDR SERIES TRUST STATE STREET BLOOMBERG 1-3 MONTH T-BILL ETF")
        ?.assetClassId,
    ).toBe(ASSET_CLASS_IDS.treasuries);
    expect(infer("ISHARES GOLD TR ISHARES NEW")?.assetClassId).toBe(
      ASSET_CLASS_IDS.gold,
    );
    expect(
      infer("VANGUARD INTL EQUITY INDEX FDS FTSE EUROPE ETF")?.assetClassId,
    ).toBe(ASSET_CLASS_IDS.international);
    expect(infer("Acme ZERO LARGE CAP INDEX FUND")?.assetClassId).toBe(
      ASSET_CLASS_IDS.usEquity,
    );
  });

  it("returns null for a name it cannot read", () => {
    expect(infer("ACME OPPORTUNITY TRUST SERIES 1")).toBeNull();
  });

  it("reads a NASDAQ index fund as US equity", () => {
    expect(infer("INVESCO NASDAQ 100 ETF")?.assetClassId).toBe(
      ASSET_CLASS_IDS.usEquity,
    );
  });
});

describe("pipeline precedence", () => {
  const input = {
    symbol: "BIL",
    description: "SPDR 1-3 MONTH T-BILL ETF",
    price: 91.51,
    isCoreCash: false,
  };

  it("prefers a user override over everything", () => {
    const result = classifySymbol(
      input,
      new Map([
        [
          "BIL",
          {
            symbol: "BIL",
            assetClassId: ASSET_CLASS_IDS.cash,
            source: "user" as const,
            confidence: 1,
          },
        ],
      ]),
    );
    expect(result.assetClassId).toBe(ASSET_CLASS_IDS.cash);
    expect(result.source).toBe("user");
  });

  it("ignores a non-user mapping of the same symbol", () => {
    const result = classifySymbol(
      input,
      new Map([
        [
          "BIL",
          {
            symbol: "BIL",
            assetClassId: ASSET_CLASS_IDS.cash,
            source: "seed" as const,
            confidence: 1,
          },
        ],
      ]),
    );
    expect(result.assetClassId).toBe(ASSET_CLASS_IDS.treasuries);
  });

  it("marks an unreadable symbol for review", () => {
    const result = classifySymbol({
      symbol: "ZZZZ",
      description: "MYSTERY HOLDING",
      price: 12.34,
      isCoreCash: false,
    });
    expect(result.assetClassId).toBeNull();
    expect(result.needsReview).toBe(true);
  });

  it("never uses the tax-lot Type column", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "lib", "domain", "classify.ts"),
      "utf8",
    );
    expect(source.includes('"Type"')).toBe(false);
    expect(source.includes("Margin")).toBe(false);
  });

  it("deduplicates symbols held in multiple accounts", () => {
    const symbols = classifications.map((c) => c.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
    expect(symbols).toHaveLength(11);
  });
});
