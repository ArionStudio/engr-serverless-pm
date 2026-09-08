import "fake-indexeddb/auto";
import { IndexedDbGlobalLibraryRepository } from "@/adapters/organization";
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { globalLibrarySchema } from "@lfspm/core";
import source from "@/assets/data/global-library.json";
import { SetupOrganization } from "./setup-organization.view";
import { createOrganizationSetupDraft } from "./setup-organization";

afterEach(cleanup);

it("keeps organization choices and navigation disabled while the vault is being created", async () => {
  const library = globalLibrarySchema.parse(source);
  const value = createOrganizationSetupDraft(library, library.templates[0]!.id);
  const change = vi.fn();
  const back = vi.fn();
  const next = vi.fn();
  const user = userEvent.setup();
  const { rerender } = render(
    <SetupOrganization
      library={library}
      value={value}
      pending
      onChange={change}
      onBack={back}
      onContinue={next}
    />,
  );
  const name = screen.getAllByRole("textbox", { name: "Folder name" })[0]!;
  expect(name).toBeDisabled();
  await user.type(name, "Changed");
  await user.click(screen.getByText("Start without folders or tags"));
  await user.click(screen.getByRole("button", { name: "Back to device" }));
  await user.click(screen.getByRole("button", { name: "Creating vault…" }));
  expect(change).not.toHaveBeenCalled();
  expect(back).not.toHaveBeenCalled();
  expect(next).not.toHaveBeenCalled();
  rerender(
    <SetupOrganization
      library={library}
      value={value}
      error="Creation failed. Try again."
      onChange={change}
      onBack={back}
      onContinue={next}
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Creation failed. Try again.",
  );
  await user.click(
    screen.getByRole("button", { name: "Continue to recovery" }),
  );
  expect(next).toHaveBeenCalledOnce();
});

it("preserves a schema-valid normalized parent through local library loading and setup", async () => {
  const library = globalLibrarySchema.parse({
    ...source,
    folders: [
      {
        id: "parent",
        name: "Work",
        icon: "briefcase",
        parent: null,
        description: "Parent",
      },
      {
        id: "child",
        name: "Projects",
        icon: "folder",
        parent: "ｗｏｒｋ",
        description: "Child",
      },
    ],
    templates: [
      {
        id: "normalized",
        label: "Work",
        complexity: "basic",
        folderIds: ["parent", "child"],
        tagIds: [],
      },
    ],
  });
  const databaseName = `organization-library-${crypto.randomUUID()}`;
  const repository = new IndexedDbGlobalLibraryRepository(
    databaseName,
    library,
  );
  try {
    const restored = await repository.read();
    const draft = createOrganizationSetupDraft(restored, "normalized");
    expect(
      draft.folders.find((folder) => folder.id === "child")?.parentId,
    ).toBe("parent");
  } finally {
    await repository.close();
    indexedDB.deleteDatabase(databaseName);
  }
});
