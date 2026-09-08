import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AddFolderCommandParams,
  MoveFolderCommandParams,
  ReadFoldersResult,
  RemoveFolderCommandParams,
  UpdateFolderCommandParams,
  GlobalLibrary,
} from "@lfspm/core";
import type { FolderManagementCapabilities } from "./folder-management.type";
import { folderError } from "./folder-error";
import { vaultAuthorizationWasLost } from "@/ui/lib/vault-authorization";

type FolderMutationResult = { readonly syncUpload: "complete" | "pending" };

export function useFolderManagement(
  vaultId: string,
  capabilities: FolderManagementCapabilities,
  onAuthorizationLost?: () => void,
) {
  const [data, setData] = useState<ReadFoldersResult>();
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [readError, setReadError] = useState<string>();
  const [mutationError, setMutationError] = useState<string>();
  const [feedback, setFeedback] = useState<string>();
  const [library, setLibrary] = useState<GlobalLibrary>();
  const readEpoch = useRef(0);
  const lifecycleEpoch = useRef(0);
  const busy = useRef(false);
  useEffect(() => {
    let active = true;
    void capabilities.readOrganizationLibrary().then(
      (result) => {
        if (active) setLibrary(result);
      },
      () => {
        if (active) setLibrary(undefined);
      },
    );
    return () => {
      active = false;
    };
  }, [capabilities]);

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
      setReadError(folderError(cause));
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

  async function mutate(task: () => Promise<FolderMutationResult>) {
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
          : "Folder changes saved.",
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
        setReadError(folderError(cause));
      } else {
        setMutationError(folderError(cause));
      }
      return false;
    } finally {
      if (owner === lifecycleEpoch.current) {
        busy.current = false;
        setPending(false);
      }
    }
  }

  return {
    library,
    folders: data?.folders ?? [],
    uncategorized: data?.uncategorized,
    hasData: data !== undefined,
    loading,
    pending,
    readError,
    mutationError,
    feedback,
    clearMutationError: () => setMutationError(undefined),
    refresh,
    add: (params: AddFolderCommandParams) =>
      mutate(() => capabilities.add(params)),
    update: (params: UpdateFolderCommandParams) =>
      mutate(() => capabilities.update(params)),
    move: (params: MoveFolderCommandParams) =>
      mutate(() => capabilities.move(params)),
    remove: (params: RemoveFolderCommandParams) =>
      mutate(() => capabilities.remove(params)),
  };
}
