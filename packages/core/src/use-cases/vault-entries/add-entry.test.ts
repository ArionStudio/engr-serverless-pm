import { describe, expect, it, vi } from "vitest";
import { objectGraphContainsString } from "../../__tests__/fixtures/error-inspection";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createUnlockVaultTestContext } from "../../__tests__/fixtures/unlock-vault";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import {
  createVaultSnapshotServiceMock,
  saveUnlockedVaultWithEntries,
} from "../../__tests__/fixtures/vault-entries";
import { toVaultSnapshotDescriptor } from "../../domain/snapshot";
import {
  LocalVaultSnapshotAheadError,
  RemoteVaultSnapshotAheadError,
  RemoteVaultSnapshotIntegrityError,
  SyncRemovalPendingError,
  SyncConflictDetectedError,
  SyncProviderUploadRejectedError,
} from "../../errors/sync.errors";
import {
  InvalidEntryUrlError,
  InvalidPasswordEntryError,
  PasswordEntryStrengthRequirementNotMetError,
} from "../../errors/vault-entry.errors";
import { VaultMustBeUnlockedError } from "../../errors/vault-session.errors";
import {
  LocalVaultSnapshotChangedError,
  PersistedVaultRollbackIncompleteError,
} from "../../errors/vault-snapshot.errors";
import type { SyncUploadOutcome } from "../../ports/sync/sync-provider.port";
import { VaultSyncGuardService } from "../../services/sync";
import { AddEntryUseCase } from "./add-entry";

const maximumStrengthPassword = "vN7#qL2!xP9@rT4$zK6&";

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const vaultSnapshot = createVaultSnapshotServiceMock(values, ports);
  const vaultSyncGuard = new VaultSyncGuardService(
    ports.syncProvider,
    vaultSnapshot,
    ports.sessionServices.unlockedVaultSession,
    ports.crypto,
    ports.vaultLocalRepository,
  );
  vi.mocked(ports.ids.generateId).mockReset().mockResolvedValue("entry-id");

  saveUnlockedVaultWithEntries(ports, values, []);

  const useCase = new AddEntryUseCase(
    ports.ids,
    ports.sessionServices.unlockedVaultSession,
    vaultSyncGuard,
    vaultSnapshot,
  );

  return {
    values,
    ports,
    saved: ports.saved,
    vaultSyncGuard,
    vaultSnapshot,
    useCase,
  };
}

