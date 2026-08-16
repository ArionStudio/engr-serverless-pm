declare const clipboardOperationLeaseBrand: unique symbol;

export type ClipboardOperationLease = {
  readonly [clipboardOperationLeaseBrand]: true;
};

/**
 * Serializes clipboard ownership and vault-session activation/cleanup
 * transitions across runtime contexts that share lifecycle state.
 */
export interface ClipboardOperationCoordinatorPort {
  /** Rejects escaped or foreign leases after the owning callback ends. */
  isLeaseActive: (lease: ClipboardOperationLease) => boolean;
  runExclusive: <T>(
    operation: (lease: ClipboardOperationLease) => Promise<T>,
  ) => Promise<T>;
}
