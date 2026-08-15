import type { RecoveryKeyMnemonic } from "../../domain/recovery/bip39-mnemonic";
import type { RecoverySecretKey } from "../../domain/recovery/brand-keys";

export interface Bip39Port {
  /**
   * Implementations must not retain raw recovery-key inputs after resolution.
   * Decoded recovery keys are fresh caller-owned buffers and must not alias
   * adapter state or a value returned by an earlier call.
   */
  recoveryKeyToMnemonic: (
    recoverySecretKey: RecoverySecretKey,
  ) => Promise<RecoveryKeyMnemonic>;
  mnemonicToRecoveryKey: (
    mnemonic: RecoveryKeyMnemonic,
  ) => Promise<RecoverySecretKey>;
}
