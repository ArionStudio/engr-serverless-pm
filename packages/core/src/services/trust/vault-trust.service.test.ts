import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import type {
  DevicePublicSignKey,
  DeviceVaultPublicKey,
} from "../../domain/device-trust";
import type { VaultSnapshot } from "../../domain/snapshot";
import { VaultTrustStateInvalidError } from "../../errors/vault-trust.errors";
import { VaultTrustService } from "./vault-trust.service";

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const service = new VaultTrustService(ports.crypto);
  const snapshot: VaultSnapshot = {
    metadata: {
      id: values.vaultId,
      schemaVersion: 1,
      vaultCreationTimestamp: values.timestamp,
      revisionTimestamp: values.timestamp,
      snapshotVersionVector: { [values.deviceId]: 1 },
      algorithmSuiteId: ports.crypto.algorithmSuite.id,
      createdByDeviceId: values.deviceId,
      vaultKeyGeneration: 1,
    },
    trustChain: values.vaultTrustChain,
    keySlots: {
      deviceSlots: [
        {
          deviceId: values.deviceId,
          vaultKeyGeneration: 1,
          envelope: values.vaultKeyEnvelope,
        },
      ],
    },
    content: values.encryptedVault,
    signature: values.snapshotSignature,
  };

  return { values, ports, service, snapshot };
}

