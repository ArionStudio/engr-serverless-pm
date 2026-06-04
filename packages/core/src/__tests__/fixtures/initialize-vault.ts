import { InitializeVaultUseCase } from "../../use-cases/vault-lifecycle/initialize-vault";
import { CommitUnlockedVaultSessionUseCase } from "../../use-cases/vault-session/commit-unlocked-vault-session";
import { createCoreTestPorts } from "./ports";
import { createCoreTestValues } from "./values";

export function createInitializeVaultTestContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const commitUnlockedVaultSession = new CommitUnlockedVaultSessionUseCase(
    ports.sessionUseCases.saveUnlockedVaultSession,
    ports.sessionUseCases.removeUnlockedVaultSession,
  );
  const useCase = new InitializeVaultUseCase(
    ports.crypto,
    ports.bip39,
    ports.vaultLocalRepository,
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
