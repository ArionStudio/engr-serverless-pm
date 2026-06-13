import type { SyncConfig } from "../../domain/sync/sync-config.type";
import type { Vault } from "../../domain/vault/vault";
import { SyncNotConfiguredError } from "../errors/sync.errors";

export function requireVaultSyncConfig(
  vaultId: string,
  operation: string,
  vault: Pick<Vault, "syncConfig">,
): SyncConfig {
  const syncConfig = vault.syncConfig;

  if (syncConfig === undefined) {
    throw new SyncNotConfiguredError(vaultId, operation);
  }

  return syncConfig;
}
