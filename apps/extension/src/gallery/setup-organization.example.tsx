import { useState } from "react";
import { globalLibrarySchema } from "@lfspm/core";
import organizationLibrary from "@/assets/data/global-library.json";
import { SetupOrganization } from "@/ui/features/vault-setup/setup-organization.view";
import { createOrganizationSetupDraft } from "@/ui/features/vault-setup/setup-organization";

export function SetupOrganizationExample({ pending }: { pending: boolean }) {
  const [library] = useState(() =>
    globalLibrarySchema.parse(organizationLibrary),
  );
  const [value, setValue] = useState(() =>
    createOrganizationSetupDraft(library, library.templates[0]?.id ?? null),
  );
  return (
    <SetupOrganization
      library={library}
      value={value}
      onChange={setValue}
      pending={pending}
      error={pending ? undefined : "Could not create the vault. Try again."}
      onBack={() => {}}
      onContinue={() => {}}
    />
  );
}
