import type { RecoveryKeyMnemonic } from "../../domain/recovery/bip39-mnemonic";
import type { RecoverySecretKey } from "../../domain/recovery/brand-keys";

export interface Bip39Port {
  /**
   * Implementations must not retain raw recovery-key inputs after resolution.
   * Decoded recovery keys are fresh caller-owned buffers and must not alias
   * adapter state or a value returned by an earlier call.
   * Encoding rejects with RecoveryMnemonicEncodingError when the supplied key
   * cannot be represented by the active algorithm suite. Decoding rejects with
   * InvalidRecoveryMnemonicError for malformed input, unsupported words, or an
   * invalid checksum. Implementations must sanitize dependency errors before
   * exposing either failure.
   */
  recoveryKeyToMnemonic: (
    recoverySecretKey: RecoverySecretKey,
  ) => Promise<RecoveryKeyMnemonic>;
  mnemonicToRecoveryKey: (
    mnemonic: RecoveryKeyMnemonic,
  ) => Promise<RecoverySecretKey>;
}
