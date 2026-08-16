import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CreateDeviceEnrollmentRequestUseCase,
  CURRENT_ALGORITHM_SUITE,
  PerformDeviceEnrollmentUseCase,
  type IdPort,
  type RawMasterPassword,
  type Vault,
  type VaultSnapshot,
} from "@lfspm/core";
import { createCoreTestPorts } from "../../../../../packages/core/src/__tests__/fixtures/ports";
import { createCoreTestValues } from "../../../../../packages/core/src/__tests__/fixtures/values";
import { ClipboardClearService } from "../../../../../packages/core/src/services/clipboard/clipboard-clear.service";
import { VaultLifecycleCleanupService } from "../../../../../packages/core/src/services/session/vault-lifecycle-cleanup.service";
import { createVaultManagerDb } from "../../infrastructure/database/dexie-db";
import type { VaultManagerDb } from "../../infrastructure/database/dexie-db";
import { WebCryptoPort } from "../crypto";
import { IndexedDbVaultLocalRepository } from "../storage";
import { JsonTextDeviceEnrollmentTransport } from "./json-text-device-enrollment.transport";

let databaseCounter = 0;
let database: VaultManagerDb | undefined;

afterEach(async () => {
  await database?.delete();
  database = undefined;
});

describe("JSON-text enrollment workflow integration", () => {
  it("carries a response through PerformDeviceEnrollmentUseCase with concrete IndexedDB and WebCrypto", async () => {
    const values = createCoreTestValues();
    const ports = createCoreTestPorts(values);
    const crypto = new WebCryptoPort();
    databaseCounter += 1;
    database = createVaultManagerDb(`lfspm-enrollment-${databaseCounter}`);
    const vaults = new IndexedDbVaultLocalRepository(database);
    const vaultId = "integrated-vault-id";
    const sourceDeviceId = "source-device-id";
    const sourceSignKeys = await crypto.generateDeviceSignKeyPair();
    const sourceVaultKeys = await crypto.generateDeviceVaultKeyPair();
    const vaultMasterKey = await crypto.generateVaultMasterKey();
    const genesisPayload = {
      version: 1 as const,
      vaultId,
      generation: 0,
      vaultKeyGeneration: 1,
      previousCertificateDigest: null,
      authorizedByDeviceId: sourceDeviceId,
      trustedDevices: [
        {
          deviceId: sourceDeviceId,
          publicSignKey: sourceSignKeys.publicKey,
          publicVaultKey: sourceVaultKeys.publicKey,
        },
      ],
    };
    const genesisCertificate = {
      payload: genesisPayload,
      signature: await crypto.signVaultTrustCertificate(
        genesisPayload,
        sourceSignKeys.privateKey,
      ),
    };
    const genesisDigest =
      await crypto.digestVaultTrustCertificate(genesisCertificate);
    const masterPassword =
      "V9!integrated-enrollment-password" as RawMasterPassword;
    const requestIds: IdPort = {
      generateId: vi
        .fn()
        .mockResolvedValueOnce("integrated-request-id")
        .mockResolvedValueOnce("target-device-id"),
    };
    const createRequest = new CreateDeviceEnrollmentRequestUseCase(
      crypto,
      requestIds,
      vaults,
    );
    const request = await createRequest.execute({
      vaultId,
      expectedGenesisCertificateDigest: genesisDigest,
      masterPassword,
    });

    await expect(
      vaults.getPendingDeviceEnrollment(request.payload.requestId),
    ).resolves.toMatchObject({
      requestId: request.payload.requestId,
      vaultId,
      deviceId: request.payload.deviceId,
    });

    const transitionPayload = {
      version: 1 as const,
      vaultId,
      generation: 1,
      vaultKeyGeneration: 1,
      previousCertificateDigest: genesisDigest,
      authorizedByDeviceId: sourceDeviceId,
      trustedDevices: [
        ...genesisPayload.trustedDevices,
        {
          deviceId: request.payload.deviceId,
          publicSignKey: request.payload.publicSignKey,
          publicVaultKey: request.payload.publicVaultKey,
        },
      ],
    };
    const transitionCertificate = {
      payload: transitionPayload,
      signature: await crypto.signVaultTrustCertificate(
        transitionPayload,
        sourceSignKeys.privateKey,
      ),
    };
    const sourceEnvelope = await crypto.createDeviceVaultKeyEnvelope(
      vaultMasterKey,
      sourceVaultKeys.publicKey,
      {
        vaultId,
        deviceId: sourceDeviceId,
        vaultKeyGeneration: 1,
        algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
      },
    );
    const targetEnvelope = await crypto.createDeviceVaultKeyEnvelope(
      vaultMasterKey,
      request.payload.publicVaultKey,
      {
        vaultId,
        deviceId: request.payload.deviceId,
        vaultKeyGeneration: 1,
        algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
      },
    );
    const unsignedSnapshot = {
      metadata: {
        id: vaultId,
        schemaVersion: 1 as const,
        vaultCreationTimestamp: 1_700_000_000_000,
        revisionTimestamp: 1_700_000_000_100,
        snapshotVersionVector: { [sourceDeviceId]: 2 },
        algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
        createdByDeviceId: sourceDeviceId,
        vaultKeyGeneration: 1,
      },
      trustChain: {
        certificates: [genesisCertificate, transitionCertificate],
      },
      keySlots: {
        deviceSlots: [
          {
            deviceId: sourceDeviceId,
            vaultKeyGeneration: 1,
            envelope: sourceEnvelope,
          },
          {
            deviceId: request.payload.deviceId,
            vaultKeyGeneration: 1,
            envelope: targetEnvelope,
          },
        ],
      },
      content: await crypto.encryptVaultSnapshotContent(
        createSourceVault(sourceDeviceId),
        vaultMasterKey,
      ),
    };
    const snapshot: VaultSnapshot = {
      ...unsignedSnapshot,
      signature: await crypto.signVaultSnapshot(
        unsignedSnapshot,
        sourceSignKeys.privateKey,
      ),
    };
    const transport = new JsonTextDeviceEnrollmentTransport();
    const response = await transport.parseDeviceEnrollmentResponse(
      transport.serializeDeviceEnrollmentResponse({
        version: 1,
        requestId: request.payload.requestId,
        vaultId,
        vaultTrustAnchor: {
          version: 1,
          vaultId,
          genesisDeviceId: sourceDeviceId,
          genesisPublicSignKey: sourceSignKeys.publicKey,
          genesisCertificateDigest: genesisDigest,
        },
        snapshot,
      }),
    );
    const clipboardClearTasks = {
      save: vi.fn(async () => undefined),
      get: vi.fn(async () => null),
      remove: vi.fn(async () => undefined),
    };
    const clipboard = {
      readText: vi.fn(async () => ""),
      writeText: vi.fn(async () => undefined),
    };
    const clipboardClear = new ClipboardClearService(
      clipboard,
      clipboardClearTasks,
      ports.clock,
      ports.clipboardSecretHash,
    );
    const lifecycleCleanup = new VaultLifecycleCleanupService(
      clipboardClear,
      clipboardClearTasks,
      ports.clipboardOperations,
      ports.scheduledTasks,
      ports.vaultLockTasks,
      ports.sessionServices.unlockedVaultSession,
    );
    vi.mocked(ports.ids.generateId).mockReset();
    vi.mocked(ports.ids.generateId)
      .mockResolvedValueOnce("local-access-generation-id")
      .mockResolvedValueOnce("vault-lock-action-id")
      .mockResolvedValue("session-id");
    const performEnrollment = new PerformDeviceEnrollmentUseCase(
      ports.clock,
      crypto,
      ports.ids,
      ports.bip39,
      ports.syncProvider,
      ports.sessionServices.unlockedVaultSession,
      ports.vaultDisplayName,
      vaults,
      lifecycleCleanup,
      ports.scheduledTasks,
      ports.vaultLockTasks,
      ports.clipboardOperations,
    );

    const result = await performEnrollment.execute({
      enrollmentResponse: response,
      masterPassword,
      deviceName: "Integrated target",
      lockAfterMs: 60_000,
    });

    expect(result.deviceId).toBe(request.payload.deviceId);
    await expect(
      vaults.getLocalVaultDescriptor(vaultId),
    ).resolves.toMatchObject({ vaultId });
    await expect(
      vaults.getDeviceAccessMaterial(vaultId),
    ).resolves.toMatchObject({
      vaultId,
      deviceId: request.payload.deviceId,
      revision: 1,
    });
    await expect(vaults.getVaultSnapshot(vaultId)).resolves.not.toBeNull();
    await expect(
      vaults.getPendingDeviceEnrollment(request.payload.requestId),
    ).resolves.toBeNull();
  });
});

function createSourceVault(sourceDeviceId: string): Vault {
  return {
    versionVector: { [sourceDeviceId]: 1 },
    entries: [],
    deletedEntries: [],
    deviceProfiles: [
      {
        id: sourceDeviceId,
        name: "Source device",
        createdAt: 1_700_000_000_000,
        versionVector: { [sourceDeviceId]: 1 },
      },
    ],
    deletedDeviceProfiles: [],
    tags: [],
    deletedTags: [],
  };
}
