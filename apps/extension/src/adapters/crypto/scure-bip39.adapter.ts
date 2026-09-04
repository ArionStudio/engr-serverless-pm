import {
  CURRENT_ALGORITHM_SUITE,
  InvalidRecoveryMnemonicError,
  RecoveryMnemonicEncodingError,
  type Bip39Port,
  type RecoveryKeyMnemonic,
  type RecoverySecretKey,
} from "@lfspm/core";
import { entropyToMnemonic, mnemonicToEntropy } from "@scure/bip39";
import { wordlist as englishWordlist } from "@scure/bip39/wordlists/english.js";

export type Bip39EntropyApi = {
  readonly entropyToMnemonic: (
    entropy: Uint8Array,
    wordlist: string[],
  ) => string;
  readonly mnemonicToEntropy: (
    mnemonic: string,
    wordlist: string[],
  ) => Uint8Array;
};

const SCURE_BIP39_API: Bip39EntropyApi = {
  entropyToMnemonic,
  mnemonicToEntropy,
};

let englishWords: ReadonlySet<string> | undefined;

function getEnglishWords(): ReadonlySet<string> {
  englishWords ??= new Set(englishWordlist);
  return englishWords;
}

export class ScureBip39Adapter implements Bip39Port {
  private readonly api: Bip39EntropyApi;

  constructor(api: Bip39EntropyApi = SCURE_BIP39_API) {
    this.api = api;
  }

  async recoveryKeyToMnemonic(
    recoverySecretKey: RecoverySecretKey,
  ): Promise<RecoveryKeyMnemonic> {
    let ownedEntropy: Uint8Array | undefined;

    try {
      if (
        !(recoverySecretKey instanceof ArrayBuffer) ||
        recoverySecretKey.byteLength !==
          CURRENT_ALGORITHM_SUITE.recoverySecretGeneration.byteLength
      ) {
        throw new RecoveryMnemonicEncodingError();
      }

      ownedEntropy = new Uint8Array(recoverySecretKey).slice();
      const mnemonic = this.api.entropyToMnemonic(
        ownedEntropy,
        englishWordlist,
      );
      const words = requireValidEnglishWords(mnemonic.split(" "));

      if (words.join(" ") !== mnemonic) {
        throw new RecoveryMnemonicEncodingError();
      }

      return { format: "BIP39", words };
    } catch {
      throw new RecoveryMnemonicEncodingError();
    } finally {
      bestEffortWipe(ownedEntropy);
    }
  }

  async mnemonicToRecoveryKey(
    mnemonic: RecoveryKeyMnemonic,
  ): Promise<RecoverySecretKey> {
    let decodedEntropy: Uint8Array | undefined;

    try {
      const words = decodeRecoveryMnemonic(mnemonic);
      decodedEntropy = this.api.mnemonicToEntropy(
        words.join(" "),
        englishWordlist,
      );

      if (
        decodedEntropy.byteLength !==
        CURRENT_ALGORITHM_SUITE.recoverySecretGeneration.byteLength
      ) {
        throw new InvalidRecoveryMnemonicError();
      }

      return decodedEntropy.slice().buffer as RecoverySecretKey;
    } catch {
      throw new InvalidRecoveryMnemonicError();
    } finally {
      bestEffortWipe(decodedEntropy);
    }
  }
}

function decodeRecoveryMnemonic(value: unknown): string[] {
  if (!isPlainRecord(value)) {
    throw new InvalidRecoveryMnemonicError();
  }

  const keys = Reflect.ownKeys(value);
  const formatProperty = Object.getOwnPropertyDescriptor(value, "format");
  const wordsProperty = Object.getOwnPropertyDescriptor(value, "words");
  if (
    keys.length !== 2 ||
    formatProperty === undefined ||
    !("value" in formatProperty) ||
    formatProperty.value !== "BIP39" ||
    wordsProperty === undefined ||
    !("value" in wordsProperty) ||
    !Array.isArray(wordsProperty.value)
  ) {
    throw new InvalidRecoveryMnemonicError();
  }

  const words: unknown[] = wordsProperty.value;
  if (Reflect.ownKeys(words).length !== words.length + 1) {
    throw new InvalidRecoveryMnemonicError();
  }

  return requireValidEnglishWords(words);
}

function requireValidEnglishWords(words: readonly unknown[]): string[] {
  if (
    words.length !== CURRENT_ALGORITHM_SUITE.recoverySecretEncoding.wordCount
  ) {
    throw new InvalidRecoveryMnemonicError();
  }

  const validatedWords: string[] = [];

  for (let index = 0; index < words.length; index += 1) {
    const wordProperty = Object.getOwnPropertyDescriptor(words, index);
    if (wordProperty === undefined || !("value" in wordProperty)) {
      throw new InvalidRecoveryMnemonicError();
    }

    const word: unknown = wordProperty.value;
    if (typeof word !== "string" || !getEnglishWords().has(word)) {
      throw new InvalidRecoveryMnemonicError();
    }

    validatedWords.push(word);
  }

  return validatedWords;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function bestEffortWipe(value: Uint8Array | undefined): void {
  if (value === undefined) {
    return;
  }

  try {
    value.fill(0);
  } catch {
    // Best-effort cleanup must not replace the operation result.
  }
}
