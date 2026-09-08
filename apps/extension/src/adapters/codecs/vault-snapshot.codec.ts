import {
  CURRENT_ALGORITHM_SUITE,
  type DeletedDeviceProfile,
  type DeletedPasswordEntry,
  type DeletedTag,
  type DeletedFolder,
  type DeviceKeySlot,
  type DevicePublicSignKey,
  type DeviceVaultPublicKey,
  type JsonValue,
  type LocalVaultTrustAnchor,
  type PasswordEntry,
  type Folder,
  type RandomBytes,
  type Tag,
  type TagGroup,
  type Vault,
  type VaultSnapshot,
  type VaultSnapshotDescriptor,
  type VaultSnapshotIdentity,
  type VaultTrustCertificate,
} from "@lfspm/core";
import {
  folderSchema,
  passwordEntryInputSchema,
  tagGroupSchema,
  tagSchema,
  UNCATEGORIZED_FOLDER_ID,
} from "@lfspm/core";
import {
  StaticArtifactError,
  canonicalDigest,
  decodeCanonicalBytes,
  decodeEncrypted,
  decodeJsonValue,
  decodeSignature,
  decodeVersionVector,
  encodeBytes,
  encodeEncrypted,
  encodeSignature,
  encodeVersionVector,
  exactRecord,
  nonBlankString,
  safeInteger,
  stringArray,
} from "./artifact-codec.primitives";

type SnapshotOrigin = "local" | "remote";

export class InvalidLocalVaultSnapshotRecordError extends StaticArtifactError {
  constructor() {
    super(
      "InvalidLocalVaultSnapshotRecordError",
      "Local vault snapshot record is malformed.",
    );
  }
}

export class InvalidRemoteVaultSnapshotRecordError extends StaticArtifactError {
  constructor() {
    super(
      "InvalidRemoteVaultSnapshotRecordError",
      "Remote vault snapshot record is malformed.",
    );
  }
}

export class InvalidOpenedVaultMasterKeyError extends StaticArtifactError {
  constructor() {
    super(
      "InvalidOpenedVaultMasterKeyError",
      "Opened vault master key is malformed.",
    );
  }
}

export class InvalidVaultSnapshotPayloadError extends StaticArtifactError {
  constructor() {
    super(
      "InvalidVaultSnapshotPayloadError",
      "Vault snapshot payload is malformed.",
    );
  }
}

function malformedSnapshot(origin: SnapshotOrigin): Error {
  return origin === "local"
    ? new InvalidLocalVaultSnapshotRecordError()
    : new InvalidRemoteVaultSnapshotRecordError();
}

export function decodeTrustAnchor(value: unknown): LocalVaultTrustAnchor {
  const record = exactRecord(value, [
    "version",
    "vaultId",
    "genesisDeviceId",
    "genesisPublicSignKey",
    "genesisCertificateDigest",
  ]);
  if (record.version !== 1) {
    throw new Error("version");
  }
  return {
    version: 1,
    vaultId: nonBlankString(record.vaultId),
    genesisDeviceId: nonBlankString(record.genesisDeviceId),
    genesisPublicSignKey: decodeCanonicalBytes<DevicePublicSignKey>(
      record.genesisPublicSignKey,
      CURRENT_ALGORITHM_SUITE.signing.publicKeyLengthBytes,
    ),
    genesisCertificateDigest: canonicalDigest(record.genesisCertificateDigest),
  };
}

export function encodeTrustAnchor(value: LocalVaultTrustAnchor): unknown {
  return {
    version: value.version,
    vaultId: value.vaultId,
    genesisDeviceId: value.genesisDeviceId,
    genesisPublicSignKey: encodeBytes(value.genesisPublicSignKey),
    genesisCertificateDigest: value.genesisCertificateDigest,
  };
}

