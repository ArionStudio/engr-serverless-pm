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

it("guides duplicate organization names and allows matching folder names in different locations", async () => {
  const library = globalLibrarySchema.parse(source);
  const value = createOrganizationSetupDraft(library, library.templates[0]!.id);
  const firstFolder = value.folders[0]!;
  const secondFolder = value.folders[1]!;
  const firstTag = value.tags[0]!;
  const secondTag = value.tags[1]!;
  const next = vi.fn();
  const duplicateFolders = {
    ...value,
    folders: value.folders.map((folder) =>
      folder.id === secondFolder.id
        ? { ...folder, name: `  ${firstFolder.name.toUpperCase()}  ` }
        : folder,
    ),
  };
  const { rerender } = render(
    <SetupOrganization
      library={library}
      value={duplicateFolders}
      onChange={() => {}}
      onBack={() => {}}
      onContinue={next}
    />,
  );

  expect(
    screen.getByRole("tab", { name: /Folders \(3, 2 need attention\)/ }),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Continue to recovery" }),
  ).toBeDisabled();
  const conflictingFolders = screen
    .getAllByRole("textbox", { name: "Folder name" })
    .slice(0, 2);
  for (const input of conflictingFolders) {
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(
      "Use a unique name among folders in this location.",
    );
  }
  expect(
    screen.getAllByText("Use a unique name among folders in this location."),
  ).toHaveLength(2);

  const matchingNamesInDifferentLocations = {
    ...duplicateFolders,
    folders: duplicateFolders.folders.map((folder) =>
      folder.id === secondFolder.id
        ? { ...folder, parentId: firstFolder.id }
        : folder,
    ),
  };
  rerender(
    <SetupOrganization
      library={library}
      value={matchingNamesInDifferentLocations}
      onChange={() => {}}
      onBack={() => {}}
      onContinue={next}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Continue to recovery" }),
  ).toBeEnabled();
  expect(
    screen.queryByText("Use a unique name among folders in this location."),
  ).not.toBeInTheDocument();

  const duplicateTags = {
    ...value,
    tags: value.tags.map((tag) =>
      tag.id === secondTag.id
        ? { ...tag, name: `  ${firstTag.name.toUpperCase()}  ` }
        : tag,
    ),
  };
  rerender(
    <SetupOrganization
      library={library}
      value={duplicateTags}
      onChange={() => {}}
      onBack={() => {}}
      onContinue={next}
    />,
  );
  expect(
    screen.getByRole("tab", { name: /Tags \(3, 2 need attention\)/ }),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Continue to recovery" }),
  ).toBeDisabled();
  await userEvent.setup().click(screen.getByRole("tab", { name: /Tags/ }));
  expect(screen.getAllByText("Use a unique tag name.")).toHaveLength(2);
  const conflictingTags = screen
    .getAllByRole("textbox", { name: "Tag name" })
    .filter((input) => input.getAttribute("aria-invalid") === "true");
  expect(conflictingTags).toHaveLength(2);
  for (const input of conflictingTags)
    expect(input).toHaveAccessibleDescription("Use a unique tag name.");

  rerender(
    <SetupOrganization
      library={library}
      value={value}
      onChange={() => {}}
      onBack={() => {}}
      onContinue={next}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Continue to recovery" }),
  ).toBeEnabled();
  expect(screen.queryByText("Use a unique tag name.")).not.toBeInTheDocument();
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
