import { InitializeVaultUseCase } from "../../use-cases/vault-lifecycle/initialize-vault";
import { createCoreTestPorts } from "./ports";
import { createCoreTestValues } from "./values";

export function createInitializeVaultTestContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const useCase = new InitializeVaultUseCase(
    ports.crypto,
    ports.bip39,
    ports.vaultLocalRepository,
    ports.unlockedVaultRepository,
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
