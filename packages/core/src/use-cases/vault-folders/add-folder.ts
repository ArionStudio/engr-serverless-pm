import { folderSchema } from "../../domain/organization/folder.schema";
import type { FolderId } from "../../domain/organization/folder.type";
import { addFolderToVault } from "../../domain/vault/vault-folder.mutations";
import {
  requireFolderParent,
  requireUniqueSiblingFolderName,
} from "../../domain/vault/vault-folder.policy";
import { InvalidVaultFolderError } from "../../errors/vault-organization.errors";
import type { ClockPort } from "../../ports/system/clock.port";
import type { IdPort } from "../../ports/system/id.port";
import type { VaultMutationService } from "../../services/vault/vault-mutation.service";
import type { VaultMutationResult } from "../../services/vault/vault-mutation.type";

export type AddFolderCommandParams = {
  readonly vaultId: string;
  readonly folder: {
    readonly name: string;
    readonly icon: string;
    readonly description?: string;
    readonly parentId: FolderId | null;
  };
};
export type AddFolderResult = VaultMutationResult & {
  readonly folderId: FolderId;
};

export class AddFolderUseCase {
  private readonly ids: IdPort;
  private readonly clock: ClockPort;
  private readonly mutation: VaultMutationService;

  constructor(ids: IdPort, clock: ClockPort, mutation: VaultMutationService) {
    this.ids = ids;
    this.clock = clock;
    this.mutation = mutation;
  }

  async execute(params: AddFolderCommandParams): Promise<AddFolderResult> {
    const input = folderSchema
      .omit({ id: true, createdAt: true })
      .safeParse(params.folder);
    if (!input.success) throw new InvalidVaultFolderError(input.error);
    let folderId: FolderId | undefined;
    const result = await this.mutation.persist(
      params.vaultId,
      "add folder",
      async (vault, deviceId) => {
        requireFolderParent(vault, input.data.parentId);
        requireUniqueSiblingFolderName(
          vault,
          input.data.name,
          input.data.parentId,
        );
        folderId = await this.ids.generateId();
        const parsed = folderSchema.safeParse({
          id: folderId,
          ...input.data,
          createdAt: this.clock.now(),
        });
        if (!parsed.success) throw new InvalidVaultFolderError(parsed.error);
        return addFolderToVault(vault, parsed.data, deviceId);
      },
    );
    if (folderId === undefined) throw new Error("Folder ID was not generated.");
    return { folderId, ...result };
  }
}
