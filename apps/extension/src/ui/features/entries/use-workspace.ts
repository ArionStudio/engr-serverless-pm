import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AddEntryResult,
  ReadEntryResult,
  VersionVector,
  VisibleVaultFields,
} from "@lfspm/core";
import type { WorkspaceCapabilities } from "./workspace.type";
import type { EntryDraft } from "./entry-form.view";
import type { OperationState } from "@/ui/components/forms/form-state.type";
import { emptyEntryDraft } from "./entry-draft";
import { workspaceError } from "./workspace-error";

type View =
  | { kind: "list" }
  | { kind: "details"; record: ReadEntryResult }
  | { kind: "delete"; record: ReadEntryResult }
  | {
      kind: "editor";
      initial: EntryDraft;
      entryId?: string;
      version?: VersionVector;
      key: number;
    };
export function useWorkspace(
  vaultId: string,
  capabilities: WorkspaceCapabilities,
  onInvalidate?: () => void,
  onSessionLost?: () => void,
) {
  const [data, setData] = useState<VisibleVaultFields>();
  const [view, setView] = useState<View>({ kind: "list" });
  const [loading, setLoading] = useState(true);
  const [operation, setOperation] = useState<"action" | "reveal">();
  const pending = operation !== undefined;
  const [error, setError] = useState<{
    message: string;
    recoverOnRead: boolean;
  }>();
  const [stale, setStale] = useState(false);
  const [password, setPassword] = useState<string>();
  const [copyState, setCopyState] = useState<OperationState>("idle");
  const [feedback, setFeedback] = useState<string>();
  const [uploadPending, setUploadPending] = useState(false);
  const epoch = useRef(0);
  const inspection = useRef(0);
  const busy = useRef(false);
  const locking = useRef(false);
  const editorKey = useRef(0);
  // Invalidate pending secret reads on blur without discarding an already-open draft.
  const secretReadEpoch = useRef(0);
  const hide = useCallback(() => {
    ++secretReadEpoch.current;
    setPassword(undefined);
    setCopyState("idle");
  }, []);
  const reset = useCallback(
    (preserveOutcome = false) => {
      ++epoch.current;
      busy.current = false;
      setOperation(undefined);
      hide();
      setView({ kind: "list" });
      setData(undefined);
      if (!preserveOutcome) {
        setFeedback(undefined);
        setUploadPending(false);
      }
      setStale(false);
      setError(undefined);
      onInvalidate?.();
    },
    [hide, onInvalidate],
  );
  const read = useCallback(async <T>(task: () => Promise<T>): Promise<T> => {
    const owner = epoch.current;
    try {
      return await task();
    } catch (cause) {
      // A context may first evict outdated cached material before restoring the
      // authoritative session. Retry only reads, never mutations or clipboard writes.
      if (
        !(cause instanceof Error) ||
        cause.name !== "VaultMustBeUnlockedError" ||
        owner !== epoch.current
      )
        throw cause;
      return task();
    }
  }, []);
  const refresh = useCallback(async () => {
    const owner = epoch.current;
    const request = ++inspection.current;
    setLoading(true);
    try {
      const result = await read(() => capabilities.read(vaultId));
      if (owner !== epoch.current || request !== inspection.current) return;
      setData(result);
      setError((current) => (current?.recoverOnRead ? undefined : current));
      setView((current) => {
        if (current.kind !== "details") return current;
        const entry = result.entries.find(
          (item) => item.id === current.record.entry.id,
        );
        return entry
          ? { ...current, record: { ...current.record, entry } }
          : { kind: "list" };
      });
    } catch (cause) {
      if (owner !== epoch.current || request !== inspection.current) return;
      reset(true);
      onSessionLost?.();
      setError({
        message: `Could not reload entries. ${workspaceError(cause)}`,
        recoverOnRead: true,
      });
    } finally {
      if (request === inspection.current) setLoading(false);
    }
  }, [capabilities, vaultId, reset, read, onSessionLost]);
  useEffect(() => {
    ++epoch.current;
    void refresh();
    const unsubscribe = capabilities.subscribe((reason) => {
      hide();
      if (reason === "session") reset();
      void refresh();
    });
    const onPageHide = () => reset();
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void refresh();
    };
    const onBlur = () => hide();
    const onVisibility = () => {
      if (document.hidden) hide();
    };
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    const lifecycle = epoch;
    const requests = inspection;
    const reveals = secretReadEpoch;
    return () => {
      unsubscribe();
      ++lifecycle.current;
      ++requests.current;
      ++reveals.current;
      busy.current = false;
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [capabilities, refresh, reset, hide]);
  async function run(
    task: (owner: number) => Promise<void>,
    kind: "action" | "reveal" = "action",
  ) {
    if (busy.current) return;
    busy.current = true;
    const owner = epoch.current;
    setOperation(kind);
    setError(undefined);
    setStale(false);
    try {
      await task(owner);
    } catch (cause) {
      if (owner !== epoch.current) return;
      ++secretReadEpoch.current;
      setPassword(undefined);
      let sessionLost =
        cause instanceof Error &&
        [
          "VaultMustBeUnlockedError",
          "UnlockedVaultSessionExpiredError",
          "UnlockedVaultSessionInvalidError",
        ].includes(cause.name);
      if (!sessionLost) {
        // Dependency errors can revoke access without a storage notification.
        // Keep a draft only when an authoritative read still permits access.
        try {
          await read(() => capabilities.read(vaultId));
        } catch {
          sessionLost = true;
        }
        if (owner !== epoch.current) return;
      }
      if (sessionLost) {
        reset();
        onSessionLost?.();
      }
      setError({
        message: workspaceError(
          cause,
          view.kind === "delete" ? "delete" : "save",
        ),
        recoverOnRead: sessionLost || view.kind === "list",
      });
      setStale(
        cause instanceof Error && cause.name === "PasswordEntryChangedError",
      );
    } finally {
      if (owner === epoch.current) {
        busy.current = false;
        setOperation(undefined);
      }
    }
  }
  function lock(action: () => void | Promise<void>) {
    if (locking.current) return;
    locking.current = true;
    reset();
    void run(async (owner) => {
      try {
        await action();
      } finally {
        locking.current = false;
      }
      if (owner === epoch.current) await refresh();
    });
  }
  function back() {
    if (busy.current) return;
    hide();
    setView({ kind: "list" });
    setError(undefined);
    setStale(false);
    void refresh();
  }
  function open(entryId: string, kind: "details" | "delete" = "details") {
    hide();
    void run(async (owner) => {
      const record =
        kind === "delete" &&
        view.kind === "details" &&
        view.record.entry.id === entryId
          ? view.record
          : await read(() => capabilities.details(vaultId, entryId));
      if (owner === epoch.current) setView({ kind, record });
    });
  }
  function edit(entryId?: string) {
    hide();
    const secretOwner = secretReadEpoch.current;
    void run(async (owner) => {
      const result = entryId
        ? await read(() => capabilities.edit(vaultId, entryId))
        : undefined;
      if (owner !== epoch.current) return;
      if (secretOwner !== secretReadEpoch.current) return;
      const entry = result?.entry;
      setView({
        kind: "editor",
        key: ++editorKey.current,
        entryId,
        version: entry ? { ...entry.versionVector } : undefined,
        initial: entry
          ? {
              login: entry.login,
              url: entry.sanitizedUrl,
              password: entry.password,
              tagIds: [...entry.tags],
              allowWeakPassword: false,
            }
          : { ...emptyEntryDraft, tagIds: [] },
      });
    });
  }
  async function committed(owner: number, result: AddEntryResult) {
    if (owner !== epoch.current) return;
    hide();
    setView({ kind: "list" });
    setUploadPending(result.syncUpload === "pending");
    setFeedback(
      result.syncUpload === "pending"
        ? "Saved on this device. Upload has not been confirmed. Review Sync before making another change."
        : result.syncConfigured
          ? "Saved and uploaded."
          : "Saved on this device.",
    );
    await refresh();
  }
  function save(draft: EntryDraft) {
    if (view.kind !== "editor") return;
    const editor = view;
    void run(async (owner) => {
      const params = {
        vaultId,
        allowWeakPassword: draft.allowWeakPassword,
        entry: {
          login: draft.login,
          url: draft.url,
          password: draft.password,
          tags: [...draft.tagIds],
        },
      };
      const result =
        editor.entryId && editor.version
          ? await capabilities.update({
              ...params,
              entryId: editor.entryId,
              expectedEntryVersionVector: editor.version,
            })
          : await capabilities.add(params);
      await committed(owner, result);
    });
  }
  function remove() {
    if (view.kind !== "delete") return;
    const { record } = view;
    void run(async (owner) => {
      const result = await capabilities.remove({
        vaultId,
        entryId: record.entry.id,
        expectedEntryVersionVector: record.entryVersionVector,
      });
      await committed(owner, result);
    });
  }
  function reveal() {
    if (view.kind !== "details") return;
    const id = view.record.entry.id;
    const revealOwner = ++secretReadEpoch.current;
    void run(async (owner) => {
      const { entry } = await read(() => capabilities.edit(vaultId, id));
      if (owner !== epoch.current || revealOwner !== secretReadEpoch.current)
        return;
      setView({
        kind: "details",
        record: {
          entry: {
            id: entry.id,
            login: entry.login,
            sanitizedUrl: entry.sanitizedUrl,
            tags: [...entry.tags],
          },
          entryVersionVector: { ...entry.versionVector },
        },
      });
      setPassword(entry.password);
    }, "reveal");
  }
  function copy() {
    if (view.kind !== "details") return;
    const id = view.record.entry.id;
    void run(async (owner) => {
      setCopyState("pending");
      try {
        await capabilities.copy(vaultId, id);
        if (owner === epoch.current) setCopyState("success");
      } catch (cause) {
        if (owner === epoch.current) setCopyState("error");
        throw cause;
      }
    });
  }
  return {
    lock,
    data,
    view,
    loading,
    pending,
    revealing: operation === "reveal",
    error: error?.message,
    stale,
    password,
    copyState,
    feedback,
    uploadPending,
    refresh,
    back,
    open,
    edit,
    save,
    remove,
    reveal,
    hide,
    copy,
  };
}
