import { describe, expect, it, vi } from "vitest";
import { createUnlockVaultTestContext } from "../../__tests__/fixtures/unlock-vault";
import { createUnlockedVaultWithEntries } from "../../__tests__/fixtures/vault-entries";
import { toVaultSnapshotIdentity } from "../../domain/snapshot";
import {
  InvalidSyncConfigError,
  InvalidSyncProviderOutcomeError,
  LocalSyncCredentialsMissingError,
  ProviderCredentialRevocationPendingError,
  ReplacementSyncTargetMismatchError,
  SyncCredentialsRejectedError,
  SyncNotConfiguredError,
} from "../../errors/sync.errors";
import { LocalVaultSnapshotChangedError } from "../../errors/vault-snapshot.errors";
import { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import { UpdateSyncCredentialsUseCase } from "./update-sync-credentials";

function createContext() {
  const ctx = createUnlockVaultTestContext();
  const unlockedVault = createUnlockedVaultWithEntries(ctx.values, []);
  ctx.saved.unlockedVaultSession = {
    sessionId: ctx.values.sessionId,
    sourceSnapshotVersionVector:
      ctx.vaultSnapshot.metadata.snapshotVersionVector,
    unlockedVault: {
      ...unlockedVault,
      vault: { ...unlockedVault.vault, syncTarget: ctx.values.syncTarget },
    },
  };
  ctx.saved.deviceSyncCredentialState =
    ctx.values.encryptedDeviceSyncCredentialState;
  vi.mocked(ctx.ports.syncProvider.setup).mockResolvedValue(
    ctx.values.replacementSyncAccess,
  );
  vi.mocked(ctx.ports.syncProvider.checkVaultAccess).mockResolvedValue(
    "accessible",
  );
  const snapshot = new VaultSnapshotService(
    ctx.ports.crypto,
    ctx.ports.clock,
    ctx.ports.vaultLocalRepository,
  );
  return {
    ...ctx,
    command: {
      vaultId: ctx.values.vaultId,
      syncConfig: ctx.values.replacementSyncConfigInput,
    },
    useCase: new UpdateSyncCredentialsUseCase(
      ctx.ports.crypto,
      ctx.ports.syncProvider,
      ctx.ports.sessionServices.unlockedVaultSession,
      snapshot,
      ctx.ports.vaultLocalRepository,
    ),
  };
}

function expectNoWrite(ctx: ReturnType<typeof createContext>) {
  expect(
    ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
  ).not.toHaveBeenCalled();
  expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  expect(
    ctx.ports.syncProvider.prepareVaultSnapshotUpload,
  ).not.toHaveBeenCalled();
  expect(
    ctx.ports.syncProvider.prepareVaultSnapshotRemoval,
  ).not.toHaveBeenCalled();
  expect(ctx.saved.deviceSyncCredentialState).toBe(
    ctx.values.encryptedDeviceSyncCredentialState,
  );
}

describe("UpdateSyncCredentialsUseCase", () => {
  it("replaces encrypted device credentials while preserving snapshot, checkpoint and session", async () => {
    const ctx = createContext();
    const session = ctx.saved.unlockedVaultSession;
    const checkpoint = ctx.saved.localVaultTrustCheckpoint;
    await ctx.useCase.execute(ctx.command);
    expect(ctx.ports.syncProvider.checkVaultAccess).toHaveBeenCalledWith(
      ctx.values.replacementSyncAccess,
      ctx.values.vaultId,
    );
    const saved = ctx.saved.deviceSyncCredentialState;
    expect(saved).toBeDefined();
    const state = await ctx.ports.crypto.decryptDeviceSyncCredentialState(
      saved!,
      session!.unlockedVault.deviceLocalProtectionKey,
      {
        vaultId: ctx.values.vaultId,
        deviceId: ctx.values.deviceId,
        provider: ctx.values.syncTarget.provider,
        target: ctx.values.syncTarget,
      },
    );
    expect(state).toEqual({
      currentCredentials: ctx.values.replacementSyncCredentials,
    });
    expect(ctx.saved.vaultSnapshot).toEqual(ctx.vaultSnapshot);
    expect(ctx.saved.localVaultTrustCheckpoint).toEqual(checkpoint);
    expect(ctx.saved.unlockedVaultSession).toEqual(session);
    expect(ctx.ports.crypto.encryptVaultSnapshotContent).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.signVaultSnapshot).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("preserves pending upload identity and previous credentials awaiting revocation", async () => {
    const ctx = createContext();
    const pendingSnapshotUpload = {
      candidateSnapshotIdentity: toVaultSnapshotIdentity(
        ctx.values.vaultId,
        ctx.vaultSnapshot,
        ctx.values.vaultSnapshotDigest,
      ),
      expectedRemoteSnapshotIdentity: null,
    };
    const previousCredentials = {
      credentials: ctx.values.syncCredentials,
      revokedDeviceIds: [ctx.values.pendingDeviceId],
      vaultKeyGeneration: 1,
    };
    vi.mocked(
      ctx.ports.crypto.decryptDeviceSyncCredentialState,
    ).mockResolvedValueOnce({
      currentCredentials: ctx.values.syncCredentials,
      previousCredentials,
      pendingSnapshotUpload,
    });
    await ctx.useCase.execute(ctx.command);
    expect(
      ctx.ports.crypto.encryptDeviceSyncCredentialState,
    ).toHaveBeenCalledWith(
      {
        currentCredentials: ctx.values.replacementSyncCredentials,
        previousCredentials,
        pendingSnapshotUpload,
      },
      expect.anything(),
      expect.objectContaining({ target: ctx.values.syncTarget }),
    );
  });

  it("does not resurrect credentials awaiting revocation", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.crypto.decryptDeviceSyncCredentialState,
    ).mockResolvedValueOnce({
      currentCredentials: ctx.values.syncCredentials,
      previousCredentials: {
        credentials: ctx.values.replacementSyncCredentials,
        revokedDeviceIds: [ctx.values.pendingDeviceId],
        vaultKeyGeneration: 1,
      },
    });
    await expect(ctx.useCase.execute(ctx.command)).rejects.toBeInstanceOf(
      ProviderCredentialRevocationPendingError,
    );
    expectNoWrite(ctx);
  });

  it("rejects a target change before probing credentials", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.syncProvider.setup).mockResolvedValueOnce({
      ...ctx.values.replacementSyncAccess,
      target: {
        ...ctx.values.syncTarget,
        targetConfig: { bucket: "different" },
      },
    });
    await expect(ctx.useCase.execute(ctx.command)).rejects.toBeInstanceOf(
      ReplacementSyncTargetMismatchError,
    );
    expect(ctx.ports.syncProvider.checkVaultAccess).not.toHaveBeenCalled();
    expectNoWrite(ctx);
  });

  it("keeps old credentials on authentication rejection", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.syncProvider.checkVaultAccess).mockResolvedValueOnce(
      "authentication_rejected",
    );
    await expect(ctx.useCase.execute(ctx.command)).rejects.toBeInstanceOf(
      SyncCredentialsRejectedError,
    );
    expectNoWrite(ctx);
  });

  it("does not treat an invalid probe outcome as success", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.syncProvider.checkVaultAccess).mockResolvedValueOnce(
      undefined as unknown as Awaited<
        ReturnType<SyncProviderPort["checkVaultAccess"]>
      >,
    );
    await expect(ctx.useCase.execute(ctx.command)).rejects.toBeInstanceOf(
      InvalidSyncProviderOutcomeError,
    );
    expectNoWrite(ctx);
  });

  it("preserves credentials when the access probe fails", async () => {
    const ctx = createContext();
    const failure = new Error("Network unavailable");
    vi.mocked(ctx.ports.syncProvider.checkVaultAccess).mockRejectedValueOnce(
      failure,
    );
    await expect(ctx.useCase.execute(ctx.command)).rejects.toBe(failure);
    expectNoWrite(ctx);
  });

  it("sanitizes provider configuration failures", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.syncProvider.setup).mockRejectedValueOnce(
      new Error("provider error containing credentials"),
    );
    await expect(ctx.useCase.execute(ctx.command)).rejects.toEqual(
      new InvalidSyncConfigError(),
    );
    expectNoWrite(ctx);
  });

  it("rejects a vault without sync before provider work", async () => {
    const ctx = createContext();
    const session = ctx.saved.unlockedVaultSession!;
    ctx.saved.unlockedVaultSession = {
      ...session,
      unlockedVault: {
        ...session.unlockedVault,
        vault: { ...session.unlockedVault.vault, syncTarget: undefined },
      },
    };
    await expect(ctx.useCase.execute(ctx.command)).rejects.toBeInstanceOf(
      SyncNotConfiguredError,
    );
    expect(ctx.ports.syncProvider.setup).not.toHaveBeenCalled();
    expectNoWrite(ctx);
  });

  it("does not guess missing local upload or revocation state", async () => {
    const ctx = createContext();
    ctx.saved.deviceSyncCredentialState = undefined;
    await expect(ctx.useCase.execute(ctx.command)).rejects.toBeInstanceOf(
      LocalSyncCredentialsMissingError,
    );
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
  });

  it.each([
    "decryptDeviceSyncCredentialState",
    "encryptDeviceSyncCredentialState",
  ] as const)("leaves state intact if %s fails", async (method) => {
    const ctx = createContext();
    const failure = new Error("Credential crypto failed");
    vi.mocked(ctx.ports.crypto[method]).mockRejectedValueOnce(failure);
    await expect(ctx.useCase.execute(ctx.command)).rejects.toBe(failure);
    expectNoWrite(ctx);
  });

  it("rejects concurrent credential replacement at the repository boundary", async () => {
    const ctx = createContext();
    const encrypt = ctx.ports.crypto.encryptDeviceSyncCredentialState;
    vi.spyOn(
      ctx.ports.crypto,
      "encryptDeviceSyncCredentialState",
    ).mockImplementationOnce(async (...args) => {
      ctx.saved.deviceSyncCredentialState =
        ctx.values.replacementEncryptedDeviceSyncCredentialState;
      return encrypt(...args);
    });
    await expect(ctx.useCase.execute(ctx.command)).rejects.toBeInstanceOf(
      LocalVaultSnapshotChangedError,
    );
    expect(ctx.saved.deviceSyncCredentialState).toBe(
      ctx.values.replacementEncryptedDeviceSyncCredentialState,
    );
  });

  it("rejects a concurrent snapshot replacement at the repository boundary", async () => {
    const ctx = createContext();
    const encrypt = ctx.ports.crypto.encryptDeviceSyncCredentialState;
    vi.spyOn(
      ctx.ports.crypto,
      "encryptDeviceSyncCredentialState",
    ).mockImplementationOnce(async (...args) => {
      ctx.saved.vaultSnapshotDigest =
        "different-digest" as typeof ctx.values.vaultSnapshotDigest;
      return encrypt(...args);
    });
    await expect(ctx.useCase.execute(ctx.command)).rejects.toBeInstanceOf(
      LocalVaultSnapshotChangedError,
    );
    expect(ctx.saved.deviceSyncCredentialState).toBe(
      ctx.values.encryptedDeviceSyncCredentialState,
    );
  });

  it("stops before key use when the session locks during the probe", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.syncProvider.checkVaultAccess).mockImplementationOnce(
      async () => {
        ctx.saved.unlockedVaultSession = undefined;
        return "accessible";
      },
    );
    await expect(ctx.useCase.execute(ctx.command)).rejects.toThrow();
    expect(
      ctx.ports.crypto.decryptDeviceSyncCredentialState,
    ).not.toHaveBeenCalled();
    expectNoWrite(ctx);
  });

  it("captures configuration before asynchronous session lookup", async () => {
    const ctx = createContext();
    const input = { ...ctx.command, syncConfig: { ...ctx.command.syncConfig } };
    const pending = ctx.useCase.execute(input);
    input.syncConfig.providerConfig = {
      ...input.syncConfig.providerConfig,
      target: { ...input.syncConfig.providerConfig.target, bucket: "changed" },
    };
    await pending;
    expect(ctx.ports.syncProvider.setup).toHaveBeenCalledWith(
      ctx.command.syncConfig,
    );
  });
  it("retains the previous artifacts when the atomic save fails", async () => {
    const ctx = createContext();
    const checkpoint = ctx.saved.localVaultTrustCheckpoint;
    const failure = new Error("Storage unavailable");
    vi.mocked(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).mockRejectedValueOnce(failure);
    await expect(ctx.useCase.execute(ctx.command)).rejects.toBe(failure);
    expect(ctx.saved.vaultSnapshot).toEqual(ctx.vaultSnapshot);
    expect(ctx.saved.localVaultTrustCheckpoint).toEqual(checkpoint);
    expect(ctx.saved.deviceSyncCredentialState).toBe(
      ctx.values.encryptedDeviceSyncCredentialState,
    );
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });
});
