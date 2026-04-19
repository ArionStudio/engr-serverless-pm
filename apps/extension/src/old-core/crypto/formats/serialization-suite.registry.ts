import type {
  SerializationSuite,
  SerializationSuiteId,
} from "./serialization-suite.type";
import { SERIALIZATION_SUITE_V1 } from "./serialization-suite.const";

const SUITES: Record<SerializationSuiteId, SerializationSuite> = {
  "ser-v1": SERIALIZATION_SUITE_V1,
};

export function resolveSerializationSuite(
  id: SerializationSuiteId,
): SerializationSuite {
  const suite = SUITES[id];
  if (!suite) {
    throw new Error(`Unknown SerializationSuiteId: ${id}`);
  }
  return suite;
}
