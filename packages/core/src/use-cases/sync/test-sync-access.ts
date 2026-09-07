import type {
  SyncAccess,
  SyncSetupInput,
} from "../../domain/sync/sync-config.type";
import {
  InvalidSyncConfigError,
  SyncCredentialsRejectedError,
} from "../../errors/sync.errors";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import { requireSyncProviderAccessOutcome } from "../../services/sync/sync-provider-outcome.policy";

export type TestSyncAccessCommandParams = {
  readonly vaultId: string;
  readonly syncConfig: SyncSetupInput;
};

export class TestSyncAccessUseCase {
  private readonly session: UnlockedVaultSessionService;
  private readonly provider: SyncProviderPort;
  constructor(
    session: UnlockedVaultSessionService,
    provider: SyncProviderPort,
  ) {
    this.session = session;
    this.provider = provider;
  }
  async execute(params: TestSyncAccessCommandParams): Promise<void> {
    const vaultId = params.vaultId;
    let config: SyncSetupInput;
    try {
      config = JSON.parse(JSON.stringify(params.syncConfig)) as SyncSetupInput;
    } catch {
      throw new InvalidSyncConfigError();
    }
    await this.session.requireUnlockedVaultContext(vaultId, "test sync access");
    let access: SyncAccess;
    try {
      access = await this.provider.setup(config);
    } catch {
      throw new InvalidSyncConfigError();
    }
    const result = requireSyncProviderAccessOutcome(
      await this.provider.checkVaultAccess(access, vaultId),
    );
    if (result === "authentication_rejected")
      throw new SyncCredentialsRejectedError();
  }
}
