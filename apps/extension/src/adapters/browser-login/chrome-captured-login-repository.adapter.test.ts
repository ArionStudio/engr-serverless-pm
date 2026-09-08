import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CapturedLogin,
  CapturedLoginContext,
  DeviceLocalProtectionKey,
} from "@lfspm/core";
import type { ChromeStorageArea } from "../storage/chrome-storage-area.type";
import { ChromeCapturedLoginRepositoryAdapter } from "./chrome-captured-login-repository.adapter";

afterEach(() => vi.restoreAllMocks());

function createContext() {
  const records = new Map<string, unknown>();
  const storage: ChromeStorageArea = {
    get: vi.fn(async (keys) =>
      Object.fromEntries(
        Array.from(records).filter(([name]) => keys == null || keys === name),
      ),
    ),
    set: vi.fn(async (items) => {
      for (const [name, value] of Object.entries(items))
        records.set(name, structuredClone(value));
    }),
    remove: vi.fn(async (keys) => {
      for (const name of Array.isArray(keys) ? keys : [keys])
        records.delete(name);
    }),
    setAccessLevel: vi.fn(async () => undefined),
  };
  const context: CapturedLoginContext = {
    vaultId: "vault",
    sessionId: "session",
    protectionKey: new Uint8Array(32).fill(7)
      .buffer as DeviceLocalProtectionKey,
  };
  const candidate: CapturedLogin = {
    id: "capture",
    tabId: 7,
    url: "https://example.com/login",
    login: "alice",
    password: "test-only-secret",
    expiresAt: Date.now() + 120_000,
  };
  return {
    records,
    storage,
    context,
    candidate,
    repository: new ChromeCapturedLoginRepositoryAdapter(storage),
  };
}

