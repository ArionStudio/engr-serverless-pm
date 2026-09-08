// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import type {
  AddFolderCommandParams,
  MoveFolderCommandParams,
  ReadFoldersResult,
  RemoveFolderCommandParams,
  UpdateFolderCommandParams,
} from "@lfspm/core";
import type { FolderManagementCapabilities } from "./folder-management.type";
import { FolderManagementView } from "./folder-management.view";
import { FolderPicker } from "./folder-tree.view";

afterEach(cleanup);

function folderCapabilities() {
  let sequence = 10;
  let folders: ReadFoldersResult["folders"] = [
    {
      id: "work",
      name: "Work",
      icon: "work",
      description: "Work accounts",
      parentId: null,
      createdAt: 1,
      versionVector: { device: 1 },
      entryCount: 2,
      childCount: 1,
    },
    {
      id: "mail",
      name: "Mail",
      icon: "mail",
      parentId: "work",
      createdAt: 2,
      versionVector: { device: 1 },
      entryCount: 0,
      childCount: 0,
    },
    {
      id: "archive",
      name: "Archive",
      icon: "folder",
      parentId: null,
      createdAt: 3,
      versionVector: { device: 1 },
      entryCount: 0,
      childCount: 0,
    },
  ];

  const read = vi.fn(
    async (): Promise<ReadFoldersResult> => ({
      folders: folders.map((folder) => ({
        ...folder,
        childCount: folders.filter(
          (candidate) => candidate.parentId === folder.id,
        ).length,
      })),
      uncategorized: {
        id: "uncategorized",
        name: "Uncategorized",
        entryCount: 1,
      },
    }),
  );

  const add = vi.fn(async ({ folder }: AddFolderCommandParams) => {
    const folderId = `folder-${++sequence}`;
    folders = [
      ...folders,
      {
        ...folder,
        id: folderId,
        createdAt: sequence,
        versionVector: { device: sequence },
        entryCount: 0,
        childCount: 0,
      },
    ];
    return {
      folderId,
      snapshotVersionVector: { device: sequence },
      revisionTimestamp: sequence,
      syncUpload: "complete" as const,
      syncConfigured: false,
    };
  });

  const update = vi.fn(async (params: UpdateFolderCommandParams) => {
    folders = folders.map((folder) =>
      folder.id === params.folderId
        ? {
            ...folder,
            ...params.folder,
            versionVector: { device: ++sequence },
          }
        : folder,
    );
    return {
      folderId: params.folderId,
      snapshotVersionVector: { device: sequence },
      revisionTimestamp: sequence,
      syncUpload: "complete" as const,
      syncConfigured: false,
    };
  });

  const move = vi.fn(async (params: MoveFolderCommandParams) => {
    folders = folders.map((folder) =>
      folder.id === params.folderId
        ? {
            ...folder,
            parentId: params.parentId,
            versionVector: { device: ++sequence },
          }
        : folder,
    );
    return {
      folderId: params.folderId,
      snapshotVersionVector: { device: sequence },
      revisionTimestamp: sequence,
      syncUpload: "complete" as const,
      syncConfigured: false,
    };
  });

  const remove = vi.fn(async (params: RemoveFolderCommandParams) => {
    folders = folders.filter((folder) => folder.id !== params.folderId);
    return {
      folderId: params.folderId,
      snapshotVersionVector: { device: ++sequence },
      revisionTimestamp: sequence,
      syncUpload: "complete" as const,
      syncConfigured: false,
    };
  });

  const capabilities: FolderManagementCapabilities = {
    readOrganizationLibrary: async () => ({
      folders: [],
      tags: [],
      tagGroups: [],
      templates: [],
    }),
    read,
    add,
    update,
    move,
    remove,
    subscribe: () => () => undefined,
  };
  return { capabilities, add, update, move, remove };
}

it("manages the folder hierarchy and protects folders that are not empty", async () => {
  const user = userEvent.setup();
  const fixture = folderCapabilities();
  render(
    <FolderManagementView
      vaultId="vault-1"
      capabilities={fixture.capabilities}
    />,
  );

  expect(await screen.findByText("Uncategorized")).toBeVisible();
  expect(screen.getByText("Locked")).toBeVisible();
  expect(screen.getByRole("button", { name: "Delete Work" })).toBeDisabled();
  expect(
    screen.getByText("Move its entries and subfolders before deleting it."),
  ).toBeVisible();

  await user.click(
    screen.getByRole("button", { name: "Add subfolder to Mail" }),
  );
  expect(screen.getByText("Deep folder nesting")).toBeVisible();
  await user.type(screen.getByRole("textbox", { name: "Name" }), "Secrets");
  await user.click(screen.getByRole("button", { name: "Create folder" }));
  expect(await screen.findByText("Secrets")).toBeVisible();
  expect(fixture.add).toHaveBeenCalledWith(
    expect.objectContaining({
      folder: expect.objectContaining({ parentId: "mail", name: "Secrets" }),
    }),
  );

  await user.click(screen.getByRole("button", { name: "Rename Work" }));
  const name = screen.getByRole("textbox", { name: "Folder name" });
  await user.clear(name);
  await user.type(name, "Office{Enter}");
  expect(await screen.findByText("Office")).toBeVisible();
  expect(fixture.update).toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "Edit Office" }));
  expect(screen.getByRole("heading", { name: "Edit folder" })).toBeVisible();
  await user.click(screen.getByText("Home"));
  const description = screen.getByRole("textbox", { name: "Description" });
  await user.clear(description);
  await user.type(description, "Team accounts");
  await user.click(screen.getByRole("button", { name: "Save folder" }));
  expect(await screen.findByText("Office")).toBeVisible();
  expect(fixture.update).toHaveBeenLastCalledWith(
    expect.objectContaining({
      folder: expect.objectContaining({
        name: "Office",
        icon: "home",
        description: "Team accounts",
      }),
    }),
  );

  await user.click(screen.getByRole("button", { name: "Move Mail" }));
  await user.click(screen.getByRole("radio", { name: "Vault root" }));
  await user.click(screen.getByRole("button", { name: "Move folder" }));
  expect(fixture.move).toHaveBeenCalledWith(
    expect.objectContaining({ folderId: "mail", parentId: null }),
  );

  await user.click(screen.getByRole("button", { name: "Delete Archive" }));
  await user.click(screen.getByRole("button", { name: "Delete folder" }));
  expect(screen.queryByText("Archive")).not.toBeInTheDocument();
  expect(fixture.remove).toHaveBeenCalled();
});

