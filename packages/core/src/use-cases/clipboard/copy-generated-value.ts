import type { ClipboardOperationCoordinatorPort } from "../../ports/clipboard/clipboard-operation-coordinator.port";
import type { SecretClipboardCopyService } from "../../services/clipboard/secret-clipboard-copy.service";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import { ActiveVaultMustBeUnlockedError } from "../../errors/vault-session.errors";

export class CopyGeneratedValueUseCase {
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

  async execute(params: { readonly value: string }): Promise<void> {
    const operation = "copy a generated value";

    return this.coordinator.runExclusive(async (lease) => {
      const activeVaultId = await this.session.getActiveVaultId(lease);
      if (activeVaultId === null)
        throw new ActiveVaultMustBeUnlockedError(operation);

      await this.session.runWithUnlockedVaultContext(
        activeVaultId,
        operation,
        async () => {
          await this.copy.copy(params.value, 30_000);
        },
        lease,
      );
    });
  }
}
