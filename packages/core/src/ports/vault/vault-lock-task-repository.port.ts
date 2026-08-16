export type VaultLockTask = {
  actionId: string;
  vaultId: string;
  expiresAt: number;
};

export interface VaultLockTaskRepositoryPort {
  save: (task: VaultLockTask) => Promise<void>;
  get: () => Promise<VaultLockTask | null>;
  runIfActionIsActive: <T>(
    actionId: string,
    operation: (task: VaultLockTask) => Promise<T>,
  ) => Promise<
    | { readonly status: "executed"; readonly result: T }
    | { readonly status: "stale_action" }
  >;
  /** Atomically removes only the task whose current action ID matches. */
  removeIfActionIsActive: (actionId: string) => Promise<boolean>;
}