function decodeTrustCertificate(value: unknown): VaultTrustCertificate {
  const record = exactRecord(value, ["payload", "signature"]);
  const payload = exactRecord(record.payload, [
    "version",
    "vaultId",
    "generation",
    "vaultKeyGeneration",
    "previousCertificateDigest",
    "authorizedByDeviceId",
    "trustedDevices",
  ]);
  if (payload.version !== 1 || !Array.isArray(payload.trustedDevices)) {
    throw new Error("certificate");
  }
  const trustedDevices = payload.trustedDevices.map((entry) => {
    const device = exactRecord(entry, [
      "deviceId",
      "publicSignKey",
      "publicVaultKey",
    ]);
    return {
      deviceId: nonBlankString(device.deviceId),
      publicSignKey: decodeCanonicalBytes<DevicePublicSignKey>(
        device.publicSignKey,
        CURRENT_ALGORITHM_SUITE.signing.publicKeyLengthBytes,
      ),
      publicVaultKey: decodeCanonicalBytes<DeviceVaultPublicKey>(
        device.publicVaultKey,
        CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.publicKeyLengthBytes,
      ),
    };
  });
  if (
    new Set(trustedDevices.map(({ deviceId }) => deviceId)).size !==
    trustedDevices.length
  ) {
    throw new Error("duplicate");
  }
  const previousCertificateDigest =
    payload.previousCertificateDigest === null
      ? null
      : canonicalDigest(payload.previousCertificateDigest);
  return {
    payload: {
      version: 1,
      vaultId: nonBlankString(payload.vaultId),
      generation: safeInteger(payload.generation),
      vaultKeyGeneration: safeInteger(payload.vaultKeyGeneration, 1),
      previousCertificateDigest,
      authorizedByDeviceId: nonBlankString(payload.authorizedByDeviceId),
      trustedDevices,
    },
    signature: decodeSignature(record.signature),
  };
}

function encodeTrustCertificate(value: VaultTrustCertificate): unknown {
  return {
    payload: {
      ...value.payload,
      trustedDevices: value.payload.trustedDevices.map((device) => ({
        deviceId: device.deviceId,
        publicSignKey: encodeBytes(device.publicSignKey),
        publicVaultKey: encodeBytes(device.publicVaultKey),
      })),
    },
    signature: encodeSignature(value.signature),
  };
}

function decodeDeviceKeySlot(value: unknown): DeviceKeySlot {
  const record = exactRecord(value, [
    "deviceId",
    "vaultKeyGeneration",
    "envelope",
  ]);
  const envelope = exactRecord(record.envelope, [
    "recipientDeviceId",
    "vaultKeyGeneration",
    "ephemeralPublicKey",
    "hkdfSalt",
    "encryptedVaultMasterKey",
  ]);
  const deviceId = nonBlankString(record.deviceId);
  const generation = safeInteger(record.vaultKeyGeneration, 1);
  const recipientDeviceId = nonBlankString(envelope.recipientDeviceId);
  const envelopeGeneration = safeInteger(envelope.vaultKeyGeneration, 1);
  if (deviceId !== recipientDeviceId || generation !== envelopeGeneration) {
    throw new Error("slot identity");
  }
  return {
    deviceId,
    vaultKeyGeneration: generation,
    envelope: {
      recipientDeviceId,
      vaultKeyGeneration: envelopeGeneration,
      ephemeralPublicKey: decodeCanonicalBytes<DeviceVaultPublicKey>(
        envelope.ephemeralPublicKey,
        CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.publicKeyLengthBytes,
      ),
      hkdfSalt: decodeCanonicalBytes<RandomBytes>(envelope.hkdfSalt, 32),
      encryptedVaultMasterKey: decodeEncrypted(
        envelope.encryptedVaultMasterKey,
        12,
        48,
      ),
    },
  };
}

function encodeDeviceKeySlot(value: DeviceKeySlot): unknown {
  return {
    deviceId: value.deviceId,
    vaultKeyGeneration: value.vaultKeyGeneration,
    envelope: {
      recipientDeviceId: value.envelope.recipientDeviceId,
      vaultKeyGeneration: value.envelope.vaultKeyGeneration,
      ephemeralPublicKey: encodeBytes(value.envelope.ephemeralPublicKey),
      hkdfSalt: encodeBytes(value.envelope.hkdfSalt),
      encryptedVaultMasterKey: encodeEncrypted(
        value.envelope.encryptedVaultMasterKey,
      ),
    },
  };
}

