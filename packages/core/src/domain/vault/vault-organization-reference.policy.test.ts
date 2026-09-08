import { expect, it } from "vitest";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import { InvalidVaultOrganizationReferenceError } from "../../errors/vault-organization.errors";
import { requireValidVaultOrganization } from "./vault-organization-reference.policy";

it.each([
  ["deletedTags", " padded "],
  ["deletedTags", "x".repeat(129)],
  ["deletedFolders", " padded "],
  ["deletedFolders", "x".repeat(129)],
  ["deletedFolders", "uncategorized"],
] as const)(
  "rejects invalid %s identities at the core boundary",
  (kind, id) => {
    const { decryptedVault } = createCoreTestValues();
    const vault = {
      ...decryptedVault,
      [kind]: [{ id, deletedAt: 1, versionVector: { device: 1 } }],
    };
    expect(() => requireValidVaultOrganization(vault)).toThrow(
      InvalidVaultOrganizationReferenceError,
    );
  },
);
