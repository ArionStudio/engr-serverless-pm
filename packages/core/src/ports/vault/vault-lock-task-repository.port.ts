export type VaultLockTask = {
  actionId: string;
  vaultId: string;
  expiresAt: number;
};

export interface VaultLockTaskRepositoryPort {
  save: (task: VaultLockTask) => Promise<void>;
  get: () => Promise<VaultLockTask | null>;
  remove: () => Promise<void>;
}