export function decodeVaultSnapshot(
  value: unknown,
  origin: SnapshotOrigin = "remote",
): VaultSnapshot {
  try {
    const record = exactRecord(value, [
      "metadata",
      "trustChain",
      "keySlots",
      "content",
      "signature",
    ]);
    const metadata = exactRecord(
      record.metadata,
      [
        "id",
        "schemaVersion",
        "vaultCreationTimestamp",
        "revisionTimestamp",
        "snapshotVersionVector",
        "algorithmSuiteId",
        "createdByDeviceId",
        "vaultKeyGeneration",
      ],
      ["uploadExpectedRemoteSnapshotIdentity"],
    );
    if (metadata.schemaVersion !== 1) {
      throw new Error("version");
    }
    const trustChainRecord = exactRecord(record.trustChain, ["certificates"]);
    if (!Array.isArray(trustChainRecord.certificates)) {
      throw new Error("trust chain");
    }
    const certificates = trustChainRecord.certificates.map(
      decodeTrustCertificate,
    );
    const keySlotsRecord = exactRecord(record.keySlots, ["deviceSlots"]);
    if (!Array.isArray(keySlotsRecord.deviceSlots)) {
      throw new Error("key slots");
    }
    const deviceSlots = keySlotsRecord.deviceSlots.map(decodeDeviceKeySlot);
    if (
      new Set(deviceSlots.map(({ deviceId }) => deviceId)).size !==
      deviceSlots.length
    ) {
      throw new Error("duplicate");
    }
    return {
      metadata: {
        id: nonBlankString(metadata.id),
        schemaVersion: 1,
        vaultCreationTimestamp: safeInteger(metadata.vaultCreationTimestamp),
        revisionTimestamp: safeInteger(metadata.revisionTimestamp),
        snapshotVersionVector: decodeVersionVector(
          metadata.snapshotVersionVector,
        ),
        algorithmSuiteId: nonBlankString(metadata.algorithmSuiteId),
        createdByDeviceId: nonBlankString(metadata.createdByDeviceId),
        vaultKeyGeneration: safeInteger(metadata.vaultKeyGeneration, 1),
        ...(metadata.uploadExpectedRemoteSnapshotIdentity === undefined
          ? {}
          : {
              uploadExpectedRemoteSnapshotIdentity:
                metadata.uploadExpectedRemoteSnapshotIdentity === null
                  ? null
                  : decodeVaultSnapshotIdentity(
                      metadata.uploadExpectedRemoteSnapshotIdentity,
                    ),
            }),
      },
      trustChain: { certificates },
      keySlots: { deviceSlots },
      content: decodeEncrypted(record.content),
      signature: decodeSignature(record.signature),
    };
  } catch {
    throw malformedSnapshot(origin);
  }
}

export function encodeVaultSnapshot(snapshot: VaultSnapshot): unknown {
  return {
    metadata: {
      ...snapshot.metadata,
      snapshotVersionVector: encodeVersionVector(
        snapshot.metadata.snapshotVersionVector,
      ),
      ...(snapshot.metadata.uploadExpectedRemoteSnapshotIdentity === undefined
        ? {}
        : {
            uploadExpectedRemoteSnapshotIdentity:
              snapshot.metadata.uploadExpectedRemoteSnapshotIdentity === null
                ? null
                : encodeVaultSnapshotIdentity(
                    snapshot.metadata.uploadExpectedRemoteSnapshotIdentity,
                  ),
          }),
    },
    trustChain: {
      certificates: snapshot.trustChain.certificates.map(
        encodeTrustCertificate,
      ),
    },
    keySlots: {
      deviceSlots: snapshot.keySlots.deviceSlots.map(encodeDeviceKeySlot),
    },
    content: encodeEncrypted(snapshot.content),
    signature: encodeSignature(snapshot.signature),
  };
}

export function decodeVaultSnapshotDescriptor(
  value: unknown,
): VaultSnapshotDescriptor {
  try {
    const record = exactRecord(value, [
      "vaultId",
      "snapshotVersionVector",
      "revisionTimestamp",
    ]);
    return {
      vaultId: nonBlankString(record.vaultId),
      snapshotVersionVector: decodeVersionVector(record.snapshotVersionVector),
      revisionTimestamp: safeInteger(record.revisionTimestamp),
    };
  } catch {
    throw new InvalidRemoteVaultSnapshotRecordError();
  }
}

export function encodeVaultSnapshotDescriptor(
  descriptor: VaultSnapshotDescriptor,
): unknown {
  return {
    vaultId: descriptor.vaultId,
    snapshotVersionVector: encodeVersionVector(
      descriptor.snapshotVersionVector,
    ),
    revisionTimestamp: descriptor.revisionTimestamp,
  };
}

