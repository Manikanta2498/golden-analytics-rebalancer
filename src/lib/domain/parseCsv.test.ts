import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  accountTotal,
  householdTotal,
  inferAccountType,
  parseMoney,
  parsePercent,
  parsePortfolioCsv,
} from "./parseCsv";

const csvText = readFileSync(
  join(process.cwd(), "public", "portfolio.csv"),
  "utf8",
);

const result = parsePortfolioCsv(csvText);

describe("parseMoney", () => {
  it("parses quoted currency with commas and trailing space", () => {
    expect(parseMoney("$6,645.97 ")).toBe(6645.97);
    expect(parseMoney("$91.51 ")).toBe(91.51);
  });

  it("parses parenthesised negatives", () => {
    expect(parseMoney("($10.07)")).toBe(-10.07);
  });

  it("treats -- and blank as null", () => {
    expect(parseMoney("--")).toBeNull();
    expect(parseMoney("")).toBeNull();
    expect(parseMoney(undefined)).toBeNull();
  });
});

describe("parsePercent", () => {
  it("strips the percent sign", () => {
    expect(parsePercent("10.66%")).toBe(10.66);
    expect(parsePercent("-0.14%")).toBe(-0.14);
  });

  it("treats -- as null", () => {
    expect(parsePercent("--")).toBeNull();
  });
});

describe("inferAccountType", () => {
  it("classifies retirement accounts by name", () => {
    expect(inferAccountType("IRA (Alex)")).toBe("retirement");
    expect(inferAccountType("Roth IRA")).toBe("retirement");
  });

  it("classifies everything else as taxable", () => {
    expect(inferAccountType("Joint WROS")).toBe("taxable");
    expect(inferAccountType("Alex's old brokerage")).toBe("taxable");
  });
});

describe("parsePortfolioCsv against the real export", () => {
  it("stops before the disclaimer and footer rows", () => {
    expect(result.positions).toHaveLength(26);
    const symbols = result.positions.map((position) => position.symbol);
    expect(symbols.some((symbol) => symbol.includes("Date downloaded"))).toBe(
      false,
    );
    expect(symbols.some((symbol) => symbol.length > 12)).toBe(false);
  });

  it("finds exactly the four accounts", () => {
    expect(result.accounts.map((account) => account.externalId).sort()).toEqual(
      ["2957816403", "8043672915", "X483920176", "XQMTVRWK"],
    );
  });

  it("keeps alphanumeric account numbers as strings", () => {
    const joint = result.accounts.find(
      (account) => account.externalId === "X483920176",
    );
    expect(joint?.name).toBe("Joint WROS");
  });

  it("reconciles the household total", () => {
    expect(householdTotal(result.positions)).toBeCloseTo(533137.47, 2);
  });

  it("reconciles each account total", () => {
    expect(accountTotal(result.positions, "X483920176")).toBeCloseTo(
      62364.09,
      2,
    );
    expect(accountTotal(result.positions, "XQMTVRWK")).toBeCloseTo(0.21, 2);
    expect(accountTotal(result.positions, "8043672915")).toBeCloseTo(
      375481.22,
      2,
    );
    expect(accountTotal(result.positions, "2957816403")).toBeCloseTo(
      95291.95,
      2,
    );
  });

  it("agrees with the broker's own Percent Of Account", () => {
    for (const position of result.positions) {
      if (position.reportedPercentOfAccount == null) continue;
      const total = accountTotal(result.positions, position.accountId);
      if (total === 0) continue;
      const computed = (position.marketValue / total) * 100;
      expect(computed).toBeCloseTo(position.reportedPercentOfAccount, 1);
    }
  });

  it("strips the ** suffix and records the core cash sleeve per account", () => {
    const coreByAccount = Object.fromEntries(
      result.accounts.map((account) => [
        account.externalId,
        account.coreCashSymbol,
      ]),
    );
    expect(coreByAccount).toEqual({
      X483920176: "FZFXX",
      XQMTVRWK: "FCASH",
      "8043672915": "SPAXX",
      "2957816403": "SPAXX",
    });
    expect(
      result.positions.every((position) => !position.symbol.includes("*")),
    ).toBe(true);
  });

  it("synthesises quantity and price for blank-quantity cash rows", () => {
    const fzfxx = result.positions.find(
      (position) => position.id === "X483920176:FZFXX",
    );
    expect(fzfxx?.price).toBe(1);
    expect(fzfxx?.quantity).toBeCloseTo(6645.97, 2);
    expect(fzfxx?.isCoreCash).toBe(true);
  });

  it("keeps quantity times price consistent with market value on priced rows", () => {
    for (const position of result.positions) {
      if (position.isCoreCash) continue;
      expect(position.quantity * position.price).toBeCloseTo(
        position.marketValue,
        0,
      );
    }
  });

  it("preserves fractional share quantities", () => {
    const bil = result.positions.find(
      (position) => position.id === "X483920176:BIL",
    );
    expect(bil?.quantity).toBeCloseTo(83.856, 3);
    expect(bil?.price).toBeCloseTo(91.51, 2);
  });

  it("handles -- placeholders without dropping the position", () => {
    const frgxx = result.positions.find(
      (position) => position.id === "8043672915:FRGXX",
    );
    expect(frgxx).toBeDefined();
    expect(frgxx?.marketValue).toBeCloseTo(6307.55, 2);
    expect(frgxx?.price).toBeCloseTo(1, 2);
  });

  it("does not treat FRGXX as the core cash sleeve", () => {
    const frgxx = result.positions.find(
      (position) => position.id === "8043672915:FRGXX",
    );
    expect(frgxx?.isCoreCash).toBe(false);
  });

  it("ranks taxable accounts ahead of retirement accounts for cash", () => {
    const ranked = [...result.accounts].sort(
      (a, b) => a.cashPreferenceRank - b.cashPreferenceRank,
    );
    expect(ranked.map((account) => account.name)).toEqual([
      "Joint WROS",
      "Alex's old brokerage",
      "IRA (Alex)",
      "IRA (Jordan)",
    ]);
  });

  it("parses cleanly with no warnings", () => {
    expect(result.warnings).toEqual([]);
  });
});
