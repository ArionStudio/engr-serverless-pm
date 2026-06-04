import type { RecoveryKeyMnemonic } from "../../domain/recovery/bip39-mnemonic";
import type { RecoverySecretKey } from "../../domain/recovery/brand-keys";

export interface Bip39Port {
  recoveryKeyToMnemonic: (
    recoverySecretKey: RecoverySecretKey,
  ) => Promise<RecoveryKeyMnemonic>;
  mnemonicToRecoveryKey: (
    mnemonic: RecoveryKeyMnemonic,
  ) => Promise<RecoverySecretKey>;
}
