import { describe, expect, it, vi } from "vitest";
import { createUnlockVaultTestContext } from "../../__tests__/fixtures/unlock-vault";
import { createUnlockedVaultWithEntries } from "../../__tests__/fixtures/vault-entries";
import {
  LocalVaultTrustCheckpointInvalidError,
  VaultTrustStateInvalidError,
} from "../../errors/vault-trust.errors";
import {
  SnapshotSigningDeviceNotTrustedError,
  VaultSnapshotDigestMismatchError,
} from "../../errors/vault-snapshot.errors";
import { VaultSnapshotService } from "./vault-snapshot.service";
import { VaultTrustService } from "../trust/vault-trust.service";

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

  it("distinguishes a changed snapshot digest from a version mismatch", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.crypto.digestVaultSnapshot).mockResolvedValueOnce(
      "changed-snapshot-digest",
    );

    await expect(
      ctx.service.requireCurrentSnapshotForUnlockedVault(
        ctx.values.vaultId,
        ctx.unlockedVault,
        ctx.vaultSnapshot.metadata.snapshotVersionVector,
      ),
    ).rejects.toBeInstanceOf(VaultSnapshotDigestMismatchError);
  });

  it("restores from a checkpoint prepared before private session material is wiped", async () => {
    const ctx = createContext();
    const preparedRestore = await ctx.service.prepareLocalVaultSnapshotRestore(
      ctx.vaultSnapshot,
      ctx.unlockedVault,
      null,
    );
    const signCallCount = vi.mocked(
      ctx.ports.crypto.signLocalVaultTrustCheckpoint,
    ).mock.calls.length;
    new Uint8Array(ctx.unlockedVault.devicePrivateSignKey).fill(0);
    ctx.ports.saved.vaultSnapshotDigest = "replacement-snapshot-digest";
    ctx.ports.saved.deviceSyncCredentialState = undefined;

    await ctx.service.restorePreparedLocalVaultSnapshot(
      preparedRestore,
      "replacement-snapshot-digest",
      ctx.values.localVaultTrustCheckpoint,
    );

    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).toHaveBeenLastCalledWith({
      expectedSnapshotDigest: "replacement-snapshot-digest",
      expectedCheckpoint: ctx.values.localVaultTrustCheckpoint,
      expectedSyncCredentialState: null,
      snapshot: ctx.vaultSnapshot,
      checkpoint: preparedRestore.checkpoint,
      syncCredentialState: null,
    });
    expect(
      ctx.ports.crypto.signLocalVaultTrustCheckpoint,
    ).toHaveBeenCalledTimes(signCallCount);
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

  it("rejects an unauthenticated current checkpoint before persistence", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.crypto.verifyLocalVaultTrustCheckpointSignature,
    ).mockResolvedValueOnce(false);

    await expect(
      ctx.service.persistUnlockedVault(
        ctx.values.vaultId,
        ctx.unlockedVault,
        ctx.vaultSnapshot.metadata.snapshotVersionVector,
      ),
    ).rejects.toBeInstanceOf(LocalVaultTrustCheckpointInvalidError);

    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated current checkpoint before restoration", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.crypto.verifyLocalVaultTrustCheckpointSignature,
    ).mockResolvedValueOnce(false);

    await expect(
      ctx.service.restoreLocalVaultSnapshot(
        ctx.vaultSnapshot,
        ctx.vaultSnapshot,
        ctx.unlockedVault,
      ),
    ).rejects.toBeInstanceOf(LocalVaultTrustCheckpointInvalidError);

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
      snapshotDigest: ctx.values.vaultSnapshotDigest,
    });
  });

  it("verifies a historical remote as an ancestor of the current candidate trust", async () => {
    const ctx = createContext();
    const historicalTrust = {
      ...ctx.values.verifiedVaultTrustState,
      generation: 0,
    };
    const currentTrust = {
      ...ctx.values.verifiedVaultTrustState,
      generation: 1,
      certificateDigest: "current-certificate-digest",
    };
    const currentSnapshot = {
      ...ctx.vaultSnapshot,
      trustChain: {
        certificates: [...ctx.vaultSnapshot.trustChain.certificates],
      },
    };
    const verifyTrustChain = vi
      .spyOn(VaultTrustService.prototype, "verifyTrustChain")
      .mockResolvedValue(historicalTrust);
    const verifySnapshot = vi
      .spyOn(VaultTrustService.prototype, "verifySnapshot")
      .mockResolvedValue(undefined);
    const requireTrustDescendsFrom = vi
      .spyOn(VaultTrustService.prototype, "requireTrustDescendsFrom")
      .mockResolvedValue(undefined);

    try {
      await expect(
        ctx.service.verifyHistoricalSnapshotTrust(
          ctx.values.vaultId,
          ctx.vaultSnapshot,
          currentSnapshot,
          {
            ...ctx.unlockedVault,
            trustedSnapshotContext: {
              ...ctx.unlockedVault.trustedSnapshotContext,
              trust: currentTrust,
            },
          },
        ),
      ).resolves.toMatchObject({ state: historicalTrust });

      expect(requireTrustDescendsFrom).toHaveBeenCalledWith(
        ctx.values.vaultId,
        currentSnapshot.trustChain,
        currentTrust,
        historicalTrust,
      );
      expect(verifyTrustChain.mock.calls[0]?.[2]).toBe(
        ctx.vaultSnapshot.trustChain,
      );
      expect(verifySnapshot).toHaveBeenCalledWith(
        ctx.values.vaultId,
        ctx.vaultSnapshot,
        historicalTrust,
      );
    } finally {
      verifyTrustChain.mockRestore();
      verifySnapshot.mockRestore();
      requireTrustDescendsFrom.mockRestore();
    }
  });
});