export function decodeVaultSnapshotIdentity(
  value: unknown,
): VaultSnapshotIdentity {
  const record = exactRecord(value, ["descriptor", "snapshotDigest"]);

  return {
    descriptor: decodeVaultSnapshotDescriptor(record.descriptor),
    snapshotDigest: canonicalDigest(record.snapshotDigest),
  };
}

export function encodeVaultSnapshotIdentity(
  identity: VaultSnapshotIdentity,
): unknown {
  return {
    descriptor: encodeVaultSnapshotDescriptor(identity.descriptor),
    snapshotDigest: identity.snapshotDigest,
  };
}

function decodePasswordEntry(value: unknown): PasswordEntry {
  const record = exactRecord(value, [
    "id",
    "password",
    "login",
    "tags",
    "sanitizedUrl",
    "folderId",
    "versionVector",
  ]);
  if (!Array.isArray(record.tags)) {
    throw new Error("tags");
  }
  const tags = record.tags.map((tag) => nonBlankString(tag));
  if (new Set(tags).size !== tags.length) {
    throw new Error("duplicate");
  }
  const input = passwordEntryInputSchema.parse({
    password: record.password,
    login: record.login,
    tags,
    sanitizedUrl: record.sanitizedUrl,
    folderId: record.folderId,
  });
  return {
    id: nonBlankString(record.id),
    ...input,
    versionVector: decodeVersionVector(record.versionVector),
  };
}

function decodeFolder(value: unknown): Folder {
  const record = exactRecord(
    value,
    ["id", "name", "icon", "parentId", "createdAt", "versionVector"],
    ["description"],
  );
  const input = folderSchema.parse({
    id: record.id,
    name: record.name,
    icon: record.icon,
    ...(record.description === undefined
      ? {}
      : { description: record.description }),
    parentId: record.parentId,
    createdAt: record.createdAt,
  });
  return {
    ...input,
    versionVector: decodeVersionVector(record.versionVector),
  };
}

function decodeDeletedFolder(value: unknown): DeletedFolder {
  const record = exactRecord(value, ["id", "versionVector", "deletedAt"]);
  return {
    id: folderSchema.shape.id.parse(record.id),
    versionVector: decodeVersionVector(record.versionVector),
    deletedAt: safeInteger(record.deletedAt),
  };
}

function decodeTagGroup(value: unknown): TagGroup {
  const record = exactRecord(
    value,
    ["id", "name", "icon", "baseColor"],
    ["description"],
  );
  return tagGroupSchema.parse({
    id: record.id,
    name: record.name,
    icon: record.icon,
    baseColor: record.baseColor,
    ...(record.description === undefined
      ? {}
      : { description: record.description }),
  });
}

function decodeDeletedPasswordEntry(value: unknown): DeletedPasswordEntry {
  const record = exactRecord(value, ["id", "versionVector", "deletedAt"]);
  return {
    id: nonBlankString(record.id),
    versionVector: decodeVersionVector(record.versionVector),
    deletedAt: safeInteger(record.deletedAt),
  };
}

function decodeTag(value: unknown): Tag {
  const record = exactRecord(value, [
    "id",
    "name",
    "groupId",
    "color",
    "shade",
    "createdAt",
    "versionVector",
  ]);
  const input = tagSchema.parse({
    id: record.id,
    name: record.name,
    groupId: record.groupId,
    color: record.color,
    shade: record.shade,
    createdAt: record.createdAt,
  });
  return {
    ...input,
    versionVector: decodeVersionVector(record.versionVector),
  };
}

function decodeDeletedTag(value: unknown): DeletedTag {
  const record = exactRecord(value, ["id", "versionVector", "deletedAt"]);
  return {
    id: tagSchema.shape.id.parse(record.id),
    versionVector: decodeVersionVector(record.versionVector),
    deletedAt: safeInteger(record.deletedAt),
  };
}

function decodeDeviceProfile(value: unknown) {
  const record = exactRecord(value, [
    "id",
    "name",
    "createdAt",
    "versionVector",
  ]);
  return {
    id: nonBlankString(record.id),
    name: nonBlankString(record.name),
    createdAt: safeInteger(record.createdAt),
    versionVector: decodeVersionVector(record.versionVector),
  };
}

