import { ZxcvbnFactory, type Score } from "@zxcvbn-ts/core";
import {
  adjacencyGraphs,
  dictionary as commonDictionary,
} from "@zxcvbn-ts/language-common";
import { dictionary as englishDictionary } from "@zxcvbn-ts/language-en";

const MASTER_PASSWORD_MINIMUM_STRENGTH_SCORE: Score = 4;

const masterPasswordStrengthEstimator = new ZxcvbnFactory({
  dictionary: {
    ...commonDictionary,
    ...englishDictionary,
  },
  graphs: adjacencyGraphs,
});

export function meetsMasterPasswordStrengthRequirement(
  masterPassword: string,
): boolean {
  return (
    masterPasswordStrengthEstimator.check(masterPassword).score >=
    MASTER_PASSWORD_MINIMUM_STRENGTH_SCORE
  );
}
