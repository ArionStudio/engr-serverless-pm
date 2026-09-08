import {
  LocalVaultTrustCheckpointInvalidError,
  LocalVaultTrustCheckpointNotFoundError,
} from "@lfspm/core";
import { describe, expect, it } from "vitest";
import { workspaceError } from "./workspace-error";

describe("workspace error guidance", () => {
  it.each([
    [new LocalVaultTrustCheckpointNotFoundError("vault"), "is missing"],
    [
      new LocalVaultTrustCheckpointInvalidError("vault", "invalid signature"),
      "could not be verified",
    ],
  ])(
    "identifies local trust failures without suggesting S3 changes",
    (error, reason) => {
      const message = workspaceError(error);
      expect(message).toContain(`vault trust record ${reason}`);
      expect(message).toContain("Keep this browser's data");
      expect(message).toContain("another trusted device");
      expect(message).not.toContain("S3");
    },
  );

  it("does not infer a network failure from an unknown local error name", () => {
    const error = new Error("local failure");
    error.name = "LocalVaultFailure";
    expect(workspaceError(error)).toBe(
      "Could not complete this action. Try again.",
    );
  });
});
