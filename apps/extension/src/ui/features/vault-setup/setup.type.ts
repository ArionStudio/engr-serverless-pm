export type SetupStep = "welcome" | "password" | "device" | "connect";
export type AssessPassword = (
  password: string,
) => Promise<{ score: 0 | 1 | 2 | 3 | 4 }>;
