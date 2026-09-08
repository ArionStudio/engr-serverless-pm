import type {
  CapturedLogin,
  CapturedLoginContext,
  CapturedLoginRepositoryPort,
} from "@lfspm/core";
import { secureWipe } from "@lfspm/core/lib";
import type { ChromeStorageArea } from "../storage/chrome-storage-area.type";

export const CAPTURED_LOGIN_STORAGE_LOCK = "lfspm:captured-logins";
export const CAPTURED_LOGIN_STORAGE_PREFIX = "lfspm.captured-login.";
const encoder = new TextEncoder();
const envelopeFields = [
  "id",
  "expiresAt",
  "vaultId",
  "sessionId",
  "iv",
  "ciphertext",
] as const;

function bytes(value: unknown, max: number): value is number[] {
  return (
    Array.isArray(value) &&
    value.length <= max &&
    Array.from(value).every(
      (n: unknown) => Number.isInteger(n) && Number(n) >= 0 && Number(n) <= 255,
    )
  );
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

type CapturedLoginEnvelope = Record<string, unknown> & {
  id: string;
  expiresAt: number | null;
  vaultId: string;
  sessionId: string;
  iv: number[];
  ciphertext: number[];
};

function decodeCapturedLoginEnvelope(
  value: unknown,
): CapturedLoginEnvelope | null {
  if (
    !record(value) ||
    Object.keys(value).length !== envelopeFields.length ||
    !envelopeFields.every((field) => Object.hasOwn(value, field)) ||
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    typeof value.vaultId !== "string" ||
    value.vaultId.length === 0 ||
    typeof value.sessionId !== "string" ||
    value.sessionId.length === 0 ||
    (value.expiresAt !== null &&
      (typeof value.expiresAt !== "number" ||
        !Number.isFinite(value.expiresAt))) ||
    !bytes(value.iv, 12) ||
    value.iv.length !== 12 ||
    !bytes(value.ciphertext, 100_000) ||
    value.ciphertext.length < 16
  )
    return null;

  return {
    id: value.id,
    expiresAt: value.expiresAt,
    vaultId: value.vaultId,
    sessionId: value.sessionId,
    iv: value.iv,
    ciphertext: value.ciphertext,
  };
}
async function key(context: CapturedLoginContext): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    context.protectionKey,
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode(context.sessionId),
      info: encoder.encode("LFSPM captured website login"),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
function aad(tabId: number, id: string, context: CapturedLoginContext) {
  return encoder.encode(
    JSON.stringify([tabId, id, context.vaultId, context.sessionId]),
  );
}
export class ChromeCapturedLoginRepositoryAdapter implements CapturedLoginRepositoryPort {
  private readonly storage: ChromeStorageArea;
  constructor(
    storage: ChromeStorageArea = chrome.storage.session as ChromeStorageArea,
  ) {
    this.storage = storage;
  }
  async save(
    value: CapturedLogin,
    context: CapturedLoginContext,
  ): Promise<void> {
    await this.storage.setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" });
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = encoder.encode(JSON.stringify(value));
    let ciphertext: ArrayBuffer;
    try {
      ciphertext = await crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv,
          additionalData: aad(value.tabId, value.id, context),
        },
        await key(context),
        plaintext,
      );
    } finally {
      secureWipe(plaintext);
    }
    const all = await this.storage.get(null);
    const now = Date.now();
    const activeNames = new Set(
      Object.entries(all).flatMap(([name, value]) => {
        if (!name.startsWith(CAPTURED_LOGIN_STORAGE_PREFIX)) return [];
        const envelope = decodeCapturedLoginEnvelope(value);
        return envelope &&
          envelope.vaultId === context.vaultId &&
          envelope.sessionId === context.sessionId &&
          (envelope.expiresAt === null || envelope.expiresAt > now)
          ? [name]
          : [];
      }),
    );
    const stale = Object.keys(all).filter(
      (name) =>
        name.startsWith(CAPTURED_LOGIN_STORAGE_PREFIX) &&
        !activeNames.has(name),
    );
    if (stale.length) await this.storage.remove(stale);
    if (
      activeNames.size >= 20 &&
      !activeNames.has(CAPTURED_LOGIN_STORAGE_PREFIX + value.tabId)
    )
      throw new Error(
        "Too many pending logins. Review or dismiss a captured login first.",
      );
    await this.storage.set({
      [CAPTURED_LOGIN_STORAGE_PREFIX + value.tabId]: {
        id: value.id,
        expiresAt: value.expiresAt,
        vaultId: context.vaultId,
        sessionId: context.sessionId,
        iv: Array.from(iv),
        ciphertext: Array.from(new Uint8Array(ciphertext)),
      },
    });
  }
  async read(
    tabId: number,
    context: CapturedLoginContext,
  ): Promise<CapturedLogin | null> {
    const stored = decodeCapturedLoginEnvelope(
      (await this.storage.get(CAPTURED_LOGIN_STORAGE_PREFIX + tabId))[
        CAPTURED_LOGIN_STORAGE_PREFIX + tabId
      ],
    );
    if (
      !stored ||
      stored.vaultId !== context.vaultId ||
      stored.sessionId !== context.sessionId
    )
      return null;
    let plaintext: Uint8Array | undefined;
    try {
      const clear = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: new Uint8Array(stored.iv),
          additionalData: aad(tabId, stored.id, context),
        },
        await key(context),
        new Uint8Array(stored.ciphertext),
      );
      plaintext = new Uint8Array(clear);
      const value: unknown = JSON.parse(new TextDecoder().decode(plaintext));
      if (
        !record(value) ||
        value.id !== stored.id ||
        value.tabId !== tabId ||
        typeof value.url !== "string" ||
        typeof value.login !== "string" ||
        typeof value.password !== "string" ||
        (value.expiresAt !== null &&
          (typeof value.expiresAt !== "number" ||
            !Number.isFinite(value.expiresAt)))
      )
        return null;
      return {
        id: stored.id,
        tabId,
        url: value.url,
        login: value.login,
        password: value.password,
        expiresAt: value.expiresAt,
      };
    } catch {
      return null;
    } finally {
      if (plaintext) secureWipe(plaintext);
    }
  }
  async remove(tabId: number, id: string): Promise<void> {
    const value = decodeCapturedLoginEnvelope(
      (await this.storage.get(CAPTURED_LOGIN_STORAGE_PREFIX + tabId))[
        CAPTURED_LOGIN_STORAGE_PREFIX + tabId
      ],
    );
    if (value?.id === id)
      await this.storage.remove(CAPTURED_LOGIN_STORAGE_PREFIX + tabId);
  }
}

/** Call while holding CAPTURED_LOGIN_STORAGE_LOCK. */
export async function clearCapturedLogins(
  predicate: (
    value: Record<string, unknown>,
    storageKey: string,
  ) => boolean = () => true,
): Promise<void> {
  const stored = await chrome.storage.session.get(null);
  const keys = Object.keys(stored).filter((name) => {
    if (!name.startsWith(CAPTURED_LOGIN_STORAGE_PREFIX)) return false;
    const value = decodeCapturedLoginEnvelope(stored[name]);
    return !value || predicate(value, name);
  });
  if (keys.length) await chrome.storage.session.remove(keys);
}
