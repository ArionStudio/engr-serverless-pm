import { removePasswordEntryFromVault } from "../../domain/vault/vault-entry-mutations.utils";
import { PasswordEntryNotFoundError } from "../../application/errors/vault-entry.errors";
import { VaultMustBeUnlockedError } from "../../application/errors/vault-session.errors";
import type { UnlockedVaultSessionService } from "../../application/vault-session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../application/vault-snapshots/vault-snapshot.service";
import type { ClockPort } from "../../ports/system/clock.port";

export type RemoveEntryCommandParams = {
  vaultId: string;
  entryId: string;
};

export type RemoveEntryResult = {
  entryId: string;
  revision: number;
  revisionTimestamp: number;
  deviceId: string;
};

export class RemoveEntryUseCase {
  private readonly clock: ClockPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultSnapshot: VaultSnapshotService;

  constructor(
    clock: ClockPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultSnapshot: VaultSnapshotService,
  ) {
    this.clock = clock;
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultSnapshot = vaultSnapshot;
  }

  async execute(params: RemoveEntryCommandParams): Promise<RemoveEntryResult> {
    const unlockedVaultSession = await this.unlockedVaultSession.get();

    if (
      unlockedVaultSession === null ||
      unlockedVaultSession.unlockedVault.vaultId !== params.vaultId
    ) {
      throw new VaultMustBeUnlockedError(params.vaultId, "remove entry");
    }

    const { sourceSnapshotRevision, unlockedVault } = unlockedVaultSession;

    const entryExists = unlockedVault.vault.entries.some(
      (entry) => entry.id === params.entryId,
    );

    if (!entryExists) {
      throw new PasswordEntryNotFoundError(params.vaultId, params.entryId);
    }

    const updatedUnlockedVault = {
      ...unlockedVault,
      vault: removePasswordEntryFromVault(
        unlockedVault.vault,
        params.entryId,
        unlockedVault.deviceId,
        this.clock.now(),
      ),
    };

    const persistedSnapshot = await this.vaultSnapshot.persistUnlockedVault(
      params.vaultId,
      updatedUnlockedVault,
      sourceSnapshotRevision,
    );

    await this.unlockedVaultSession.commitPersistedSnapshot(
      updatedUnlockedVault,
      persistedSnapshot.revision,
    );

    return {
      entryId: params.entryId,
      ...persistedSnapshot,
    };
  }
}
