import type { DeviceEnrollmentResponse } from "../../domain/device-trust";
import type { SyncTarget } from "../../domain/sync";
import type { RawMasterPassword } from "../../domain/master-password";
import {
  SyncNotConfiguredError,
  SyncRemovalPendingError,
} from "../../errors/sync.errors";
import { bestEffortWipeArrayBuffers } from "../../lib/secure-wipe.utils";
import type { DeviceEnrollmentApprovalService } from "../../services/trust/device-enrollment-approval.service";

export type ReadDeviceEnrollmentApprovalParams = {
  readonly enrollmentResponse: DeviceEnrollmentResponse;
  readonly masterPassword: RawMasterPassword;
};

export type ReadDeviceEnrollmentApprovalResult = {
  readonly vaultId: string;
  readonly requestId: string;
  readonly target: SyncTarget;
};

export class ReadDeviceEnrollmentApprovalUseCase {
  private readonly approval: DeviceEnrollmentApprovalService;
  constructor(approval: DeviceEnrollmentApprovalService) {
    this.approval = approval;
  }

  async execute(
    params: ReadDeviceEnrollmentApprovalParams,
  ): Promise<ReadDeviceEnrollmentApprovalResult> {
    const opened = await this.approval.open(
      params.enrollmentResponse,
      params.masterPassword,
    );
    try {
      const { authorizedVault: vault } = opened;
      if (vault.syncRemovalPending !== undefined)
        throw new SyncRemovalPendingError(
          params.enrollmentResponse.vaultId,
          "read device approval",
        );
      if (vault.syncTarget === undefined)
        throw new SyncNotConfiguredError(
          params.enrollmentResponse.vaultId,
          "read device approval",
        );
      return {
        vaultId: params.enrollmentResponse.vaultId,
        requestId: params.enrollmentResponse.requestId,
        target: vault.syncTarget,
      };
    } finally {
      bestEffortWipeArrayBuffers(opened.secrets);
    }
  }
}
