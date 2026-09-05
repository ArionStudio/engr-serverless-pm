import type {
  SetupCapabilities,
  SetupRecovery,
  SetupVault,
} from "@/ui/features/vault-setup/setup.type";
import { demoWords } from "./fixtures";
export const setupVault: SetupVault = {
  vaultId: "gallery-vault",
  name: "Personal vault",
  deviceName: "This browser",
  duration: 600_000,
  complete: false,
  unlocked: true,
};
export const setupRecovery: SetupRecovery = {
  vault: setupVault,
  words: demoWords,
  positions: [3, 11, 19],
};
export function gallerySetup(): SetupCapabilities {
  let vault: SetupVault | null = null;
  return {
    inspect: async () => vault,
    create: async (params) => {
      vault = {
        ...setupVault,
        deviceName: params.deviceName,
        duration: params.duration,
      };
      return { ...setupRecovery, vault };
    },
    unlock: async () => {
      vault = { ...(vault ?? setupVault), unlocked: true };
      return vault;
    },
    replace: async () => ({ ...setupRecovery, vault: vault ?? setupVault }),
    verify: async (answers) => {
      const valid = setupRecovery.positions.every(
        (position) => answers[position]?.trim() === demoWords[position - 1],
      );
      if (valid) vault = { ...(vault ?? setupVault), complete: true };
      return valid;
    },
    save: async () => {},
    lock: async () => {
      vault = { ...(vault ?? setupVault), unlocked: false };
    },
    clear: () => {},
    subscribe: () => () => {},
    saveDuration: async (_, duration) => {
      vault = { ...(vault ?? setupVault), duration };
    },
  };
}
