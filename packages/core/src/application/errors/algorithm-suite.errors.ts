export type AlgorithmSuiteArtifact =
  | "device access material"
  | "vault snapshot";

export class UnsupportedAlgorithmSuiteError extends Error {
  constructor(params: {
    vaultId: string;
    artifact: AlgorithmSuiteArtifact;
    expectedAlgorithmSuiteId: string;
    actualAlgorithmSuiteId: string;
  }) {
    super(
      `Unsupported algorithm suite "${params.actualAlgorithmSuiteId}" for ${params.artifact} in vault "${params.vaultId}". Expected "${params.expectedAlgorithmSuiteId}".`,
    );
    this.name = "UnsupportedAlgorithmSuiteError";
  }
}
