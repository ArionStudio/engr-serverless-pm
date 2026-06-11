import { describe, expect, it } from "vitest";
import { areJsonEqual } from "./json.utils";

describe("json utils", () => {
  it("compares objects independently from key insertion order", () => {
    expect(
      areJsonEqual(
        {
          versionVector: {
            B: 2,
            A: 1,
          },
          nested: [
            {
              z: true,
              a: "value",
            },
          ],
        },
        {
          nested: [
            {
              a: "value",
              z: true,
            },
          ],
          versionVector: {
            A: 1,
            B: 2,
          },
        },
      ),
    ).toBe(true);
  });

  it("preserves array order during comparison", () => {
    expect(areJsonEqual(["A", "B"], ["B", "A"])).toBe(false);
  });
});
