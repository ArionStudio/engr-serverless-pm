import { InitializeVaultUseCase } from "../../use-cases/vault-lifecycle/initialize-vault";
import { CommitUnlockedVaultSessionService } from "../../application/vault-session/commit-unlocked-vault-session.service";
import { createCoreTestPorts } from "./ports";
import { createCoreTestValues } from "./values";

export function createInitializeVaultTestContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const commitUnlockedVaultSession = new CommitUnlockedVaultSessionService(
    ports.sessionServices.saveUnlockedVaultSession,
    ports.sessionServices.removeUnlockedVaultSession,
  );
  const useCase = new InitializeVaultUseCase(
    ports.crypto,
    ports.bip39,
    ports.vaultLocalRepository,
    ports.sessionServices.assertUnlockedVaultSessionCanActivate,
    commitUnlockedVaultSession,
    ports.ids,
    ports.clock,
    ports.vaultDisplayName,
  );

  return {
    values,
    ports,
    saved: ports.saved,
    useCase,
  };
}
