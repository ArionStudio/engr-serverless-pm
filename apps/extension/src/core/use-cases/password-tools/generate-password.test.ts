import { describe, expect, it, vi } from "vitest";
import type { RandomBytes } from "../../domain/crypto/brand-keys";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import {
  InvalidGeneratedPasswordSettingsError,
  PasswordGenerationImpossibleError,
} from "../__errors/generate-password.errors";
import { GeneratePasswordUseCase } from "./generate-password";

function randomBytesFromUint32(value: number): RandomBytes {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setUint32(0, value);

  return buffer as RandomBytes;
}

function createContext(randomValues: number[] = []) {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);

  vi.mocked(ports.crypto.generateRandomBytes).mockImplementation(
    async (byteLength) => {
      if (byteLength !== 4) {
        throw new Error("Unexpected random byte length.");
      }

      return randomBytesFromUint32(randomValues.shift() ?? 0);
    },
  );

  return {
    ports,
    useCase: new GeneratePasswordUseCase(ports.crypto),
  };
}

describe("GeneratePasswordUseCase", () => {
  it("generates a default password that fits password entry storage", async () => {
    const ctx = createContext();

    const result = await ctx.useCase.execute();

    expect(result.password).toHaveLength(14);
    expect(result.password).toMatch(/^[A-Za-z0-9]+$/);
    expect(result.password).toMatch(/[0-9]/);
    expect(
      vi
        .mocked(ctx.ports.crypto.generateRandomBytes)
        .mock.calls.every(([byteLength]) => byteLength === 4),
    ).toBe(true);
  });

  it("generates a password from selected character groups and minimums", async () => {
    const ctx = createContext();

    const result = await ctx.useCase.execute({
      length: 6,
      uppercase: false,
      lowercase: false,
      numbers: true,
      special: true,
      minNumbers: 2,
      minSpecial: 2,
    });

    expect(result.password).toHaveLength(6);
    expect(result.password).toMatch(/^[0-9!@#$%^&*]+$/);
    expect(result.password.match(/[0-9]/g)).toHaveLength(4);
    expect(result.password.match(/[!@#$%^&*]/g)).toHaveLength(2);
  });

  it("avoids ambiguous characters when requested", async () => {
    const ctx = createContext(Array.from({ length: 64 }, (_, index) => index));

    const result = await ctx.useCase.execute({
      length: 20,
      uppercase: true,
      lowercase: true,
      numbers: true,
      special: false,
      minNumbers: 0,
      avoidAmbiguousCharacters: true,
    });

    expect(result.password).toHaveLength(20);
    expect(result.password).not.toMatch(/[IOl01]/);
  });

  it("rejects settings that do not fit password entry storage", async () => {
    const ctx = createContext();

    await expect(
      ctx.useCase.execute({
        length: 129,
      }),
    ).rejects.toBeInstanceOf(InvalidGeneratedPasswordSettingsError);

    expect(ctx.ports.crypto.generateRandomBytes).not.toHaveBeenCalled();
  });

  it("rejects impossible character group settings", async () => {
    const ctx = createContext();

    await expect(
      ctx.useCase.execute({
        uppercase: false,
        lowercase: false,
        numbers: false,
        special: false,
        minNumbers: 0,
      }),
    ).rejects.toBeInstanceOf(PasswordGenerationImpossibleError);

    expect(ctx.ports.crypto.generateRandomBytes).not.toHaveBeenCalled();
  });

  it("rejects minimum requirements that cannot fit requested length", async () => {
    const ctx = createContext();

    await expect(
      ctx.useCase.execute({
        length: 2,
        minNumbers: 2,
        special: true,
        minSpecial: 1,
      }),
    ).rejects.toBeInstanceOf(PasswordGenerationImpossibleError);

    expect(ctx.ports.crypto.generateRandomBytes).not.toHaveBeenCalled();
  });

  it("rejects numeric minimums when numbers are disabled", async () => {
    const ctx = createContext();

    await expect(
      ctx.useCase.execute({
        numbers: false,
        minNumbers: 1,
      }),
    ).rejects.toBeInstanceOf(PasswordGenerationImpossibleError);

    expect(ctx.ports.crypto.generateRandomBytes).not.toHaveBeenCalled();
  });

  it("retries random index selection when sampled value would introduce modulo bias", async () => {
    const ctx = createContext([0xffffffff, 0]);

    const result = await ctx.useCase.execute({
      length: 1,
      uppercase: true,
      lowercase: false,
      numbers: false,
      special: false,
      minNumbers: 0,
    });

    expect(result).toEqual({
      password: "A",
    });
    expect(ctx.ports.crypto.generateRandomBytes).toHaveBeenCalledTimes(2);
  });
});
