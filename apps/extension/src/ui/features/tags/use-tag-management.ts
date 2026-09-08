import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AddTagCommandParams,
  RemoveTagCommandParams,
  UpdateTagCommandParams,
} from "@lfspm/core";
import type { TagManagementCapabilities } from "./tag-management.type";
import type { TagManagementReadResult } from "./tag-management.type";
import { tagError } from "./tag-error";
import { vaultAuthorizationWasLost } from "@/ui/lib/vault-authorization";

type TagMutationResult = { readonly syncUpload: "complete" | "pending" };

export function useTagManagement(
  vaultId: string,
  capabilities: TagManagementCapabilities,
  onAuthorizationLost?: () => void,
) {
  const [data, setData] = useState<TagManagementReadResult>();
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [readError, setReadError] = useState<string>();
  const [mutationError, setMutationError] = useState<string>();
  const [feedback, setFeedback] = useState<string>();
  const readEpoch = useRef(0);
  const lifecycleEpoch = useRef(0);
  const busy = useRef(false);

  const invalidate = useCallback(() => {
    ++lifecycleEpoch.current;
    ++readEpoch.current;
    busy.current = false;
  }, []);

  const loseAuthorization = useCallback(() => {
    invalidate();
    setData(undefined);
    setLoading(false);
    setPending(false);
    setFeedback(undefined);
    setMutationError(undefined);
    onAuthorizationLost?.();
  }, [invalidate, onAuthorizationLost]);

  const refresh = useCallback(async () => {
    const owner = ++readEpoch.current;
    const lifecycleOwner = lifecycleEpoch.current;
    setLoading(true);
    setReadError(undefined);
    try {
      const result = await capabilities.read(vaultId);
      if (owner === readEpoch.current) setData(result);
    } catch (cause) {
      if (
        owner !== readEpoch.current ||
        lifecycleOwner !== lifecycleEpoch.current
      )
        return;
      const lost = await vaultAuthorizationWasLost(cause, async () => {
        const result = await capabilities.read(vaultId);
        if (
          owner === readEpoch.current &&
          lifecycleOwner === lifecycleEpoch.current
        )
          setData(result);
      });
      if (
        owner !== readEpoch.current ||
        lifecycleOwner !== lifecycleEpoch.current ||
        !lost
      )
        return;
      loseAuthorization();
      setReadError(tagError(cause));
    } finally {
      if (owner === readEpoch.current) setLoading(false);
    }
  }, [capabilities, vaultId, loseAuthorization]);

  useEffect(() => {
    ++lifecycleEpoch.current;
    busy.current = false;
    setPending(false);
    void refresh();
    const unsubscribe = capabilities.subscribe(() => void refresh());
    return () => {
      invalidate();
      unsubscribe();
    };
  }, [capabilities, invalidate, refresh]);

  async function mutate(task: () => Promise<TagMutationResult>) {
    if (busy.current) return false;
    busy.current = true;
    const owner = lifecycleEpoch.current;
    setPending(true);
    setMutationError(undefined);
    setFeedback(undefined);
    try {
      const result = await task();
      if (owner !== lifecycleEpoch.current) return false;
      setFeedback(
        result.syncUpload === "pending"
          ? "Saved on this device. Review Sync before making another change."
          : "Tag changes saved.",
      );
      await refresh();
      return owner === lifecycleEpoch.current;
    } catch (cause) {
      if (owner !== lifecycleEpoch.current) return false;
      const lost = await vaultAuthorizationWasLost(cause, () =>
        capabilities.read(vaultId),
      );
      if (owner !== lifecycleEpoch.current) return false;
      if (lost) {
        loseAuthorization();
        setReadError(tagError(cause));
      } else {
        setMutationError(tagError(cause));
      }
      return false;
    } finally {
      busy.current = false;
      if (owner === lifecycleEpoch.current) setPending(false);
    }
  }

  return {
    tags: data?.tags ?? [],
    tagGroups: data?.tagGroups,
    hasData: data !== undefined,
    softLimit: data?.softLimit,
    softLimitReached: data?.softLimitReached ?? false,
    loading,
    pending,
    readError,
    mutationError,
    clearMutationError: () => setMutationError(undefined),
    feedback,
    refresh,
    add: (params: AddTagCommandParams) =>
      mutate(() => capabilities.add(params)),
    update: (params: UpdateTagCommandParams) =>
      mutate(() => capabilities.update(params)),
    remove: (params: RemoveTagCommandParams) =>
      mutate(() => capabilities.remove(params)),
  };
}
