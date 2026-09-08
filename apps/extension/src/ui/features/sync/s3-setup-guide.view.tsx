import { useId, useState, type ReactNode } from "react";
import templateUrl from "../../../../../../providers/aws/s3.template.yaml?url";
import { Button } from "@/ui/components/primitives/button";
import { Textarea } from "@/ui/components/primitives/textarea";
import { TextField } from "@/ui/components/forms/fields.view";
import { CopyAction } from "@/ui/components/feedback/action-feedback.view";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/ui/components/primitives/tabs";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/ui/components/primitives/accordion";
import type { OperationState } from "@/ui/components/forms/form-state.type";
import type { SyncLocation } from "./sync.type";
import { s3SetupDocuments } from "./s3-setup-documents";

function SetupLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button
      variant="outline"
      nativeButton={false}
      render={<a href={href} target="_blank" rel="noreferrer" />}
    >
      {children}
    </Button>
  );
}
function SetupCopy({
  title,
  value,
  onCopy,
}: {
  title: string;
  value: string;
  onCopy: (value: string) => Promise<void>;
}) {
  const id = useId();
  const [state, setState] = useState<OperationState>("idle");
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <label htmlFor={id} className="block text-sm font-medium">
          {title}
        </label>
        <Textarea
          id={id}
          readOnly
          value={value}
          rows={value.includes("\n") ? 8 : 2}
          className="field-sizing-fixed resize-y p-3 font-mono text-xs leading-relaxed"
          spellCheck={false}
        />
      </div>
      <CopyAction
        state={state}
        label={`Copy ${title.toLowerCase()}`}
        onCopy={() => {
          setState("pending");
          void onCopy(value).then(
            () => setState("success"),
            () => setState("error"),
          );
        }}
      />
    </div>
  );
}
function SetupStep({
  value,
  title,
  children,
}: {
  value: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <AccordionItem value={value}>
      <AccordionTrigger className="text-base hover:no-underline">
        {title}
      </AccordionTrigger>
      <AccordionContent className="space-y-5 text-sm leading-relaxed [&_a]:no-underline">
        {children}
      </AccordionContent>
    </AccordionItem>
  );
}
export function S3SetupGuide({
  origin,
  location,
  onLocationChange,
  onCopy,
  onContinue,
}: {
  origin: string;
  location: SyncLocation;
  onLocationChange: (location: SyncLocation) => void;
  onCopy: (value: string) => Promise<void>;
  onContinue: () => void;
}) {
  const { documents: docs, error } = s3SetupDocuments(location, origin);
  const documentError = error
    ? {
        bucket:
          "In step 1, enter a bucket name with 3–63 lowercase letters, numbers or hyphens, starting and ending with a letter or number.",
        prefix:
          "In step 1, enter a prefix of up to 128 characters, starting with a letter or number and ending with /. Use only letters, numbers, single / separators, _ or -.",
        origin:
          "Open this setup page from the installed extension so its browser origin can be included in the access configuration.",
      }[error]
    : undefined;
  return (
    <section className="space-y-6" aria-label="S3 storage setup">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Set up S3 storage</h2>
        <Button variant="ghost" onClick={onContinue}>
          I already have storage
        </Button>
      </div>
      <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">
        <li>
          Use an AWS account where you can create an S3 bucket, IAM user and
          policy. Enable MFA for the account you use to manage AWS.
        </li>
        <li>
          AWS bills your account for storage and requests.{" "}
          <a
            className="text-primary"
            href="https://aws.amazon.com/s3/pricing/"
            target="_blank"
            rel="noreferrer"
          >
            Check S3 pricing
          </a>
          .
        </li>
        <li>
          Use a dedicated bucket or prefix for this vault. Keep all public
          access blocked.
        </li>
      </ul>
      <Tabs defaultValue="template">
        <TabsList aria-label="S3 setup method" className="w-full">
          <TabsTrigger value="template">Use template</TabsTrigger>
          <TabsTrigger value="manual">AWS Console</TabsTrigger>
        </TabsList>
        <TabsContent value="template" className="pt-4">
          <Accordion defaultValue={["stack"]} multiple>
            <SetupStep value="stack" title="1. Create the storage stack">
              <p>
                The template creates a private, versioned bucket and an IAM user
                restricted to your vault prefix. It configures encryption, CORS
                and HTTPS-only access. Access keys are created separately.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<a href={templateUrl} download="s3.template.yaml" />}
                >
                  Download S3 template
                </Button>
                <SetupLink href="https://console.aws.amazon.com/cloudformation/">
                  Open CloudFormation
                </SetupLink>
              </div>
              <ol className="list-decimal space-y-3 pl-5">
                <li>
                  Select the AWS Region where you want to store your vault.
                </li>
                <li>
                  Choose <strong>Create stack → With new resources</strong>.
                  Select{" "}
                  <strong>
                    Choose an existing template → Upload a template file
                  </strong>{" "}
                  and upload the downloaded file.
                </li>
                <li>
                  Give the stack a name, such as <code>lfspm-sync</code>. Set
                  the parameters below.
                </li>
              </ol>
              <dl className="grid gap-4 rounded-lg bg-muted/30 p-4">
                <div>
                  <dt className="font-medium">BucketName</dt>
                  <dd>
                    A new, globally unique name using lowercase letters, numbers
                    and hyphens. This template creates a bucket; it does not
                    attach an existing one.
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">ExtensionOrigins</dt>
                  <dd>
                    Paste the origin shown below. If another device has a
                    different extension ID, add its origin separated by a comma.
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">ObjectPrefix</dt>
                  <dd>
                    Use <code>vault/</code> for this vault. Keep the same prefix
                    on each device.
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">IamUserName</dt>
                  <dd>
                    Choose a unique name, such as <code>lfspm-sync-user</code>.
                    This user only needs programmatic access.
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">Lifecycle settings</dt>
                  <dd>
                    The defaults delete old object versions after 30 days and
                    abort unfinished uploads after 7 days. Disable lifecycle
                    cleanup if you need to retain old versions longer; retained
                    versions add storage costs.
                  </dd>
                </div>
              </dl>
              <SetupCopy
                key={origin}
                title="Extension origin"
                value={origin}
                onCopy={onCopy}
              />
              <p>
                Review the resources, acknowledge creation of named IAM
                resources, then submit. Wait for <code>CREATE_COMPLETE</code>.
                In <strong>Outputs</strong>, keep <code>BucketNameOut</code>,{" "}
                <code>RegionOut</code>, <code>PrefixOut</code> and{" "}
                <code>IamUserNameOut</code>.
              </p>
              <SetupLink href="https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cfn-console-create-stack.html">
                AWS stack instructions
              </SetupLink>
            </SetupStep>
            <SetupStep value="keys" title="2. Create access keys">
              <AccessKeyInstructions />
            </SetupStep>
            <SetupStep value="connect" title="3. Connect this vault">
              <ConnectionInstructions onContinue={onContinue} />
            </SetupStep>
          </Accordion>
        </TabsContent>
        <TabsContent value="manual" className="pt-4">
          <Accordion defaultValue={["bucket"]} multiple>
            <SetupStep value="bucket" title="1. Create a private bucket">
              <SetupLink href="https://console.aws.amazon.com/s3/">
                Open Amazon S3
              </SetupLink>
              <ol className="list-decimal space-y-3 pl-5">
                <li>
                  Choose <strong>Create bucket</strong>, select an AWS Region
                  and use a <strong>General purpose</strong> bucket.
                </li>
                <li>
                  Choose a unique name. Keep <strong>ACLs disabled</strong> and
                  every <strong>Block Public Access</strong> setting enabled.
                </li>
                <li>
                  Enable <strong>Bucket Versioning</strong>. For default
                  encryption, use{" "}
                  <strong>Amazon S3 managed keys, SSE-S3</strong>. Custom KMS
                  keys need additional permissions that this setup does not
                  grant.
                </li>
                <li>
                  Create the bucket and record its name and region below. Choose
                  a dedicated prefix ending in <code>/</code>; S3 does not
                  require you to create a folder first.
                </li>
              </ol>
              <div className="grid gap-4 @lg:grid-cols-2">
                <TextField
                  label="S3 bucket name"
                  value={location.bucket}
                  onChange={(e) =>
                    onLocationChange({ ...location, bucket: e.target.value })
                  }
                  description="3–63 lowercase letters, numbers or hyphens."
                />
                <TextField
                  label="S3 region"
                  value={location.region}
                  onChange={(e) =>
                    onLocationChange({ ...location, region: e.target.value })
                  }
                  description="The bucket's region code, for example eu-central-1."
                />
                <TextField
                  label="Vault object prefix"
                  value={location.prefix}
                  onChange={(e) =>
                    onLocationChange({ ...location, prefix: e.target.value })
                  }
                  description="Use letters, numbers, single / separators, _ or -. End with /; do not use wildcards."
                />
              </div>
              <SetupLink href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/create-bucket-overview.html">
                AWS bucket instructions
              </SetupLink>
            </SetupStep>
            <SetupStep
              value="cors"
              title="2. Allow this extension and require HTTPS"
            >
              <p>
                Open the bucket's{" "}
                <strong>
                  Permissions → Cross-origin resource sharing, CORS → Edit
                </strong>
                . Save the CORS JSON below. It permits this extension origin; it
                does not make the bucket public or replace IAM permissions.
              </p>
              {docs ? (
                <SetupCopy
                  key={docs.cors}
                  title="CORS configuration"
                  value={docs.cors}
                  onCopy={onCopy}
                />
              ) : (
                <p role="status">{documentError}</p>
              )}
              <p>
                Then open <strong>Permissions → Bucket policy → Edit</strong>{" "}
                and save the HTTPS-only policy below. Use it for the new
                dedicated bucket. If the bucket already has a policy, merge this
                statement instead of replacing existing restrictions.
              </p>
              {docs ? (
                <SetupCopy
                  key={docs.tls}
                  title="Bucket policy"
                  value={docs.tls}
                  onCopy={onCopy}
                />
              ) : (
                <p role="status">{documentError}</p>
              )}
              <p>
                For each additional device, add its extension origin to{" "}
                <code>AllowedOrigins</code>. Keep public access blocked.
              </p>
              <SetupLink href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/enabling-cors-examples.html">
                AWS CORS instructions
              </SetupLink>
            </SetupStep>
            <SetupStep
              value="iam"
              title="3. Restrict an IAM user to this vault"
            >
              <SetupLink href="https://console.aws.amazon.com/iam/">
                Open IAM
              </SetupLink>
              <ol className="list-decimal space-y-3 pl-5">
                <li>
                  In <strong>Policies → Create policy</strong>, choose the JSON
                  editor and paste the access policy below. Save it with a name
                  such as <code>lfspm-vault-access</code>.
                </li>
                <li>
                  In <strong>Users → Create user</strong>, create a dedicated
                  user without AWS Console access.
                </li>
                <li>
                  Attach only the policy you created. Do not attach{" "}
                  <code>AdministratorAccess</code> or{" "}
                  <code>AmazonS3FullAccess</code>.
                </li>
              </ol>
              {docs ? (
                <SetupCopy
                  key={docs.policy}
                  title="IAM access policy"
                  value={docs.policy}
                  onCopy={onCopy}
                />
              ) : (
                <p role="status">{documentError}</p>
              )}
            </SetupStep>
            <SetupStep value="keys" title="4. Create access keys">
              <AccessKeyInstructions />
            </SetupStep>
            <SetupStep value="connect" title="5. Connect this vault">
              <ConnectionInstructions
                onContinue={onContinue}
                disabled={!docs}
              />
              {!docs ? <p role="status">{documentError}</p> : null}
            </SetupStep>
          </Accordion>
        </TabsContent>
      </Tabs>
      <Accordion>
        <SetupStep value="help" title="Troubleshoot setup">
          <dl className="space-y-4">
            <div>
              <dt className="font-medium">The stack failed</dt>
              <dd>
                Read the failed resource in CloudFormation Events. Check for a
                bucket or IAM user name already in use, or missing deployment
                permissions.
              </dd>
            </div>
            <div>
              <dt className="font-medium">
                Access denied or connection failed
              </dt>
              <dd>
                Check the region, bucket, prefix and access keys. Confirm the
                IAM policy is attached and CORS includes the exact origin of
                this extension. Keep Block Public Access enabled.
              </dd>
            </div>
            <div>
              <dt className="font-medium">
                Access passes, but uploading fails
              </dt>
              <dd>
                Test access checks reads only. Enabling sync also requires
                PutObject permission and CORS support for PUT and request
                headers.
              </dd>
            </div>
          </dl>
        </SetupStep>
      </Accordion>
    </section>
  );
}
function AccessKeyInstructions() {
  return (
    <div className="space-y-4">
      <SetupLink href="https://console.aws.amazon.com/iam/">Open IAM</SetupLink>
      <ol className="list-decimal space-y-3 pl-5">
        <li>
          Open <strong>Users</strong> and select the dedicated sync user. With
          the template, use the name from <code>IamUserNameOut</code>.
        </li>
        <li>
          Open{" "}
          <strong>
            Security credentials → Access keys → Create access key
          </strong>
          . Review AWS's guidance and choose the applicable use case, or{" "}
          <strong>Other</strong>.
        </li>
        <li>
          Create the key and keep the result open while entering the access key
          ID and secret access key in the extension.
        </li>
      </ol>
      <p>
        AWS reveals the secret only when the key is created. Never use root or
        administrator access keys for sync. Do not put keys in the template, a
        screenshot or a support message. If you download a CSV, remove the
        unencrypted copy after saving the key securely.
      </p>
      <SetupLink href="https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys_update.html">
        AWS access-key instructions
      </SetupLink>
    </div>
  );
}
function ConnectionInstructions({
  onContinue,
  disabled = false,
}: {
  onContinue: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-3 pl-5">
        <li>
          Enter the bucket, region, prefix and access keys in the connection
          form. For a template deployment, use the stack Outputs.
        </li>
        <li>
          Choose <strong>Test access</strong>. This checks read access without
          uploading the vault.
        </li>
        <li>
          Choose <strong>Enable sync</strong> to save the credentials on this
          device and upload the encrypted vault. If the upload is pending, use
          Retry upload.
        </li>
      </ol>
      <p>
        Each device stores its own encrypted access keys. Keys are not
        transferred with the vault. Keep recovery data outside this vault; S3
        sync is not a substitute for recovery material.
      </p>
      <Button disabled={disabled} onClick={onContinue}>
        Enter connection details
      </Button>
    </div>
  );
}
