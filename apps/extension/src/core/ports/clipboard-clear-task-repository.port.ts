export type ClipboardClearTask = {
  actionId: string;
  copiedValueHash: string;
  expiresAt: number;
};

/**
 * Stores short-lived clipboard clear metadata.
 *
 * Implementations must use storage appropriate for sensitive unlocked-session
 * runtime state, for example MV3 `storage.session` with trusted-context access.
 * The task must not be persisted long term and must not contain the copied
 * plaintext password value.
 */
export interface ClipboardClearTaskRepositoryPort {
  save: (task: ClipboardClearTask) => Promise<void>;
  get: () => Promise<ClipboardClearTask | null>;
  remove: () => Promise<void>;
}
