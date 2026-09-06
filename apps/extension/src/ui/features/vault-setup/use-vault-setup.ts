import { useCallback, useEffect, useRef, useState } from "react";
import type {
  RecoverySaveMethod,
  SetupCapabilities,
  SetupInspection,
  SetupRecovery,
  SetupVault,
} from "./setup.type";

export function useVaultSetup(capabilities: SetupCapabilities) {
  const [loading, setLoading] = useState(true);
  const [vault, setVault] = useState<SetupVault | null>(null);
  const [vaults, setVaults] = useState<SetupInspection["vaults"]>([]);
  const selectedId = useRef<string>(undefined);
  const applyInspection = useCallback((next: SetupInspection) => {
    setVault(next.vault);
    setVaults(next.vaults);
    if (next.vault) selectedId.current = next.vault.vaultId;
  }, []);
  async function inspect() {
    const request = epoch.current;
    const next = await capabilities.inspect(selectedId.current);
    if (request === epoch.current) applyInspection(next);
  }
  const [recovery, setRecovery] = useState<SetupRecovery>();
  const [verifying, setVerifying] = useState(false);
  const [pending, setPending] = useState(false);
  const [inspectionFailed, setInspectionFailed] = useState(false);
  const [error, setError] = useState<string>();
  const epoch = useRef(0);
  const busy = useRef(false);
  const refresh = useCallback(async () => {
    const request = ++epoch.current;
    setLoading(true);
    setInspectionFailed(false);
    setError(undefined);
    setRecovery(undefined);
    setVerifying(false);
    try {
      const next = await capabilities.inspect(selectedId.current);
      if (request === epoch.current) applyInspection(next);
    } catch {
      if (request === epoch.current) {
        setVault(null);
        setVaults([]);
        setInspectionFailed(true);
      }
    } finally {
      if (request === epoch.current) setLoading(false);
    }
  }, [capabilities, applyInspection]);
  useEffect(() => {
    void refresh();
    const unsubscribe = capabilities.subscribe(() => {
      void refresh();
    });
    return () => {
      epoch.current += 1;
      unsubscribe();
    };
  }, [capabilities, refresh]);
  async function run(
    action: (request: number) => Promise<void>,
    failure: string,
  ) {
    if (busy.current) return;
    busy.current = true;
    const request = ++epoch.current;
    setLoading(false);
    setPending(true);
    setError(undefined);
    try {
      await action(request);
    } catch {
      if (request !== epoch.current) return;
      setError(failure);
      // Initialization may have committed before a later failure. Always
      // reconcile persistence before allowing another creation attempt.
      try {
        await inspect();
      } catch {
        if (request !== epoch.current) return;
        setVault(null);
        setVaults([]);
        setInspectionFailed(true);
        setError(
          "Could not check whether the vault was saved. Reload this page before trying again.",
        );
      }
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function accept(operation: () => Promise<SetupRecovery>) {
    const request = epoch.current;
    const next = await operation();
    if (epoch.current !== request) {
      capabilities.clear();
      return;
    }
    selectedId.current = next.vault.vaultId;
    setVault(next.vault);
    setRecovery(next);
    setVerifying(false);
  }
  return {
    loading,
    inspectionFailed,
    retry: refresh,
    vault,
    vaults,
    recovery,
    verifying,
    pending,
    error,
    selectVault: (vaultId: string | null) =>
      run(async () => {
        selectedId.current = vaultId ?? undefined;
        setVault(null);
        setRecovery(undefined);
        setVerifying(false);
        capabilities.clear();
        await inspect();
      }, "Could not open this vault. Try again."),
    create: (params: {
      password: string;
      deviceName: string;
      duration: number;
    }) =>
      run(async () => {
        await accept(() => capabilities.create(params));
      }, "Could not finish creating the vault. If it was saved, unlock it to finish recovery setup."),
    unlock: (password: string) =>
      run(async (request) => {
        if (vault) {
          const next = await capabilities.unlock(vault.vaultId, password);
          if (request === epoch.current) setVault(next);
        }
      }, "Could not unlock this vault. Check your password and try again."),
    replace: () =>
      run(async () => {
        if (vault) await accept(() => capabilities.replace(vault.vaultId));
      }, "Could not generate replacement words. Try again after checking that the vault is unlocked."),
    verify: (answers: Readonly<Record<number, string>>) =>
      run(async (request) => {
        const valid = await capabilities.verify(answers);
        if (request !== epoch.current) return;
        if (!valid) {
          setError(
            "The words do not match. Check the numbered positions in your saved copy.",
          );
          return;
        }
        setRecovery(undefined);
        setVerifying(false);
        await inspect();
      }, "Could not complete verification. Unlock the vault if your session ended."),
    save: async (method: RecoverySaveMethod) => {
      await capabilities.save(method);
    },
    lock: () =>
      run(async (request) => {
        setRecovery(undefined);
        setVerifying(false);
        await capabilities.lock();
        if (request === epoch.current) await inspect();
      }, "Could not lock the vault. Try again."),
    saveDuration: (duration: number) =>
      run(async (request) => {
        if (vault) {
          await capabilities.saveDuration(vault.vaultId, duration);
          if (request === epoch.current) await inspect();
        }
      }, "Could not save the lock setting. Try again."),
    continue: () => {
      setError(undefined);
      setVerifying(true);
    },
    review: () => {
      setError(undefined);
      setVerifying(false);
    },
  };
}
