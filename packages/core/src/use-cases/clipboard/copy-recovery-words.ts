import type { RecoveryKeyMnemonic } from "../../domain/recovery/bip39-mnemonic";
import type { Bip39Port } from "../../ports/crypto/bip39.port";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import type { ClipboardOperationCoordinatorPort } from "../../ports/clipboard/clipboard-operation-coordinator.port";
import type { SecretClipboardCopyService } from "../../services/clipboard/secret-clipboard-copy.service";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import { bestEffortWipeArrayBuffers } from "../../lib/secure-wipe.utils";
import { areDeviceAccessRecordsConsistent } from "../../domain/device-trust/device-access-records";
import { InvalidRecoveryMnemonicError } from "../../errors/recovery.errors";

export class CopyRecoveryWordsUseCase {
  private readonly bip39: Bip39Port;
  private readonly crypto: CryptoPort;
  private readonly repository: VaultLocalRepositoryPort;
  private readonly session: UnlockedVaultSessionService;
  private readonly coordinator: ClipboardOperationCoordinatorPort;
  private readonly copy: SecretClipboardCopyService;
  constructor(
    bip39: Bip39Port,
    crypto: CryptoPort,
    repository: VaultLocalRepositoryPort,
    session: UnlockedVaultSessionService,
    coordinator: ClipboardOperationCoordinatorPort,
    copy: SecretClipboardCopyService,
  ) {
    this.bip39 = bip39;
    this.crypto = crypto;
    this.repository = repository;
    this.session = session;
    this.coordinator = coordinator;
    this.copy = copy;
  }
  async execute({
    vaultId,
    mnemonic,
  }: {
    vaultId: string;
    mnemonic: RecoveryKeyMnemonic;
  }): Promise<void> {
    return this.coordinator.runExclusive((lease) =>
      this.session.runWithUnlockedVaultContext(
        vaultId,
        "copy recovery words",
        async ({ unlockedVault }) => {
          const secrets: ArrayBuffer[] = [];
          try {
            const {
              deviceAccessMaterial: material,
              deviceAccessRecoveryBackup: backup,
            } = await this.repository.getDeviceAccessRecords(vaultId);
            if (
              !material ||
              !backup ||
              !areDeviceAccessRecordsConsistent(material, backup) ||
              backup.vaultId !== vaultId ||
              backup.deviceId !== unlockedVault.deviceId ||
              backup.algorithmSuiteId !== this.crypto.algorithmSuite.id ||
              !(await this.crypto.verifyDeviceSignKeyPair(
                backup.devicePublicSignKey,
                unlockedVault.devicePrivateSignKey,
              )) ||
              !(await this.crypto.verifyDeviceVaultKeyPair(
                backup.devicePublicVaultKey,
                unlockedVault.devicePrivateVaultKey,
              ))
            )
              throw new InvalidRecoveryMnemonicError();
            const key = await this.bip39.mnemonicToRecoveryKey(mnemonic);
            secrets.push(key);
            const protection =
              await this.crypto.deriveRecoveryLocalKeysProtectionKey(
                key,
                backup.recoveryLocalKeysProtectionSalt,
              );
            secrets.push(protection);
            const payload = await this.crypto.unwrapLocalKeysPayload(
              backup.protectedLocalKeys,
              protection,
            );
            secrets.push(
              payload.devicePrivateSignKey,
              payload.devicePrivateVaultKey,
              payload.deviceLocalProtectionKey,
            );
            if (
              !(await this.crypto.verifyDeviceSignKeyPair(
                backup.devicePublicSignKey,
                payload.devicePrivateSignKey,
              )) ||
              !(await this.crypto.verifyDeviceVaultKeyPair(
                backup.devicePublicVaultKey,
                payload.devicePrivateVaultKey,
              ))
            )
              throw new InvalidRecoveryMnemonicError();
            await this.copy.copy(mnemonic.words.join(" "), 30_000);
          } finally {
            bestEffortWipeArrayBuffers(secrets);
          }
        },
        lease,
      ),
    );
  }
}
