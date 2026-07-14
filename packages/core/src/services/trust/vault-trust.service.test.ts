import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { bytes, createCoreTestValues } from "../../__tests__/fixtures/values";
import type { DevicePublicSignKey } from "../../domain/device-trust";
import type { VaultSnapshot } from "../../domain/snapshot";
import {
  VaultSnapshotRollbackDetectedError,
  VaultTrustStateInvalidError,
} from "../../errors/vault-trust.errors";
import { VaultSnapshotSignerNotTrustedError } from "../../errors/unlock-vault.errors";
import { VaultTrustService } from "./vault-trust.service";

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const service = new VaultTrustService(ports.crypto);
  const snapshot: VaultSnapshot = {
    metadata: {
      id: values.vaultId,
      schemaVersion: 2,
      vaultCreationTimestamp: values.timestamp,
      revisionTimestamp: values.timestamp,
      snapshotVersionVector: { [values.deviceId]: 1 },
      algorithmSuiteId: ports.crypto.algorithmSuite.id,
      createdByDeviceId: values.deviceId,
    },
    trustChain: values.vaultTrustChain,
    keySlots: {
      deviceSlots: [
        {
          deviceId: values.deviceId,
          publicSignKey: values.devicePublicSignKey,
          protectedVaultMasterKey: values.protectedDeviceVaultMasterKey,
        },
      ],
    },
    content: values.encryptedVault,
    signature: values.snapshotSignature,
  };

  return { values, ports, service, snapshot };
}

describe("VaultTrustService", () => {
  it("verifies a certificate chain rooted in the protected local anchor", async () => {
    const ctx = createContext();

    await expect(
      ctx.service.verifyTrustChain(
        ctx.values.vaultId,
        ctx.values.vaultTrustAnchor,
        ctx.values.vaultTrustChain,
      ),
    ).resolves.toEqual(ctx.values.verifiedVaultTrustState);

    expect(
      ctx.ports.crypto.verifyVaultTrustCertificateSignature,
    ).toHaveBeenCalledWith(
      ctx.values.vaultTrustCertificate,
      ctx.values.devicePublicSignKey,
    );
  });

  it("rejects an attacker signer added only to the candidate snapshot", async () => {
    const ctx = createContext();
    const attackerPublicKey = bytes<DevicePublicSignKey>();
    const attackerSnapshot: VaultSnapshot = {
      ...ctx.snapshot,
      metadata: {
        ...ctx.snapshot.metadata,
        createdByDeviceId: "attacker-device",
      },
      keySlots: {
        ...ctx.snapshot.keySlots,
        deviceSlots: [
          ...ctx.snapshot.keySlots.deviceSlots,
          {
            deviceId: "attacker-device",
            publicSignKey: attackerPublicKey,
            protectedVaultMasterKey: ctx.values.protectedDeviceVaultMasterKey,
          },
        ],
      },
    };

    await expect(
      ctx.service.verifySnapshot(
        ctx.values.vaultId,
        attackerSnapshot,
        ctx.values.verifiedVaultTrustState,
      ),
    ).rejects.toBeInstanceOf(VaultSnapshotSignerNotTrustedError);

    expect(
      ctx.ports.crypto.verifyVaultSnapshotSignature,
    ).not.toHaveBeenCalled();
  });

  it("rejects a disconnected trust transition", async () => {
    const ctx = createContext();
    const disconnectedCertificate = {
      ...ctx.values.vaultTrustCertificate,
      payload: {
        ...ctx.values.vaultTrustCertificate.payload,
        generation: 1,
        previousCertificateDigest: "unrelated-certificate",
      },
    };

    await expect(
      ctx.service.verifyTrustChain(
        ctx.values.vaultId,
        ctx.values.vaultTrustAnchor,
        {
          ...ctx.values.vaultTrustChain,
          certificates: [
            ctx.values.vaultTrustCertificate,
            disconnectedCertificate,
          ],
        },
      ),
    ).rejects.toBeInstanceOf(VaultTrustStateInvalidError);
  });

  it("rejects a valid old snapshot when the signed checkpoint is newer", async () => {
    const ctx = createContext();
    const newerCheckpoint = {
      ...ctx.values.localVaultTrustCheckpoint,
      payload: {
        ...ctx.values.localVaultTrustCheckpoint.payload,
        snapshotVersionVector: { [ctx.values.deviceId]: 2 },
      },
    };

    await expect(
      ctx.service.requireSnapshotNotRolledBack(
        ctx.values.vaultId,
        ctx.snapshot,
        ctx.values.verifiedVaultTrustState,
        newerCheckpoint,
      ),
    ).rejects.toBeInstanceOf(VaultSnapshotRollbackDetectedError);
  });

  it("rejects an equal vector whose signed snapshot digest changed", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.crypto.digestVaultSnapshot).mockResolvedValueOnce(
      "different-snapshot-digest",
    );

    await expect(
      ctx.service.requireSnapshotNotRolledBack(
        ctx.values.vaultId,
        ctx.snapshot,
        ctx.values.verifiedVaultTrustState,
        ctx.values.localVaultTrustCheckpoint,
      ),
    ).rejects.toBeInstanceOf(VaultSnapshotRollbackDetectedError);
  });

  it("rejects a newer trust fork that does not contain the local trust checkpoint", async () => {
    const ctx = createContext();
    const forkCertificate = {
      ...ctx.values.vaultTrustCertificate,
      payload: {
        ...ctx.values.vaultTrustCertificate.payload,
        generation: 1,
        previousCertificateDigest: ctx.values.vaultTrustCertificateDigest,
      },
    };
    vi.mocked(
      ctx.ports.crypto.digestVaultTrustCertificate,
    ).mockResolvedValueOnce("fork-certificate-digest");

    await expect(
      ctx.service.requireTrustDescendsFrom(
        ctx.values.vaultId,
        {
          ...ctx.values.vaultTrustChain,
          certificates: [ctx.values.vaultTrustCertificate, forkCertificate],
        },
        {
          ...ctx.values.verifiedVaultTrustState,
          generation: 1,
          certificateDigest: "fork-certificate-digest",
        },
        {
          generation: 1,
          certificateDigest: "locally-checkpointed-certificate-digest",
        },
      ),
    ).rejects.toBeInstanceOf(VaultSnapshotRollbackDetectedError);
  });
});
