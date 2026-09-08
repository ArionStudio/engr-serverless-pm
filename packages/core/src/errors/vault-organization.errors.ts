export class InvalidVaultFolderError extends Error {
  constructor(cause: unknown) {
    super("Vault folder is invalid.", { cause });
    this.name = "InvalidVaultFolderError";
  }
}

export class DuplicateVaultFolderError extends Error {
  readonly folderId: string;

  constructor(folderId: string) {
    super(`Folder "${folderId}" already exists.`);
    this.name = "DuplicateVaultFolderError";
    this.folderId = folderId;
  }
}

export class DuplicateVaultFolderNameError extends Error {
  constructor() {
    super("A folder with this name already exists in this location.");
    this.name = "DuplicateVaultFolderNameError";
  }
}

export class VaultFolderNotFoundError extends Error {
  readonly folderId: string;

  constructor(folderId: string) {
    super(`Folder "${folderId}" was not found.`);
    this.name = "VaultFolderNotFoundError";
    this.folderId = folderId;
  }
}

export class VaultFolderCycleError extends Error {
  constructor() {
    super("A folder cannot contain itself.");
    this.name = "VaultFolderCycleError";
  }
}

export class VaultFolderNotEmptyError extends Error {
  readonly folderId: string;
  readonly entryCount: number;
  readonly childCount: number;

  constructor(folderId: string, entryCount: number, childCount: number) {
    super(`Folder "${folderId}" is not empty.`);
    this.name = "VaultFolderNotEmptyError";
    this.folderId = folderId;
    this.entryCount = entryCount;
    this.childCount = childCount;
  }
}

export class InvalidExpectedFolderVersionError extends Error {
  override readonly name = "InvalidExpectedFolderVersionError";

  constructor() {
    super("The expected folder version is invalid.");
  }
}

export class VaultFolderChangedError extends Error {
  override readonly name = "VaultFolderChangedError";

  constructor() {
    super("The folder changed after it was read.");
  }
}

export class InvalidVaultOrganizationReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidVaultOrganizationReferenceError";
  }
}

export class VaultTagGroupNotFoundError extends Error {
  readonly groupId: string;

  constructor(groupId: string) {
    super(`Tag group "${groupId}" was not found.`);
    this.name = "VaultTagGroupNotFoundError";
    this.groupId = groupId;
  }
}
