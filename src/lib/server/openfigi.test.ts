import { describe, expect, it } from "vitest";
import { MAX_JOBS_PER_REQUEST, chunk } from "./openfigi";

describe("chunk", () => {
  it("splits into batches within the keyless job limit", () => {
    const symbols = Array.from({ length: 11 }, (_, i) => `S${i}`);
    const batches = chunk(symbols, MAX_JOBS_PER_REQUEST);
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(10);
    expect(batches[1]).toHaveLength(1);
  });

  it("returns nothing for an empty list", () => {
    expect(chunk([], MAX_JOBS_PER_REQUEST)).toEqual([]);
  });

  it("keeps a single batch when under the limit", () => {
    expect(chunk(["A", "B"], MAX_JOBS_PER_REQUEST)).toEqual([["A", "B"]]);
  });
});
