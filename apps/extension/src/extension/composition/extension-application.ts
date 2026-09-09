import { VaultMutationService } from "@lfspm/core/services";
import { composeBrowserLoginApplication } from "./browser-login.composition";
import {
  CopyEntryPasswordUseCase,
  CopyGeneratedValueUseCase,
  CopyRevealedSecretUseCase,
  RevealSyncCredentialsUseCase,
  CopyRecoveryWordsUseCase,
  ConsumeDeviceEnrollmentUseCase,
  ConsumeDeviceRevocationUseCase,
  CreateDeviceEnrollmentRequestUseCase,
  InitializeDeviceEnrollmentUseCase,
  PerformDeviceEnrollmentUseCase,
  ReadDeviceEnrollmentApprovalUseCase,
  PrepareDeviceEnrollmentConsumptionUseCase,
  PrepareDeviceRevocationConsumptionUseCase,
  RecoverDeviceAccessUseCase,
  RevokeDeviceUseCase,
  ReadDeviceManagementUseCase,
  CheckPasswordStrengthUseCase,
  GeneratePasswordUseCase,
  GenerateUsernameUseCase,
  GetVaultSessionStatusUseCase,
  ApplySyncResolutionUseCase,
  ConnectExistingSyncUseCase,
  CompleteProviderCredentialRevocationUseCase,
  DisableSyncUseCase,
  PrepareExistingSyncConnectionUseCase,
  PrepareSyncReviewUseCase,
  SetupSyncUseCase,
  SyncUploadUseCase,
  AddEntryUseCase,
  AddTagUseCase,
  AddFolderUseCase,
  GetEntryPasswordUseCase,
  ReadEntryUseCase,
  ReadEntryForEditingUseCase,
  ReadVaultWorkspaceUseCase,
  ReadTagsUseCase,
  ReadTagGroupsUseCase,
  ReadFoldersUseCase,
  RemoveEntryUseCase,
  RemoveTagUseCase,
  RemoveFolderUseCase,
  SearchEntriesUseCase,
  UpdateEntryUseCase,
  UpdateTagUseCase,
  UpdateFolderUseCase,
  MoveFolderUseCase,
  UpdateSyncCredentialsUseCase,
  GetSyncConfigurationUseCase,
  TestSyncAccessUseCase,
  ChangeMasterPasswordUseCase,
  DeleteLocalVaultUseCase,
  InitializeVaultUseCase,
  ReplaceRecoveryWordsUseCase,
  ListLocalVaultsUseCase,
  UnlockVaultUseCase,
} from "@lfspm/core";
import {
  RandomSamplerService,
  SecretClipboardCopyService,
  RandomVaultDisplayNameService,
  DeviceEnrollmentApprovalService,
  VaultSnapshotService,
  VaultSyncGuardService,
  VaultTrustService,
} from "@lfspm/core/services";
import { ScureBip39Adapter } from "../../adapters/crypto/scure-bip39.adapter";
import { IndexedDbVaultLocalRepositoryAdapter } from "../../adapters/storage";
import { AwsS3SyncProviderAdapter } from "../../adapters/sync";
import { createBrowserS3Client } from "../../adapters/sync/browser-s3-access.adapter";
import { db } from "../../infrastructure/database/dexie-db";
import type { VaultManagerDb } from "../../infrastructure/database/dexie-db";
import { composeSession } from "./session.composition";

