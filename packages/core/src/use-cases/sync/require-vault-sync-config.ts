import type { Vault } from "../../domain/vault/vault";
import { SyncNotConfiguredError } from "../../errors/sync.errors";

export function requireVaultSyncConfig(
  vaultId: string,
  operation: string,
  vault: Pick<Vault, "syncConfig">,
) {
  const syncConfig = vault.syncConfig;

  if (syncConfig === undefined) {
    throw new SyncNotConfiguredError(vaultId, operation);
  }

  return syncConfig;
}