it("keeps a folder draft after an ordinary failure, then clears it when authorization is lost", async () => {
  const fixture = folderCapabilities();
  const onSessionLost = vi.fn();
  fixture.capabilities.update = vi.fn(async () => {
    throw new Error("temporary dependency failure");
  });
  const user = userEvent.setup();
  render(
    <FolderManagementView
      vaultId="vault-1"
      capabilities={fixture.capabilities}
      onSessionLost={onSessionLost}
    />,
  );

  await user.click(await screen.findByRole("button", { name: "Edit Mail" }));
  await user.click(screen.getByRole("button", { name: "Save folder" }));

  expect(onSessionLost).not.toHaveBeenCalled();
  expect(screen.getByRole("heading", { name: "Edit folder" })).toBeVisible();
  expect(
    screen.getByText("The folder could not be saved. Try again."),
  ).toBeVisible();

  fixture.capabilities.update = vi.fn(async () => {
    const error = new Error("session ended");
    error.name = "UnlockedVaultSessionInvalidError";
    throw error;
  });
  await user.click(screen.getByRole("button", { name: "Save folder" }));

  expect(onSessionLost).toHaveBeenCalledOnce();
  expect(screen.queryByText("Mail")).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Edit folder" })).toBeNull();
  expect(
    screen.getByText("Unlock this vault again before changing folders."),
  ).toBeVisible();
});

it("uses the library folder properties and suggested existing parent without losing the draft", async () => {
  const user = userEvent.setup();
  const fixture = folderCapabilities();
  fixture.capabilities.readOrganizationLibrary = async () => ({
    folders: [
      {
        id: "clients",
        name: "Clients",
        icon: "users",
        parent: "Work",
        description: "Client accounts",
      },
    ],
    tags: [],
    tagGroups: [],
    templates: [],
  });
  render(
    <FolderManagementView
      vaultId="vault-1"
      capabilities={fixture.capabilities}
    />,
  );
  await screen.findByText("Work");
  await user.click(screen.getByRole("button", { name: "New folder" }));
  await user.type(screen.getByLabelText("Name", { exact: true }), "Cli");
  await user.click(
    await screen.findByRole("button", { name: "Use Clients folder" }),
  );
  expect(screen.getByLabelText("Name", { exact: true })).toHaveValue("Clients");
  expect(screen.getByLabelText("Description")).toHaveValue("Client accounts");
  await user.click(screen.getByRole("button", { name: "Create folder" }));
  expect(fixture.add).toHaveBeenCalledWith({
    vaultId: "vault-1",
    folder: {
      name: "Clients",
      icon: "users",
      description: "Client accounts",
      parentId: "work",
    },
  });
});

it("cancels inline rename with Escape", async () => {
  const user = userEvent.setup();
  const fixture = folderCapabilities();
  render(
    <FolderManagementView
      vaultId="vault-1"
      capabilities={fixture.capabilities}
    />,
  );

  await screen.findByText("Mail");
  await user.click(screen.getByRole("button", { name: "Rename Mail" }));
  const name = screen.getByRole("textbox", { name: "Folder name" });
  await user.clear(name);
  await user.type(name, "Messages{Escape}");
  expect(screen.getByText("Mail")).toBeVisible();
  expect(fixture.update).not.toHaveBeenCalled();
});

it("names folder choices and selects them through their visible labels", async () => {
  const user = userEvent.setup();
  const fixture = folderCapabilities();
  const data = await fixture.capabilities.read("vault-1");
  const onChange = vi.fn();
  render(
    <FolderPicker
      folders={data.folders}
      uncategorized={data.uncategorized}
      value="uncategorized"
      onChange={onChange}
    />,
  );

  expect(screen.getByRole("radio", { name: "Mail" })).toBeVisible();
  await user.click(screen.getByText("Mail"));
  expect(onChange).toHaveBeenCalledWith("mail");
});

it("uses folders returned by a successful authorization recheck", async () => {
  const { capabilities } = folderCapabilities();
  const read = capabilities.read;
  capabilities.read = vi
    .fn(read)
    .mockRejectedValueOnce(new Error("Temporary read failure"));
  render(<FolderManagementView vaultId="vault" capabilities={capabilities} />);
  expect(await screen.findByText("Archive")).toBeVisible();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(capabilities.read).toHaveBeenCalledTimes(2);
});
