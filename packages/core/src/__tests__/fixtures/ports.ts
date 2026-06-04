import { vi } from "vitest";
import { CURRENT_ALGORITHM_SUITE } from "../../domain/crypto/algorithm-suite.const";
import type { RandomBytes } from "../../domain/crypto/brand-keys";
import type { DeviceSignKeyPair } from "../../domain/device/brand-keys";
import type { DeviceAccessMaterial } from "../../domain/device/device-access-material";
import type { VaultSnapshot } from "../../domain/snapshot/vault-snapshot";
import type { LocalVaultDescriptor } from "../../domain/vault/local-vault-descriptor";
import type {
  EncryptedUnlockedVaultSessionPayload,
  UnlockedVaultSession,
  UnlockedVaultSessionMaterial,
  UnlockedVaultSessionPayload,
} from "../../domain/vault/unlocked-vault-session";
import type { Bip39Port } from "../../ports/crypto/bip39.port";
import type { ClockPort } from "../../ports/system/clock.port";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { EncryptedUnlockedVaultSessionPayloadRepositoryPort } from "../../ports/vault/encrypted-unlocked-vault-session-payload-repository.port";
import type { IdPort } from "../../ports/system/id.port";
import type { ScheduledTaskPort } from "../../ports/system/scheduled-task.port";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { VaultDisplayNamePort } from "../../ports/vault/vault-display-name.port";
import type { VaultLockTaskRepositoryPort } from "../../ports/vault/vault-lock-task-repository.port";
import type { UnlockedVaultSessionMaterialRepositoryPort } from "../../ports/vault/unlocked-vault-session-material-repository.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import { AssertUnlockedVaultSessionCanActivateService } from "../../application/vault-session/assert-unlocked-vault-session-can-activate.service";
import { GetUnlockedVaultSessionService } from "../../application/vault-session/get-unlocked-vault-session.service";
import { ProtectUnlockedVaultSessionService } from "../../application/vault-session/protect-unlocked-vault-session.service";
import { RemoveUnlockedVaultSessionService } from "../../application/vault-session/remove-unlocked-vault-session.service";
import { RestoreUnlockedVaultSessionService } from "../../application/vault-session/restore-unlocked-vault-session.service";
import { SaveUnlockedVaultSessionService } from "../../application/vault-session/save-unlocked-vault-session.service";
import { createCoreTestValues, type CoreTestValues } from "./values";

export type SavedCoreRecords = {
  localVaultDescriptor?: LocalVaultDescriptor;
  deviceAccessMaterial?: DeviceAccessMaterial;
  vaultSnapshot?: VaultSnapshot;
  unlockedVaultSession?: UnlockedVaultSession;
  unlockedVaultSessionMaterial?: UnlockedVaultSessionMaterial;
  encryptedUnlockedVaultSessionPayload?: EncryptedUnlockedVaultSessionPayload;
  unlockedVaultSessionPayload?: UnlockedVaultSessionPayload;
};

export type CoreTestPorts = ReturnType<typeof createCoreTestPorts>;

