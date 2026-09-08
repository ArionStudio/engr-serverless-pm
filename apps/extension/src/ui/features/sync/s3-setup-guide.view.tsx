import "./s3-setup-guide.css";
import { useId, useState, type ReactNode } from "react";
import templateUrl from "../../../../../../providers/aws/s3.template.yaml?url";
import { GuidancePanel } from "@/ui/components/feedback/guidance-panel.view";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/ui/components/primitives/native-select";
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
import { SetupChecklist, SetupStage } from "./setup-checklist.view";
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
  location,
  onLocationChange,
  onCopy,
  connection,
  busy = false,
}: {
  location: SyncLocation;
  onLocationChange: (location: SyncLocation) => void;
  onCopy: (value: string) => Promise<void>;
  connection: (onEditLocation?: () => void) => ReactNode;
  busy?: boolean;
}) {
  const [existingStorage, setExistingStorage] = useState(false);
  const [method, setMethod] = useState("template");
  const { documents: docs, error: documentField } = s3SetupDocuments(location);
  const locationKey = JSON.stringify(location);
  const validRegion = /^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(location.region);
  const locationErrors: Partial<Record<keyof SyncLocation, string>> = {
    bucket:
      documentField === "bucket"
        ? "Enter 3–63 lowercase letters, numbers, dots or hyphens. Start and end with a letter or number. Avoid consecutive dots, IP addresses and AWS-reserved prefixes or suffixes."
        : undefined,
    region: validRegion
      ? undefined
      : "Enter an AWS region code, for example eu-central-1.",
    prefix:
      documentField === "prefix"
        ? "Enter up to 128 letters, numbers, /, _ or -. Start with a letter or number, end with / and use single / separators."
        : undefined,
  };
  const validLocation = !!docs && validRegion;
  const documentError = documentField
    ? locationErrors[documentField]
    : undefined;
  const [stackStatus, setStackStatus] = useState("waiting");
  const statusId = useId();
  return (
    <section
      className="s3-setup-guide @container/s3 space-y-6"
      aria-label="S3 storage setup"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Set up S3 storage</h2>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => setExistingStorage(!existingStorage)}
        >
          {existingStorage ? "Back to setup guide" : "I already have storage"}
        </Button>
      </div>
      {existingStorage ? (
        <div className="mx-auto max-w-3xl">{connection()}</div>
      ) : null}
      <div hidden={existingStorage} className="space-y-6">
        <details className="border-b pb-4 text-base leading-7">
          <summary className="cursor-pointer font-medium">
            Before you start
          </summary>
          <ul className="mt-4 list-disc space-y-2 pl-5">
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
        </details>
        <Tabs
          value={method}
          onValueChange={(value) => {
            if (!busy) setMethod(String(value));
          }}
        >
          <TabsList aria-label="S3 setup method" className="w-full">
            <TabsTrigger value="template" disabled={busy}>
              Use template
            </TabsTrigger>
            <TabsTrigger value="manual" disabled={busy}>
              AWS Console
            </TabsTrigger>
          </TabsList>
          <TabsContent value="template" keepMounted className="pt-4">
            <SetupChecklist
              label="Template setup steps"
              locationKey={locationKey}
              locationStep={4}
              busy={busy}
              renderConnection={
                !existingStorage && method === "template"
                  ? connection
                  : undefined
              }
            >
              <SetupStage
                title="Upload template"
                confirmation="I uploaded the template"
              >
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    nativeButton={false}
                    render={
                      <a href={templateUrl} download="s3.template.yaml" />
                    }
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
                    Choose{" "}
                    <strong>
                      Create stack → With new resources (standard)
                    </strong>
                    . Select{" "}
                    <strong>
                      Choose an existing template → Upload a template file
                    </strong>{" "}
                    and upload the downloaded file.
                  </li>
                </ol>
                <GuidancePanel title="What the template creates">
                  <p>
                    The template creates a private, versioned bucket and an IAM
                    user restricted to your vault prefix. It configures
                    encryption and HTTPS-only access. Access keys are created
                    separately.
                  </p>
                </GuidancePanel>
              </SetupStage>
              <SetupStage
                title="Set parameters"
                confirmation="I entered the parameters"
              >
                <p>
                  Give the stack a name, such as <code>lfspm-sync</code>, and
                  set these parameters.
                </p>
                <dl className="grid gap-4 rounded-lg bg-muted/30 p-4">
                  <div>
                    <dt className="font-medium">BucketName</dt>
                    <dd>
                      A new, globally unique name using lowercase letters,
                      numbers and hyphens. This template creates a bucket; it
                      does not attach an existing one.
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium">ObjectPrefix</dt>
                    <dd>
                      Use <code>vault/</code> for this vault. Keep the same
                      prefix on each device.
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium">IamUserName</dt>
                    <dd>
                      Choose a unique name, such as <code>lfspm-sync-user</code>
                      . This user only needs programmatic access.
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium">Lifecycle settings</dt>
                    <dd>
                      The defaults delete old object versions after 30 days and
                      abort unfinished uploads after 7 days. Disable lifecycle
                      cleanup if you need to retain old versions longer;
                      retained versions add storage costs.
                    </dd>
                  </div>
                </dl>
              </SetupStage>
              <SetupStage
                title="Deploy stack"
                confirmation="I submitted the stack"
              >
                <ol className="list-decimal space-y-3 pl-5">
                  <li>
                    Leave the optional <strong>IAM role</strong> blank unless
                    your account requires a CloudFormation service role.
                  </li>
                  <li>
                    Leave <strong>Express mode</strong> off. Keep{" "}
                    <strong>Roll back all resources</strong> and{" "}
                    <strong>Use deletion policy</strong> selected.
                  </li>
                  <li>
                    Keep deployment validations enabled and leave the additional
                    settings unchanged.
                  </li>
                  <li>
                    Review the resources and acknowledge that CloudFormation may
                    create IAM resources with custom names.
                  </li>
                  <li>
                    Choose <strong>Next</strong>, review the parameters, then{" "}
                    <strong>Submit</strong>.
                  </li>
                </ol>
                <p>
                  The template creates a dedicated sync user. The optional
                  deployment role is a separate identity used by CloudFormation.
                </p>
                <SetupLink href="https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cfn-console-create-stack.html">
                  AWS stack instructions
                </SetupLink>
              </SetupStage>
              <SetupStage
                title="Check stack status"
                confirmation="Stack shows CREATE_COMPLETE"
                canContinue={stackStatus === "complete"}
              >
                <p>
                  Open <strong>Stack info</strong> in CloudFormation and check
                  the status. Confirmations here record what you checked in AWS.
                </p>
                <div className="space-y-2">
                  <label htmlFor={statusId} className="block font-medium">
                    Status shown in CloudFormation
                  </label>
                  <NativeSelect
                    id={statusId}
                    value={stackStatus}
                    onChange={(event) => setStackStatus(event.target.value)}
                    className="w-full"
                  >
                    <NativeSelectOption value="waiting">
                      CREATE_IN_PROGRESS / still deploying
                    </NativeSelectOption>
                    <NativeSelectOption value="complete">
                      CREATE_COMPLETE
                    </NativeSelectOption>
                    <NativeSelectOption value="failed">
                      CREATE_FAILED / ROLLBACK
                    </NativeSelectOption>
                  </NativeSelect>
                </div>
                <div role="status">
                  <GuidancePanel
                    variant={stackStatus === "failed" ? "warning" : "info"}
                    title={
                      stackStatus === "failed"
                        ? "Deployment needs attention"
                        : stackStatus === "waiting"
                          ? "Wait for the stack to finish"
                          : "Collect the stack Outputs"
                    }
                  >
                    <p>
                      {stackStatus === "waiting"
                        ? "Wait for deployment to finish, then refresh Stack info. Outputs are unavailable while the stack is in progress."
                        : stackStatus === "failed"
                          ? "Open Events and read the failed resource's Status reason. Resolve that error before continuing. Check for a bucket or IAM user name already in use, or missing deployment permissions."
                          : "Open Outputs to collect the bucket, region, prefix and dedicated IAM user name."}
                    </p>
                  </GuidancePanel>
                </div>
              </SetupStage>
              <SetupStage
                title="Record Outputs"
                confirmation="I copied the stack Outputs"
                canContinue={validLocation}
              >
                <p>
                  Copy <code>BucketNameOut</code>, <code>RegionOut</code> and{" "}
                  <code>PrefixOut</code> into these fields. Keep{" "}
                  <code>IamUserNameOut</code> for the next step.
                </p>
                <SetupLocation
                  location={location}
                  onChange={onLocationChange}
                  errors={locationErrors}
                />
                <p>
                  If Outputs is empty, check the stack status first. After{" "}
                  <code>CREATE_COMPLETE</code>, refresh Outputs. If it remains
                  empty, open Template and check that the uploaded file contains
                  an <code>Outputs</code> section. This template defines those
                  four values and <code>TemplateVersion</code>.
                </p>
                <SetupLink href="https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/outputs-section-structure.html">
                  AWS Outputs instructions
                </SetupLink>
              </SetupStage>
              <SetupStage title="Connect vault">
                <details className="border-b pb-5">
                  <summary className="cursor-pointer font-medium">
                    Create access keys in AWS
                  </summary>
                  <div className="mt-5">
                    <AccessKeyInstructions />
                  </div>
                </details>
              </SetupStage>
            </SetupChecklist>
          </TabsContent>
          <TabsContent value="manual" keepMounted className="pt-4">
            <SetupChecklist
              label="Manual setup steps"
              locationKey={locationKey}
              locationStep={0}
              busy={busy}
              renderConnection={
                !existingStorage && method === "manual" ? connection : undefined
              }
            >
              <SetupStage
                title="Create a private bucket"
                confirmation="I created this private bucket"
                canContinue={validLocation}
              >
                <SetupLink href="https://console.aws.amazon.com/s3/">
                  Open Amazon S3
                </SetupLink>
                <ol className="list-decimal space-y-3 pl-5">
                  <li>
                    Choose <strong>Create bucket</strong>, select an AWS Region
                    and use a <strong>General purpose</strong> bucket.
                  </li>
                  <li>
                    Choose a unique name. Keep <strong>ACLs disabled</strong>{" "}
                    and every <strong>Block Public Access</strong> setting
                    enabled.
                  </li>
                  <li>
                    Enable <strong>Bucket Versioning</strong>. For default
                    encryption, use{" "}
                    <strong>Amazon S3 managed keys, SSE-S3</strong>. Custom KMS
                    keys need additional permissions that this setup does not
                    grant.
                  </li>
                  <li>
                    Create the bucket and record its name and region below.
                    Choose a dedicated prefix ending in <code>/</code>; S3 does
                    not require you to create a folder first.
                  </li>
                </ol>
                <SetupLocation
                  location={location}
                  onChange={onLocationChange}
                  errors={locationErrors}
                />
                <SetupLink href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/create-bucket-overview.html">
                  AWS bucket instructions
                </SetupLink>
              </SetupStage>
              <SetupStage
                title="Require HTTPS"
                confirmation="I saved the HTTPS policy"
              >
                <p>
                  Open <strong>Permissions → Bucket policy → Edit</strong> and
                  save the HTTPS-only policy below. Use it for the new dedicated
                  bucket. If the bucket already has a policy, merge this
                  statement instead of replacing existing restrictions.
                </p>
                {docs ? (
                  <SetupCopy
                    key={docs.tls}
                    title="Bucket policy"
                    value={docs.tls}
                    onCopy={onCopy}
                  />
                ) : null}
              </SetupStage>
              <SetupStage
                title="Restrict the IAM user"
                confirmation="I attached the scoped policy to the user"
              >
                <SetupLink href="https://console.aws.amazon.com/iam/">
                  Open IAM
                </SetupLink>
                <ol className="list-decimal space-y-3 pl-5">
                  <li>
                    In <strong>Policies → Create policy</strong>, choose the
                    JSON editor and paste the access policy below. Save it with
                    a name such as <code>lfspm-vault-access</code>.
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
                  <p role="status">
                    {documentError} Correct the field in step 1 before creating
                    the policy.
                  </p>
                )}
              </SetupStage>
              <SetupStage title="Connect vault">
                <details className="border-b pb-5">
                  <summary className="cursor-pointer font-medium">
                    Create access keys in AWS
                  </summary>
                  <div className="mt-5">
                    <AccessKeyInstructions />
                  </div>
                </details>
              </SetupStage>
            </SetupChecklist>
          </TabsContent>
        </Tabs>
        <Accordion>
          <SetupStep value="help" title="Troubleshoot setup">
            <dl className="space-y-4">
              <div>
                <dt className="font-medium">
                  IAM policies are unsupported for Import
                </dt>
                <dd>
                  Start again with Create stack → With new resources (standard),
                  then upload the template. Import is for resources that already
                  exist.
                </dd>
              </div>
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
                  IAM policy is attached and allow storage access in this
                  browser. Keep Block Public Access enabled.
                </dd>
              </div>
              <div>
                <dt className="font-medium">
                  Access passes, but uploading fails
                </dt>
                <dd>
                  Test access checks reads only. Enabling sync also requires
                  PutObject permission for the configured vault prefix.
                </dd>
              </div>
            </dl>
          </SetupStep>
        </Accordion>
      </div>
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
          .
        </li>
        <li>
          Select <strong>Application running outside AWS</strong>. LFSPM
          accesses S3 from your browser. Review AWS's alternatives, acknowledge
          access-key creation if asked, then choose <strong>Next</strong>.
        </li>
        <li>
          <strong>Description tag value</strong> is optional. Use it to identify
          this device's key when reviewing or replacing access keys. Example:{" "}
          <code>LFSPM sync - My laptop</code>.
        </li>
        <li>
          Create the key and keep the result open while entering the access key
          ID and secret access key in the extension.
        </li>
      </ol>
      <GuidancePanel
        variant="warning"
        title="Keep the secret access key private"
      >
        <p>
          AWS reveals the secret only when the key is created. Keep it available
          until you have entered it in the extension.
        </p>
        <ul>
          <li>
            Use the dedicated sync user's keys. Never use root or administrator
            access keys.
          </li>
          <li>
            Do not put keys in the template, screenshots or support messages.
          </li>
          <li>
            If you download a CSV, remove the unencrypted copy after saving the
            key securely.
          </li>
        </ul>
      </GuidancePanel>
      <SetupLink href="https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys_update.html">
        AWS access-key instructions
      </SetupLink>
    </div>
  );
}
function SetupLocation({
  location,
  onChange,
  errors,
}: {
  location: SyncLocation;
  onChange: (location: SyncLocation) => void;
  errors: Partial<Record<keyof SyncLocation, string>>;
}) {
  return (
    <div className="grid gap-4 @lg:grid-cols-2">
      <TextField
        label="S3 bucket name"
        value={location.bucket}
        onChange={(e) => onChange({ ...location, bucket: e.target.value })}
        description="3–63 lowercase letters, numbers, dots or hyphens. Avoid consecutive dots and IP addresses."
        error={errors.bucket}
      />
      <TextField
        label="S3 region"
        value={location.region}
        onChange={(e) => onChange({ ...location, region: e.target.value })}
        description="The bucket's region code, for example eu-central-1."
        error={errors.region}
      />
      <TextField
        label="Vault object prefix"
        value={location.prefix}
        onChange={(e) => onChange({ ...location, prefix: e.target.value })}
        description="Use letters, numbers, single / separators, _ or -. End with /; do not use wildcards."
        error={errors.prefix}
      />
    </div>
  );
}