function decodeDeletedDeviceProfile(value: unknown): DeletedDeviceProfile {
  const record = exactRecord(value, ["id", "versionVector", "deletedAt"]);
  return {
    id: nonBlankString(record.id),
    versionVector: decodeVersionVector(record.versionVector),
    deletedAt: safeInteger(record.deletedAt),
  };
}

function requireUniqueAcross(
  active: readonly { readonly id: string | number }[],
  deleted: readonly { readonly id: string | number }[],
): void {
  const ids = [...active, ...deleted].map(({ id }) => String(id));
  if (new Set(ids).size !== ids.length) {
    throw new Error("duplicate");
  }
}

function normalizedOrganizationName(name: string): string {
  return name.trim().normalize("NFKC").toLowerCase();
}

function requireUniqueOrganizationNames(
  items: readonly { readonly name: string }[],
): void {
  const names = items.map(({ name }) => normalizedOrganizationName(name));
  if (new Set(names).size !== names.length)
    throw new Error("duplicate organization name");
}

export function decodeVault(value: unknown): Vault {
  try {
    const record = exactRecord(
      value,
      [
        "versionVector",
        "entries",
        "deletedEntries",
        "deviceProfiles",
        "deletedDeviceProfiles",
        "tags",
        "deletedTags",
        "tagGroups",
        "folders",
        "deletedFolders",
      ],
      [
        "syncTarget",
        "syncRemovalPending",
        "providerCredentialRevocationPending",
      ],
    );
    if (
      !Array.isArray(record.entries) ||
      !Array.isArray(record.deletedEntries) ||
      !Array.isArray(record.deviceProfiles) ||
      !Array.isArray(record.deletedDeviceProfiles) ||
      !Array.isArray(record.tags) ||
      !Array.isArray(record.deletedTags) ||
      !Array.isArray(record.tagGroups) ||
      !Array.isArray(record.folders) ||
      !Array.isArray(record.deletedFolders)
    ) {
      throw new Error("collections");
    }
    const entries = record.entries.map(decodePasswordEntry);
    const deletedEntries = record.deletedEntries.map(
      decodeDeletedPasswordEntry,
    );
    const deviceProfiles = record.deviceProfiles.map(decodeDeviceProfile);
    const deletedDeviceProfiles = record.deletedDeviceProfiles.map(
      decodeDeletedDeviceProfile,
    );
    const tags = record.tags.map(decodeTag);
    const deletedTags = record.deletedTags.map(decodeDeletedTag);
    const tagGroups = record.tagGroups.map(decodeTagGroup);
    const folders = record.folders.map(decodeFolder);
    const deletedFolders = record.deletedFolders.map(decodeDeletedFolder);
    requireUniqueAcross(entries, deletedEntries);
    requireUniqueAcross(deviceProfiles, deletedDeviceProfiles);
    requireUniqueAcross(tags, deletedTags);
    requireUniqueAcross(folders, deletedFolders);
    if (new Set(tagGroups.map(({ id }) => id)).size !== tagGroups.length)
      throw new Error("duplicate tag group");
    requireUniqueOrganizationNames(tags);
    requireUniqueOrganizationNames(tagGroups);
    const siblings = new Map<string | null, Folder[]>();
    for (const folder of folders) {
      const group = siblings.get(folder.parentId) ?? [];
      group.push(folder);
      siblings.set(folder.parentId, group);
    }
    for (const group of siblings.values())
      requireUniqueOrganizationNames(group);
    const activeTagIds = new Set(tags.map((tag) => tag.id));
    const activeTagGroupIds = new Set(tagGroups.map((group) => group.id));
    const activeFolderIds = new Set(folders.map((folder) => folder.id));
    if (
      entries.some((entry) =>
        entry.tags.some((tagId) => !activeTagIds.has(tagId)),
      )
    ) {
      throw new Error("missing tag reference");
    }
    if (tags.some((tag) => !activeTagGroupIds.has(tag.groupId)))
      throw new Error("missing tag group reference");
    if (
      folders.some(
        (folder) =>
          folder.parentId !== null && !activeFolderIds.has(folder.parentId),
      ) ||
      entries.some(
        (entry) =>
          entry.folderId !== UNCATEGORIZED_FOLDER_ID &&
          !activeFolderIds.has(entry.folderId),
      )
    )
      throw new Error("missing folder reference");
    for (const folder of folders) {
      const visited = new Set<string>([folder.id]);
      let parentId = folder.parentId;
      while (parentId !== null) {
        if (visited.has(parentId)) throw new Error("folder cycle");
        visited.add(parentId);
        parentId =
          folders.find((candidate) => candidate.id === parentId)?.parentId ??
          null;
      }
    }

    const result: Vault = {
      versionVector: decodeVersionVector(record.versionVector),
      entries,
      deletedEntries,
      deviceProfiles,
      deletedDeviceProfiles,
      tags,
      deletedTags,
      tagGroups,
      folders,
      deletedFolders,
    };
    if (record.syncTarget !== undefined) {
      const target = exactRecord(record.syncTarget, [
        "provider",
        "targetConfig",
      ]);
      if (target.provider !== "aws-s3-v1") {
        throw new Error("provider");
      }
      result.syncTarget = {
        provider: "aws-s3-v1",
        targetConfig: decodeJsonValue(target.targetConfig) as JsonValue,
      };
    }
    if (record.syncRemovalPending !== undefined) {
      const pending = exactRecord(record.syncRemovalPending, [
        "expectedRemoteSnapshotIdentity",
        "rollbackSnapshot",
      ]);
      result.syncRemovalPending = {
        expectedRemoteSnapshotIdentity:
          pending.expectedRemoteSnapshotIdentity === null
            ? null
            : decodeVaultSnapshotIdentity(
                pending.expectedRemoteSnapshotIdentity,
              ),
        rollbackSnapshot: decodeVaultSnapshot(
          pending.rollbackSnapshot,
          "local",
        ),
      };
    }
    if (record.providerCredentialRevocationPending !== undefined) {
      const pending = exactRecord(record.providerCredentialRevocationPending, [
        "revokedDeviceIds",
        "vaultKeyGeneration",
      ]);
      result.providerCredentialRevocationPending = {
        revokedDeviceIds: stringArray(pending.revokedDeviceIds, true),
        vaultKeyGeneration: safeInteger(pending.vaultKeyGeneration, 1),
      };
    }
    return result;
  } catch {
    throw new InvalidVaultSnapshotPayloadError();
  }
}

