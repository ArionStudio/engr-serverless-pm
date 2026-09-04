export class InvalidRecoveryMnemonicError extends Error {
  constructor() {
    super("Recovery mnemonic is malformed.");
    this.name = "InvalidRecoveryMnemonicError";
  }
}

export class RecoveryMnemonicEncodingError extends Error {
  constructor() {
    super("Recovery key could not be encoded as a mnemonic.");
    this.name = "RecoveryMnemonicEncodingError";
  }
}
