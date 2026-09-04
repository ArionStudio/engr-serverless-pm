import {
  AddEntryUseCase,
  CopyEntryPasswordUseCase,
  DeleteLocalVaultUseCase,
  InitializeVaultUseCase,
  LockVaultUseCase,
  PerformDeviceEnrollmentUseCase,
  SyncUploadUseCase,
} from "@lfspm/core";
import type {
  ClipboardClearTaskRepositoryPort,
  ClipboardOperationCoordinatorPort,
  ClipboardPort,
  ClipboardSecretHashPort,
  CryptoPort,
  EncryptedUnlockedVaultSessionPayloadRepositoryPort,
  ScheduledTaskPort,
  SyncProviderPort,
  UnlockedVaultSessionMaterialRepositoryPort,
  VaultLockTaskRepositoryPort,
  VaultLocalRepositoryPort,
} from "@lfspm/core";
import {
  ClipboardClearService,
  RandomSamplerService,
  RandomVaultDisplayNameService,
  UnlockedVaultSessionService,
  VaultLifecycleCleanupService,
  VaultSnapshotService,
  VaultSyncGuardService,
} from "@lfspm/core/services";
import { ScureBip39Adapter } from "./adapters/crypto";
import { SystemClockAdapter, WebCryptoIdAdapter } from "./adapters/system";

type CoreCompositionPorts = {
  readonly clipboard: ClipboardPort;
  readonly clipboardClearTasks: ClipboardClearTaskRepositoryPort;
  readonly clipboardOperations: ClipboardOperationCoordinatorPort;
  readonly clipboardSecretHash: ClipboardSecretHashPort;
  readonly crypto: CryptoPort;
  readonly encryptedSessionPayloads: EncryptedUnlockedVaultSessionPayloadRepositoryPort;
  readonly scheduledTasks: ScheduledTaskPort;
  readonly sessionMaterials: UnlockedVaultSessionMaterialRepositoryPort;
  readonly syncProvider: SyncProviderPort;
  readonly vaultLockTasks: VaultLockTaskRepositoryPort;
  readonly vaults: VaultLocalRepositoryPort;
};

export function composeCoreApi(ports: CoreCompositionPorts) {
  const bip39 = new ScureBip39Adapter();
  const clock = new SystemClockAdapter();
  const ids = new WebCryptoIdAdapter();
  const randomSampler = new RandomSamplerService(ports.crypto);
  const vaultDisplayName = new RandomVaultDisplayNameService(randomSampler);
  const unlockedVaultSession = new UnlockedVaultSessionService(
    ports.sessionMaterials,
    ports.encryptedSessionPayloads,
    ports.crypto,
    ids,
    ports.clipboardOperations,
  );
  const vaultSnapshot = new VaultSnapshotService(
    ports.crypto,
    clock,
    ports.vaults,
  );
  const vaultSyncGuard = new VaultSyncGuardService(
    ports.syncProvider,
    vaultSnapshot,
    unlockedVaultSession,
    ports.crypto,
    ports.vaults,
  );
  const clipboardClear = new ClipboardClearService(
    ports.clipboard,
    ports.clipboardClearTasks,
    clock,
    ports.clipboardSecretHash,
  );
  const lifecycleCleanup = new VaultLifecycleCleanupService(
    clipboardClear,
    ports.clipboardClearTasks,
    ports.clipboardOperations,
    ports.scheduledTasks,
    ports.vaultLockTasks,
    unlockedVaultSession,
  );

  return {
    vaultLifecycle: new InitializeVaultUseCase(
      ports.crypto,
      bip39,
      ports.vaults,
      unlockedVaultSession,
      ids,
      clock,
      vaultDisplayName,
      ports.scheduledTasks,
      ports.vaultLockTasks,
      ports.clipboardOperations,
    ),
    lockVault: new LockVaultUseCase(lifecycleCleanup),
    deleteLocalVault: new DeleteLocalVaultUseCase(
      ports.vaults,
      lifecycleCleanup,
    ),
    performDeviceEnrollment: new PerformDeviceEnrollmentUseCase(
      clock,
      ports.crypto,
      ids,
      bip39,
      ports.syncProvider,
      unlockedVaultSession,
      vaultDisplayName,
      ports.vaults,
      lifecycleCleanup,
      ports.scheduledTasks,
      ports.vaultLockTasks,
      ports.clipboardOperations,
    ),
    vaultEntry: new AddEntryUseCase(
      ids,
      unlockedVaultSession,
      vaultSyncGuard,
      vaultSnapshot,
    ),
    clipboard: new CopyEntryPasswordUseCase(
      ports.clipboard,
      clipboardClear,
      ports.clipboardOperations,
      ports.clipboardSecretHash,
      ids,
      ports.clipboardClearTasks,
      ports.scheduledTasks,
      clock,
      unlockedVaultSession,
    ),
    sync: new SyncUploadUseCase(
      ports.syncProvider,
      unlockedVaultSession,
      vaultSnapshot,
      vaultSyncGuard,
    ),
  };
}