describe("VaultTrustService", () => {
  it("creates genesis that authenticates both device public keys", async () => {
    const ctx = createContext();

    const result = await ctx.service.createGenesis(
      ctx.values.vaultId,
      {
        deviceId: ctx.values.deviceId,
        publicSignKey: ctx.values.devicePublicSignKey,
        publicVaultKey: ctx.values.devicePublicVaultKey,
      },
      1,
      ctx.values.devicePrivateSignKey,
    );

    expect(result.trust.trustedDevices[0]).toEqual({
      deviceId: ctx.values.deviceId,
      publicSignKey: ctx.values.devicePublicSignKey,
      publicVaultKey: ctx.values.devicePublicVaultKey,
    });
    expect(result.trust.vaultKeyGeneration).toBe(1);
    expect(result.chain.certificates[0]?.payload.vaultKeyGeneration).toBe(1);
  });

  it("preserves the key generation for enrollment and increments it for revocation", async () => {
    const ctx = createContext();
    const targetIdentity = {
      deviceId: ctx.values.pendingDeviceId,
      publicSignKey: ctx.values.pendingDevicePublicSignKey,
      publicVaultKey: ctx.values.pendingDevicePublicVaultKey,
    };
    const enrollment = await ctx.service.appendTrustTransition(
      ctx.values.vaultId,
      ctx.values.vaultTrustChain,
      ctx.values.verifiedVaultTrustState,
      [...ctx.values.verifiedVaultTrustState.trustedDevices, targetIdentity],
      1,
      ctx.values.deviceId,
      ctx.values.devicePrivateSignKey,
    );
    const revocation = await ctx.service.appendTrustTransition(
      ctx.values.vaultId,
      enrollment.chain,
      enrollment.trust,
      ctx.values.verifiedVaultTrustState.trustedDevices,
      2,
      ctx.values.deviceId,
      ctx.values.devicePrivateSignKey,
    );

    expect(enrollment.trust.vaultKeyGeneration).toBe(1);
    expect(revocation.trust.vaultKeyGeneration).toBe(2);
  });

  it("rejects empty, generation-breaking, and self-removing transitions", async () => {
    const ctx = createContext();
    const targetIdentity = {
      deviceId: ctx.values.pendingDeviceId,
      publicSignKey: ctx.values.pendingDevicePublicSignKey,
      publicVaultKey: ctx.values.pendingDevicePublicVaultKey,
    };
    const enrollment = await ctx.service.appendTrustTransition(
      ctx.values.vaultId,
      ctx.values.vaultTrustChain,
      ctx.values.verifiedVaultTrustState,
      [...ctx.values.verifiedVaultTrustState.trustedDevices, targetIdentity],
      1,
      ctx.values.deviceId,
      ctx.values.devicePrivateSignKey,
    );

    await expect(
      ctx.service.appendTrustTransition(
        ctx.values.vaultId,
        enrollment.chain,
        enrollment.trust,
        enrollment.trust.trustedDevices,
        1,
        ctx.values.deviceId,
        ctx.values.devicePrivateSignKey,
      ),
    ).rejects.toBeInstanceOf(VaultTrustStateInvalidError);
    await expect(
      ctx.service.appendTrustTransition(
        ctx.values.vaultId,
        enrollment.chain,
        enrollment.trust,
        ctx.values.verifiedVaultTrustState.trustedDevices,
        1,
        ctx.values.deviceId,
        ctx.values.devicePrivateSignKey,
      ),
    ).rejects.toBeInstanceOf(VaultTrustStateInvalidError);
    await expect(
      ctx.service.appendTrustTransition(
        ctx.values.vaultId,
        enrollment.chain,
        enrollment.trust,
        [targetIdentity],
        2,
        ctx.values.deviceId,
        ctx.values.devicePrivateSignKey,
      ),
    ).rejects.toBeInstanceOf(VaultTrustStateInvalidError);
  });

  it("validates multiple consecutive revocations after an offline baseline", async () => {
    const ctx = createContext();
    const thirdPublicSignKey = new Uint8Array([3])
      .buffer as DevicePublicSignKey;
    const thirdPublicVaultKey = new Uint8Array([4])
      .buffer as DeviceVaultPublicKey;
    const firstTarget = {
      deviceId: ctx.values.pendingDeviceId,
      publicSignKey: ctx.values.pendingDevicePublicSignKey,
      publicVaultKey: ctx.values.pendingDevicePublicVaultKey,
    };
    const secondTarget = {
      deviceId: "third-device",
      publicSignKey: thirdPublicSignKey,
      publicVaultKey: thirdPublicVaultKey,
    };
    vi.mocked(ctx.ports.crypto.digestDevicePublicSignKey).mockImplementation(
      async (key) => {
        if (key === ctx.values.pendingDevicePublicSignKey) {
          return "pending-sign";
        }

        return key === thirdPublicSignKey ? "third-sign" : "initial-sign";
      },
    );
    vi.mocked(ctx.ports.crypto.digestDevicePublicVaultKey).mockImplementation(
      async (key) => {
        if (key === ctx.values.pendingDevicePublicVaultKey) {
          return "pending-vault";
        }

        return key === thirdPublicVaultKey ? "third-vault" : "initial-vault";
      },
    );
    const firstEnrollment = await ctx.service.appendTrustTransition(
      ctx.values.vaultId,
      ctx.values.vaultTrustChain,
      ctx.values.verifiedVaultTrustState,
      [...ctx.values.verifiedVaultTrustState.trustedDevices, firstTarget],
      1,
      ctx.values.deviceId,
      ctx.values.devicePrivateSignKey,
    );
    const secondEnrollment = await ctx.service.appendTrustTransition(
      ctx.values.vaultId,
      firstEnrollment.chain,
      firstEnrollment.trust,
      [...firstEnrollment.trust.trustedDevices, secondTarget],
      1,
      ctx.values.deviceId,
      ctx.values.devicePrivateSignKey,
    );
    const firstRevocation = await ctx.service.appendTrustTransition(
      ctx.values.vaultId,
      secondEnrollment.chain,
      secondEnrollment.trust,
      secondEnrollment.trust.trustedDevices.filter(
        (device) => device.deviceId !== firstTarget.deviceId,
      ),
      2,
      ctx.values.deviceId,
      ctx.values.devicePrivateSignKey,
    );
    const secondRevocation = await ctx.service.appendTrustTransition(
      ctx.values.vaultId,
      firstRevocation.chain,
      firstRevocation.trust,
      firstRevocation.trust.trustedDevices.filter(
        (device) => device.deviceId !== secondTarget.deviceId,
      ),
      3,
      ctx.values.deviceId,
      ctx.values.devicePrivateSignKey,
    );
    const remoteTrust = await ctx.service.verifyTrustChain(
      ctx.values.vaultId,
      ctx.values.vaultTrustAnchor,
      secondRevocation.chain,
    );

    await expect(
      ctx.service.verifyDeviceRevocationSuffix(
        ctx.values.vaultId,
        secondRevocation.chain,
        secondEnrollment.trust,
        remoteTrust,
      ),
    ).resolves.toEqual([
      {
        revokedDeviceId: firstTarget.deviceId,
        authorizedByDeviceId: ctx.values.deviceId,
        trustGeneration: 3,
        vaultKeyGeneration: 2,
      },
      {
        revokedDeviceId: secondTarget.deviceId,
        authorizedByDeviceId: ctx.values.deviceId,
        trustGeneration: 4,
        vaultKeyGeneration: 3,
      },
    ]);
  });

  it("verifies a snapshot with exactly one current-generation slot per trusted device", async () => {
    const ctx = createContext();

    await expect(
      ctx.service.verifySnapshot(
        ctx.values.vaultId,
        ctx.snapshot,
        ctx.values.verifiedVaultTrustState,
      ),
    ).resolves.toBeUndefined();

    expect(ctx.ports.crypto.verifyVaultSnapshotSignature).toHaveBeenCalled();
  });

  it.each([
    {
      name: "missing slot",
      mutate: (snapshot: VaultSnapshot): VaultSnapshot => ({
        ...snapshot,
        keySlots: { deviceSlots: [] },
      }),
    },
    {
      name: "duplicate slot",
      mutate: (snapshot: VaultSnapshot): VaultSnapshot => ({
        ...snapshot,
        keySlots: {
          deviceSlots: [
            ...snapshot.keySlots.deviceSlots,
            snapshot.keySlots.deviceSlots[0],
          ],
        },
      }),
    },
    {
      name: "invalid snapshot key generation",
      mutate: (snapshot: VaultSnapshot): VaultSnapshot => ({
        ...snapshot,
        metadata: {
          ...snapshot.metadata,
          vaultKeyGeneration: 0,
        },
        keySlots: {
          deviceSlots: snapshot.keySlots.deviceSlots.map((slot) => ({
            ...slot,
            vaultKeyGeneration: 0,
            envelope: {
              ...slot.envelope,
              vaultKeyGeneration: 0,
            },
          })),
        },
      }),
    },
    {
      name: "stale slot generation",
      mutate: (snapshot: VaultSnapshot): VaultSnapshot => ({
        ...snapshot,
        keySlots: {
          deviceSlots: [
            {
              ...snapshot.keySlots.deviceSlots[0],
              vaultKeyGeneration: 0,
            },
          ],
        },
      }),
    },
    {
      name: "wrong envelope recipient",
      mutate: (snapshot: VaultSnapshot): VaultSnapshot => ({
        ...snapshot,
        keySlots: {
          deviceSlots: [
            {
              ...snapshot.keySlots.deviceSlots[0],
              envelope: {
                ...snapshot.keySlots.deviceSlots[0].envelope,
                recipientDeviceId: "other-device",
              },
            },
          ],
        },
      }),
    },
  ])("rejects $name", async ({ mutate }) => {
    const ctx = createContext();

    await expect(
      ctx.service.verifySnapshot(
        ctx.values.vaultId,
        mutate(ctx.snapshot),
        ctx.values.verifiedVaultTrustState,
      ),
    ).rejects.toBeInstanceOf(VaultTrustStateInvalidError);
  });

  it("rejects duplicate wrapping keys in a trust certificate", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.crypto.digestDevicePublicSignKey).mockImplementation(
      async (key) =>
        key === ctx.values.pendingDevicePublicSignKey ? "pending" : "current",
    );
    vi.mocked(ctx.ports.crypto.digestDevicePublicVaultKey).mockResolvedValue(
      "same-wrapping-key",
    );
    const certificate = {
      ...ctx.values.vaultTrustCertificate,
      payload: {
        ...ctx.values.vaultTrustCertificate.payload,
        trustedDevices: [
          ...ctx.values.vaultTrustCertificate.payload.trustedDevices,
          {
            deviceId: ctx.values.pendingDeviceId,
            publicSignKey: ctx.values.pendingDevicePublicSignKey,
            publicVaultKey: ctx.values.pendingDevicePublicVaultKey,
          },
        ],
      },
    };

    await expect(
      ctx.service.verifyTrustChain(
        ctx.values.vaultId,
        ctx.values.vaultTrustAnchor,
        {
          certificates: [certificate],
        },
      ),
    ).rejects.toBeInstanceOf(VaultTrustStateInvalidError);
  });
});
