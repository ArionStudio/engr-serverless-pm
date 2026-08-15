import type { ClipboardOperationCoordinatorPort } from "@lfspm/core";

export const CLIPBOARD_OPERATION_LOCK_NAME = "lfspm:clipboard-operation";

export type WebLockManager = {
  request: <T>(
    name: string,
    callback: (lock: Lock | null) => Promise<T>,
  ) => Promise<T>;
};

/**
 * Uses one origin-scoped Web Lock so independent extension contexts coordinate
 * the same clipboard ownership transition.
 */
export class WebLocksClipboardOperationCoordinator implements ClipboardOperationCoordinatorPort {
  private readonly lockManager: WebLockManager;

  constructor(lockManager: WebLockManager = navigator.locks) {
    this.lockManager = lockManager;
  }

  async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    return this.lockManager.request(CLIPBOARD_OPERATION_LOCK_NAME, operation);
  }
}
