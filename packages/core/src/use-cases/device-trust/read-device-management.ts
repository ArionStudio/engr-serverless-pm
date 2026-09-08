import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";

export type ReadDeviceManagementResult = {
  readonly vaultId: string;
  readonly currentDeviceId: string;
  readonly syncConfigured: boolean;
  readonly genesisCertificateDigest: string;
  readonly devices: readonly {
    readonly id: string;
    readonly name: string;
    readonly state: "current" | "other" | "revoked";
  }[];
};

/** Only verified public identity information may leave the session boundary. */
export class ReadDeviceManagementUseCase {
  private readonly session: UnlockedVaultSessionService;
  constructor(session: UnlockedVaultSessionService) {
    this.session = session;
  }

  async execute({
    vaultId,
  }: {
    vaultId: string;
  }): Promise<ReadDeviceManagementResult> {
    return this.session.runWithUnlockedVaultContext(
      vaultId,
      "read device management",
      async ({ unlockedVault }) => {
        const trusted =
          unlockedVault.trustedSnapshotContext.trust.trustedDevices;
        return {
          vaultId,
          currentDeviceId: unlockedVault.deviceId,
          syncConfigured: unlockedVault.vault.syncTarget !== undefined,
          genesisCertificateDigest:
            unlockedVault.vaultTrustAnchor.genesisCertificateDigest,
          devices: [
            ...trusted.map(({ deviceId }) => ({
              id: deviceId,
              name:
                unlockedVault.vault.deviceProfiles.find(
                  (profile) => profile.id === deviceId,
                )?.name ?? "Awaiting connection",
              state:
                deviceId === unlockedVault.deviceId
                  ? ("current" as const)
                  : ("other" as const),
            })),
            ...unlockedVault.vault.deletedDeviceProfiles
              .filter(
                (profile) =>
                  !trusted.some((device) => device.deviceId === profile.id),
              )
              .map((profile) => ({
                id: profile.id,
                name: "Revoked device",
                state: "revoked" as const,
              })),
          ],
        };
      },
    );
  }
}
