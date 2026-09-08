// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import type { FolderManagementCapabilities } from "@/ui/features/folders";
import type { TagManagementCapabilities } from "@/ui/features/tags";
import { OrganizationManagementView } from "./organization-management.view";

afterEach(cleanup);

const unavailable = async (): Promise<never> => {
  throw new Error("This operation is not used in this test.");
};

const tagCapabilities: TagManagementCapabilities = {
  read: async () => ({
    tags: [],
    tagGroups: [],
    softLimit: 50,
    softLimitReached: false,
  }),
  add: unavailable,
  update: unavailable,
  remove: unavailable,
  subscribe: () => () => undefined,
};

const folderCapabilities: FolderManagementCapabilities = {
  readOrganizationLibrary: async () => ({
    folders: [],
    tags: [],
    tagGroups: [],
    templates: [],
  }),
  read: async () => ({
    folders: [],
    uncategorized: {
      id: "uncategorized",
      name: "Uncategorized",
      entryCount: 0,
    },
  }),
  add: unavailable,
  update: unavailable,
  move: unavailable,
  remove: unavailable,
  subscribe: () => () => undefined,
};

it("switches between tag and folder management without leaving the page", async () => {
  const user = userEvent.setup();
  render(
    <OrganizationManagementView
      vaultId="vault-1"
      tagCapabilities={tagCapabilities}
      folderCapabilities={folderCapabilities}
    />,
  );

  expect(await screen.findByRole("heading", { name: "Tags" })).toBeVisible();
  await user.click(screen.getByRole("tab", { name: "Folders" }));
  expect(await screen.findByRole("heading", { name: "Folders" })).toBeVisible();
  expect(screen.getByText("Uncategorized")).toBeVisible();
});
