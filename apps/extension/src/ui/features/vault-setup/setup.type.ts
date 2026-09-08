export type SetupStep = "welcome" | "password" | "device" | "connect";
export type AssessPassword = (
  password: string,
) => Promise<{ score: 0 | 1 | 2 | 3 | 4 }>;

export type SetupVault = {
  vaultId: string;
  name: string;
  deviceName: string;
  duration: number;
  complete: boolean;
  unlocked: boolean;
};
export type SetupInspection = {
  vault: SetupVault | null;
  vaults: readonly { vaultId: string; name: string }[];
};
export type SetupRecovery = {
  purpose?: "password-recovery";
  vault: SetupVault;
  words: readonly string[];
  positions: readonly number[];
};
export type RecoverySaveMethod = "text" | "print" | "copy";
export type SetupCapabilities = {
  inspect: (selectedVaultId?: string) => Promise<SetupInspection>;
  create: (params: {
    password: string;
    deviceName: string;
    duration: number;
  }) => Promise<SetupRecovery>;
  unlock: (vaultId: string, password: string) => Promise<SetupVault>;
  replace: (vaultId: string) => Promise<SetupRecovery>;
  recover: (
    vaultId: string,
    words: readonly string[],
    password: string,
  ) => Promise<SetupRecovery>;
  verify: (answers: Readonly<Record<number, string>>) => Promise<boolean>;
  save: (method: RecoverySaveMethod) => Promise<void>;
  lock: () => Promise<void>;
  clear: () => void;
  subscribe: (onInvalidated: (clearDraft?: boolean) => void) => () => void;
  saveDuration: (vaultId: string, duration: number) => Promise<void>;
};
