import type { DeviceRegistry } from "../../device/domain/device.type";
import type { Tag, TagGroup } from "../../../old-core/organization/tag.type";
import type { Folder } from "../../../old-core/passwords/folder.type";
import type { Password } from "../../../old-core/passwords/password.type";
import type { EncryptedDataPayload } from "./encrypted-payload.type";
import type { Base64UrlBytes, KeySlot } from "./key-slot.type";
import type { UnsignedVaultEnvelope } from "./vault-envelope.type";
import type { VaultMetadata } from "./vault-metadata.type";

/**
 * Additional authenticated data bound to encrypted vault contents.
 */
export interface AADObject {
  readonly version: number;
  readonly metadata: VaultMetadata;
  readonly envelope: UnsignedVaultEnvelope;
  readonly keySlotsDigest: Base64UrlBytes;
}

/**
 * Encrypted payload section stored in a vault snapshot.
 */
export interface VaultPayload {
  readonly keySlots: KeySlot[];
  readonly data: EncryptedDataPayload;
}

/**
 * Decrypted vault contents available only in memory.
 */
export interface DecryptedVaultData {
  passwords: Password[];
  folders: Folder[];
  tags: Tag[];
  tagGroups: TagGroup[];
  deviceRegistry: DeviceRegistry;
}
