export type Bip39Mnemonic = {
  readonly format: "BIP39";
  readonly words: readonly string[];
};

export type RecoveryKeyMnemonic = Bip39Mnemonic;
