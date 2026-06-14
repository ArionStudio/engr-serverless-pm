import { describe, expect, it } from "vitest";
import {
  compareVersionVectors,
  incrementVersionVector,
  isVersionVectorAheadOf,
  mergeVersionVectors,
} from "./version-vector.utils";

describe("version vector utils", () => {
  it("increments only the local device component", () => {
    expect(incrementVersionVector({ A: 7, B: 3 }, "A")).toEqual({
      A: 8,
      B: 3,
    });
    expect(incrementVersionVector({ A: 7 }, "B")).toEqual({
      A: 7,
      B: 1,
    });
  });

  it("merges vectors by taking each device maximum", () => {
    expect(mergeVersionVectors({ A: 7, B: 3 }, { A: 2, C: 10 })).toEqual({
      A: 7,
      B: 3,
      C: 10,
    });
  });

  it("detects when a vector has any component ahead of the baseline", () => {
    expect(isVersionVectorAheadOf({ A: 7, B: 4 }, { A: 7, B: 3 })).toBe(true);
    expect(isVersionVectorAheadOf({ A: 2, C: 10 }, { A: 7, C: 5 })).toBe(true);
    expect(isVersionVectorAheadOf({ A: 7, B: 1 }, { A: 7 })).toBe(true);
    expect(isVersionVectorAheadOf({ A: 7, B: 3 }, { A: 7, B: 3 })).toBe(false);
    expect(isVersionVectorAheadOf({ A: 7 }, { A: 8, B: 3 })).toBe(false);
  });

  it("compares equal vectors", () => {
    expect(compareVersionVectors({ A: 7 }, { A: 7, B: 0 })).toBe("equal");
  });

  it("detects when the local vector is ahead of the remote vector", () => {
    expect(compareVersionVectors({ A: 8, B: 3 }, { A: 7, B: 3 })).toBe(
      "local_ahead",
    );
  });

  it("detects when the remote vector is ahead of the local vector", () => {
    expect(compareVersionVectors({ A: 7, B: 3 }, { A: 7, B: 4 })).toBe(
      "remote_ahead",
    );
  });

  it("detects broken vectors", () => {
    expect(compareVersionVectors({ A: 7, C: 5 }, { A: 2, C: 10 })).toBe(
      "broken",
    );
  });
});
