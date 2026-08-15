/**
 * Serializes clipboard ownership transitions across every runtime context that
 * shares the clipboard clear task repository.
 */
export interface ClipboardOperationCoordinatorPort {
  runExclusive: <T>(operation: () => Promise<T>) => Promise<T>;
}
