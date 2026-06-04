export type ClipboardClearTask = {
  actionId: string;
  copiedValueHash: string;
  expiresAt: number;
};

/**
 * Stores short-lived clipboard clear metadata.
 *
 * The task must not be persisted long term and must not contain the copied
 * plaintext password value.
 */
export interface ClipboardClearTaskRepositoryPort {
  save: (task: ClipboardClearTask) => Promise<void>;
  get: () => Promise<ClipboardClearTask | null>;
  remove: () => Promise<void>;
}
