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
  Bip39Port,
  ClipboardClearTaskRepositoryPort,
  ClipboardOperationCoordinatorPort,
  ClipboardPort,
  ClipboardSecretHashPort,
  ClockPort,
  CryptoPort,
  EncryptedUnlockedVaultSessionPayloadRepositoryPort,
  IdPort,
  ScheduledTaskPort,
  SyncProviderPort,
  UnlockedVaultSessionMaterialRepositoryPort,
  VaultDisplayNamePort,
  VaultLockTaskRepositoryPort,
  VaultLocalRepositoryPort,
} from "@lfspm/core";
import {
  ClipboardClearService,
  UnlockedVaultSessionService,
  VaultLifecycleCleanupService,
  VaultSnapshotService,
  VaultSyncGuardService,
} from "@lfspm/core/services";

type CoreCompositionPorts = {
  readonly bip39: Bip39Port;
  readonly clipboard: ClipboardPort;
  readonly clipboardClearTasks: ClipboardClearTaskRepositoryPort;
  readonly clipboardOperations: ClipboardOperationCoordinatorPort;
  readonly clipboardSecretHash: ClipboardSecretHashPort;
  readonly clock: ClockPort;
  readonly crypto: CryptoPort;
  readonly encryptedSessionPayloads: EncryptedUnlockedVaultSessionPayloadRepositoryPort;
  readonly ids: IdPort;
  readonly scheduledTasks: ScheduledTaskPort;
  readonly sessionMaterials: UnlockedVaultSessionMaterialRepositoryPort;
  readonly syncProvider: SyncProviderPort;
  readonly vaultDisplayName: VaultDisplayNamePort;
  readonly vaultLockTasks: VaultLockTaskRepositoryPort;
  readonly vaults: VaultLocalRepositoryPort;
};

export function composeCoreApi(ports: CoreCompositionPorts) {
  const unlockedVaultSession = new UnlockedVaultSessionService(
    ports.sessionMaterials,
    ports.encryptedSessionPayloads,
    ports.crypto,
    ports.ids,
  );
  const vaultSnapshot = new VaultSnapshotService(
    ports.crypto,
    ports.clock,
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
    ports.clock,
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
      ports.bip39,
      ports.vaults,
      unlockedVaultSession,
      ports.ids,
      ports.clock,
      ports.vaultDisplayName,
      ports.scheduledTasks,
      ports.vaultLockTasks,
    ),
    lockVault: new LockVaultUseCase(lifecycleCleanup),
    deleteLocalVault: new DeleteLocalVaultUseCase(
      ports.vaults,
      lifecycleCleanup,
    ),
    performDeviceEnrollment: new PerformDeviceEnrollmentUseCase(
      ports.clock,
      ports.crypto,
      ports.ids,
      ports.bip39,
      ports.syncProvider,
      unlockedVaultSession,
      ports.vaultDisplayName,
      ports.vaults,
      lifecycleCleanup,
      ports.scheduledTasks,
      ports.vaultLockTasks,
    ),
    vaultEntry: new AddEntryUseCase(
      ports.ids,
      unlockedVaultSession,
      vaultSyncGuard,
      vaultSnapshot,
    ),
    clipboard: new CopyEntryPasswordUseCase(
      ports.clipboard,
      clipboardClear,
      ports.clipboardOperations,
      ports.clipboardSecretHash,
      ports.ids,
      ports.clipboardClearTasks,
      ports.scheduledTasks,
      ports.clock,
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
