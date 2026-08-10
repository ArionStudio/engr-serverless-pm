import type {
  DeviceEnrollmentPrivateState,
  DeviceEnrollmentRequest,
  PendingDeviceEnrollment,
} from "../../domain/device-trust";
import type { RawMasterPassword } from "../../domain/master-password";
import { assertNewMasterPasswordMeetsPolicy } from "../../domain/master-password/master-password.utils";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { IdPort } from "../../ports/system/id.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import { bestEffortWipeArrayBuffers } from "../../lib/secure-wipe.utils";

export type CreateDeviceEnrollmentRequestCommandParams = {
  readonly vaultId: string;
  readonly expectedGenesisCertificateDigest: string;
  readonly masterPassword: RawMasterPassword;
};

export class CreateDeviceEnrollmentRequestUseCase {
  private readonly crypto: CryptoPort;
  private readonly ids: IdPort;
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;

  constructor(
    crypto: CryptoPort,
    ids: IdPort,
    vaultLocalRepository: VaultLocalRepositoryPort,
  ) {
    this.crypto = crypto;
    this.ids = ids;
    this.vaultLocalRepository = vaultLocalRepository;
  }

  async execute(
    params: CreateDeviceEnrollmentRequestCommandParams,
  ): Promise<DeviceEnrollmentRequest> {
    assertNewMasterPasswordMeetsPolicy(params.masterPassword);

    const requestId = await this.ids.generateId();
    const deviceId = await this.ids.generateId();
    const ownedSecrets: ArrayBuffer[] = [];

    try {
      const signKeyPair = await this.crypto.generateDeviceSignKeyPair();
      ownedSecrets.push(signKeyPair.privateKey);
      const vaultKeyPair = await this.crypto.generateDeviceVaultKeyPair();
      ownedSecrets.push(vaultKeyPair.privateKey);
      const deviceLocalProtectionKey =
        await this.crypto.generateDeviceLocalProtectionKey();
      ownedSecrets.push(deviceLocalProtectionKey);
      const payload = {
        version: 1,
        requestId,
        vaultId: params.vaultId,
        expectedGenesisCertificateDigest:
          params.expectedGenesisCertificateDigest,
        deviceId,
        algorithmSuiteId: this.crypto.algorithmSuite.id,
        publicSignKey: signKeyPair.publicKey,
        publicVaultKey: vaultKeyPair.publicKey,
      } as const;
      const request: DeviceEnrollmentRequest = {
        payload,
        signature: await this.crypto.signDeviceEnrollmentRequest(
          payload,
          signKeyPair.privateKey,
        ),
      };
      const privateState: DeviceEnrollmentPrivateState = {
        request,
        devicePrivateSignKey: signKeyPair.privateKey,
        devicePrivateVaultKey: vaultKeyPair.privateKey,
        deviceLocalProtectionKey,
      };
      const masterPasswordSalt = await this.crypto.generateMasterPasswordSalt();
      const localRootKey = await this.crypto.deriveLocalRootKey(
        params.masterPassword,
        masterPasswordSalt,
      );
      ownedSecrets.push(localRootKey);
      const localKeysProtectionSalt =
        await this.crypto.generateLocalKeysProtectionSalt();
      const protectionKey =
        await this.crypto.deriveDeviceEnrollmentPrivateStateProtectionKey(
          localRootKey,
          localKeysProtectionSalt,
        );
      ownedSecrets.push(protectionKey);
      const pendingEnrollment: PendingDeviceEnrollment = {
        requestId,
        vaultId: params.vaultId,
        deviceId,
        algorithmSuiteId: this.crypto.algorithmSuite.id,
        masterPasswordSalt,
        localKeysProtectionSalt,
        protectedPrivateState:
          await this.crypto.wrapDeviceEnrollmentPrivateState(
            privateState,
            protectionKey,
          ),
      };

      await this.vaultLocalRepository.savePendingDeviceEnrollment(
        pendingEnrollment,
      );

      return request;
    } finally {
      bestEffortWipeArrayBuffers(ownedSecrets);
    }
  }
}
