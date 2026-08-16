import { vi } from "vitest";
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
    ports.sessionServices.unlockedVaultSession,
    ports.ids,
    ports.clock,
    ports.vaultDisplayName,
    ports.scheduledTasks,
    ports.vaultLockTasks,
    ports.clipboardOperations,
  );

  vi.mocked(ports.ids.generateId).mockReset();
  vi.mocked(ports.ids.generateId)
    .mockResolvedValueOnce(values.vaultId)
    .mockResolvedValueOnce(values.deviceId)
    .mockResolvedValueOnce(values.localAccessGenerationId)
    .mockResolvedValueOnce(values.vaultLockActionId)
    .mockResolvedValue(values.sessionId);

  return {
    values,
    ports,
    saved: ports.saved,
    useCase,
  };
}
