import { useEffect, useRef, useState } from "react";
import type {
  RecoverySaveMethod,
  SetupCapabilities,
  SetupRecovery,
  SetupVault,
} from "./setup.type";

export function useVaultSetup(capabilities: SetupCapabilities) {
  const [loading, setLoading] = useState(true);
  const [vault, setVault] = useState<SetupVault | null>(null);
  const [recovery, setRecovery] = useState<SetupRecovery>();
  const [verifying, setVerifying] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const epoch = useRef(0);
  const busy = useRef(false);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const request = ++epoch.current;
      setRecovery(undefined);
      setVerifying(false);
      try {
        const next = await capabilities.inspect();
        if (active && request === epoch.current) setVault(next);
      } catch {
        if (active && request === epoch.current)
          setError(
            "Could not check your vault. Reload this page to try again.",
          );
      } finally {
        if (active && request === epoch.current) setLoading(false);
      }
    };
    void refresh();
    const unsubscribe = capabilities.subscribe(() => {
      void refresh();
    });
    return () => {
      active = false;
      epoch.current += 1;
      unsubscribe();
    };
  }, [capabilities]);
  async function run(action: () => Promise<void>, failure: string) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(undefined);
    try {
      await action();
    } catch {
      setError(failure);
      // Initialization may have committed before a later failure. Always
      // reconcile persistence before allowing another creation attempt.
      try {
        setVault(await capabilities.inspect());
      } catch {
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
    setVault(next.vault);
    setRecovery(next);
    setVerifying(false);
  }
  return {
    loading,
    vault,
    recovery,
    verifying,
    pending,
    error,
    create: (params: {
      password: string;
      deviceName: string;
      duration: number;
    }) =>
      run(async () => {
        await accept(() => capabilities.create(params));
      }, "Could not finish creating the vault. If it was saved, unlock it to finish recovery setup."),
    unlock: (password: string) =>
      run(async () => {
        if (vault) setVault(await capabilities.unlock(vault.vaultId, password));
      }, "Could not unlock this vault. Check your password and try again."),
    replace: () =>
      run(async () => {
        if (vault) await accept(() => capabilities.replace(vault.vaultId));
      }, "Could not generate replacement words. Try again after checking that the vault is unlocked."),
    verify: (answers: Readonly<Record<number, string>>) =>
      run(async () => {
        if (!(await capabilities.verify(answers))) {
          setError(
            "The words do not match. Check the numbered positions in your saved copy.",
          );
          return;
        }
        setRecovery(undefined);
        setVerifying(false);
        setVault(await capabilities.inspect());
      }, "Could not complete verification. Unlock the vault if your session ended."),
    save: async (method: RecoverySaveMethod) => {
      await capabilities.save(method);
    },
    lock: () =>
      run(async () => {
        epoch.current += 1;
        setRecovery(undefined);
        setVerifying(false);
        await capabilities.lock();
        setVault(await capabilities.inspect());
      }, "Could not lock the vault. Try again."),
    saveDuration: (duration: number) =>
      run(async () => {
        if (vault) {
          await capabilities.saveDuration(vault.vaultId, duration);
          setVault(await capabilities.inspect());
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
