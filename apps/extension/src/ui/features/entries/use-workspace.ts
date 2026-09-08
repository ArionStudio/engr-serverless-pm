import { vaultAuthorizationWasLost } from "@/ui/lib/vault-authorization";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AddEntryResult,
  CapturedLogin,
  ReadEntryResult,
  VersionVector,
  VisibleVaultFields,
  SyncUploadStatus,
  AddTagCommandParams,
  AddFolderCommandParams,
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
      captured?: Pick<CapturedLogin, "id" | "tabId">;
      version?: VersionVector;
      key: number;
    };
export function useWorkspace(
  vaultId: string,
  capabilities: WorkspaceCapabilities,
  initialDraft?: EntryDraft,
  onInvalidate?: () => void,
  onSessionLost?: () => void,
) {
  const [startingDraft] = useState(initialDraft);
  const needsActiveUrl =
    !!startingDraft && !startingDraft.url && !!capabilities.readActivePageUrl;
  const [data, setData] = useState<VisibleVaultFields>();
  const [view, setView] = useState<View>(() =>
    startingDraft && !needsActiveUrl
      ? { kind: "editor", initial: startingDraft, key: 0 }
      : { kind: "list" },
  );
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
  const readActiveUrl = useCallback(async () => {
    try {
      return (await capabilities.readActivePageUrl?.()) ?? "";
    } catch {
      // Browser-tab access is independent of vault authorization.
      return "";
    }
  }, [capabilities]);
  const refresh = useCallback(async () => {
    const owner = epoch.current;
    const request = ++inspection.current;
    setLoading(true);
    function applyRead(result: VisibleVaultFields) {
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
    }
    try {
      const result = await read(() => capabilities.read(vaultId));
      if (owner !== epoch.current || request !== inspection.current) return;
      applyRead(result);
    } catch (cause) {
      if (owner !== epoch.current || request !== inspection.current) return;
      const lost = await vaultAuthorizationWasLost(cause, async () => {
        const result = await read(() => capabilities.read(vaultId));
        if (owner === epoch.current && request === inspection.current)
          applyRead(result);
      });
      if (owner !== epoch.current || request !== inspection.current || !lost)
        return;
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
    const owner = ++epoch.current;
    void refresh();
    if (needsActiveUrl && startingDraft) {
      busy.current = true;
      setOperation("action");
      void readActiveUrl().then((url) => {
        if (owner !== epoch.current) return;
        setView({
          kind: "editor",
          initial: { ...startingDraft, url },
          key: ++editorKey.current,
        });
        busy.current = false;
        setOperation(undefined);
      });
    }
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
  }, [
    capabilities,
    refresh,
    reset,
    hide,
    readActiveUrl,
    needsActiveUrl,
    startingDraft,
  ]);
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
      const sessionLost = await vaultAuthorizationWasLost(cause, () =>
        read(() => capabilities.read(vaultId)),
      );
      if (owner !== epoch.current) return;
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
  async function lock(action: () => void | Promise<void>): Promise<void> {
    if (locking.current) return;
    locking.current = true;
    reset();
    await run(async (owner) => {
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
  function edit(entryId?: string, captured?: CapturedLogin) {
    hide();
    const secretOwner = secretReadEpoch.current;
    void run(async (owner) => {
      const result = entryId
        ? await read(() => capabilities.edit(vaultId, entryId))
        : undefined;
      const activeUrl = !entryId && !captured?.url ? await readActiveUrl() : "";
      if (owner !== epoch.current) return;
      if (secretOwner !== secretReadEpoch.current) return;
      const entry = result?.entry;
      setView({
        kind: "editor",
        key: ++editorKey.current,
        entryId,
        captured: captured
          ? { id: captured.id, tabId: captured.tabId }
          : undefined,
        version: entry ? { ...entry.versionVector } : undefined,
        initial: entry
          ? {
              login: entry.login,
              url: entry.sanitizedUrl,
              password: captured?.password || entry.password,
              withoutPassword: !(captured?.password || entry.password),
              tagIds: [...entry.tags],
              folderId: entry.folderId,
              allowWeakPassword: false,
            }
          : {
              ...emptyEntryDraft,
              url: activeUrl,
              ...(captured
                ? {
                    login: captured.login,
                    password: captured.password,
                    url: captured.url,
                  }
                : {}),
              withoutPassword: captured?.password === "",
              tagIds: [],
            },
      });
    });
  }
  async function committed(
    owner: number,
    result: AddEntryResult,
    captured?: Pick<CapturedLogin, "id" | "tabId">,
  ) {
    if (owner !== epoch.current) return;
    hide();
    setView({ kind: "list" });
    reportSave(result);
    if (captured) {
      try {
        await capabilities.dismissCapturedLogin(
          vaultId,
          captured.tabId,
          captured.id,
        );
      } catch (cause) {
        if (owner !== epoch.current) return;
        const lost = await vaultAuthorizationWasLost(cause, () =>
          read(() => capabilities.read(vaultId)),
        );
        if (owner !== epoch.current) return;
        if (lost) {
          reset(true);
          onSessionLost?.();
          return;
        }
        setError({
          message:
            "Your entry was saved, but its detected login could not be cleared. Dismiss it in Detected before reviewing another login.",
          recoverOnRead: false,
        });
      }
    }
    if (owner === epoch.current) await refresh();
  }
  function reportSave(
    receipt: {
      readonly syncUpload: SyncUploadStatus;
      readonly syncConfigured: boolean;
    },
    item?: "Tag" | "Folder",
  ) {
    const saved = item ? `${item} saved` : "Saved";
    setUploadPending(receipt.syncUpload === "pending");
    setFeedback(
      receipt.syncUpload === "pending"
        ? `${saved} on this device. Upload has not been confirmed. Review Sync before making another change.`
        : receipt.syncConfigured
          ? `${saved} and uploaded.`
          : `${saved} on this device.`,
    );
  }
  async function createOrganizationItem<
    T extends {
      readonly syncUpload: SyncUploadStatus;
      readonly syncConfigured: boolean;
    },
  >(item: "Tag" | "Folder", create: () => Promise<T>): Promise<T> {
    const owner = epoch.current;
    let result: T;
    try {
      result = await create();
    } catch (cause) {
      if (owner === epoch.current) {
        const sessionLost = await vaultAuthorizationWasLost(cause, () =>
          read(() => capabilities.read(vaultId)),
        );
        if (owner === epoch.current && sessionLost) {
          reset();
          onSessionLost?.();
        }
      }
      throw cause;
    }
    if (owner !== epoch.current) throw new Error("The vault session changed.");
    reportSave(result, item);
    await refresh();
    return result;
  }
  function save(draft: EntryDraft) {
    if (view.kind !== "editor") return;
    const editor = view;
    void run(async (owner) => {
      const params = {
        vaultId,
        allowWeakPassword: draft.allowWeakPassword,
        ...(draft.withoutPassword === true ? { withoutPassword: true } : {}),
        entry: {
          login: draft.login,
          url: draft.url,
          password: draft.password,
          tags: [...draft.tagIds],
          folderId: draft.folderId,
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
      await committed(owner, result, editor.captured);
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
            hasPassword: entry.password.length > 0,
            login: entry.login,
            sanitizedUrl: entry.sanitizedUrl,
            tags: [...entry.tags],
            folderId: entry.folderId,
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
    createTag: (tag: AddTagCommandParams["tag"]) =>
      createOrganizationItem("Tag", () =>
        capabilities.createTag({ vaultId, tag }),
      ),
    createFolder: (folder: AddFolderCommandParams["folder"]) =>
      createOrganizationItem("Folder", () =>
        capabilities.createFolder({ vaultId, folder }),
      ),
  };
}
