import { useEffect, useState } from "react";
import type { VaultAvailability } from "./first-launch.type";

export function useVaultAvailability(readVaultCount: () => Promise<number>) {
  const [availability, setAvailability] =
    useState<VaultAvailability>("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    readVaultCount().then(
      (count) => {
        if (current) setAvailability(count === 0 ? "empty" : "existing");
      },
      () => {
        if (current) setAvailability("error");
      },
    );
    return () => {
      current = false;
    };
  }, [readVaultCount, attempt]);
  return {
    availability,
    retry: () => {
      setAvailability("loading");
      setAttempt((value) => value + 1);
    },
  };
}
