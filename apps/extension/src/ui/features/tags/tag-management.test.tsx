// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import type { ReadTagsResult } from "@lfspm/core";
import { galleryTagManagement } from "@/gallery/tag-management-fixture";
import { TagManagementView } from "./tag-management.view";
import { tagGroupPresentations } from "./tag-presentation";

afterEach(cleanup);

it("manages unused tags while protecting tags assigned to entries", async () => {
  const user = userEvent.setup();
  render(
    <TagManagementView
      vaultId="gallery-vault"
      capabilities={galleryTagManagement()}
    />,
  );

  expect(await screen.findByText("Personal")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Delete Personal" }),
  ).toBeDisabled();
  expect(
    screen.getByText(
      "Used by 1 entry. Remove it from entries to delete this tag.",
    ),
  ).toBeVisible();

  await user.click(screen.getByRole("button", { name: "New tag" }));
  await user.type(screen.getByRole("textbox", { name: "Name" }), "Banking");
  await user.click(screen.getByText("Topic"));
  expect(screen.getByRole("radio", { name: "Topic" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "Blue" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "Default" })).toBeChecked();
  screen.getByRole("textbox", { name: "Name" }).focus();
  await user.keyboard("{Enter}");
  expect(await screen.findByText("Banking")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Edit Banking" }));
  const name = screen.getByRole("textbox", { name: "Name" });
  await user.clear(name);
  await user.type(name, "Finance");
  await user.click(screen.getByRole("button", { name: "Save tag" }));
  expect(await screen.findByText("Finance")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Delete Finance" }));
  await user.click(screen.getByRole("button", { name: "Delete tag" }));
  expect(screen.queryByText("Finance")).not.toBeInTheDocument();
});

it("keeps creation available at the soft tag limit and explains the guidance", async () => {
  const capabilities = galleryTagManagement();
  const tags: ReadTagsResult["tags"] = Array.from(
    { length: 50 },
    (_, index) => ({
      id: `tag-${index}`,
      name: `Tag ${index + 1}`,
      groupId: "other",
      color: "gray",
      shade: 500,
      createdAt: index,
      versionVector: { gallery: 1 },
      entryCount: 0,
    }),
  );
  capabilities.read = async () => ({
    tags,
    tagGroups: tagGroupPresentations,
    softLimit: 50,
    softLimitReached: true,
  });

  render(
    <TagManagementView vaultId="gallery-vault" capabilities={capabilities} />,
  );

  expect(await screen.findByText("50 tags in this vault")).toBeVisible();
  expect(
    screen.getByText(
      "The suggested limit is 50. Reuse an existing tag or remove an unused one when possible.",
    ),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "New tag" })).toBeEnabled();
});

it("clears loaded tags and the editor when a mutation reports lost authorization", async () => {
  const capabilities = galleryTagManagement();
  const onSessionLost = vi.fn();
  capabilities.update = async () => {
    const error = new Error("session ended");
    error.name = "UnlockedVaultSessionExpiredError";
    throw error;
  };
  const user = userEvent.setup();
  render(
    <TagManagementView
      vaultId="gallery-vault"
      capabilities={capabilities}
      onSessionLost={onSessionLost}
    />,
  );

  await user.click(
    await screen.findByRole("button", { name: "Edit Personal" }),
  );
  await user.click(screen.getByRole("button", { name: "Save tag" }));

  expect(onSessionLost).toHaveBeenCalledOnce();
  expect(screen.queryByText("Personal")).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Edit tag" })).toBeNull();
  expect(
    screen.getByText("Unlock this vault again before changing tags."),
  ).toBeVisible();
});

it("clears a canceled save error and reads group details from the vault", async () => {
  const capabilities = galleryTagManagement("tags-live-groups");
  capabilities.update = vi.fn(async () => {
    throw new Error("Save failed");
  });
  const user = userEvent.setup();
  render(
    <TagManagementView vaultId="gallery-vault" capabilities={capabilities} />,
  );
  expect(await screen.findByText("Account status")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Edit MFA enabled" }));
  expect(screen.getByRole("radio", { name: "Account status" })).toBeChecked();
  await user.click(screen.getByRole("button", { name: "Save tag" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The tag could not be saved",
  );
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("alert")).toBeNull();
  await user.click(screen.getByRole("button", { name: "New tag" }));
  expect(screen.queryByRole("alert")).toBeNull();
});

it("uses the successful authorization recheck after a temporary tag read failure", async () => {
  const onSessionLost = vi.fn();
  render(
    <TagManagementView
      vaultId="gallery-vault"
      capabilities={galleryTagManagement("tags-read-retry")}
      onSessionLost={onSessionLost}
    />,
  );
  expect(await screen.findByText("Personal")).toBeVisible();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(onSessionLost).not.toHaveBeenCalled();
});