// Construct once per trusted application context and pass the needed use cases
// explicitly to callers. Separate contexts coordinate through storage/Web Locks.
export function composeExtensionApplication(database: VaultManagerDb = db) {
  const sessionResources = composeSession(database);
  const {
    clock,
    ids,
    crypto,
    clipboard,
    clipboardSecretHash,
    clipboardClearTasks,
    clipboardOperations,
    scheduledTasks,
    vaultLockTasks,
    clipboardClear,
    unlockedVaultSession,
    lifecycleCleanup,
    clearClipboardTask,
    lockVault,
  } = sessionResources;
  const bip39 = new ScureBip39Adapter();
  const vaultLocalRepository = new IndexedDbVaultLocalRepositoryAdapter(
    database,
    undefined,
    crypto,
  );
  const syncProvider = new AwsS3SyncProviderAdapter(
    createBrowserS3Client,
    undefined,
    crypto,
  );
  const randomSampler = new RandomSamplerService(crypto);
  const vaultDisplayName = new RandomVaultDisplayNameService(randomSampler);
  const vaultSnapshot = new VaultSnapshotService(
    crypto,
    clock,
    vaultLocalRepository,
  );
  const vaultSyncGuard = new VaultSyncGuardService(
    syncProvider,
    vaultSnapshot,
    unlockedVaultSession,
    crypto,
    vaultLocalRepository,
  );
  const vaultMutation = new VaultMutationService(
    unlockedVaultSession,
    vaultSyncGuard,
    vaultSnapshot,
  );
  const vaultTrust = new VaultTrustService(crypto);
  const deviceEnrollmentApproval = new DeviceEnrollmentApprovalService(
    crypto,
    vaultLocalRepository,
    vaultTrust,
  );

  const secretCopy = new SecretClipboardCopyService(
    clipboard,
    clipboardClear,
    clipboardSecretHash,
    ids,
    clipboardClearTasks,
    scheduledTasks,
    clock,
  );

  return {
    browserLogins: composeBrowserLoginApplication(sessionResources),
    revealSyncCredentials: new RevealSyncCredentialsUseCase(
      crypto,
      vaultLocalRepository,
      unlockedVaultSession,
    ),
    copyRevealedSecret: new CopyRevealedSecretUseCase(
      unlockedVaultSession,
      clipboardOperations,
      secretCopy,
    ),
    copyGeneratedValue: new CopyGeneratedValueUseCase(
      unlockedVaultSession,
      clipboardOperations,
      secretCopy,
    ),
    readDeviceManagement: new ReadDeviceManagementUseCase(unlockedVaultSession),
    clearClipboardTask,
    lockVault,
    copyRecoveryWords: new CopyRecoveryWordsUseCase(
      bip39,
      crypto,
      vaultLocalRepository,
      unlockedVaultSession,
      clipboardOperations,
      secretCopy,
    ),
    copyEntryPassword: new CopyEntryPasswordUseCase(
      clipboard,
      clipboardClear,
      clipboardOperations,
      clipboardSecretHash,
      ids,
      clipboardClearTasks,
      scheduledTasks,
      clock,
      unlockedVaultSession,
    ),
    consumeDeviceEnrollment: new ConsumeDeviceEnrollmentUseCase(
      crypto,
      syncProvider,
      unlockedVaultSession,
      vaultSnapshot,
      vaultLocalRepository,
      vaultSyncGuard,
    ),
    consumeDeviceRevocation: new ConsumeDeviceRevocationUseCase(
      crypto,
      syncProvider,
      unlockedVaultSession,
      vaultSnapshot,
      vaultLocalRepository,
    ),
    createDeviceEnrollmentRequest: new CreateDeviceEnrollmentRequestUseCase(
      crypto,
      ids,
      vaultLocalRepository,
    ),
    initializeDeviceEnrollment: new InitializeDeviceEnrollmentUseCase(
      crypto,
      unlockedVaultSession,
      vaultSyncGuard,
      vaultSnapshot,
    ),
    readDeviceEnrollmentApproval: new ReadDeviceEnrollmentApprovalUseCase(
      deviceEnrollmentApproval,
    ),
    performDeviceEnrollment: new PerformDeviceEnrollmentUseCase(
      clock,
      crypto,
      ids,
      bip39,
      syncProvider,
      unlockedVaultSession,
      vaultDisplayName,
      vaultLocalRepository,
      lifecycleCleanup,
      scheduledTasks,
      vaultLockTasks,
      clipboardOperations,
      deviceEnrollmentApproval,
    ),
    prepareDeviceEnrollmentConsumption:
      new PrepareDeviceEnrollmentConsumptionUseCase(
        crypto,
        syncProvider,
        unlockedVaultSession,
        vaultSnapshot,
        vaultSyncGuard,
      ),
    prepareDeviceRevocationConsumption:
      new PrepareDeviceRevocationConsumptionUseCase(
        crypto,
        syncProvider,
        unlockedVaultSession,
        vaultSnapshot,
        vaultLocalRepository,
      ),
    recoverDeviceAccess: new RecoverDeviceAccessUseCase(
      bip39,
      crypto,
      ids,
      unlockedVaultSession,
      vaultLocalRepository,
    ),
    revokeDevice: new RevokeDeviceUseCase(
      clock,
      crypto,
      syncProvider,
      unlockedVaultSession,
      vaultSyncGuard,
      vaultSnapshot,
    ),
    checkPasswordStrength: new CheckPasswordStrengthUseCase(),
    generatePassword: new GeneratePasswordUseCase(randomSampler),
    generateUsername: new GenerateUsernameUseCase(randomSampler),
    getVaultSessionStatus: new GetVaultSessionStatusUseCase(
      unlockedVaultSession,
    ),
    applySyncResolution: new ApplySyncResolutionUseCase(
      syncProvider,
      unlockedVaultSession,
      vaultSnapshot,
      vaultSyncGuard,
    ),
    connectExistingSync: new ConnectExistingSyncUseCase(
      crypto,
      syncProvider,
      unlockedVaultSession,
      vaultSnapshot,
      vaultLocalRepository,
    ),
    completeProviderCredentialRevocation:
      new CompleteProviderCredentialRevocationUseCase(
        crypto,
        syncProvider,
        unlockedVaultSession,
        vaultSnapshot,
        vaultLocalRepository,
        vaultSyncGuard,
      ),
    disableSync: new DisableSyncUseCase(
      clock,
      crypto,
      syncProvider,
      unlockedVaultSession,
      vaultSnapshot,
      vaultSyncGuard,
    ),
    prepareSyncReview: new PrepareSyncReviewUseCase(
      unlockedVaultSession,
      syncProvider,
      vaultSnapshot,
      vaultSyncGuard,
    ),
    prepareExistingSyncConnection: new PrepareExistingSyncConnectionUseCase(
      syncProvider,
      unlockedVaultSession,
      vaultSnapshot,
      vaultLocalRepository,
    ),
    getSyncConfiguration: new GetSyncConfigurationUseCase(unlockedVaultSession),
    testSyncAccess: new TestSyncAccessUseCase(
      unlockedVaultSession,
      syncProvider,
    ),
    setupSync: new SetupSyncUseCase(
      syncProvider,
      unlockedVaultSession,
      vaultSyncGuard,
      vaultSnapshot,
      crypto,
    ),
    updateSyncCredentials: new UpdateSyncCredentialsUseCase(
      crypto,
      syncProvider,
      unlockedVaultSession,
      vaultSnapshot,
      vaultLocalRepository,
    ),
    syncUpload: new SyncUploadUseCase(
      syncProvider,
      unlockedVaultSession,
      vaultSnapshot,
      vaultSyncGuard,
    ),
    addEntry: new AddEntryUseCase(
      ids,
      unlockedVaultSession,
      vaultSyncGuard,
      vaultSnapshot,
    ),
    addTag: new AddTagUseCase(ids, clock, vaultMutation),
    addFolder: new AddFolderUseCase(ids, clock, vaultMutation),
    getEntryPassword: new GetEntryPasswordUseCase(unlockedVaultSession),
    readEntry: new ReadEntryUseCase(unlockedVaultSession),
    readEntryForEditing: new ReadEntryForEditingUseCase(unlockedVaultSession),
    readVaultWorkspace: new ReadVaultWorkspaceUseCase(unlockedVaultSession),
    readTags: new ReadTagsUseCase(unlockedVaultSession),
    readTagGroups: new ReadTagGroupsUseCase(unlockedVaultSession),
    readFolders: new ReadFoldersUseCase(unlockedVaultSession),
    removeEntry: new RemoveEntryUseCase(
      clock,
      unlockedVaultSession,
      vaultSyncGuard,
      vaultSnapshot,
    ),
    removeTag: new RemoveTagUseCase(clock, vaultMutation),
    removeFolder: new RemoveFolderUseCase(clock, vaultMutation),
    searchEntries: new SearchEntriesUseCase(unlockedVaultSession),
    updateEntry: new UpdateEntryUseCase(
      unlockedVaultSession,
      vaultSyncGuard,
      vaultSnapshot,
    ),
    updateTag: new UpdateTagUseCase(vaultMutation),
    updateFolder: new UpdateFolderUseCase(vaultMutation),
    moveFolder: new MoveFolderUseCase(vaultMutation),
    changeMasterPassword: new ChangeMasterPasswordUseCase(
      crypto,
      vaultLocalRepository,
      unlockedVaultSession,
      ids,
    ),
    deleteLocalVault: new DeleteLocalVaultUseCase(
      vaultLocalRepository,
      lifecycleCleanup,
    ),
    replaceRecoveryWords: new ReplaceRecoveryWordsUseCase(
      crypto,
      bip39,
      ids,
      vaultLocalRepository,
      unlockedVaultSession,
    ),
    initializeVault: new InitializeVaultUseCase(
      crypto,
      bip39,
      vaultLocalRepository,
      unlockedVaultSession,
      ids,
      clock,
      vaultDisplayName,
      scheduledTasks,
      vaultLockTasks,
      clipboardOperations,
    ),
    listLocalVaults: new ListLocalVaultsUseCase(vaultLocalRepository),
    unlockVault: new UnlockVaultUseCase(
      clock,
      crypto,
      ids,
      scheduledTasks,
      vaultLocalRepository,
      vaultLockTasks,
      unlockedVaultSession,
      clipboardOperations,
    ),
  };
}

export type ExtensionApplication = ReturnType<
  typeof composeExtensionApplication
>;
