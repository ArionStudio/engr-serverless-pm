import { afterEach, expect, it, vi } from "vitest";
import { readActivePageUrl } from "./active-page-url";
afterEach(() => vi.unstubAllGlobals());
it("prefills the active website without credentials, query tokens or fragments", async () => {
  const query = vi.fn(async () => [
    {
      url: "https://user:secret@example.com:8443/sign-in?token=private#account",
    },
  ]);
  vi.stubGlobal("chrome", { tabs: { query } });
  expect(await readActivePageUrl()).toBe("https://example.com:8443/sign-in");
  expect(query).toHaveBeenCalledWith({ active: true, currentWindow: true });
  query.mockResolvedValue([{ url: "chrome://settings" }]);
  expect(await readActivePageUrl()).toBe("");
  query.mockRejectedValue(new Error("No access"));
  expect(await readActivePageUrl()).toBe("");
});
