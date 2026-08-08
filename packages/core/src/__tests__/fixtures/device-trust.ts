import type { VaultTrustCertificate } from "../../domain/device-trust/vault-trust";
import type { VaultSnapshot } from "../../domain/snapshot/vault-snapshot";

export function createDivergedTrustBaselineFixture(params: {
  readonly remoteSnapshot: VaultSnapshot;
  readonly remotePrefix: readonly VaultTrustCertificate[];
  readonly localBaseline: VaultTrustCertificate;
  readonly remoteTransition: VaultTrustCertificate;
  readonly replacementSignature: VaultTrustCertificate["signature"];
}) {
  const divergedBaseline = {
    ...params.localBaseline,
    signature: params.replacementSignature,
  };
  const divergedBaselineDigest = "diverged-trust-baseline-digest";
  const forgedRemoteSnapshot = {
    ...params.remoteSnapshot,
    trustChain: {
      certificates: [
        ...params.remotePrefix,
        divergedBaseline,
        {
          ...params.remoteTransition,
          payload: {
            ...params.remoteTransition.payload,
            previousCertificateDigest: divergedBaselineDigest,
          },
        },
      ],
    },
  };

  return {
    divergedBaseline,
    divergedBaselineDigest,
    forgedRemoteSnapshot,
  };
}