describe("AddEntryUseCase", () => {
  it("adds a sanitized password entry to the unlocked vault and persists a new snapshot", async () => {
    const ctx = createContext();

    const result = await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      entry: {
        password: maximumStrengthPassword,
        login: "user@example.com",
        tags: [1, 2],
        url: "https://example.com/login?session=secret#form",
      },
    });

    expect(result).toEqual({
      entryId: "entry-id",
      snapshotVersionVector: {
        [ctx.values.deviceId]: 2,
      },
      revisionTimestamp: ctx.values.timestamp + 1,
      syncUpload: "complete",
      syncConfigured: false,
    });
    expect(ctx.saved.unlockedVaultSession?.unlockedVault.vault.entries).toEqual(
      [
        {
          id: "entry-id",
          password: maximumStrengthPassword,
          login: "user@example.com",
          tags: [1, 2],
          sanitizedUrl: "https://example.com/login",
          versionVector: {
            [ctx.values.deviceId]: 2,
          },
        },
      ],
    );
    expect(
      ctx.saved.unlockedVaultSession?.unlockedVault.vault.versionVector,
    ).toEqual({
      [ctx.values.deviceId]: 2,
    });
    expect(ctx.saved.unlockedVaultSession?.sourceSnapshotVersionVector).toEqual(
      {
        [ctx.values.deviceId]: 2,
      },
    );
    expect(ctx.vaultSnapshot.persistUnlockedVault).toHaveBeenCalledWith(
      ctx.values.vaultId,
      expect.objectContaining({
        vault: expect.objectContaining({
          entries: ctx.saved.unlockedVaultSession?.unlockedVault.vault.entries,
        }),
      }),
      {
        [ctx.values.deviceId]: 1,
      },
      {},
    );
    expect(ctx.saved.vaultSnapshot?.metadata.snapshotVersionVector).toEqual(
      ctx.saved.localVaultTrustCheckpoint?.payload.snapshotVersionVector,
    );
    expect(ctx.saved.vaultSnapshotDigest).toBe(
      ctx.saved.localVaultTrustCheckpoint?.payload.snapshotDigest,
    );
    expect(ctx.saved.vaultSnapshotDigest).not.toBe(
      ctx.values.vaultSnapshotDigest,
    );
    expect(
      vi.mocked(ctx.vaultSnapshot.persistUnlockedVault).mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(
        ctx.ports.sessionServices.unlockedVaultSession.commitPersistedSnapshot,
      ).mock.invocationCallOrder[0],
    );
  });

  it("rejects a password below maximum strength by default without side effects or secret retention", async () => {
    const ctx = createContext();
    const submittedPassword = "weak-entry-password";
    const prepareLocalMutation = vi.spyOn(
      ctx.vaultSyncGuard,
      "prepareLocalMutation",
    );
    let caught: unknown;

    try {
      await ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entry: {
          password: submittedPassword,
          login: "user@example.com",
          tags: [],
          url: "https://example.com/login",
        },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(PasswordEntryStrengthRequirementNotMetError);
    expect(caught).not.toHaveProperty("cause");
    expect(objectGraphContainsString(caught, submittedPassword)).toBe(false);
    expect(prepareLocalMutation).not.toHaveBeenCalled();
    expect(ctx.ports.ids.generateId).not.toHaveBeenCalled();
    expect(ctx.vaultSnapshot.persistUnlockedVault).not.toHaveBeenCalled();
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.commitPersistedSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("adds a weak password only when the caller explicitly allows it", async () => {
    const ctx = createContext();
    const weakPassword = "weak-entry-password";

    await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      allowWeakPassword: true,
      entry: {
        password: weakPassword,
        login: "user@example.com",
        tags: [],
        url: "https://example.com/login",
      },
    });

    expect(
      ctx.saved.unlockedVaultSession?.unlockedVault.vault.entries[0]?.password,
    ).toBe(weakPassword);
  });

  it("fails when the target vault is not unlocked", async () => {
    const ctx = createContext();
    ctx.saved.unlockedVaultSession = undefined;

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entry: {
          password: "weak-entry-password",
          login: "user@example.com",
          tags: [],
          url: "https://example.com/login",
        },
      }),
    ).rejects.toBeInstanceOf(VaultMustBeUnlockedError);

    expect(ctx.ports.ids.generateId).not.toHaveBeenCalled();
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.commitPersistedSnapshot,
    ).not.toHaveBeenCalled();
    expect(ctx.vaultSnapshot.persistUnlockedVault).not.toHaveBeenCalled();
  });

  it.each([undefined, true])(
    "does not persist a snapshot when entry validation fails with allowWeakPassword=$allowWeakPassword",
    async (allowWeakPassword) => {
      const ctx = createContext();

      await expect(
        ctx.useCase.execute({
          vaultId: ctx.values.vaultId,
          allowWeakPassword,
          entry: {
            password: "",
            login: "user@example.com",
            tags: [],
            url: "https://example.com/login",
          },
        }),
      ).rejects.toBeInstanceOf(InvalidPasswordEntryError);

      expect(ctx.ports.ids.generateId).not.toHaveBeenCalled();
      expect(
        ctx.ports.sessionServices.unlockedVaultSession.commitPersistedSnapshot,
      ).not.toHaveBeenCalled();
      expect(ctx.vaultSnapshot.persistUnlockedVault).not.toHaveBeenCalled();
    },
  );

  it("does not retain a malformed entry url in the public validation error", async () => {
    const ctx = createContext();
    const credentialSecret = "credential-secret";
    const querySecret = "query-secret";
    let caught: unknown;

    try {
      await ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        allowWeakPassword: true,
        entry: {
          password: maximumStrengthPassword,
          login: "user@example.com",
          tags: [],
          url: `https://user:${credentialSecret}@?token=${querySecret}`,
        },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(InvalidPasswordEntryError);

    if (!(caught instanceof InvalidPasswordEntryError)) {
      return;
    }

    expect(caught.cause).toBeInstanceOf(InvalidEntryUrlError);
    expect(objectGraphContainsString(caught, credentialSecret)).toBe(false);
    expect(objectGraphContainsString(caught, querySecret)).toBe(false);
    expect(ctx.ports.ids.generateId).not.toHaveBeenCalled();
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.commitPersistedSnapshot,
    ).not.toHaveBeenCalled();
    expect(ctx.vaultSnapshot.persistUnlockedVault).not.toHaveBeenCalled();
  });

  it("rejects local changes while sync removal is pending", async () => {
    const ctx = createContext();
    const session = ctx.saved.unlockedVaultSession!;
    const rollbackSnapshot = createUnlockVaultTestContext().vaultSnapshot;

    ctx.saved.unlockedVaultSession = {
      ...session,
      unlockedVault: {
        ...session.unlockedVault,
        vault: {
          ...session.unlockedVault.vault,
          syncTarget: ctx.values.syncTarget,
          syncRemovalPending: {
            expectedRemoteSnapshotIdentity: null,
            rollbackSnapshot,
          },
        },
      },
    };

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entry: {
          password: maximumStrengthPassword,
          login: "user@example.com",
          tags: [],
          url: "https://example.com/login",
        },
      }),
    ).rejects.toBeInstanceOf(SyncRemovalPendingError);

    expect(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
    expect(ctx.vaultSnapshot.persistUnlockedVault).not.toHaveBeenCalled();
  });

  it("does not add an entry when synced remote changes must be downloaded first", async () => {
    const ctx = createContext();
    const session = ctx.saved.unlockedVaultSession!;

    ctx.saved.unlockedVaultSession = {
      ...session,
      unlockedVault: {
        ...session.unlockedVault,
        vault: {
          ...session.unlockedVault.vault,
          syncTarget: ctx.values.syncTarget,
        },
      },
    };
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce({
      vaultId: ctx.values.vaultId,
      snapshotVersionVector: {
        [ctx.values.deviceId]: 1,
        "remote-device-id": 1,
      },
      revisionTimestamp: ctx.values.timestamp + 1,
    });

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entry: {
          password: maximumStrengthPassword,
          login: "user@example.com",
          tags: [],
          url: "https://example.com/login",
        },
      }),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotAheadError);

    expect(ctx.ports.ids.generateId).not.toHaveBeenCalled();
    expect(ctx.vaultSnapshot.persistUnlockedVault).not.toHaveBeenCalled();
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.commitPersistedSnapshot,
    ).not.toHaveBeenCalled();
    expect(ctx.saved.unlockedVaultSession?.unlockedVault.vault.entries).toEqual(
      [],
    );
  });

  it("does not extend a local-ahead synchronized snapshot", async () => {
    const ctx = createContext();
    const session = ctx.saved.unlockedVaultSession!;
    const localSnapshot =
      await ctx.vaultSnapshot.requireCurrentSnapshotForUnlockedVault(
        ctx.values.vaultId,
        session.unlockedVault,
        session.sourceSnapshotVersionVector,
      );
    const localSnapshotVersionVector = {
      [ctx.values.deviceId]: 2,
    };
    vi.mocked(ctx.vaultSnapshot.requireCurrentSnapshotForUnlockedVault)
      .mockClear()
      .mockResolvedValue({
        ...localSnapshot,
        metadata: {
          ...localSnapshot.metadata,
          revisionTimestamp: ctx.values.timestamp + 1,
          snapshotVersionVector: localSnapshotVersionVector,
        },
      });
    ctx.saved.unlockedVaultSession = {
      ...session,
      sourceSnapshotVersionVector: localSnapshotVersionVector,
      unlockedVault: {
        ...session.unlockedVault,
        vault: {
          ...session.unlockedVault.vault,
          syncTarget: ctx.values.syncTarget,
          versionVector: localSnapshotVersionVector,
        },
      },
    };
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce({
      vaultId: ctx.values.vaultId,
      snapshotVersionVector: {
        [ctx.values.deviceId]: 1,
      },
      revisionTimestamp: ctx.values.timestamp,
    });

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entry: {
          password: maximumStrengthPassword,
          login: "user@example.com",
          tags: [],
          url: "https://example.com/login",
        },
      }),
    ).rejects.toBeInstanceOf(LocalVaultSnapshotAheadError);

    expect(ctx.ports.ids.generateId).not.toHaveBeenCalled();
    expect(ctx.vaultSnapshot.persistUnlockedVault).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.commitPersistedSnapshot,
    ).not.toHaveBeenCalled();
    expect(ctx.saved.unlockedVaultSession?.unlockedVault.vault.entries).toEqual(
      [],
    );
  });

  it("rejects a descriptor from another vault before extending synchronized state", async () => {
    const ctx = createContext();
    const session = ctx.saved.unlockedVaultSession!;
    ctx.saved.unlockedVaultSession = {
      ...session,
      unlockedVault: {
        ...session.unlockedVault,
        vault: {
          ...session.unlockedVault.vault,
          syncTarget: ctx.values.syncTarget,
        },
      },
    };
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValue({
      vaultId: "other-vault-id",
      snapshotVersionVector: { [ctx.values.deviceId]: 0 },
      revisionTimestamp: ctx.values.timestamp - 1,
    });

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entry: {
          password: maximumStrengthPassword,
          login: "user@example.com",
          tags: [],
          url: "https://example.com/login",
        },
      }),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotIntegrityError);

    expect(ctx.ports.ids.generateId).not.toHaveBeenCalled();
    expect(ctx.vaultSnapshot.persistUnlockedVault).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("uploads the persisted snapshot before committing a synced vault entry", async () => {
    const ctx = createContext();
    const remoteSnapshotDescriptor = {
      vaultId: ctx.values.vaultId,
      snapshotVersionVector: {
        [ctx.values.deviceId]: 1,
      },
      revisionTimestamp: ctx.values.timestamp,
    };
    const session = ctx.saved.unlockedVaultSession!;

    ctx.saved.unlockedVaultSession = {
      ...session,
      unlockedVault: {
        ...session.unlockedVault,
        vault: {
          ...session.unlockedVault.vault,
          syncTarget: ctx.values.syncTarget,
        },
      },
    };
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce(remoteSnapshotDescriptor);

    await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      entry: {
        password: maximumStrengthPassword,
        login: "user@example.com",
        tags: [],
        url: "https://example.com/login",
      },
    });

    expect(ctx.ports.syncProvider.uploadVaultSnapshot).toHaveBeenCalledWith(
      ctx.values.syncAccess,
      expect.objectContaining({
        metadata: expect.objectContaining({
          snapshotVersionVector: {
            [ctx.values.deviceId]: 2,
          },
        }),
      }),
      {
        descriptor: remoteSnapshotDescriptor,
        snapshotDigest: ctx.values.vaultSnapshotDigest,
      },
    );
    expect(
      vi.mocked(ctx.vaultSnapshot.persistUnlockedVault).mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(ctx.ports.syncProvider.uploadVaultSnapshot).mock
        .invocationCallOrder[0],
    );
    expect(
      vi.mocked(ctx.ports.syncProvider.uploadVaultSnapshot).mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(
        ctx.ports.sessionServices.unlockedVaultSession
          .commitPersistedSnapshotIfSessionIsActive,
      ).mock.invocationCallOrder[0],
    );
  });

  it.each([
    ["an outcome-unknown result", { status: "outcome_unknown" }],
    ["a malformed result", "malformed"],
  ] as const)(
    "keeps the local entry and reports pending for %s",
    async (_description, uploadOutcome) => {
      const ctx = createContext();
      const remoteSnapshotDescriptor = toVaultSnapshotDescriptor(
        ctx.values.vaultId,
        ctx.saved.vaultSnapshot!,
      );
      const session = ctx.saved.unlockedVaultSession!;
      ctx.saved.unlockedVaultSession = {
        ...session,
        unlockedVault: {
          ...session.unlockedVault,
          vault: {
            ...session.unlockedVault.vault,
            syncTarget: ctx.values.syncTarget,
          },
        },
      };
      vi.mocked(
        ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
      ).mockResolvedValueOnce(remoteSnapshotDescriptor);
      vi.mocked(
        ctx.ports.syncProvider.uploadVaultSnapshot,
      ).mockResolvedValueOnce(uploadOutcome as never);

      const result = await ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entry: {
          password: maximumStrengthPassword,
          login: "pending@example.com",
          tags: [],
          url: "https://example.com/pending",
        },
      });

      expect(result.syncUpload).toBe("pending");
      expect(result.syncConfigured).toBe(true);
      expect(ctx.saved.vaultSnapshot?.metadata.snapshotVersionVector).toEqual({
        [ctx.values.deviceId]: 2,
      });
      expect(
        ctx.saved.vaultSnapshot?.metadata.uploadExpectedRemoteSnapshotIdentity,
      ).toEqual({
        descriptor: remoteSnapshotDescriptor,
        snapshotDigest: ctx.values.vaultSnapshotDigest,
      });
      expect(
        ctx.saved.unlockedVaultSession?.unlockedVault.vault.entries,
      ).toEqual([
        expect.objectContaining({
          id: "entry-id",
          login: "pending@example.com",
        }),
      ]);
      expect(
        ctx.vaultSnapshot.restorePreparedLocalVaultSnapshot,
      ).not.toHaveBeenCalled();
      expect(
        ctx.ports.sessionServices.unlockedVaultSession
          .commitPersistedSnapshotIfSessionIsActive,
      ).toHaveBeenCalledOnce();
      await expect(
        ctx.ports.crypto.decryptDeviceSyncCredentialState(
          ctx.saved.deviceSyncCredentialState!,
          ctx.values.deviceLocalProtectionKey,
          {
            vaultId: ctx.values.vaultId,
            deviceId: ctx.values.deviceId,
            provider: ctx.values.syncTarget.provider,
            target: ctx.values.syncTarget,
          },
        ),
      ).resolves.toEqual(
        expect.objectContaining({
          pendingSnapshotUpload: {
            candidateSnapshotIdentity: {
              descriptor: toVaultSnapshotDescriptor(
                ctx.values.vaultId,
                ctx.saved.vaultSnapshot!,
              ),
              snapshotDigest: ctx.saved.vaultSnapshotDigest!,
            },
            expectedRemoteSnapshotIdentity: {
              descriptor: remoteSnapshotDescriptor,
              snapshotDigest: ctx.values.vaultSnapshotDigest,
            },
          },
        }),
      );
      expect(
        vi.mocked(
          ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
        ).mock.invocationCallOrder[0],
      ).toBeLessThan(
        vi.mocked(ctx.ports.syncProvider.uploadVaultSnapshot).mock
          .invocationCallOrder[0]!,
      );
    },
  );

  it("returns pending when the session is removed after upload start", async () => {
    const ctx = createContext();
    const remoteSnapshotDescriptor = toVaultSnapshotDescriptor(
      ctx.values.vaultId,
      ctx.saved.vaultSnapshot!,
    );
    const session = ctx.saved.unlockedVaultSession!;
    ctx.saved.unlockedVaultSession = {
      ...session,
      unlockedVault: {
        ...session.unlockedVault,
        vault: {
          ...session.unlockedVault.vault,
          syncTarget: ctx.values.syncTarget,
        },
      },
    };
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce(remoteSnapshotDescriptor);
    let signalUploadStarted: () => void = () => undefined;
    let resolveUpload: (outcome: SyncUploadOutcome) => void = () => undefined;
    const uploadStarted = new Promise<void>((resolve) => {
      signalUploadStarted = resolve;
    });
    vi.mocked(
      ctx.ports.syncProvider.uploadVaultSnapshot,
    ).mockImplementationOnce(
      async () =>
        new Promise<SyncUploadOutcome>((resolve) => {
          resolveUpload = resolve;
          signalUploadStarted();
        }),
    );

    const execution = ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      entry: {
        password: maximumStrengthPassword,
        login: "locked@example.com",
        tags: [],
        url: "https://example.com/locked",
      },
    });
    await uploadStarted;
    await ctx.ports.sessionServices.unlockedVaultSession.remove();
    resolveUpload({ status: "committed" });

    await expect(execution).resolves.toMatchObject({ syncUpload: "pending" });
    expect(ctx.saved.unlockedVaultSession).toBeUndefined();
    expect(ctx.saved.deviceSyncCredentialState).toBeDefined();
    expect(ctx.saved.vaultSnapshot?.metadata.snapshotVersionVector).toEqual({
      [ctx.values.deviceId]: 2,
    });
  });

  it("leaves a replacement session untouched after a started upload commits", async () => {
    const ctx = createContext();
    const remoteSnapshotDescriptor = toVaultSnapshotDescriptor(
      ctx.values.vaultId,
      ctx.saved.vaultSnapshot!,
    );
    const originalSession = ctx.saved.unlockedVaultSession!;
    ctx.saved.unlockedVaultSession = {
      ...originalSession,
      unlockedVault: {
        ...originalSession.unlockedVault,
        vault: {
          ...originalSession.unlockedVault.vault,
          syncTarget: ctx.values.syncTarget,
        },
      },
    };
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce(remoteSnapshotDescriptor);
    let signalUploadStarted: () => void = () => undefined;
    let resolveUpload: (outcome: SyncUploadOutcome) => void = () => undefined;
    const uploadStarted = new Promise<void>((resolve) => {
      signalUploadStarted = resolve;
    });
    vi.mocked(
      ctx.ports.syncProvider.uploadVaultSnapshot,
    ).mockImplementationOnce(
      async () =>
        new Promise<SyncUploadOutcome>((resolve) => {
          resolveUpload = resolve;
          signalUploadStarted();
        }),
    );

    const execution = ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      entry: {
        password: maximumStrengthPassword,
        login: "replacement@example.com",
        tags: [],
        url: "https://example.com/replacement",
      },
    });
    await uploadStarted;
    await ctx.ports.sessionServices.unlockedVaultSession.remove();
    vi.mocked(ctx.ports.ids.generateId).mockResolvedValueOnce(
      "replacement-session-id",
    );
    const activationGeneration =
      await ctx.ports.sessionServices.unlockedVaultSession.requireVaultCanBeActivated(
        ctx.values.vaultId,
      );
    await ctx.ports.sessionServices.unlockedVaultSession.activate(
      activationGeneration,
      originalSession.unlockedVault,
      originalSession.sourceSnapshotVersionVector,
    );
    resolveUpload({ status: "committed" });

    await expect(execution).resolves.toMatchObject({ syncUpload: "pending" });
    expect(ctx.saved.unlockedVaultSession).toMatchObject({
      sessionId: "replacement-session-id",
      sourceSnapshotVersionVector: originalSession.sourceSnapshotVersionVector,
    });
  });

  it("blocks a new mutation while an outcome-unknown snapshot upload is pending", async () => {
    const ctx = createContext();
    const session = ctx.saved.unlockedVaultSession!;
    const unlockedVault = {
      ...session.unlockedVault,
      vault: {
        ...session.unlockedVault.vault,
        syncTarget: ctx.values.syncTarget,
      },
    };
    ctx.saved.unlockedVaultSession = {
      ...session,
      unlockedVault,
    };
    ctx.saved.deviceSyncCredentialState =
      await ctx.ports.crypto.encryptDeviceSyncCredentialState(
        {
          ...ctx.values.deviceSyncCredentialState,
          pendingSnapshotUpload: {
            candidateSnapshotIdentity: {
              descriptor: toVaultSnapshotDescriptor(
                ctx.values.vaultId,
                ctx.saved.vaultSnapshot!,
              ),
              snapshotDigest: ctx.values.vaultSnapshotDigest,
            },
            expectedRemoteSnapshotIdentity: null,
          },
        },
        ctx.values.deviceLocalProtectionKey,
        {
          vaultId: ctx.values.vaultId,
          deviceId: ctx.values.deviceId,
          provider: ctx.values.syncTarget.provider,
          target: ctx.values.syncTarget,
        },
      );

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entry: {
          password: maximumStrengthPassword,
          login: "blocked@example.com",
          tags: [],
          url: "https://example.com/blocked",
        },
      }),
    ).rejects.toBeInstanceOf(LocalVaultSnapshotAheadError);

    expect(ctx.ports.ids.generateId).not.toHaveBeenCalled();
    expect(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).not.toHaveBeenCalled();
    expect(ctx.vaultSnapshot.persistUnlockedVault).not.toHaveBeenCalled();
  });

  it("does not persist over an upload intent staged after mutation preflight", async () => {
    const ctx = createContext();
    const session = ctx.saved.unlockedVaultSession!;
    const snapshot = ctx.saved.vaultSnapshot!;
    const checkpoint = ctx.saved.localVaultTrustCheckpoint!;
    const remoteSnapshotDescriptor = toVaultSnapshotDescriptor(
      ctx.values.vaultId,
      snapshot,
    );
    ctx.saved.unlockedVaultSession = {
      ...session,
      unlockedVault: {
        ...session.unlockedVault,
        vault: {
          ...session.unlockedVault.vault,
          syncTarget: ctx.values.syncTarget,
        },
      },
    };
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockImplementationOnce(async () => {
      const pendingCredentialState =
        await ctx.ports.crypto.encryptDeviceSyncCredentialState(
          {
            ...ctx.values.deviceSyncCredentialState,
            pendingSnapshotUpload: {
              candidateSnapshotIdentity: {
                descriptor: remoteSnapshotDescriptor,
                snapshotDigest: ctx.values.vaultSnapshotDigest,
              },
              expectedRemoteSnapshotIdentity: {
                descriptor: remoteSnapshotDescriptor,
                snapshotDigest: ctx.values.vaultSnapshotDigest,
              },
            },
          },
          ctx.values.deviceLocalProtectionKey,
          {
            vaultId: ctx.values.vaultId,
            deviceId: ctx.values.deviceId,
            provider: ctx.values.syncTarget.provider,
            target: ctx.values.syncTarget,
          },
        );
      await ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint({
        expectedSnapshotDigest: ctx.values.vaultSnapshotDigest,
        expectedCheckpoint: checkpoint,
        expectedSyncCredentialState:
          ctx.values.encryptedDeviceSyncCredentialState,
        snapshot,
        checkpoint,
        syncCredentialState: pendingCredentialState,
      });
      return remoteSnapshotDescriptor;
    });

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entry: {
          password: maximumStrengthPassword,
          login: "raced@example.com",
          tags: [],
          url: "https://example.com/raced",
        },
      }),
    ).rejects.toBeInstanceOf(LocalVaultSnapshotChangedError);

    expect(ctx.saved.vaultSnapshot).toBe(snapshot);
    await expect(
      ctx.ports.crypto.decryptDeviceSyncCredentialState(
        ctx.saved.deviceSyncCredentialState!,
        ctx.values.deviceLocalProtectionKey,
        {
          vaultId: ctx.values.vaultId,
          deviceId: ctx.values.deviceId,
          provider: ctx.values.syncTarget.provider,
          target: ctx.values.syncTarget,
        },
      ),
    ).resolves.toEqual(
      expect.objectContaining({ pendingSnapshotUpload: expect.any(Object) }),
    );
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.commitPersistedSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("restores the local snapshot and does not commit when synced upload races", async () => {
    const ctx = createContext();
    const remoteSnapshotDescriptor = {
      vaultId: ctx.values.vaultId,
      snapshotVersionVector: {
        [ctx.values.deviceId]: 1,
      },
      revisionTimestamp: ctx.values.timestamp,
    };
    const session = ctx.saved.unlockedVaultSession!;

    ctx.saved.unlockedVaultSession = {
      ...session,
      unlockedVault: {
        ...session.unlockedVault,
        vault: {
          ...session.unlockedVault.vault,
          syncTarget: ctx.values.syncTarget,
        },
      },
    };
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce(remoteSnapshotDescriptor);
    vi.mocked(ctx.ports.syncProvider.uploadVaultSnapshot).mockResolvedValueOnce(
      {
        status: "definitely_not_committed",
        reason: "remote_snapshot_changed",
      },
    );

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entry: {
          password: maximumStrengthPassword,
          login: "user@example.com",
          tags: [],
          url: "https://example.com/login",
        },
      }),
    ).rejects.toBeInstanceOf(SyncConflictDetectedError);

    expect(
      ctx.vaultSnapshot.prepareLocalVaultSnapshotRestore,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          snapshotVersionVector: { [ctx.values.deviceId]: 1 },
        }),
      }),
      expect.objectContaining({ vaultId: ctx.values.vaultId }),
    );
    expect(
      ctx.vaultSnapshot.restorePreparedLocalVaultSnapshot,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          metadata: expect.objectContaining({
            snapshotVersionVector: { [ctx.values.deviceId]: 1 },
          }),
        }),
      }),
      expect.any(String),
      expect.any(Object),
      expect.any(Object),
    );
    const persistedSnapshotDigest = vi.mocked(
      ctx.vaultSnapshot.restorePreparedLocalVaultSnapshot,
    ).mock.calls[0]?.[1];

    expect(persistedSnapshotDigest).toBeDefined();
    expect(persistedSnapshotDigest).not.toBe(ctx.values.vaultSnapshotDigest);
    expect(ctx.saved.vaultSnapshot?.metadata.snapshotVersionVector).toEqual({
      [ctx.values.deviceId]: 1,
    });
    expect(ctx.saved.localVaultTrustCheckpoint).toBe(
      ctx.values.localVaultTrustCheckpoint,
    );
    expect(ctx.saved.deviceSyncCredentialState).toBe(
      ctx.values.encryptedDeviceSyncCredentialState,
    );
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedSnapshotDigest: persistedSnapshotDigest,
        checkpoint: ctx.values.localVaultTrustCheckpoint,
      }),
    );
    expect(ctx.saved.vaultSnapshotDigest).toBe(ctx.values.vaultSnapshotDigest);
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.commitPersistedSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("restores the local snapshot without reporting a conflict when the provider rejects the upload", async () => {
    const ctx = createContext();
    const session = ctx.saved.unlockedVaultSession!;
    const snapshot = ctx.saved.vaultSnapshot!;

    ctx.saved.unlockedVaultSession = {
      ...session,
      unlockedVault: {
        ...session.unlockedVault,
        vault: {
          ...session.unlockedVault.vault,
          syncTarget: ctx.values.syncTarget,
        },
      },
    };
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce(
      toVaultSnapshotDescriptor(ctx.values.vaultId, snapshot),
    );
    vi.mocked(ctx.ports.syncProvider.uploadVaultSnapshot).mockResolvedValueOnce(
      {
        status: "definitely_not_committed",
        reason: "provider_rejected",
      },
    );

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entry: {
          password: maximumStrengthPassword,
          login: "user@example.com",
          tags: [],
          url: "https://example.com/login",
        },
      }),
    ).rejects.toBeInstanceOf(SyncProviderUploadRejectedError);

    expect(ctx.saved.vaultSnapshot).toEqual(snapshot);
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.commitPersistedSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("does not prepare synchronized rollback after the active session expires", async () => {
    const ctx = createContext();
    const remoteSnapshotDescriptor = {
      vaultId: ctx.values.vaultId,
      snapshotVersionVector: { [ctx.values.deviceId]: 1 },
      revisionTimestamp: ctx.values.timestamp,
    };
    const session = ctx.saved.unlockedVaultSession!;
    const expiredError = new Error("session expired before persistence");

    ctx.saved.unlockedVaultSession = {
      ...session,
      unlockedVault: {
        ...session.unlockedVault,
        vault: {
          ...session.unlockedVault.vault,
          syncTarget: ctx.values.syncTarget,
        },
      },
    };
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce(remoteSnapshotDescriptor);
    vi.spyOn(
      ctx.ports.sessionServices.unlockedVaultSession,
      "persistForActiveSession",
    ).mockRejectedValueOnce(expiredError);

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entry: {
          password: maximumStrengthPassword,
          login: "user@example.com",
          tags: [],
          url: "https://example.com/login",
        },
      }),
    ).rejects.toBe(expiredError);

    expect(
      ctx.vaultSnapshot.prepareLocalVaultSnapshotRestore,
    ).not.toHaveBeenCalled();
    expect(ctx.vaultSnapshot.persistUnlockedVault).not.toHaveBeenCalled();
  });

  it("does not restore persisted state or invalidate a session opened during upload", async () => {
    const ctx = createContext();
    const remoteSnapshotDescriptor = {
      vaultId: ctx.values.vaultId,
      snapshotVersionVector: {
        [ctx.values.deviceId]: 1,
      },
      revisionTimestamp: ctx.values.timestamp,
    };
    const originalSession = ctx.saved.unlockedVaultSession!;

    ctx.saved.unlockedVaultSession = {
      ...originalSession,
      unlockedVault: {
        ...originalSession.unlockedVault,
        vault: {
          ...originalSession.unlockedVault.vault,
          syncTarget: ctx.values.syncTarget,
        },
      },
    };
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce(remoteSnapshotDescriptor);
    vi.mocked(
      ctx.ports.syncProvider.uploadVaultSnapshot,
    ).mockImplementationOnce(async () => {
      await ctx.ports.sessionServices.unlockedVaultSession.remove();
      vi.mocked(ctx.ports.ids.generateId).mockResolvedValueOnce(
        "new-session-id",
      );
      const activationGeneration =
        await ctx.ports.sessionServices.unlockedVaultSession.requireVaultCanBeActivated(
          ctx.values.vaultId,
        );
      await ctx.ports.sessionServices.unlockedVaultSession.activate(
        activationGeneration,
        originalSession.unlockedVault,
        originalSession.sourceSnapshotVersionVector,
      );

      return {
        status: "definitely_not_committed",
        reason: "remote_snapshot_changed",
      };
    });

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entry: {
          password: maximumStrengthPassword,
          login: "user@example.com",
          tags: [],
          url: "https://example.com/login",
        },
      }),
    ).rejects.toBeInstanceOf(SyncConflictDetectedError);

    expect(ctx.vaultSnapshot.restoreLocalVaultSnapshot).not.toHaveBeenCalled();
    expect(ctx.saved.unlockedVaultSession?.sessionId).toBe("new-session-id");
  });

  it("invalidates the session when synced upload restoration fails", async () => {
    const ctx = createContext();
    const remoteSnapshotDescriptor = {
      vaultId: ctx.values.vaultId,
      snapshotVersionVector: {
        [ctx.values.deviceId]: 1,
      },
      revisionTimestamp: ctx.values.timestamp,
    };
    const session = ctx.saved.unlockedVaultSession!;

    ctx.saved.unlockedVaultSession = {
      ...session,
      unlockedVault: {
        ...session.unlockedVault,
        vault: {
          ...session.unlockedVault.vault,
          syncTarget: ctx.values.syncTarget,
        },
      },
    };
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce(remoteSnapshotDescriptor);
    vi.mocked(
      ctx.ports.syncProvider.uploadVaultSnapshot,
    ).mockImplementationOnce(async () => {
      const concurrentSnapshotDigest = "concurrent-snapshot-digest";
      const concurrentSnapshotVersionVector = {
        [ctx.values.deviceId]: 99,
      };
      ctx.saved.vaultSnapshot = {
        ...ctx.saved.vaultSnapshot!,
        metadata: {
          ...ctx.saved.vaultSnapshot!.metadata,
          snapshotVersionVector: concurrentSnapshotVersionVector,
        },
      };
      ctx.saved.vaultSnapshotDigest = concurrentSnapshotDigest;
      ctx.saved.localVaultTrustCheckpoint = {
        ...ctx.saved.localVaultTrustCheckpoint!,
        payload: {
          ...ctx.saved.localVaultTrustCheckpoint!.payload,
          snapshotVersionVector: concurrentSnapshotVersionVector,
          snapshotDigest: concurrentSnapshotDigest,
        },
      };
      return {
        status: "definitely_not_committed",
        reason: "remote_snapshot_changed",
      };
    });

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entry: {
          password: maximumStrengthPassword,
          login: "user@example.com",
          tags: [],
          url: "https://example.com/login",
        },
      }),
    ).rejects.toBeInstanceOf(PersistedVaultRollbackIncompleteError);

    expect(ctx.saved.unlockedVaultSession).toBeUndefined();
    expect(ctx.saved.vaultSnapshotDigest).toBe("concurrent-snapshot-digest");
    expect(ctx.saved.vaultSnapshot?.metadata.snapshotVersionVector).toEqual({
      [ctx.values.deviceId]: 99,
    });
    expect(
      ctx.saved.localVaultTrustCheckpoint?.payload.snapshotVersionVector,
    ).toEqual({ [ctx.values.deviceId]: 99 });
    await expect(
      ctx.vaultSnapshot.requireLocalVaultSnapshot(ctx.values.vaultId),
    ).resolves.toMatchObject({
      metadata: {
        snapshotVersionVector: { [ctx.values.deviceId]: 99 },
      },
    });
  });

  it("reports incomplete rollback when session ownership cannot be read after upload failure", async () => {
    const ctx = createContext();
    const remoteSnapshotDescriptor = {
      vaultId: ctx.values.vaultId,
      snapshotVersionVector: { [ctx.values.deviceId]: 1 },
      revisionTimestamp: ctx.values.timestamp,
    };
    const session = ctx.saved.unlockedVaultSession!;

    ctx.saved.unlockedVaultSession = {
      ...session,
      unlockedVault: {
        ...session.unlockedVault,
        vault: {
          ...session.unlockedVault.vault,
          syncTarget: ctx.values.syncTarget,
        },
      },
    };
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce(remoteSnapshotDescriptor);
    vi.mocked(
      ctx.ports.syncProvider.uploadVaultSnapshot,
    ).mockImplementationOnce(async () => {
      vi.mocked(
        ctx.ports.unlockedVaultSessionMaterialRepository
          .getUnlockedVaultSessionMaterial,
      ).mockRejectedValueOnce(new Error("material read failed"));
      return {
        status: "definitely_not_committed",
        reason: "remote_snapshot_changed",
      };
    });

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entry: {
          password: maximumStrengthPassword,
          login: "user@example.com",
          tags: [],
          url: "https://example.com/login",
        },
      }),
    ).rejects.toMatchObject({
      name: "PersistedVaultRollbackIncompleteError",
      cause: expect.objectContaining({
        name: "RemoteVaultSnapshotChangedError",
      }),
    });

    expect(
      ctx.vaultSnapshot.restorePreparedLocalVaultSnapshot,
    ).not.toHaveBeenCalled();
    expect(ctx.saved.unlockedVaultSession).toBeDefined();
  });

  it("does not save the session vault when snapshot persistence fails", async () => {
    const ctx = createContext();
    vi.mocked(ctx.vaultSnapshot.persistUnlockedVault).mockRejectedValueOnce(
      new Error("persist failed"),
    );

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entry: {
          password: maximumStrengthPassword,
          login: "user@example.com",
          tags: [],
          url: "https://example.com/login",
        },
      }),
    ).rejects.toThrow("persist failed");

    expect(
      ctx.ports.sessionServices.unlockedVaultSession.commitPersistedSnapshot,
    ).not.toHaveBeenCalled();
    expect(ctx.saved.unlockedVaultSession?.unlockedVault.vault.entries).toEqual(
      [],
    );
  });

  it("bubbles the session commit failure after snapshot persistence", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.crypto.encryptUnlockedVaultSessionPayload,
    ).mockRejectedValueOnce(new Error("session save failed"));

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entry: {
          password: maximumStrengthPassword,
          login: "user@example.com",
          tags: [],
          url: "https://example.com/login",
        },
      }),
    ).rejects.toThrow("session save failed");

    expect(ctx.vaultSnapshot.persistUnlockedVault).toHaveBeenCalled();
    expect(ctx.saved.unlockedVaultSession).toBeUndefined();
  });

  it("preserves the session commit error", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.sessionServices.unlockedVaultSession.commitPersistedSnapshot,
    ).mockRejectedValueOnce(new Error("session save failed"));

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entry: {
          password: maximumStrengthPassword,
          login: "user@example.com",
          tags: [],
          url: "https://example.com/login",
        },
      }),
    ).rejects.toThrow("session save failed");
  });
});
