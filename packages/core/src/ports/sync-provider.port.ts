import type { SyncConfig } from "../domain/sync/sync-config.type";

export interface SyncProviderPort {
  setup: (syncConfig: SyncConfig) => Promise<SyncConfig>;
}
