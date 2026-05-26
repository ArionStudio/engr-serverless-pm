export type LocalVaultDescriptor = {
  readonly vaultId: string;
  readonly displayName: string;
  readonly createdAt: number;
  readonly lastUnlockedAt?: number;
};
