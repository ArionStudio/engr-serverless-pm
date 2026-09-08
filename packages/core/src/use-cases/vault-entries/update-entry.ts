import {
  captureExpectedEntryVersion,
  requireExpectedEntryVersion,
} from "../../domain/entry/entry-version.policy";
import { passwordEntryInputSchema } from "../../domain/entry/password-entry.schema";
import { sanitizeEntryUrl } from "../../domain/entry/sanitized-entry-url.utils";
import { updatePasswordEntryInVault } from "../../domain/vault/vault-entry.mutations";
import {
  InvalidPasswordEntryError,
  PasswordEntryStrengthRequirementNotMetError,
  PasswordEntryNotFoundError,
} from "../../errors/vault-entry.errors";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import type { VersionVector } from "../../domain/versioning/version-vector.type";
import type { VaultSyncGuardService } from "../../services/sync";
import { calculatePasswordStrength } from "../../lib/password-strength/password-strength.utils";
import type { SyncUploadStatus } from "../../domain/sync/sync-upload-status.type";
import { requireVaultTagsExist } from "../../domain/vault/vault-tag-reference.policy";
import { requireVaultFolderExists } from "../../domain/vault/vault-organization-reference.policy";
import type { FolderId } from "../../domain/organization/folder.type";

export type UpdateEntryCommandParams = {
  vaultId: string;
  entryId: string;
  expectedEntryVersionVector: Readonly<VersionVector>;
  allowWeakPassword?: boolean;
  withoutPassword?: boolean;
  entry: {
    password: string;
    login: string;
    tags: string[];
    url: string;
    folderId?: FolderId;
  };
};

export type UpdateEntryResult = {
  entryId: string;
  snapshotVersionVector: VersionVector;
  revisionTimestamp: number;
  syncUpload: SyncUploadStatus;
  syncConfigured: boolean;
};

export class UpdateEntryUseCase {
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultSyncGuard: VaultSyncGuardService;
  private readonly vaultSnapshot: VaultSnapshotService;

  constructor(
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultSyncGuard: VaultSyncGuardService,
    vaultSnapshot: VaultSnapshotService,
  ) {
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultSyncGuard = vaultSyncGuard;
    this.vaultSnapshot = vaultSnapshot;
  }

  async execute(params: UpdateEntryCommandParams): Promise<UpdateEntryResult> {
    const { vaultId, entryId } = params;
    const expectedEntryVersion = captureExpectedEntryVersion(
      params.expectedEntryVersionVector,
    );
    const { sessionId, sourceSnapshotVersionVector, unlockedVault } =
      await this.unlockedVaultSession.requireUnlockedVaultContext(
        vaultId,
        "update entry",
      );

    const entryIndex = unlockedVault.vault.entries.findIndex(
      (entry) => entry.id === entryId,
    );

    if (entryIndex === -1) {
      throw new PasswordEntryNotFoundError(vaultId, entryId);
    }
    const current = unlockedVault.vault.entries[entryIndex];

    requireExpectedEntryVersion(current.versionVector, expectedEntryVersion);

    let sanitizedUrl: string;

    try {
      sanitizedUrl = sanitizeEntryUrl(params.entry.url);
    } catch (error) {
      throw new InvalidPasswordEntryError(error);
    }

    const entryPayloadResult = passwordEntryInputSchema.safeParse({
      password: params.entry.password,
      login: params.entry.login,
      tags: params.entry.tags,
      sanitizedUrl,
      folderId: params.entry.folderId ?? current.folderId,
    });

    if (!entryPayloadResult.success) {
      throw new InvalidPasswordEntryError(entryPayloadResult.error);
    }

    if (!entryPayloadResult.data.password && params.withoutPassword !== true) {
      throw new InvalidPasswordEntryError(
        "Confirm that this account has no password.",
      );
    }

    if (
      entryPayloadResult.data.password !== "" &&
      params.allowWeakPassword !== true &&
      calculatePasswordStrength(entryPayloadResult.data.password).score !== 4
    ) {
      throw new PasswordEntryStrengthRequirementNotMetError();
    }

    requireVaultTagsExist(unlockedVault.vault, entryPayloadResult.data.tags);
    requireVaultFolderExists(
      unlockedVault.vault,
      entryPayloadResult.data.folderId,
    );

    const syncState = await this.vaultSyncGuard.prepareLocalMutation(
      vaultId,
      unlockedVault,
      sourceSnapshotVersionVector,
    );

    const updatedUnlockedVault = {
      ...unlockedVault,
      vault: updatePasswordEntryInVault(
        unlockedVault.vault,
        entryId,
        entryPayloadResult.data,
        unlockedVault.deviceId,
      ),
    };
    const { persistedSnapshot, preparedRestore } =
      await this.unlockedVaultSession.persistForActiveSession(
        sessionId,
        vaultId,
        async () => {
          const preparedRestore =
            syncState.syncAccess === undefined
              ? undefined
              : await this.vaultSnapshot.prepareLocalVaultSnapshotRestore(
                  syncState.localSnapshot,
                  unlockedVault,
                );
          const persistedSnapshot =
            await this.vaultSnapshot.persistUnlockedVault(
              vaultId,
              updatedUnlockedVault,
              sourceSnapshotVersionVector,
              syncState.remoteSnapshotIdentity === undefined
                ? {}
                : {
                    uploadExpectedRemoteSnapshotIdentity:
                      syncState.remoteSnapshotIdentity,
                    expectedSyncCredentialState: syncState.syncCredentialState,
                    syncCredentialState: syncState.syncCredentialState,
                  },
            );

          return { persistedSnapshot, preparedRestore };
        },
      );

    let syncUpload: SyncUploadStatus = "complete";

    if (syncState.syncAccess !== undefined) {
      if (preparedRestore === undefined) {
        throw new Error("Synchronized mutation rollback was not prepared.");
      }

      syncUpload = await this.vaultSyncGuard.uploadPersistedLocalMutation(
        vaultId,
        syncState,
        persistedSnapshot.snapshot,
        persistedSnapshot.trustedSnapshotContext.snapshotDigest,
        persistedSnapshot.checkpoint,
        updatedUnlockedVault,
        preparedRestore,
        sessionId,
      );
    }

    const committedUnlockedVault = {
      ...updatedUnlockedVault,
      trustedSnapshotContext: persistedSnapshot.trustedSnapshotContext,
    };

    if (syncState.syncAccess === undefined) {
      await this.unlockedVaultSession.commitPersistedSnapshot(
        sessionId,
        committedUnlockedVault,
        persistedSnapshot.snapshotVersionVector,
      );
    } else {
      await this.unlockedVaultSession.commitPersistedSnapshotIfSessionIsActive(
        sessionId,
        committedUnlockedVault,
        persistedSnapshot.snapshotVersionVector,
      );
    }

    return {
      entryId,
      snapshotVersionVector: persistedSnapshot.snapshotVersionVector,
      revisionTimestamp: persistedSnapshot.revisionTimestamp,
      syncUpload,
      syncConfigured: syncState.syncAccess !== undefined,
    };
  }
}
