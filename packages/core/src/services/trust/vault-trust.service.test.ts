import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import type {
  DevicePublicSignKey,
  DeviceTrustIdentity,
  DeviceVaultPublicKey,
} from "../../domain/device-trust";
import type { VaultSnapshot } from "../../domain/snapshot";
import {
  VaultSnapshotRollbackDetectedError,
  VaultTrustStateInvalidError,
} from "../../errors/vault-trust.errors";
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

async function createEnrollmentFixture(ctx: ReturnType<typeof createContext>) {
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

  return { targetIdentity, enrollment };
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
    const { enrollment } = await createEnrollmentFixture(ctx);
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
    const { targetIdentity, enrollment } =
      await createEnrollmentFixture(ctx);

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

  it("rejects removed or mutated certificates in the trusted prefix", async () => {
    const ctx = createContext();
    const { enrollment } = await createEnrollmentFixture(ctx);
    const trustedCertificate = enrollment.chain.certificates[1];

    if (trustedCertificate === undefined) {
      throw new Error("Expected an appended trust certificate.");
    }

    const mutatedCertificate = {
      ...trustedCertificate,
      signature: ctx.values.enrollmentRequestSignature,
    };
    vi.mocked(
      ctx.ports.crypto.digestVaultTrustCertificate,
    ).mockImplementation(async (certificate) =>
      certificate === mutatedCertificate
        ? "mutated-trust-certificate-digest"
        : ctx.values.vaultTrustCertificateDigest,
    );

    await expect(
      ctx.service.requireTrustDescendsFrom(
        ctx.values.vaultId,
        ctx.values.vaultTrustChain,
        enrollment.trust,
        enrollment.trust,
      ),
    ).rejects.toBeInstanceOf(VaultSnapshotRollbackDetectedError);
    await expect(
      ctx.service.requireTrustDescendsFrom(
        ctx.values.vaultId,
        {
          certificates: [
            ...ctx.values.vaultTrustChain.certificates,
            mutatedCertificate,
          ],
        },
        enrollment.trust,
        enrollment.trust,
      ),
    ).rejects.toBeInstanceOf(VaultSnapshotRollbackDetectedError);
  });

  it("rejects disconnected or unauthorized trust certificates", async () => {
    const ctx = createContext();
    const { enrollment } = await createEnrollmentFixture(ctx);
    const certificate = enrollment.chain.certificates[1];

    if (certificate === undefined) {
      throw new Error("Expected an appended trust certificate.");
    }

    await expect(
      ctx.service.verifyTrustChain(ctx.values.vaultId, ctx.values.vaultTrustAnchor, {
        certificates: [
          ...ctx.values.vaultTrustChain.certificates,
          {
            ...certificate,
            payload: {
              ...certificate.payload,
              previousCertificateDigest: "disconnected-certificate-digest",
            },
          },
        ],
      }),
    ).rejects.toBeInstanceOf(VaultTrustStateInvalidError);
    await expect(
      ctx.service.verifyTrustChain(ctx.values.vaultId, ctx.values.vaultTrustAnchor, {
        certificates: [
          ...ctx.values.vaultTrustChain.certificates,
          {
            ...certificate,
            payload: {
              ...certificate.payload,
              generation: certificate.payload.generation + 1,
            },
          },
        ],
      }),
    ).rejects.toBeInstanceOf(VaultTrustStateInvalidError);
    await expect(
      ctx.service.verifyTrustChain(ctx.values.vaultId, ctx.values.vaultTrustAnchor, {
        certificates: [
          ...ctx.values.vaultTrustChain.certificates,
          {
            ...certificate,
            payload: {
              ...certificate.payload,
              authorizedByDeviceId: "untrusted-authorizer",
            },
          },
        ],
      }),
    ).rejects.toBeInstanceOf(VaultTrustStateInvalidError);

    vi.mocked(
      ctx.ports.crypto.verifyVaultTrustCertificateSignature,
    ).mockReset().mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(
      ctx.service.verifyTrustChain(
        ctx.values.vaultId,
        ctx.values.vaultTrustAnchor,
        enrollment.chain,
      ),
    ).rejects.toBeInstanceOf(VaultTrustStateInvalidError);
  });

  it("rejects a certificate signed by a trusted device other than its declared authorizer", async () => {
    const ctx = createContext();
    const { targetIdentity, enrollment } =
      await createEnrollmentFixture(ctx);
    const revocation = await ctx.service.appendTrustTransition(
      ctx.values.vaultId,
      enrollment.chain,
      enrollment.trust,
      [targetIdentity],
      2,
      targetIdentity.deviceId,
      ctx.values.pendingDevicePrivateSignKey,
    );
    const revocationCertificate = revocation.chain.certificates[2];

    if (revocationCertificate === undefined) {
      throw new Error("Expected an appended revocation certificate.");
    }

    const certificateSignedByAnotherDevice = {
      ...revocationCertificate,
      signature: ctx.values.enrollmentRequestSignature,
    };
    vi.mocked(
      ctx.ports.crypto.verifyVaultTrustCertificateSignature,
    ).mockImplementation(async (certificate, publicKey) =>
      certificate === certificateSignedByAnotherDevice
        ? publicKey === ctx.values.devicePublicSignKey
        : true,
    );

    await expect(
      ctx.service.verifyTrustChain(
        ctx.values.vaultId,
        ctx.values.vaultTrustAnchor,
        {
          certificates: [
            ...revocation.chain.certificates.slice(0, -1),
            certificateSignedByAnotherDevice,
          ],
        },
      ),
    ).rejects.toBeInstanceOf(VaultTrustStateInvalidError);

    expect(
      ctx.ports.crypto.verifyVaultTrustCertificateSignature,
    ).toHaveBeenCalledWith(
      certificateSignedByAnotherDevice,
      targetIdentity.publicSignKey,
    );
  });

  it("rejects appending a transition with another device's private signing key", async () => {
    const ctx = createContext();
    const targetIdentity = {
      deviceId: ctx.values.pendingDeviceId,
      publicSignKey: ctx.values.pendingDevicePublicSignKey,
      publicVaultKey: ctx.values.pendingDevicePublicVaultKey,
    };
    vi.mocked(ctx.ports.crypto.verifyDeviceSignKeyPair).mockImplementation(
      async (publicKey, privateKey) =>
        publicKey === ctx.values.devicePublicSignKey &&
        privateKey === ctx.values.devicePrivateSignKey,
    );

    await expect(
      ctx.service.appendTrustTransition(
        ctx.values.vaultId,
        ctx.values.vaultTrustChain,
        ctx.values.verifiedVaultTrustState,
        [...ctx.values.verifiedVaultTrustState.trustedDevices, targetIdentity],
        1,
        ctx.values.deviceId,
        ctx.values.pendingDevicePrivateSignKey,
      ),
    ).rejects.toBeInstanceOf(VaultTrustStateInvalidError);

    expect(ctx.ports.crypto.verifyDeviceSignKeyPair).toHaveBeenCalledWith(
      ctx.values.devicePublicSignKey,
      ctx.values.pendingDevicePrivateSignKey,
    );
    expect(ctx.ports.crypto.signVaultTrustCertificate).not.toHaveBeenCalled();
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
        type: "revocation",
        revokedDeviceId: firstTarget.deviceId,
        authorizedByDeviceId: ctx.values.deviceId,
        trustGeneration: 3,
        vaultKeyGeneration: 2,
      },
      {
        type: "revocation",
        revokedDeviceId: secondTarget.deviceId,
        authorizedByDeviceId: ctx.values.deviceId,
        trustGeneration: 4,
        vaultKeyGeneration: 3,
      },
    ]);

    await expect(
      ctx.service.verifyDeviceTrustSuffix(
        ctx.values.vaultId,
        secondRevocation.chain,
        firstEnrollment.trust,
        remoteTrust,
      ),
    ).resolves.toEqual([
      {
        type: "enrollment",
        enrolledDeviceId: secondTarget.deviceId,
        authorizedByDeviceId: ctx.values.deviceId,
        trustGeneration: 2,
        vaultKeyGeneration: 1,
      },
      {
        type: "revocation",
        revokedDeviceId: firstTarget.deviceId,
        authorizedByDeviceId: ctx.values.deviceId,
        trustGeneration: 3,
        vaultKeyGeneration: 2,
      },
      {
        type: "revocation",
        revokedDeviceId: secondTarget.deviceId,
        authorizedByDeviceId: ctx.values.deviceId,
        trustGeneration: 4,
        vaultKeyGeneration: 3,
      },
    ]);
  });

  it("validates an enrollment-only suffix without rotating the vault key", async () => {
    const ctx = createContext();
    const { targetIdentity, enrollment } =
      await createEnrollmentFixture(ctx);

    await expect(
      ctx.service.verifyDeviceEnrollmentSuffix(
        ctx.values.vaultId,
        enrollment.chain,
        ctx.values.verifiedVaultTrustState,
        enrollment.trust,
      ),
    ).resolves.toEqual([
      {
        type: "enrollment",
        enrolledDeviceId: targetIdentity.deviceId,
        authorizedByDeviceId: ctx.values.deviceId,
        trustGeneration: 1,
        vaultKeyGeneration: 1,
      },
    ]);
  });

  it("rejects a revocation inside an enrollment-consumption suffix", async () => {
    const ctx = createContext();
    const { enrollment } = await createEnrollmentFixture(ctx);
    const revocation = await ctx.service.appendTrustTransition(
      ctx.values.vaultId,
      enrollment.chain,
      enrollment.trust,
      ctx.values.verifiedVaultTrustState.trustedDevices,
      2,
      ctx.values.deviceId,
      ctx.values.devicePrivateSignKey,
    );

    await expect(
      ctx.service.verifyDeviceEnrollmentSuffix(
        ctx.values.vaultId,
        revocation.chain,
        ctx.values.verifiedVaultTrustState,
        revocation.trust,
      ),
    ).rejects.toBeInstanceOf(VaultTrustStateInvalidError);
  });

  it("rejects re-enrollment of a historically revoked device identity", async () => {
    const ctx = createContext();
    const freshPublicSignKey = new Uint8Array([5])
      .buffer as DevicePublicSignKey;
    const freshPublicVaultKey = new Uint8Array([6])
      .buffer as DeviceVaultPublicKey;
    const targetIdentity = {
      deviceId: ctx.values.pendingDeviceId,
      publicSignKey: ctx.values.pendingDevicePublicSignKey,
      publicVaultKey: ctx.values.pendingDevicePublicVaultKey,
    };
    const reusedDeviceIdWithFreshKeys = {
      deviceId: targetIdentity.deviceId,
      publicSignKey: freshPublicSignKey,
      publicVaultKey: freshPublicVaultKey,
    };
    vi.mocked(ctx.ports.crypto.digestDevicePublicSignKey).mockImplementation(
      async (key) => {
        if (key === targetIdentity.publicSignKey) {
          return "revoked-sign";
        }

        return key === freshPublicSignKey ? "fresh-sign" : "initial-sign";
      },
    );
    vi.mocked(ctx.ports.crypto.digestDevicePublicVaultKey).mockImplementation(
      async (key) => {
        if (key === targetIdentity.publicVaultKey) {
          return "revoked-vault";
        }

        return key === freshPublicVaultKey ? "fresh-vault" : "initial-vault";
      },
    );
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

    await expect(
      ctx.service.appendTrustTransition(
        ctx.values.vaultId,
        revocation.chain,
        revocation.trust,
        [...revocation.trust.trustedDevices, reusedDeviceIdWithFreshKeys],
        2,
        ctx.values.deviceId,
        ctx.values.devicePrivateSignKey,
      ),
    ).rejects.toBeInstanceOf(VaultTrustStateInvalidError);

    const reEnrollmentCertificate = {
      payload: {
        version: 1 as const,
        vaultId: ctx.values.vaultId,
        generation: 3,
        vaultKeyGeneration: 2,
        previousCertificateDigest: ctx.values.vaultTrustCertificateDigest,
        authorizedByDeviceId: ctx.values.deviceId,
        trustedDevices: [
          ...revocation.trust.trustedDevices,
          reusedDeviceIdWithFreshKeys,
        ],
      },
      signature: ctx.values.vaultTrustCertificateSignature,
    };

    await expect(
      ctx.service.verifyTrustChain(
        ctx.values.vaultId,
        ctx.values.vaultTrustAnchor,
        {
          certificates: [
            ...revocation.chain.certificates,
            reEnrollmentCertificate,
          ],
        },
      ),
    ).rejects.toBeInstanceOf(VaultTrustStateInvalidError);
  });

  it("rejects reuse of either public key from a revoked identity", async () => {
    const ctx = createContext();
    const freshPublicSignKey = new Uint8Array([7])
      .buffer as DevicePublicSignKey;
    const freshPublicVaultKey = new Uint8Array([8])
      .buffer as DeviceVaultPublicKey;
    const revokedIdentity = {
      deviceId: ctx.values.pendingDeviceId,
      publicSignKey: ctx.values.pendingDevicePublicSignKey,
      publicVaultKey: ctx.values.pendingDevicePublicVaultKey,
    };
    vi.mocked(ctx.ports.crypto.digestDevicePublicSignKey).mockImplementation(
      async (key) => {
        if (key === ctx.values.pendingDevicePublicSignKey) {
          return "revoked-sign";
        }

        return key === freshPublicSignKey ? "fresh-sign" : "initial-sign";
      },
    );
    vi.mocked(ctx.ports.crypto.digestDevicePublicVaultKey).mockImplementation(
      async (key) => {
        if (key === ctx.values.pendingDevicePublicVaultKey) {
          return "revoked-vault";
        }

        return key === freshPublicVaultKey ? "fresh-vault" : "initial-vault";
      },
    );
    const enrollment = await ctx.service.appendTrustTransition(
      ctx.values.vaultId,
      ctx.values.vaultTrustChain,
      ctx.values.verifiedVaultTrustState,
      [...ctx.values.verifiedVaultTrustState.trustedDevices, revokedIdentity],
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

    await expect(
      ctx.service.appendTrustTransition(
        ctx.values.vaultId,
        revocation.chain,
        revocation.trust,
        [
          ...revocation.trust.trustedDevices,
          {
            deviceId: "fresh-device-with-reused-signing-key",
            publicSignKey: revokedIdentity.publicSignKey,
            publicVaultKey: freshPublicVaultKey,
          },
        ],
        2,
        ctx.values.deviceId,
        ctx.values.devicePrivateSignKey,
      ),
    ).rejects.toBeInstanceOf(VaultTrustStateInvalidError);

    await expect(
      ctx.service.appendTrustTransition(
        ctx.values.vaultId,
        revocation.chain,
        revocation.trust,
        [
          ...revocation.trust.trustedDevices,
          {
            deviceId: "fresh-device-with-reused-wrapping-key",
            publicSignKey: freshPublicSignKey,
            publicVaultKey: revokedIdentity.publicVaultKey,
          },
        ],
        2,
        ctx.values.deviceId,
        ctx.values.devicePrivateSignKey,
      ),
    ).rejects.toBeInstanceOf(VaultTrustStateInvalidError);

    const hostileRemoteIdentities = [
      {
        deviceId: "fresh-device-with-historical-signing-key",
        publicSignKey: revokedIdentity.publicSignKey,
        publicVaultKey: freshPublicVaultKey,
      },
      {
        deviceId: "fresh-device-with-historical-vault-key",
        publicSignKey: freshPublicSignKey,
        publicVaultKey: revokedIdentity.publicVaultKey,
      },
    ] satisfies readonly DeviceTrustIdentity[];

    for (const hostileRemoteIdentity of hostileRemoteIdentities) {
      await expect(
        ctx.service.verifyTrustChain(
          ctx.values.vaultId,
          ctx.values.vaultTrustAnchor,
          {
            certificates: [
              ...revocation.chain.certificates,
              {
                payload: {
                  version: 1,
                  vaultId: ctx.values.vaultId,
                  generation: 3,
                  vaultKeyGeneration: 2,
                  previousCertificateDigest:
                    ctx.values.vaultTrustCertificateDigest,
                  authorizedByDeviceId: ctx.values.deviceId,
                  trustedDevices: [
                    ...revocation.trust.trustedDevices,
                    hostileRemoteIdentity,
                  ],
                },
                signature: ctx.values.vaultTrustCertificateSignature,
              },
            ],
          },
        ),
      ).rejects.toBeInstanceOf(VaultTrustStateInvalidError);
    }
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
