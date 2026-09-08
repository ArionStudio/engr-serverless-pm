import { useState } from "react";
import { globalLibrarySchema } from "@lfspm/core";
import organizationLibrary from "@/assets/data/global-library.json";
import { SetupOrganization } from "@/ui/features/vault-setup/setup-organization.view";
import { createOrganizationSetupDraft } from "@/ui/features/vault-setup/setup-organization";

export function SetupOrganizationExample({
  pending,
  nameConflicts = false,
}: {
  pending: boolean;
  nameConflicts?: boolean;
}) {
  const [library] = useState(() =>
    globalLibrarySchema.parse(organizationLibrary),
  );
  const [value, setValue] = useState(() => {
    const draft = createOrganizationSetupDraft(
      library,
      library.templates[0]?.id ?? null,
    );
    if (!nameConflicts) return draft;
    return {
      ...draft,
      folders: draft.folders.map((folder, index) =>
        index === 1 ? { ...folder, name: "ｗｏｒｋ" } : folder,
      ),
      tags: draft.tags.map((tag, index) =>
        index === 1 ? { ...tag, name: draft.tags[0]!.name.toUpperCase() } : tag,
      ),
    };
  });
  return (
    <SetupOrganization
      library={library}
      value={value}
      onChange={setValue}
      pending={pending}
      error={
        pending || nameConflicts
          ? undefined
          : "Could not create the vault. Try again."
      }
      onBack={() => {}}
      onContinue={() => {}}
    />
  );
}
