import { describe, expect, it } from "vitest";
import { getSyncItemRelation } from "./vault-sync-item-review.utils";

describe("vault sync item review utils", () => {
  it("treats missing local and remote vectors as equal", () => {
    expect(getSyncItemRelation(null, null)).toBe("equal");
  });
});