export function createCoreTestPorts(
  values: CoreTestValues = createCoreTestValues(),
) {
  const saved: SavedCoreRecords = {};
  let unlockedVaultSessionMirror: UnlockedVaultSession | undefined;

  function writeSplitUnlockedVaultSessionRecords(
    session: UnlockedVaultSession,
  ): void {
    const context = {
      sessionId: values.sessionId,
      vaultId: session.unlockedVault.vaultId,
      sourceSnapshotRevision: session.sourceSnapshotRevision,
    };

    saved.unlockedVaultSessionMaterial = {
      ...context,
      deviceId: session.unlockedVault.deviceId,
      vaultMasterKey: session.unlockedVault.vaultMasterKey,
      devicePrivateSignKey: session.unlockedVault.devicePrivateSignKey,
      payloadKey: values.unlockedVaultSessionPayloadKey,
    };
    saved.encryptedUnlockedVaultSessionPayload = {
      ...context,
      content: values.encryptedUnlockedVaultSessionPayload,
    };
    saved.unlockedVaultSessionPayload = {
      vault: session.unlockedVault.vault,
    };
  }

  function clearSplitUnlockedVaultSessionRecords(): void {
    saved.unlockedVaultSessionMaterial = undefined;
    saved.encryptedUnlockedVaultSessionPayload = undefined;
    saved.unlockedVaultSessionPayload = undefined;
  }

  Object.defineProperty(saved, "unlockedVaultSession", {
    get: () => unlockedVaultSessionMirror,
    set: (session: UnlockedVaultSession | undefined) => {
      unlockedVaultSessionMirror = session;

      if (session === undefined) {
        clearSplitUnlockedVaultSessionRecords();
        return;
      }

      writeSplitUnlockedVaultSessionRecords(session);
    },
  });

  const deviceSignKeyPair: DeviceSignKeyPair = {
    publicKey: values.devicePublicSignKey,
    privateKey: values.devicePrivateSignKey,
  };

  const crypto: CryptoPort = {
    algorithmSuite: CURRENT_ALGORITHM_SUITE,
    generateRandomBytes: vi.fn(
      async (byteLength: number) => new ArrayBuffer(byteLength) as RandomBytes,
    ),
    hashSecretValue: vi.fn(async (value) => `hash:${value}`),
    compareSecretValueHash: vi.fn(async (left, right) => left === right),
    generateDeviceSignKeyPair: vi.fn(async () => deviceSignKeyPair),
    generateVaultMasterKey: vi.fn(async () => values.vaultMasterKey),
    generateDeviceSlotKey: vi.fn(async () => values.deviceSlotKey),
    generateRecoveryKey: vi.fn(async () => values.recoverySecretKey),
    generateUnlockedVaultSessionPayloadKey: vi.fn(
      async () => values.unlockedVaultSessionPayloadKey,
    ),
    generateMasterPasswordSalt: vi
      .fn()
      .mockResolvedValueOnce(values.masterPasswordSalt)
      .mockResolvedValue(values.newMasterPasswordSalt),
    generateLocalKeysProtectionSalt: vi
      .fn()
      .mockResolvedValueOnce(values.localKeysProtectionSalt)
      .mockResolvedValue(values.newLocalKeysProtectionSalt),
    deriveLocalRootKey: vi
      .fn()
      .mockResolvedValueOnce(values.localRootKey)
      .mockResolvedValue(values.newLocalRootKey),
    deriveLocalKeysProtectionKey: vi.fn(async (_localRootKey, salt) =>
      salt === values.newLocalKeysProtectionSalt
        ? values.newLocalKeysProtectionKey
        : values.localKeysProtectionKey,
    ),
    deriveDeviceSlotVaultMasterKeyProtectionKey: vi.fn(
      async () => values.deviceSlotVaultMasterKeyProtectionKey,
    ),
    deriveRecoveryVaultMasterKeyProtectionKey: vi.fn(
      async () => values.recoveryVaultMasterKeyProtectionKey,
    ),
    wrapLocalKeysPayload: vi.fn(async (_localKeysPayload, protectionKey) =>
      protectionKey === values.newLocalKeysProtectionKey
        ? values.reprotectedLocalKeys
        : values.protectedLocalKeys,
    ),
    unwrapLocalKeysPayload: vi.fn(async () => ({
      deviceSlotKey: values.deviceSlotKey,
      devicePrivateSignKey: values.devicePrivateSignKey,
    })),
    wrapVaultMasterKey: vi
      .fn()
      .mockResolvedValueOnce(values.protectedDeviceVaultMasterKey)
      .mockResolvedValueOnce(values.protectedRecoveryVaultMasterKey),
    unwrapVaultMasterKey: vi.fn(async () => values.vaultMasterKey),
    encryptVaultSnapshotContent: vi.fn(async () => values.encryptedVault),
    decryptVaultSnapshotContent: vi.fn(async () => values.decryptedVault),
    encryptUnlockedVaultSessionPayload: vi.fn(async (payload) => {
      saved.unlockedVaultSessionPayload = payload;

      return values.encryptedUnlockedVaultSessionPayload;
    }),
    decryptUnlockedVaultSessionPayload: vi.fn(
      async () =>
        saved.unlockedVaultSessionPayload ?? {
          vault: values.decryptedVault,
        },
    ),
    signVaultSnapshot: vi.fn(async () => values.snapshotSignature),
    verifyVaultSnapshotSignature: vi.fn(async () => true),
  };

  const bip39: Bip39Port = {
    recoveryKeyToMnemonic: vi.fn(async () => values.recoveryMnemonicKey),
    mnemonicToRecoveryKey: vi.fn(),
  };

  const vaultLocalRepository: VaultLocalRepositoryPort = {
    saveInitializedLocalVault: vi.fn(
      async ({ descriptor, deviceAccessMaterial, snapshot }) => {
        saved.localVaultDescriptor = descriptor;
        saved.deviceAccessMaterial = deviceAccessMaterial;
        saved.vaultSnapshot = snapshot;
      },
    ),
    removePersistedLocalVault: vi.fn(async () => {
      saved.localVaultDescriptor = undefined;
      saved.deviceAccessMaterial = undefined;
      saved.vaultSnapshot = undefined;
    }),
    saveLocalVaultDescriptor: vi.fn(async (descriptor) => {
      saved.localVaultDescriptor = descriptor;
    }),
    getLocalVaultDescriptor: vi.fn(),
    listLocalVaultDescriptors: vi.fn(),
    removeLocalVaultDescriptor: vi.fn(),
    saveDeviceAccessMaterial: vi.fn(async (deviceAccessMaterial) => {
      saved.deviceAccessMaterial = deviceAccessMaterial;
    }),
    getDeviceAccessMaterial: vi.fn(async (vaultId) => {
      const deviceAccessMaterial = saved.deviceAccessMaterial;

      if (deviceAccessMaterial === undefined) {
        return null;
      }

      return deviceAccessMaterial.vaultId === vaultId
        ? deviceAccessMaterial
        : null;
    }),
    removeDeviceAccessMaterial: vi.fn(),
    saveVaultSnapshot: vi.fn(async (vaultSnapshot) => {
      saved.vaultSnapshot = vaultSnapshot;
    }),
    getVaultSnapshot: vi.fn(async (vaultId) => {
      const vaultSnapshot = saved.vaultSnapshot;

      if (vaultSnapshot === undefined) {
        return null;
      }

      return vaultSnapshot.metadata.id === vaultId ? vaultSnapshot : null;
    }),
    removeVaultSnapshot: vi.fn(),
  };

  const unlockedVaultSessionMaterialRepository: UnlockedVaultSessionMaterialRepositoryPort =
    {
      saveUnlockedVaultSessionMaterial: vi.fn(async (material) => {
        saved.unlockedVaultSessionMaterial = material;
      }),
      getUnlockedVaultSessionMaterial: vi.fn(
        async () => saved.unlockedVaultSessionMaterial ?? null,
      ),
      removeUnlockedVaultSessionMaterial: vi.fn(async () => {
        saved.unlockedVaultSessionMaterial = undefined;
      }),
    };

  const encryptedUnlockedVaultSessionPayloadRepository: EncryptedUnlockedVaultSessionPayloadRepositoryPort =
    {
      saveEncryptedUnlockedVaultSessionPayload: vi.fn(
        async (encryptedPayload) => {
          saved.encryptedUnlockedVaultSessionPayload = encryptedPayload;
        },
      ),
      getEncryptedUnlockedVaultSessionPayload: vi.fn(
        async () => saved.encryptedUnlockedVaultSessionPayload ?? null,
      ),
      removeEncryptedUnlockedVaultSessionPayload: vi.fn(async () => {
        saved.encryptedUnlockedVaultSessionPayload = undefined;
        saved.unlockedVaultSessionPayload = undefined;
      }),
    };

  const ids: IdPort = {
    generateId: vi
      .fn()
      .mockResolvedValueOnce(values.vaultId)
      .mockResolvedValueOnce(values.deviceId)
      .mockResolvedValue(values.sessionId),
  };

  const protectUnlockedVaultSession = new ProtectUnlockedVaultSessionService(
    crypto,
    ids,
  );
  const restoreUnlockedVaultSession = new RestoreUnlockedVaultSessionService(
    crypto,
  );
  const saveUnlockedVaultSession = new SaveUnlockedVaultSessionService(
    unlockedVaultSessionMaterialRepository,
    encryptedUnlockedVaultSessionPayloadRepository,
    protectUnlockedVaultSession,
  );
  const getUnlockedVaultSession = new GetUnlockedVaultSessionService(
    unlockedVaultSessionMaterialRepository,
    encryptedUnlockedVaultSessionPayloadRepository,
    restoreUnlockedVaultSession,
  );
  const removeUnlockedVaultSession = new RemoveUnlockedVaultSessionService(
    unlockedVaultSessionMaterialRepository,
    encryptedUnlockedVaultSessionPayloadRepository,
  );
  const assertUnlockedVaultSessionCanActivate =
    new AssertUnlockedVaultSessionCanActivateService(
      unlockedVaultSessionMaterialRepository,
    );
  const sessionServices = {
    assertUnlockedVaultSessionCanActivate,
    protectUnlockedVaultSession,
    restoreUnlockedVaultSession,
    saveUnlockedVaultSession,
    getUnlockedVaultSession,
    removeUnlockedVaultSession,
  };

  const saveUnlockedVaultSessionOriginal =
    sessionServices.saveUnlockedVaultSession.save.bind(
      sessionServices.saveUnlockedVaultSession,
    );
  const getUnlockedVaultSessionOriginal =
    sessionServices.getUnlockedVaultSession.get.bind(
      sessionServices.getUnlockedVaultSession,
    );
  const removeUnlockedVaultSessionOriginal =
    sessionServices.removeUnlockedVaultSession.remove.bind(
      sessionServices.removeUnlockedVaultSession,
    );

  vi.spyOn(sessionServices.saveUnlockedVaultSession, "save").mockImplementation(
    async (session) => {
      await saveUnlockedVaultSessionOriginal(session);
      unlockedVaultSessionMirror = session;
    },
  );
  vi.spyOn(sessionServices.getUnlockedVaultSession, "get").mockImplementation(
    async () => {
      const session = await getUnlockedVaultSessionOriginal();
      unlockedVaultSessionMirror = session ?? undefined;

      return session;
    },
  );
  vi.spyOn(
    sessionServices.removeUnlockedVaultSession,
    "remove",
  ).mockImplementation(async () => {
    await removeUnlockedVaultSessionOriginal();
    unlockedVaultSessionMirror = undefined;
  });

  const clock: ClockPort = {
    now: vi.fn(() => values.timestamp),
  };

  const scheduledTasks: ScheduledTaskPort = {
    scheduleTask: vi.fn(async () => undefined),
    cancelTask: vi.fn(async () => undefined),
  };

  const syncProvider: SyncProviderPort = {
    setup: vi.fn(async () => values.syncConfig),
  };

  const vaultLockTasks: VaultLockTaskRepositoryPort = {
    save: vi.fn(async () => undefined),
    get: vi.fn(async () => null),
    remove: vi.fn(async () => undefined),
  };

  const vaultDisplayName: VaultDisplayNamePort = {
    generateVaultDisplayName: vi.fn(async () => values.vaultDisplayName),
  };

  return {
    crypto,
    bip39,
    vaultLocalRepository,
    unlockedVaultSessionMaterialRepository,
    encryptedUnlockedVaultSessionPayloadRepository,
    ids,
    clock,
    scheduledTasks,
    syncProvider,
    vaultLockTasks,
    vaultDisplayName,
    sessionServices,
    saved,
  };
}
