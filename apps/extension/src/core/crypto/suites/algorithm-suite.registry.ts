import type { AlgorithmSuite, AlgorithmSuiteId } from "./algorithm-suite.type";
import { ALGORITHM_SUITE_V1 } from "./algorithm-suite.const";

/**
 * Registry of supported algorithm suites.
 *
 * This centralizes suite lookup and ensures:
 * - Unknown IDs are rejected (no silent fallback).
 * - Adapters/services can resolve suites by ID consistently.
 *
 * Add new suites by widening `AlgorithmSuiteId` and extending this map.
 */
const SUITES: Record<AlgorithmSuiteId, AlgorithmSuite> = {
  "suite-v1": ALGORITHM_SUITE_V1,
};

/**
 * Resolve an AlgorithmSuite by its identifier.
 *
 * @param id - Algorithm suite identifier
 * @returns AlgorithmSuite definition
 * @throws If the suite identifier is unknown
 */
export function resolveAlgorithmSuite(id: AlgorithmSuiteId): AlgorithmSuite {
  const suite = SUITES[id];
  if (!suite) {
    throw new Error(`Unknown AlgorithmSuiteId: ${id}`);
  }
  return suite;
}
