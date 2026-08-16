import type {
  ClipboardOperationCoordinatorPort,
  ClipboardOperationLease,
} from "@lfspm/core";

export const CLIPBOARD_OPERATION_LOCK_NAME = "lfspm:clipboard-operation";

export type WebLockManager = {
  request: <T>(
    name: string,
    callback: (lock: Lock | null) => Promise<T>,
  ) => Promise<T>;
};

/**
 * Uses one origin-scoped Web Lock so independent extension contexts coordinate
 * clipboard ownership with vault-session activation and cleanup transitions.
 */
export class WebLocksClipboardOperationCoordinator implements ClipboardOperationCoordinatorPort {
  private readonly lockManager: WebLockManager;
  private readonly activeLeases = new WeakSet<ClipboardOperationLease>();

  constructor(lockManager: WebLockManager = navigator.locks) {
    this.lockManager = lockManager;
  }

  isLeaseActive(lease: ClipboardOperationLease): boolean {
    return this.activeLeases.has(lease);
  }

  async runExclusive<T>(
    operation: (lease: ClipboardOperationLease) => Promise<T>,
  ): Promise<T> {
    return this.lockManager.request(CLIPBOARD_OPERATION_LOCK_NAME, async () => {
      const lease = Object.freeze({}) as ClipboardOperationLease;
      this.activeLeases.add(lease);

      try {
        return await operation(lease);
      } finally {
        this.activeLeases.delete(lease);
      }
    });
  }
}
