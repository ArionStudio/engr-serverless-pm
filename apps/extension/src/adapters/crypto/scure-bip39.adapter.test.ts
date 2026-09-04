import {
  InvalidRecoveryMnemonicError,
  RecoveryMnemonicEncodingError,
  type RecoveryKeyMnemonic,
  type RecoverySecretKey,
} from "@lfspm/core";
import { describe, expect, it, vi } from "vitest";
import { type Bip39EntropyApi, ScureBip39Adapter } from "./scure-bip39.adapter";

const ZERO_ENTROPY_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art";

const ZERO_ENTROPY_WORDS = ZERO_ENTROPY_MNEMONIC.split(" ");

describe("ScureBip39Adapter", () => {
  it("matches the official 256-bit zero-entropy vector", async () => {
    const adapter = new ScureBip39Adapter();
    const key = new ArrayBuffer(32) as RecoverySecretKey;

    await expect(adapter.recoveryKeyToMnemonic(key)).resolves.toEqual({
      format: "BIP39",
      words: ZERO_ENTROPY_WORDS,
    });

    const decoded = await adapter.mnemonicToRecoveryKey({
      format: "BIP39",
      words: ZERO_ENTROPY_WORDS,
    });
    expect(Array.from(new Uint8Array(decoded))).toEqual(
      Array<number>(32).fill(0),
    );
  });

  it("round-trips 256-bit entropy across adapter instances", async () => {
    const sourceBytes = Uint8Array.from({ length: 32 }, (_, index) => index);
    const sourceKey = sourceBytes.buffer as RecoverySecretKey;
    const mnemonic = await new ScureBip39Adapter().recoveryKeyToMnemonic(
      sourceKey,
    );
    const decoded = await new ScureBip39Adapter().mnemonicToRecoveryKey(
      mnemonic,
    );

    expect(Array.from(new Uint8Array(decoded))).toEqual(
      Array.from(sourceBytes),
    );
  });

  it.each([0, 31, 33])("rejects a %i-byte recovery key", async (byteLength) => {
    const adapter = new ScureBip39Adapter();
    const key = new ArrayBuffer(byteLength) as RecoverySecretKey;

    await expect(adapter.recoveryKeyToMnemonic(key)).rejects.toEqual(
      new RecoveryMnemonicEncodingError(),
    );
  });

  it("rejects a detached recovery-key buffer", async () => {
    const adapter = new ScureBip39Adapter();
    const key = new ArrayBuffer(32);
    structuredClone(key, { transfer: [key] });

    await expect(
      adapter.recoveryKeyToMnemonic(key as RecoverySecretKey),
    ).rejects.toEqual(new RecoveryMnemonicEncodingError());
  });

  it("does not mutate caller entropy and wipes its temporary copy", async () => {
    let dependencyInput: Uint8Array | undefined;
    const api: Bip39EntropyApi = {
      entropyToMnemonic: (entropy) => {
        dependencyInput = entropy;
        return ZERO_ENTROPY_MNEMONIC;
      },
      mnemonicToEntropy: vi.fn(),
    };
    const callerBytes = new Uint8Array(32).fill(42);
    const adapter = new ScureBip39Adapter(api);

    await adapter.recoveryKeyToMnemonic(
      callerBytes.buffer as RecoverySecretKey,
    );

    expect(Array.from(callerBytes)).toEqual(Array<number>(32).fill(42));
    expect(dependencyInput).toBeDefined();
    expect(Array.from(dependencyInput ?? [])).toEqual(
      Array<number>(32).fill(0),
    );
  });

  it("wipes temporary entropy after a dependency failure", async () => {
    let dependencyInput: Uint8Array | undefined;
    const api: Bip39EntropyApi = {
      entropyToMnemonic: (entropy) => {
        dependencyInput = entropy;
        throw new Error("dependency included secret state");
      },
      mnemonicToEntropy: vi.fn(),
    };
    const adapter = new ScureBip39Adapter(api);

    await expect(
      adapter.recoveryKeyToMnemonic(
        new Uint8Array(32).fill(42).buffer as RecoverySecretKey,
      ),
    ).rejects.toEqual(new RecoveryMnemonicEncodingError());
    expect(Array.from(dependencyInput ?? [])).toEqual(
      Array<number>(32).fill(0),
    );
  });

  it("returns independent mnemonic word arrays", async () => {
    const adapter = new ScureBip39Adapter();
    const key = new ArrayBuffer(32) as RecoverySecretKey;
    const first = await adapter.recoveryKeyToMnemonic(key);
    const second = await adapter.recoveryKeyToMnemonic(key);

    expect(first.words).not.toBe(second.words);
    Reflect.set(first.words, 0, "zoo");

    expect(second.words[0]).toBe("abandon");
    await expect(adapter.recoveryKeyToMnemonic(key)).resolves.toEqual({
      format: "BIP39",
      words: ZERO_ENTROPY_WORDS,
    });
  });

  it.each([
    ["null", null],
    ["non-plain object", new (class RecoveryMnemonic {})()],
    [
      "extra field",
      { format: "BIP39", words: ZERO_ENTROPY_WORDS, extra: true },
    ],
    ["wrong format", { format: "OTHER", words: ZERO_ENTROPY_WORDS }],
    ["non-array words", { format: "BIP39", words: ZERO_ENTROPY_MNEMONIC }],
    [
      "wrong word count",
      { format: "BIP39", words: ZERO_ENTROPY_WORDS.slice(0, 23) },
    ],
    [
      "non-string word",
      { format: "BIP39", words: [...ZERO_ENTROPY_WORDS.slice(0, 23), 1] },
    ],
    [
      "unknown word",
      {
        format: "BIP39",
        words: [...ZERO_ENTROPY_WORDS.slice(0, 23), "notaword"],
      },
    ],
    [
      "invalid checksum",
      {
        format: "BIP39",
        words: [...ZERO_ENTROPY_WORDS.slice(0, 23), "abandon"],
      },
    ],
  ])("rejects a mnemonic with %s", async (_label, value) => {
    const adapter = new ScureBip39Adapter();

    await expect(decodeUnknown(adapter, value)).rejects.toEqual(
      new InvalidRecoveryMnemonicError(),
    );
  });

  it("rejects sparse and extended word arrays", async () => {
    const adapter = new ScureBip39Adapter();
    const sparseWords = new Array<string>(24);
    sparseWords[0] = "abandon";
    const extendedWords = Object.assign([...ZERO_ENTROPY_WORDS], {
      extra: true,
    });

    await expect(
      decodeUnknown(adapter, { format: "BIP39", words: sparseWords }),
    ).rejects.toEqual(new InvalidRecoveryMnemonicError());
    await expect(
      decodeUnknown(adapter, { format: "BIP39", words: extendedWords }),
    ).rejects.toEqual(new InvalidRecoveryMnemonicError());
  });

  it("rejects accessor properties without invoking them", async () => {
    const adapter = new ScureBip39Adapter();
    const readFormat = vi.fn(() => "BIP39");
    const recordWithAccessor = Object.defineProperties(
      {},
      {
        format: { enumerable: true, get: readFormat },
        words: { enumerable: true, value: ZERO_ENTROPY_WORDS },
      },
    );
    const readWord = vi.fn(() => "abandon");
    const wordsWithAccessor = [...ZERO_ENTROPY_WORDS];
    Object.defineProperty(wordsWithAccessor, 0, {
      enumerable: true,
      get: readWord,
    });

    await expect(decodeUnknown(adapter, recordWithAccessor)).rejects.toEqual(
      new InvalidRecoveryMnemonicError(),
    );
    await expect(
      decodeUnknown(adapter, { format: "BIP39", words: wordsWithAccessor }),
    ).rejects.toEqual(new InvalidRecoveryMnemonicError());
    expect(readFormat).not.toHaveBeenCalled();
    expect(readWord).not.toHaveBeenCalled();
  });

  it("rejects casing and whitespace changes", async () => {
    const adapter = new ScureBip39Adapter();

    for (const word of ["Abandon", " abandon", "abandon "]) {
      await expect(
        decodeUnknown(adapter, {
          format: "BIP39",
          words: [word, ...ZERO_ENTROPY_WORDS.slice(1)],
        }),
      ).rejects.toEqual(new InvalidRecoveryMnemonicError());
    }
  });

  it("rejects malformed Unicode without passing it to the dependency", async () => {
    const mnemonicToEntropy = vi.fn<Bip39EntropyApi["mnemonicToEntropy"]>();
    const adapter = new ScureBip39Adapter({
      entropyToMnemonic: vi.fn(),
      mnemonicToEntropy,
    });

    await expect(
      decodeUnknown(adapter, {
        format: "BIP39",
        words: ["\ud800", ...ZERO_ENTROPY_WORDS.slice(1)],
      }),
    ).rejects.toEqual(new InvalidRecoveryMnemonicError());
    expect(mnemonicToEntropy).not.toHaveBeenCalled();
  });

  it("returns a fresh buffer and preserves the caller word array", async () => {
    const adapter = new ScureBip39Adapter();
    const callerWords = [...ZERO_ENTROPY_WORDS];
    const before = [...callerWords];
    const mnemonic: RecoveryKeyMnemonic = {
      format: "BIP39",
      words: callerWords,
    };
    const first = await adapter.mnemonicToRecoveryKey(mnemonic);
    const second = await adapter.mnemonicToRecoveryKey(mnemonic);

    expect(callerWords).toEqual(before);
    expect(first).not.toBe(second);
    new Uint8Array(first).fill(42);
    expect(Array.from(new Uint8Array(second))).toEqual(
      Array<number>(32).fill(0),
    );
  });

  it("copies decoded entropy for the caller and wipes dependency output", async () => {
    const dependencyOutput = new Uint8Array(32).fill(42);
    const api: Bip39EntropyApi = {
      entropyToMnemonic: vi.fn(),
      mnemonicToEntropy: () => dependencyOutput,
    };
    const adapter = new ScureBip39Adapter(api);

    const decoded = await adapter.mnemonicToRecoveryKey({
      format: "BIP39",
      words: ZERO_ENTROPY_WORDS,
    });

    expect(Array.from(new Uint8Array(decoded))).toEqual(
      Array<number>(32).fill(42),
    );
    expect(Array.from(dependencyOutput)).toEqual(Array<number>(32).fill(0));
  });

  it("rejects and wipes a dependency result with the wrong byte length", async () => {
    const dependencyOutput = new Uint8Array(31).fill(42);
    const adapter = new ScureBip39Adapter({
      entropyToMnemonic: vi.fn(),
      mnemonicToEntropy: () => dependencyOutput,
    });

    await expect(
      adapter.mnemonicToRecoveryKey({
        format: "BIP39",
        words: ZERO_ENTROPY_WORDS,
      }),
    ).rejects.toEqual(new InvalidRecoveryMnemonicError());
    expect(Array.from(dependencyOutput)).toEqual(Array<number>(31).fill(0));
  });

  it("sanitizes dependency errors without retaining mnemonic input", async () => {
    const secretMarker = "recovery-material-marker";
    const unsafeCause = new Error(`unsafe ${secretMarker}`);
    const unsafeSymbol = Symbol(secretMarker);
    Reflect.set(unsafeCause, unsafeSymbol, {
      nested: [unsafeCause, secretMarker],
    });
    const api: Bip39EntropyApi = {
      entropyToMnemonic: vi.fn(),
      mnemonicToEntropy: () => {
        throw new Error(`failed on ${secretMarker}`, { cause: unsafeCause });
      },
    };
    const adapter = new ScureBip39Adapter(api);

    let rejected: unknown;
    try {
      await adapter.mnemonicToRecoveryKey({
        format: "BIP39",
        words: ZERO_ENTROPY_WORDS,
      });
    } catch (error) {
      rejected = error;
    }

    expect(rejected).toEqual(new InvalidRecoveryMnemonicError());
    expect(rejected).not.toBe(unsafeCause);
    expect(collectOwnGraphStrings(rejected)).not.toContain(secretMarker);
  });
});

function decodeUnknown(adapter: ScureBip39Adapter, value: unknown) {
  return adapter.mnemonicToRecoveryKey(value as RecoveryKeyMnemonic);
}

function collectOwnGraphStrings(value: unknown): string {
  const collected: string[] = [];
  const seen = new WeakSet<object>();

  function visit(candidate: unknown): void {
    if (typeof candidate === "string") {
      collected.push(candidate);
      return;
    }

    if (
      (typeof candidate !== "object" || candidate === null) &&
      typeof candidate !== "function"
    ) {
      return;
    }

    if (seen.has(candidate)) {
      return;
    }
    seen.add(candidate);

    for (const key of Reflect.ownKeys(candidate)) {
      collected.push(typeof key === "symbol" ? (key.description ?? "") : key);
      const descriptor = Object.getOwnPropertyDescriptor(candidate, key);

      if (descriptor !== undefined && "value" in descriptor) {
        visit(descriptor.value);
      }
    }
  }

  visit(value);
  return collected.join("\n");
}
