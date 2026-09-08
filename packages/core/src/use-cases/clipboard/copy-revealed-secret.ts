import type { ClipboardOperationCoordinatorPort } from "../../ports/clipboard/clipboard-operation-coordinator.port";
import type { SecretClipboardCopyService } from "../../services/clipboard/secret-clipboard-copy.service";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import { VaultMustBeUnlockedError } from "../../errors/vault-session.errors";

// Copies a value already disclosed to the caller; never reads stored secrets.
export class CopyRevealedSecretUseCase {
  private readonly session: UnlockedVaultSessionService;
  private readonly coordinator: ClipboardOperationCoordinatorPort;
  private readonly copy: SecretClipboardCopyService;
  constructor(
    session: UnlockedVaultSessionService,
    coordinator: ClipboardOperationCoordinatorPort,
    copy: SecretClipboardCopyService,
  ) {
    this.session = session;
    this.coordinator = coordinator;
    this.copy = copy;
  }

  async execute(params: {
    readonly vaultId: string;
    readonly sessionId: string;
    readonly value: string;
  }): Promise<void> {
    return this.coordinator.runExclusive((lease) =>
      this.session.runWithUnlockedVaultContext(
        params.vaultId,
        "copy revealed secret",
        async (session) => {
          if (session.sessionId !== params.sessionId)
            throw new VaultMustBeUnlockedError(
              params.vaultId,
              "copy revealed secret",
            );
          await this.copy.copy(params.value, 30_000);
        },
        lease,
      ),
    );
  }
}