export function encodeVault(vault: Vault): unknown {
  return {
    versionVector: encodeVersionVector(vault.versionVector),
    entries: vault.entries.map((entry) => ({
      ...entry,
      versionVector: encodeVersionVector(entry.versionVector),
    })),
    deletedEntries: vault.deletedEntries.map((entry) => ({
      ...entry,
      versionVector: encodeVersionVector(entry.versionVector),
    })),
    deviceProfiles: vault.deviceProfiles.map((profile) => ({
      ...profile,
      versionVector: encodeVersionVector(profile.versionVector),
    })),
    deletedDeviceProfiles: vault.deletedDeviceProfiles.map((profile) => ({
      ...profile,
      versionVector: encodeVersionVector(profile.versionVector),
    })),
    ...(vault.syncTarget === undefined ? {} : { syncTarget: vault.syncTarget }),
    ...(vault.syncRemovalPending === undefined
      ? {}
      : {
          syncRemovalPending: {
            expectedRemoteSnapshotIdentity:
              vault.syncRemovalPending.expectedRemoteSnapshotIdentity === null
                ? null
                : encodeVaultSnapshotIdentity(
                    vault.syncRemovalPending.expectedRemoteSnapshotIdentity,
                  ),
            rollbackSnapshot: encodeVaultSnapshot(
              vault.syncRemovalPending.rollbackSnapshot,
            ),
          },
        }),
    ...(vault.providerCredentialRevocationPending === undefined
      ? {}
      : {
          providerCredentialRevocationPending:
            vault.providerCredentialRevocationPending,
        }),
    tags: vault.tags.map((tag) => ({
      ...tag,
      versionVector: encodeVersionVector(tag.versionVector),
    })),
    deletedTags: vault.deletedTags.map((tag) => ({
      ...tag,
      versionVector: encodeVersionVector(tag.versionVector),
    })),
    tagGroups: vault.tagGroups.map((group) => ({ ...group })),
    folders: vault.folders.map((folder) => ({
      ...folder,
      versionVector: encodeVersionVector(folder.versionVector),
    })),
    deletedFolders: vault.deletedFolders.map((folder) => ({
      ...folder,
      versionVector: encodeVersionVector(folder.versionVector),
    })),
  };
}
