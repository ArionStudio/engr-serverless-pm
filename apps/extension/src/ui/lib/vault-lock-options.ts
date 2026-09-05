import { AVAILABLE_VAULT_LOCK_DELAYS_MS } from "@lfspm/core";

export const vaultLockOptions = AVAILABLE_VAULT_LOCK_DELAYS_MS.map((value) => ({
  value,
  label: value === 60_000 ? "1 minute" : `${value / 60_000} minutes`,
}));
