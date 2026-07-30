import { describe, expect, it, vi } from "vitest";
import { createUnlockVaultTestContext } from "../../__tests__/fixtures/unlock-vault";
import { createUnlockedVaultWithEntries } from "../../__tests__/fixtures/vault-entries";
import { VaultTrustStateInvalidError } from "../../errors/vault-trust.errors";
import { SnapshotSigningDeviceNotTrustedError } from "../../errors/vault-snapshot.errors";
import { VaultSnapshotService } from "./vault-snapshot.service";

function createContext() {
  const base = createUnlockVaultTestContext();
  const service = new VaultSnapshotService(
    base.ports.crypto,
    base.ports.clock,
    base.ports.vaultLocalRepository,
  );
  const unlockedVault = createUnlockedVaultWithEntries(base.values, []);

  return { ...base, service, unlockedVault };
}

describe("VaultSnapshotService", () => {
  it("preserves vault key generation during an ordinary save", async () => {
    const ctx = createContext();

    const result = await ctx.service.persistUnlockedVault(
      ctx.values.vaultId,
      ctx.unlockedVault,
      ctx.vaultSnapshot.metadata.snapshotVersionVector,
    );

    expect(result.snapshot.metadata.vaultKeyGeneration).toBe(1);
    expect(result.snapshot.keySlots).toEqual(ctx.vaultSnapshot.keySlots);
    expect(ctx.ports.crypto.encryptVaultSnapshotContent).toHaveBeenCalledBefore(
      vi.mocked(ctx.ports.crypto.signVaultSnapshot),
    );
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).toHaveBeenCalledOnce();
  });

  it("rejects a rotated generation without matching verified trust", async () => {
    const ctx = createContext();
    const slot = {
      deviceId: ctx.values.deviceId,
      vaultKeyGeneration: 2,
      envelope: {
        ...ctx.values.vaultKeyEnvelope,
        vaultKeyGeneration: 2,
      },
    };

    await expect(
      ctx.service.persistUnlockedVault(
        ctx.values.vaultId,
        {
          ...ctx.unlockedVault,
          vaultMasterKey: ctx.values.rotatedVaultMasterKey,
        },
        ctx.vaultSnapshot.metadata.snapshotVersionVector,
        {
          vaultKeyGeneration: 2,
          keySlots: { deviceSlots: [slot] },
        },
      ),
    ).rejects.toBeInstanceOf(VaultTrustStateInvalidError);
  });

  it("rejects an untrusted signing device before encryption", async () => {
    const ctx = createContext();

    await expect(
      ctx.service.persistUnlockedVault(
        ctx.values.vaultId,
        {
          ...ctx.unlockedVault,
          deviceId: "untrusted-device",
        },
        ctx.vaultSnapshot.metadata.snapshotVersionVector,
      ),
    ).rejects.toBeInstanceOf(SnapshotSigningDeviceNotTrustedError);

    expect(ctx.ports.crypto.encryptVaultSnapshotContent).not.toHaveBeenCalled();
  });

  it("does not save when encryption fails", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.crypto.encryptVaultSnapshotContent).mockRejectedValue(
      new Error("encryption failed"),
    );

    await expect(
      ctx.service.persistUnlockedVault(
        ctx.values.vaultId,
        ctx.unlockedVault,
        ctx.vaultSnapshot.metadata.snapshotVersionVector,
      ),
    ).rejects.toThrow("encryption failed");

    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
  });

  it("verifies candidate trust before returning it", async () => {
    const ctx = createContext();

    await expect(
      ctx.service.verifyCandidateSnapshotTrust(
        ctx.values.vaultId,
        ctx.vaultSnapshot,
        ctx.unlockedVault,
      ),
    ).resolves.toEqual({
      chain: ctx.values.vaultTrustChain,
      state: ctx.values.verifiedVaultTrustState,
    });
  });
});
