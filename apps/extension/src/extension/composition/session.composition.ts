import { ClearClipboardTaskUseCase, LockVaultUseCase } from "@lfspm/core";
import {
  ClipboardClearService,
  UnlockedVaultSessionService,
  VaultLifecycleCleanupService,
} from "@lfspm/core/services";
import {
  OffscreenClipboardAdapter,
  WebCryptoClipboardSecretHashAdapter,
  WebLocksClipboardOperationCoordinatorAdapter,
} from "../../adapters/clipboard";
import { WebCryptoAdapter } from "../../adapters/crypto/web-crypto.adapter";
import {
  ChromeClipboardClearTaskRepositoryAdapter,
  ChromeUnlockedVaultSessionMaterialRepositoryAdapter,
  ChromeVaultLockTaskRepositoryAdapter,
  IndexedDbEncryptedUnlockedVaultSessionPayloadRepositoryAdapter,
} from "../../adapters/storage";
import {
  ChromeAlarmsScheduledTaskAdapter,
  SystemClockAdapter,
  WebCryptoIdAdapter,
} from "../../adapters/system";
import { db } from "../../infrastructure/database/dexie-db";
import type { VaultManagerDb } from "../../infrastructure/database/dexie-db";

// Internal construction shared by the application and alarm roots. Runtime
// initiators receive use cases from their root, never these services or ports.
export function composeSession(database: VaultManagerDb = db) {
  const clock = new SystemClockAdapter();
  const ids = new WebCryptoIdAdapter();
  const crypto = new WebCryptoAdapter();
  const clipboard = new OffscreenClipboardAdapter();
  const clipboardSecretHash = new WebCryptoClipboardSecretHashAdapter();
  const clipboardClearTasks = new ChromeClipboardClearTaskRepositoryAdapter();
  const clipboardOperations =
    new WebLocksClipboardOperationCoordinatorAdapter();
  const scheduledTasks = new ChromeAlarmsScheduledTaskAdapter();
  const vaultLockTasks = new ChromeVaultLockTaskRepositoryAdapter();
  const clipboardClear = new ClipboardClearService(
    clipboard,
    clipboardClearTasks,
    clock,
    clipboardSecretHash,
  );
  const unlockedVaultSession = new UnlockedVaultSessionService(
    new ChromeUnlockedVaultSessionMaterialRepositoryAdapter(),
    new IndexedDbEncryptedUnlockedVaultSessionPayloadRepositoryAdapter(
      database,
    ),
    crypto,
    ids,
    clipboardOperations,
  );
  const lifecycleCleanup = new VaultLifecycleCleanupService(
    clipboardClear,
    clipboardClearTasks,
    clipboardOperations,
    scheduledTasks,
    vaultLockTasks,
    unlockedVaultSession,
  );

  return {
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
    clearClipboardTask: new ClearClipboardTaskUseCase(
      clipboardClear,
      clipboardOperations,
    ),
    lockVault: new LockVaultUseCase(lifecycleCleanup),
  };
}
