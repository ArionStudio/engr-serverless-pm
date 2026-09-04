import type { RecoverySecretKey } from "@lfspm/core";
import { ScureBip39Adapter } from "../src/adapters/crypto/scure-bip39.adapter";

const adapter = new ScureBip39Adapter();

export async function runBip39BundleSmokeCheck(): Promise<void> {
  const entropy = new ArrayBuffer(32) as RecoverySecretKey;
  const mnemonic = await adapter.recoveryKeyToMnemonic(entropy);
  const decoded = await adapter.mnemonicToRecoveryKey(mnemonic);

  if (decoded.byteLength !== entropy.byteLength) {
    throw new Error("BIP39 browser bundle smoke check failed.");
  }
}

await runBip39BundleSmokeCheck();
