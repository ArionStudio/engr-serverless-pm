export type AlgorithmSuiteArtifact =
  | "device access material"
  | "device access recovery backup"
  | "device enrollment request"
  | "device enrollment snapshot"
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
