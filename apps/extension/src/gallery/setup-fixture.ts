import type {
  SetupCapabilities,
  SetupRecovery,
  SetupVault,
} from "@/ui/features/vault-setup/setup.type";
import { demoWords } from "./fixtures";
import { globalLibrarySchema } from "@lfspm/core";
import organizationLibrary from "@/assets/data/global-library.json";
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
export function gallerySetup(
  mode:
    | "empty"
    | "multiple"
    | "existing"
    | "ready"
    | "loading"
    | "error" = "empty",
): SetupCapabilities {
  const multiple = mode === "multiple";
  const choices = multiple
    ? [
        { ...setupVault, unlocked: false },
        {
          ...setupVault,
          vaultId: "work-vault",
          name: "Work vault",
          unlocked: false,
        },
      ]
    : [];
  let vault: SetupVault | null =
    mode === "ready"
      ? { ...setupVault, complete: true }
      : mode === "existing"
        ? { ...setupVault, unlocked: false }
        : null;
  return {
    readOrganizationLibrary: async () =>
      globalLibrarySchema.parse(organizationLibrary),
    generatePassword: async () => ({
      password: "Gallery-river-8!Pine-sky",
    }),
    inspect: async (selectedId) => {
      if (mode === "loading") return new Promise(() => {});
      if (mode === "error") throw new Error("Inspection unavailable");
      if (multiple && !vault?.unlocked)
        vault = choices.find((choice) => choice.vaultId === selectedId) ?? null;
      return { vault, vaults: multiple ? choices : vault ? [vault] : [] };
    },
    enroll: async (params) => {
      vault = {
        ...setupVault,
        deviceName: params.deviceName,
        duration: params.duration,
      };
      return { ...setupRecovery, vault };
    },
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
    recover: async () => {
      vault = { ...(vault ?? setupVault), unlocked: true, complete: false };
      return { ...setupRecovery, vault, purpose: "password-recovery" };
    },
    replace: async (_, purpose) => ({
      ...setupRecovery,
      purpose,
      vault: vault ?? setupVault,
    }),
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
