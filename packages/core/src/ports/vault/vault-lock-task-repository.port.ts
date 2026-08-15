export type VaultLockTask = {
  actionId: string;
  vaultId: string;
  expiresAt: number;
};

export interface VaultLockTaskRepositoryPort {
  save: (task: VaultLockTask) => Promise<void>;
  get: () => Promise<VaultLockTask | null>;
  /** Atomically removes only the task whose current action ID matches. */
  removeIfActionIsActive: (actionId: string) => Promise<boolean>;
}
