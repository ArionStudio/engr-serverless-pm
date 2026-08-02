import {
  AddEntryUseCase,
  CopyEntryPasswordUseCase,
  InitializeVaultUseCase,
  SyncUploadUseCase,
} from "@lfspm/core";
import type {
  Bip39Port,
  ClipboardClearTaskRepositoryPort,
  ClipboardPort,
  ClockPort,
  CryptoPort,
  EncryptedUnlockedVaultSessionPayloadRepositoryPort,
  IdPort,
  ScheduledTaskPort,
  SyncProviderPort,
  UnlockedVaultSessionMaterialRepositoryPort,
  VaultDisplayNamePort,
  VaultLocalRepositoryPort,
} from "@lfspm/core";
import {
  ClipboardClearService,
  UnlockedVaultSessionService,
  VaultSnapshotService,
  VaultSyncGuardService,
} from "@lfspm/core/services";

type CoreCompositionPorts = {
  readonly bip39: Bip39Port;
  readonly clipboard: ClipboardPort;
  readonly clipboardClearTasks: ClipboardClearTaskRepositoryPort;
  readonly clock: ClockPort;
  readonly crypto: CryptoPort;
  readonly encryptedSessionPayloads: EncryptedUnlockedVaultSessionPayloadRepositoryPort;
  readonly ids: IdPort;
  readonly scheduledTasks: ScheduledTaskPort;
  readonly sessionMaterials: UnlockedVaultSessionMaterialRepositoryPort;
  readonly syncProvider: SyncProviderPort;
  readonly vaultDisplayName: VaultDisplayNamePort;
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
    ports.crypto,
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
      ports.crypto,
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
