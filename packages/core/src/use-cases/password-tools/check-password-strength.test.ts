import { describe, expect, it } from "vitest";
import { CheckPasswordStrengthUseCase } from "./check-password-strength";

describe("CheckPasswordStrengthUseCase", () => {
  it("returns only the calculated score", async () => {
    const password = "orbit lantern velvet canyon river";
    const useCase = new CheckPasswordStrengthUseCase();

    const result = await useCase.execute({ password });

    expect(result).toEqual({ score: 4 });
    expect(result).not.toHaveProperty("password");
    expect(JSON.stringify(result)).not.toContain(password);
  });
});
