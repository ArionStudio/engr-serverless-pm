/**
 * Password entry types.
 *
 * Passwords are stored encrypted in the vault.
 * The plaintext only exists in memory during an unlocked session.
 */

/**
 * Full password entry with all fields.
 * Stored in the decrypted vault data.
 *
 * All fields are readonly to prevent accidental mutation of decrypted data.
 * Use PasswordInput/PasswordUpdate for creation and modification operations.
 */
export interface Password {
  /** UUID */
  readonly id: string;
  readonly title: string;
  readonly username: string;
  /** plaintext, only in decrypted vault */
  readonly password: string;
  readonly url: string | null;
  readonly notes: string | null;
  /** null = root */
  readonly folderId: string | null;
  readonly tags: readonly string[];
  /** Unix ms */
  readonly createdAt: number;
  /** Unix ms */
  readonly modifiedAt: number;
}

/**
 * Password metadata for sync comparisons.
 * Excludes sensitive data (password, notes) for conflict resolution UI.
 */
export interface PasswordMetadata {
  readonly id: string;
  readonly title: string;
  readonly username: string;
  readonly url: string | null;
  readonly folderId: string | null;
  readonly tags: readonly string[];
  /** Unix ms */
  readonly modifiedAt: number;
}

export interface PasswordInput {
  title: string;
  username: string;
  password: string;
  url?: string | null;
  notes?: string | null;
  folderId?: string | null;
  tags?: string[];
}

export interface PasswordUpdate {
  readonly id: string;
  title?: string;
  username?: string;
  password?: string;
  url?: string | null;
  notes?: string | null;
  folderId?: string | null;
  tags?: string[];
}