describe("encrypted captured login storage", () => {
  it("wipes owned plaintext buffers on success and failure without wiping the session key", async () => {
    const ctx = createContext();
    const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
    const decrypt = crypto.subtle.decrypt.bind(crypto.subtle);
    const encryptedInputs: Uint8Array[] = [];
    const decryptedOutputs: Uint8Array[] = [];
    const encryptSpy = vi
      .spyOn(crypto.subtle, "encrypt")
      .mockImplementation(async (algorithm, key, data) => {
        encryptedInputs.push(data as Uint8Array);
        return encrypt(algorithm, key, data);
      });
    const decryptSpy = vi
      .spyOn(crypto.subtle, "decrypt")
      .mockImplementation(async (algorithm, key, data) => {
        const value = await decrypt(algorithm, key, data);
        decryptedOutputs.push(new Uint8Array(value));
        return value;
      });
    await ctx.repository.save(ctx.candidate, ctx.context);
    expect(await ctx.repository.read(7, ctx.context)).toEqual(ctx.candidate);
    encryptSpy.mockImplementationOnce(async (_algorithm, _key, data) => {
      encryptedInputs.push(data as Uint8Array);
      throw new Error("Encryption failed");
    });
    await expect(
      ctx.repository.save(ctx.candidate, ctx.context),
    ).rejects.toThrow("Encryption failed");
    const malformed = new TextEncoder().encode("{");
    decryptedOutputs.push(malformed);
    decryptSpy.mockResolvedValueOnce(malformed.buffer);
    expect(await ctx.repository.read(7, ctx.context)).toBeNull();
    expect(encryptedInputs).toHaveLength(2);
    expect(decryptedOutputs).toHaveLength(2);
    for (const buffer of [...encryptedInputs, ...decryptedOutputs]) {
      expect(buffer.length).toBeGreaterThan(0);
      expect(buffer.every((byte) => byte === 0)).toBe(true);
    }
    expect(new Uint8Array(ctx.context.protectionKey)).toEqual(
      new Uint8Array(32).fill(7),
    );
  });
  it("stores ciphertext accessible only with the original vault, session, key and tab", async () => {
    const ctx = createContext();
    await ctx.repository.save(ctx.candidate, ctx.context);
    expect(ctx.storage.setAccessLevel).toHaveBeenCalledWith({
      accessLevel: "TRUSTED_CONTEXTS",
    });
    expect(JSON.stringify(Object.fromEntries(ctx.records))).not.toContain(
      ctx.candidate.password,
    );
    expect(await ctx.repository.read(7, ctx.context)).toEqual(ctx.candidate);
    for (const context of [
      { ...ctx.context, vaultId: "another-vault" },
      { ...ctx.context, sessionId: "another-session" },
      {
        ...ctx.context,
        protectionKey: new Uint8Array(32).fill(8)
          .buffer as DeviceLocalProtectionKey,
      },
    ])
      expect(await ctx.repository.read(7, context)).toBeNull();
    ctx.records.set(
      "lfspm.captured-login.8",
      ctx.records.get("lfspm.captured-login.7"),
    );
    expect(await ctx.repository.read(8, ctx.context)).toBeNull();
  });

  it("rejects ciphertext tampering and preserves a replacement when dismissing an older capture", async () => {
    const ctx = createContext();
    await ctx.repository.save(ctx.candidate, ctx.context);
    const value = ctx.records.get("lfspm.captured-login.7") as {
      ciphertext: number[];
    };
    value.ciphertext[0] ^= 1;
    expect(await ctx.repository.read(7, ctx.context)).toBeNull();
    await ctx.repository.save(
      { ...ctx.candidate, id: "replacement" },
      ctx.context,
    );
    await ctx.repository.remove(7, "capture");
    expect(await ctx.repository.read(7, ctx.context)).toEqual({
      ...ctx.candidate,
      id: "replacement",
    });
    await ctx.repository.remove(7, "replacement");
    expect(await ctx.repository.read(7, ctx.context)).toBeNull();
  });

  it("removes malformed matching envelopes before applying the pending-login limit", async () => {
    const ctx = createContext();
    for (let tabId = 1; tabId <= 17; tabId += 1) {
      await ctx.repository.save(
        { ...ctx.candidate, id: `capture-${tabId}`, tabId },
        ctx.context,
      );
    }

    const valid = structuredClone(
      ctx.records.get("lfspm.captured-login.1"),
    ) as {
      id: string;
      expiresAt: number;
      vaultId: string;
      sessionId: string;
      iv: number[];
      ciphertext: number[];
    };
    ctx.records.set("lfspm.captured-login.18", {
      id: valid.id,
      vaultId: valid.vaultId,
      sessionId: valid.sessionId,
      iv: valid.iv,
      ciphertext: valid.ciphertext,
    });
    ctx.records.set("lfspm.captured-login.19", { ...valid, iv: [0] });
    ctx.records.set("lfspm.captured-login.20", {
      ...valid,
      ciphertext: [],
    });

    const nextCapture = {
      ...ctx.candidate,
      id: "capture-21",
      tabId: 21,
    };
    await expect(
      ctx.repository.save(nextCapture, ctx.context),
    ).resolves.toBeUndefined();
    expect(await ctx.repository.read(21, ctx.context)).toEqual(nextCapture);
    expect(ctx.records.has("lfspm.captured-login.18")).toBe(false);
    expect(ctx.records.has("lfspm.captured-login.19")).toBe(false);
    expect(ctx.records.has("lfspm.captured-login.20")).toBe(false);
    expect(ctx.records.size).toBe(18);
  });
});

it("keeps a null-expiry capture when a later save purges expired records", async () => {
  const ctx = createContext();
  const retained = { ...ctx.candidate, expiresAt: null };
  await ctx.repository.save(retained, ctx.context);
  await ctx.repository.save(
    { ...ctx.candidate, id: "expiring", tabId: 8 },
    ctx.context,
  );
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 600_000);
  await ctx.repository.save(
    { ...ctx.candidate, id: "later", tabId: 9, expiresAt: null },
    ctx.context,
  );
  expect(await ctx.repository.read(7, ctx.context)).toEqual(retained);
  expect(ctx.records.has("lfspm.captured-login.8")).toBe(false);
});
