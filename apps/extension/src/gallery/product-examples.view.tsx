import { SiteIconsExample } from "./site-icons.example";
import { PASSWORD_ENTRY_TAG_LIMIT } from "@lfspm/core";
import setupScreenshot from "./s3-setup-outputs.png";
import { GuidancePanel } from "@/ui/components/feedback/guidance-panel.view";
import { EntryDetailsExample, SiteIconExample } from "./entry-widgets.example";
import { vaultLockOptions } from "@/ui/lib/vault-lock-options";
import { EntryTableExample } from "./entry-table-example.view";
import { useState, useEffect } from "react";
import { Button } from "@/ui/components/primitives/button";
import {
  StepNavigation,
  SetupLayout,
  SettingsSection,
  SafetyHelp,
  EmptyState,
  DetailField,
} from "@/ui/components/layout/sections.view";
import {
  PasswordField,
  PasswordStrengthFeedback,
  LockDurationField,
  TextField,
} from "@/ui/components/forms/fields.view";
import {
  SecretField,
  CopyAction,
  ActionFeedback,
} from "@/ui/components/feedback/action-feedback.view";
import { DestructiveConfirmation } from "@/ui/components/feedback/destructive-confirmation.view";
import {
  AppNavigation,
  VaultToolbar,
} from "@/ui/entrypoints/components/app-navigation.view";
import { ThemeToggle } from "@/ui/features/theme";
import type { ThemePreference } from "@/ui/features/theme";
import { VaultPicker } from "@/ui/features/vault-access";
import {
  SearchField,
  parseEntrySearch,
  matchesEntrySearch,
  EntrySelection,
  TagSelection,
} from "@/ui/features/entries";
import {
  RecoveryPhraseGrid,
  RecoveryExportChoices,
  RecoveryGuide,
  RecoveryWordInput,
  RecoveryVerification,
} from "@/ui/features/recovery";
import {
  GeneratorControls,
  UsernameControls,
  GeneratedValue,
  type PasswordSettings,
} from "@/ui/features/password-tools";
import { SyncStatus, SyncReview, type Resolution } from "@/ui/features/sync";
import {
  DeviceSummary,
  TransferInput,
  TransferOutput,
} from "@/ui/features/devices";
import {
  demoEntries,
  demoTagLabels,
  demoVaults,
  demoTags,
  demoWords,
} from "./fixtures";
import { Specimen, Scenario } from "./specimen.view";
const steps = [
  { id: "password", label: "Password", state: "complete", allowed: true },
  { id: "recovery", label: "Recovery", state: "upcoming", allowed: true },
  { id: "device", label: "Device", state: "upcoming", allowed: false },
] as const;
export function SharedExamples() {
  const [step, setStep] = useState("recovery");
  const [password, setPassword] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [lock, setLock] = useState(600_000);
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [secret, setSecret] = useState(false);
  const [notice, setNotice] = useState("");
  const [route, setRoute] = useState("entries");
  const [locked, setLocked] = useState(false);
  return (
    <div className="review-grid grid gap-x-8 gap-y-10">
      <Specimen
        id="P29"
        name="GuidancePanel"
        owner="Shared presentation · components/feedback"
        wide
      >
        <Scenario
          label="Guidance content"
          options={
            ["long", "short", "links-and-image", "grouped-info"] as const
          }
        >
          {(content) => (
            <div className="grid items-start gap-5 @3xl:grid-cols-2">
              <GuidancePanel
                title="What the template creates"
                links={
                  content === "links-and-image" ? (
                    <>
                      <a
                        href="https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cfn-console-create-stack.html"
                        target="_blank"
                        rel="noreferrer"
                      >
                        AWS stack instructions ↗
                      </a>
                      <a
                        href="https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/outputs-section-structure.html"
                        target="_blank"
                        rel="noreferrer"
                      >
                        AWS Outputs reference ↗
                      </a>
                    </>
                  ) : undefined
                }
                attachments={
                  content === "links-and-image" ? (
                    <figure>
                      <a
                        href={setupScreenshot}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Open setup screenshot at full size"
                      >
                        <img
                          src={setupScreenshot}
                          alt="Extension S3 guide showing bucket, region and prefix fields in the Record Outputs step."
                          loading="lazy"
                          width={1000}
                          height={850}
                        />
                      </a>
                      <figcaption>
                        Record the stack Outputs in the extension. Open the
                        image for full size.
                      </figcaption>
                    </figure>
                  ) : undefined
                }
              >
                {content === "grouped-info" ? (
                  <dl className="space-y-4">
                    <div>
                      <dt className="font-semibold">Stored in S3</dt>
                      <dd>
                        The encrypted vault and its previous object versions.
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Kept on this device</dt>
                      <dd>
                        Your encrypted access keys. Enter keys separately on
                        each device.
                      </dd>
                    </div>
                  </dl>
                ) : null}
                <p>
                  The template creates a private, versioned bucket and an IAM
                  user restricted to your vault prefix.
                </p>
                {content === "long" ? (
                  <>
                    <p>
                      Encryption, extension access and HTTPS-only access are
                      configured together. Access keys are created separately.
                    </p>
                    <ul>
                      <li>
                        Keep the same bucket, region and prefix on each device.
                      </li>
                      <li>
                        Use the stack Outputs to fill the connection form.
                      </li>
                      <li>Test access before enabling sync.</li>
                    </ul>
                  </>
                ) : null}
              </GuidancePanel>
              <GuidancePanel
                variant="warning"
                title="Keep the secret access key private"
              >
                <p>AWS reveals the secret only when the key is created.</p>
                {content === "long" ? (
                  <>
                    <p>
                      Keep it available until you have entered it in the
                      extension.
                    </p>
                    <ul>
                      <li>Never use root or administrator access keys.</li>
                      <li>
                        Do not include keys in screenshots or support messages.
                      </li>
                      <li>
                        Remove an unencrypted CSV after saving the key securely.
                      </li>
                    </ul>
                  </>
                ) : null}
              </GuidancePanel>
            </div>
          )}
        </Scenario>
      </Specimen>
      <Specimen
        id="P01"
        name="StepNavigation"
        owner="Shared presentation · components/layout"
      >
        <Scenario
          label="Step navigation"
          options={["current", "complete", "upcoming", "error"] as const}
        >
          {(state) => (
            <StepNavigation
              steps={steps.map((item) =>
                item.id === "password"
                  ? { ...item, state: state === "current" ? "upcoming" : state }
                  : item,
              )}
              currentId={state === "current" ? "password" : step}
              onNavigate={setStep}
            />
          )}
        </Scenario>
      </Specimen>
      <Specimen
        id="P02"
        name="SetupLayout"
        owner="Shared layout slots · components/layout"
        wide
      >
        <Scenario label="Setup help" options={["with-help", "without-help"]}>
          {(state) => (
            <SetupLayout
              title="Create your vault"
              steps={
                <StepNavigation
                  steps={steps}
                  currentId={step}
                  onNavigate={setStep}
                />
              }
              help={
                state === "with-help" ? (
                  <SafetyHelp
                    title="Before you start"
                    essential="Choose a private place to save your recovery record."
                  />
                ) : undefined
              }
              actions={
                <Button
                  onClick={() =>
                    setNotice("Example continue callback received.")
                  }
                >
                  Continue example
                </Button>
              }
            >
              <TextField
                label="Example device name"
                placeholder="This laptop"
              />
            </SetupLayout>
          )}
        </Scenario>
      </Specimen>
      <Specimen
        id="P03"
        name="SettingsSection"
        owner="Shared presentation · components/layout"
      >
        <Scenario label="Settings section" options={["normal", "destructive"]}>
          {(state) => (
            <SettingsSection
              title={state === "normal" ? "This device" : "Remove local vault"}
              description={
                state === "normal"
                  ? "Local preferences, editable later."
                  : "Removing local data affects this device. Cloud copies require a separate decision."
              }
              destructive={state === "destructive"}
            >
              <Button
                variant="outline"
                onClick={() => setNotice("Settings action selected.")}
              >
                Review change
              </Button>
            </SettingsSection>
          )}
        </Scenario>
      </Specimen>
      <Specimen
        id="P04"
        name="SafetyHelp"
        owner="Shared presentation · components/layout"
      >
        <SafetyHelp
          title="Keep your recovery words private"
          essential="Anyone with the required vault data and your recovery record may be able to recover access."
          details={[
            {
              title: "Where should I store a record?",
              text: "Choose a private place you can find again. Consider who can access physical copies, files, print queues, clipboard history and backups.",
            },
            {
              title: "Will support ask for my words?",
              text: "Never send recovery words to support or enter them on an unrelated website.",
            },
          ]}
        />
      </Specimen>
      <Specimen
        id="P05"
        name="PasswordField"
        owner="Shared controlled field · components/forms"
      >
        <Scenario
          label="Password field"
          options={["normal", "error", "disabled"]}
        >
          {(state) => (
            <PasswordField
              label="Example password"
              value={password}
              onChange={setPassword}
              revealed={revealed}
              onRevealChange={setRevealed}
              disabled={state === "disabled"}
              error={
                state === "error"
                  ? "Example validation error. Your input is retained."
                  : undefined
              }
            />
          )}
        </Scenario>
      </Specimen>
      <Specimen
        id="P06"
        name="PasswordStrengthFeedback"
        owner="Shared supplied assessment · components/forms"
      >
        <Scenario
          label="Password strength"
          options={[
            "empty",
            "pending",
            "unavailable",
            "very-weak",
            "weak",
            "fair",
            "good",
            "accepted",
          ]}
        >
          {(state) => (
            <PasswordStrengthFeedback
              state={
                state === "pending" || state === "unavailable" ? state : "ready"
              }
              score={
                state === "very-weak"
                  ? 0
                  : state === "weak"
                    ? 1
                    : state === "fair"
                      ? 2
                      : state === "good"
                        ? 3
                        : state === "accepted"
                          ? 4
                          : undefined
              }
            />
          )}
        </Scenario>
      </Specimen>
      <Specimen
        id="P07"
        name="LockDurationField"
        owner="Shared controlled field · components/forms"
      >
        <Scenario
          label="Lock duration"
          options={["ready", "disabled", "error"]}
        >
          {(state) => (
            <LockDurationField
              value={lock}
              onChange={setLock}
              options={vaultLockOptions}
              disabled={state === "disabled"}
              error={
                state === "error"
                  ? "Choose an available lock duration."
                  : undefined
              }
              description="Time since unlocking, including while you are using the vault."
            />
          )}
        </Scenario>
      </Specimen>
      <Specimen
        id="P08"
        name="ThemeControl"
        owner="Existing theme feature · ThemeToggle"
      >
        <ThemeToggle preference={theme} onThemeChange={setTheme} />
        <p className="mt-3 text-xs text-muted-foreground">
          This specimen selects {theme}. Use the page's Theme control to change
          the whole gallery.
        </p>
      </Specimen>
      <Specimen
        id="P12"
        name="DetailField"
        owner="Shared safe text and link presentation · components/layout"
      >
        <DetailField label="Login" value="adrian@example.test" />
        <DetailField
          label="Website"
          value="mail.example.test"
          url="https://mail.example.test"
        />
        <DetailField
          label="Blocked protocol example"
          value="javascript:alert('inert')"
          url="javascript:alert('inert')"
        />
        <DetailField label="Missing field" />
        <EntryDetailsExample />
      </Specimen>
      <Specimen
        id="P13"
        name="SecretField"
        owner="Shared controlled presentation · components/feedback"
      >
        <Scenario
          label="Secret field"
          options={["available", "pending", "error", "disabled"]}
        >
          {(state) => (
            <SecretField
              label="Example stored password"
              state={
                state === "available"
                  ? secret
                    ? "revealed"
                    : "concealed"
                  : state
              }
              value={secret ? "DEMO-password-not-a-credential" : undefined}
              onReveal={() => setSecret(true)}
              onHide={() => setSecret(false)}
              onCopy={() => setNotice("Copy requested.")}
            />
          )}
        </Scenario>
      </Specimen>
      <Specimen
        id="P14"
        name="CopyAction"
        owner="Shared feedback · components/feedback"
      >
        <Scenario
          label="Copy action"
          options={["idle", "pending", "success", "error"]}
        >
          {(state) => (
            <CopyAction
              state={state}
              onCopy={() => setNotice("Copy requested.")}
              description="Clipboard history may retain copied text."
            />
          )}
        </Scenario>
      </Specimen>
      <Specimen
        id="P15"
        name="EmptyState / EmptyVault"
        owner="Shared presentation · components/layout"
      >
        <Scenario
          label="Empty state"
          options={["empty vault", "no results", "failed"]}
        >
          {(state) => (
            <EmptyState
              title={
                state === "empty vault"
                  ? "Your vault is ready for its first entry"
                  : state === "no results"
                    ? "No matching entries"
                    : "Entries could not be loaded"
              }
              description={
                state === "empty vault"
                  ? "Add a login to keep it here."
                  : state === "no results"
                    ? "Try a different search or clear your filters."
                    : "Your saved data has not been changed."
              }
              action={
                state === "empty vault"
                  ? "Add entry"
                  : state === "no results"
                    ? "Clear filters"
                    : "Try again"
              }
              onAction={() => setNotice("Empty-state action selected.")}
            />
          )}
        </Scenario>
      </Specimen>
      <Specimen
        id="P26"
        name="ActionFeedback"
        owner="Shared feedback · components/feedback"
      >
        <Scenario
          label="Action feedback"
          options={["idle", "pending", "success", "error"]}
        >
          {(state) => (
            <ActionFeedback
              state={state}
              message={
                state === "pending"
                  ? "Waiting for the example operation."
                  : state === "success"
                    ? "Example preference updated."
                    : "Example operation could not complete. Your input is retained."
              }
              onRetry={() => setNotice("Retry callback received.")}
            />
          )}
        </Scenario>
      </Specimen>
      <Specimen
        id="P28"
        name="AppNavigation / VaultToolbar"
        owner="Entrypoint composition · entrypoints/components"
        wide
      >
        <div className="space-y-4">
          <VaultToolbar
            name="Personal vault"
            locked={locked}
            onLock={() => setLocked(true)}
            onOpenOptions={() => setNotice("Open-options callback received.")}
          />
          <AppNavigation
            current={route}
            onNavigate={setRoute}
            items={[
              { id: "entries", label: "Entries", available: true },
              { id: "settings", label: "Settings", available: true },
              {
                id: "sync",
                label: "Sync review",
                available: false,
                unavailableReason: "Configure sync to enable review.",
              },
            ]}
          />
        </div>
      </Specimen>
      <p role="status" className="review-wide text-sm text-muted-foreground">
        {notice}
      </p>
    </div>
  );
}
function VaultExample() {
  const [value, setValue] = useState<string | null>("personal");
  return (
    <Scenario
      label="Vault picker"
      options={["ready", "empty", "loading", "error"]}
    >
      {(state) => (
        <VaultPicker
          vaults={state === "empty" ? [] : demoVaults}
          value={value}
          onChange={setValue}
          loading={state === "loading"}
          error={
            state === "error" ? "Could not load the vault list." : undefined
          }
          onCreate={() => setValue(null)}
        />
      )}
    </Scenario>
  );
}
function EntriesExample() {
  const [selected, setSelected] = useState<string>();
  const [opened, setOpened] = useState("");
  return (
    <Scenario
      label="Entries"
      options={["list", "compact", "table", "loading", "error", "empty"]}
    >
      {(state) => (
        <div className="space-y-4">
          {state === "table" ? (
            <EntryTableExample />
          ) : (
            <EntrySelection
              tagLabels={demoTagLabels}
              entries={state === "empty" ? [] : demoEntries.slice(0, 2)}
              selectedId={selected}
              onSelect={setSelected}
              onOpen={setOpened}
              state={state === "loading" || state === "error" ? state : "ready"}
              onRetry={() => setOpened("Retry requested")}
              presentation={state === "compact" ? "popup" : "default"}
            />
          )}
          <p role="status" className="text-xs text-muted-foreground">
            {opened
              ? `Example callback: ${opened}`
              : "Choose a row to exercise its callback."}
          </p>
        </div>
      )}
    </Scenario>
  );
}
function PhraseExample() {
  const [shown, setShown] = useState(false);
  return (
    <RecoveryPhraseGrid
      words={shown ? demoWords : undefined}
      onReveal={() => setShown(true)}
      onHide={() => setShown(false)}
    />
  );
}
function ExportExample() {
  const [requested, setRequested] = useState("");
  const [guide, setGuide] = useState(false);
  return (
    <div className="space-y-5">
      <Scenario label="Recovery export" options={["idle", "pending", "error"]}>
        {(state) => (
          <RecoveryExportChoices
            methods={[
              {
                id: "pdf",
                label: "Download PDF",
                description:
                  "An unencrypted recovery record. Keep the downloaded file private.",
              },
              {
                id: "print",
                label: "Print record",
                description:
                  "Printers and print queues can retain copies. Review the guide first.",
              },
              {
                id: "txt",
                label: "Plain text",
                description:
                  "An unencrypted file. Consider downloads, cloud backups and shared devices.",
              },
              {
                id: "copy",
                label: "Copy words",
                description:
                  "Clipboard history and other applications may retain the text.",
              },
            ].map((m) => ({
              ...m,
              state:
                state === "idle" && requested === m.id ? "requested" : state,
            }))}
            onRequest={setRequested}
          />
        )}
      </Scenario>
      <Button variant="outline" onClick={() => setGuide(!guide)}>
        {guide ? "Hide" : "Preview"} printable guide
      </Button>
      {guide ? (
        <RecoveryGuide words={demoWords} identity="Personal vault" />
      ) : null}
    </div>
  );
}
function WordInputExample() {
  const [value, setValue] = useState<string | readonly string[]>("");
  return (
    <Scenario
      label="Recovery input"
      options={[
        "phrase",
        "numbered",
        "error",
        "numbered-error",
        "disabled",
        "numbered-disabled",
      ]}
    >
      {(state) =>
        state.startsWith("numbered") ? (
          <RecoveryWordInput
            positional
            value={
              typeof value === "string"
                ? value.trim()
                  ? value.trim().split(/\s+/)
                  : []
                : value
            }
            onChange={setValue}
            disabled={state === "numbered-disabled"}
            error={
              state === "numbered-error"
                ? "The recovery phrase is incomplete."
                : undefined
            }
          />
        ) : (
          <RecoveryWordInput
            value={typeof value === "string" ? value : value.join(" ")}
            onChange={setValue}
            disabled={state === "disabled"}
            error={
              state === "error"
                ? "The recovery phrase is incomplete."
                : undefined
            }
          />
        )
      }
    </Scenario>
  );
}
function VerificationExample() {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [complete, setComplete] = useState(false);
  const positions = [3, 11, 20];
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Fixed demo challenge: demo-03, demo-11, demo-20. Production supplies
        three randomly chosen positions once per challenge.
      </p>
      <Scenario label="Recovery verification" options={["ready", "pending"]}>
        {(state) => (
          <RecoveryVerification
            pending={state === "pending"}
            positions={positions}
            answers={answers}
            errors={errors}
            complete={complete}
            onChange={(position, value) => {
              setAnswers({ ...answers, [position]: value });
              setErrors({ ...errors, [position]: "" });
            }}
            onSubmit={() => {
              const next = Object.fromEntries(
                positions
                  .filter((p) => answers[p]?.trim() !== demoWords[p - 1])
                  .map((p) => [
                    p,
                    "That word does not match this demo position.",
                  ]),
              );
              setErrors(next);
              setComplete(!Object.keys(next).length);
            }}
            onReview={() => {
              setAnswers({});
              setErrors({});
              setComplete(false);
            }}
          />
        )}
      </Scenario>
    </div>
  );
}
function GeneratorExample() {
  const [value, setValue] = useState<PasswordSettings>({
    length: 20,
    uppercase: true,
    lowercase: true,
    numbers: true,
    special: true,
    minNumbers: 1,
    minSpecial: 1,
    avoidAmbiguousCharacters: true,
  });
  const [username, setUsername] = useState({
    capitalize: true,
    includeNumber: false,
  });
  const [result, setResult] = useState<string>();
  const [revealed, setRevealed] = useState(false);
  const [notice, setNotice] = useState("");
  const invalid =
    (!value.uppercase &&
      !value.lowercase &&
      !value.numbers &&
      !value.special) ||
    value.minNumbers + value.minSpecial > value.length ||
    (!value.numbers && value.minNumbers > 0) ||
    (!value.special && value.minSpecial > 0) ||
    value.length < 1 ||
    value.length > 128;
  return (
    <div className="space-y-5">
      <Scenario label="Generator" options={["password", "username", "pending"]}>
        {(state) =>
          state === "username" ? (
            <UsernameControls
              {...username}
              onChange={setUsername}
              onGenerate={() => {
                setResult("DemoOtter42");
                setRevealed(false);
              }}
            />
          ) : (
            <GeneratorControls
              value={value}
              onChange={setValue}
              pending={state === "pending"}
              error={
                invalid
                  ? "Choose valid character groups and counts."
                  : undefined
              }
              onGenerate={() => {
                setResult("DEMO-result-never-a-real-password");
                setRevealed(false);
              }}
            />
          )
        }
      </Scenario>
      <GeneratedValue
        value={result}
        revealed={revealed}
        onRevealChange={setRevealed}
        onUse={() => setNotice("Personal vault accepted.")}
        onCopy={() => setNotice("Copy callback received. Clipboard unchanged.")}
      />
      <p role="status" className="text-xs text-muted-foreground">
        {notice ||
          "Fixture results do not implement random generation or reflect selected settings."}
      </p>
    </div>
  );
}
function SyncReviewExample() {
  const [choices, setChoices] = useState<Record<string, Resolution>>({});
  const [applied, setApplied] = useState(false);
  return (
    <Scenario
      label="Sync review"
      options={["reviewing", "loading", "applying", "stale", "error"]}
    >
      {(state) => (
        <div className="space-y-3">
          <SyncReview
            state={state}
            choices={choices}
            onChange={(id, value) => {
              setChoices({ ...choices, [id]: value });
              setApplied(false);
            }}
            items={[
              {
                id: "demo-1",
                label: "Mail login",
                local: "adrian@example.test",
                remote: "new@example.test",
                passwordChanged: true,
                allowed: ["use_local", "use_remote"],
              },
              {
                id: "demo-2",
                label: "Remote-only entry",
                local: "Missing on this device",
                remote: "travel@example.test",
                passwordChanged: false,
                allowed: ["use_remote"],
              },
            ]}
            onApply={() => setApplied(true)}
          />
          {applied ? (
            <p role="status" className="text-sm">
              Choices submitted.
            </p>
          ) : null}
        </div>
      )}
    </Scenario>
  );
}
function TransferExample() {
  const [value, setValue] = useState("");
  const [notice, setNotice] = useState("");
  return (
    <div className="space-y-5">
      <Scenario
        label="Transfer input"
        options={["empty", "selected", "validating", "invalid", "ready"]}
      >
        {(state) => (
          <TransferInput
            label="Access request"
            fileLabel="Choose request file"
            value={value}
            onChange={setValue}
            state={state}
            error={
              state === "invalid"
                ? "The file was rejected. Select a valid file."
                : undefined
            }
            onFile={(file) => setNotice(`Selected ${file.name}.`)}
          />
        )}
      </Scenario>
      <Scenario label="Transfer output" options={["ready", "pending"]}>
        {(state) => (
          <TransferOutput
            title="Device approval"
            pending={state === "pending"}
            description="Transfer this approval to the browser that created the request."
            metadata="Awaiting peer verification"
            onCopy={() => setNotice("Copy requested.")}
            onExport={() => setNotice("Download requested.")}
          />
        )}
      </Scenario>
      <p role="status" className="text-xs">
        {notice}
      </p>
    </div>
  );
}
function DestructiveExample() {
  const [open, setOpen] = useState(false);
  const [ack, setAck] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => {
      setPending(false);
      setOpen(false);
      setNotice("Removal requested.");
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [pending]);
  return (
    <Scenario label="Destructive confirmation" options={["idle", "error"]}>
      {(state) => (
        <div className="space-y-3">
          <Button
            variant="outline"
            onClick={() => {
              setOpen(true);
              setAck(false);
            }}
          >
            Review local removal
          </Button>
          <DestructiveConfirmation
            open={open}
            onOpenChange={setOpen}
            action="Remove local vault"
            identity="Personal vault"
            consequences="This removes the local copy on this device. It does not remove encrypted cloud copies or data held by other devices."
            acknowledgment="I understand which copy will be removed."
            acknowledged={ack}
            onAcknowledge={setAck}
            pending={pending}
            error={
              state === "error"
                ? "Example removal failed. No data changed."
                : undefined
            }
            onConfirm={() => setPending(true)}
          />
          <p role="status" className="text-xs">
            {notice}
          </p>
        </div>
      )}
    </Scenario>
  );
}
function SearchExample({
  state,
  presentation,
}: {
  state: "empty" | "filled" | "searching" | "filters";
  presentation: "default" | "popup";
}) {
  const [query, setQuery] = useState(
    state === "empty"
      ? ""
      : state === "filters"
        ? "@adrian #Personal /Uncategorized :example.test"
        : "adrian",
  );
  const [notice, setNotice] = useState("");
  return (
    <>
      <SearchField
        value={query}
        suggestions={{
          login: ["adrian@example.test", "alex@example.test"],
          tag: ["Personal", "Shared work"],
          folder: ["Uncategorized"],
          website: ["mail.example.test", "bank.example.test"],
        }}
        onChange={setQuery}
        onSubmit={() => setNotice("Search submitted.")}
        searching={state === "searching"}
        presentation={presentation}
        summary={
          state === "searching"
            ? "Searching entries…"
            : `${
                demoEntries.filter((entry) =>
                  matchesEntrySearch(
                    entry,
                    parseEntrySearch(query),
                    demoTagLabels,
                  ),
                ).length
              } example results`
        }
      />
      {notice ? <p role="status">{notice}</p> : null}
    </>
  );
}
function TagExample({
  state,
}: {
  state: "selected" | "none" | "loading" | "unavailable" | "error" | "limit";
}) {
  const options =
    state === "limit"
      ? Array.from({ length: PASSWORD_ENTRY_TAG_LIMIT + 1 }, (_, index) => ({
          ...demoTags[0],
          id: `limit-${index}`,
          label: `Tag ${index + 1}`,
        }))
      : demoTags;
  const [tags, setTags] = useState<string[]>(
    state === "none"
      ? []
      : state === "limit"
        ? options.slice(0, PASSWORD_ENTRY_TAG_LIMIT).map(({ id }) => id)
        : ["tag-personal"],
  );
  return (
    <TagSelection
      value={tags}
      onChange={setTags}
      options={options}
      disabled={state === "unavailable"}
      loading={state === "loading"}
      error={
        state === "error"
          ? "Example tag selection could not be saved."
          : undefined
      }
    />
  );
}
export function FeatureExamples() {
  const [notice, setNotice] = useState("");
  return (
    <div className="review-grid grid gap-x-8 gap-y-10">
      <Specimen
        id="P09"
        name="VaultPicker"
        owner="Feature widget · vault-access"
      >
        <VaultExample />
      </Specimen>
      <Specimen id="P10" name="SearchField" owner="Feature control · entries">
        <Scenario
          label="Search field presentation"
          options={["default", "popup"]}
        >
          {(presentation) => (
            <Scenario
              label="Search field"
              options={["empty", "filled", "searching", "filters"]}
            >
              {(state) => (
                <SearchExample
                  key={`${presentation}:${state}`}
                  state={state}
                  presentation={presentation}
                />
              )}
            </Scenario>
          )}
        </Scenario>
      </Specimen>
      <Specimen
        id="P11"
        name="EntryRow / EntryList / EntrySelection / EntryTable"
        owner="Feature widgets · entries · TanStack Table 9.2.4"
        wide
      >
        <EntriesExample />
        <SiteIconExample />
        <SiteIconsExample />
      </Specimen>
      <Specimen
        id="P16"
        name="RecoveryPhraseGrid"
        owner="Feature widget · recovery"
      >
        <PhraseExample />
      </Specimen>
      <Specimen
        id="P17"
        name="RecoveryExportChoices / RecoveryGuide"
        owner="Feature widgets · recovery"
      >
        <ExportExample />
      </Specimen>
      <Specimen
        id="P18"
        name="RecoveryWordInput"
        owner="Feature control · recovery"
      >
        <WordInputExample />
      </Specimen>
      <Specimen
        id="P19"
        name="RecoveryVerification"
        owner="Feature widget · recovery"
      >
        <VerificationExample />
      </Specimen>
      <Specimen
        id="P20"
        name="GeneratorControls / GeneratedValue"
        owner="Feature widgets · password-tools"
      >
        <GeneratorExample />
      </Specimen>
      <Specimen id="P21" name="SyncStatus" owner="Feature widget · sync">
        <Scenario
          label="Sync status"
          options={[
            "unconfigured",
            "permission-required",
            "not-checked",
            "access-confirmed",
            "checking",
            "uploading",
            "complete",
            "pending",
            "existing-vault",
            "target-occupied",
            "review-required",
            "failed",
          ]}
        >
          {(state) => (
            <SyncStatus
              state={state}
              detail={
                {
                  "permission-required":
                    "Allow this browser to connect to your S3 storage. Your local vault remains available.",
                  "not-checked":
                    "Sync is configured. Check for remote changes.",
                  "access-confirmed":
                    "Your keys can read this storage location. Upload permission will be checked when you enable sync.",
                  unconfigured: "Connect your own S3 storage when ready.",
                  checking: "Checking remote state.",
                  uploading: "Uploading encrypted changes.",
                  complete: "The example upload is complete.",
                  pending: "Local changes are still waiting for confirmation.",
                  "existing-vault":
                    "S3 contains a newer signed copy of this vault. Review the reconnect action before replacing the older local copy.",
                  "target-occupied":
                    "An object already exists at the S3 key “vault/vault.enc”, but it is not a valid LFSPM vault. Choose another object prefix to keep the existing S3 object.",
                  "review-required": "Review remote changes before continuing.",
                  failed: "The example request failed.",
                }[state]
              }
              action={
                state === "target-occupied"
                  ? "Change object prefix"
                  : state === "failed"
                    ? "Retry"
                    : undefined
              }
              onAction={
                state === "target-occupied"
                  ? () => setNotice("Object-prefix edit requested.")
                  : state === "failed"
                    ? () => setNotice("Retry requested.")
                    : undefined
              }
            />
          )}
        </Scenario>
      </Specimen>
      <Specimen
        id="P22"
        name="Comparison / Resolution / Summary / SyncReview"
        owner="Feature widgets · sync"
        wide
      >
        <SyncReviewExample />
      </Specimen>
      <Specimen id="P23" name="DeviceSummary" owner="Feature widget · devices">
        <Scenario
          label="Device summary"
          options={[
            "current",
            "other",
            "revoked",
            "unavailable",
            "pending",
            "error",
          ]}
        >
          {(state) => (
            <DeviceSummary
              state={state === "pending" || state === "error" ? "other" : state}
              pending={state === "pending"}
              error={
                state === "error" ? "Revocation failed. Try again." : undefined
              }
              name="Personal laptop"
              identifier="demo-device-fingerprint"
              onRevoke={() => setNotice("Revocation review requested.")}
            />
          )}
        </Scenario>
      </Specimen>
      <Specimen
        id="P24"
        name="TransferInput / TransferOutput"
        owner="Feature widgets · devices"
      >
        <TransferExample />
      </Specimen>
      <Specimen
        id="P25"
        name="DestructiveConfirmation"
        owner="Shared policy-free presentation · components/feedback"
      >
        <DestructiveExample />
      </Specimen>
      <Specimen id="P27" name="TagSelection" owner="Feature control · entries">
        <Scenario
          label="Tag selection"
          options={[
            "selected",
            "none",
            "loading",
            "unavailable",
            "error",
            "limit",
          ]}
        >
          {(state) => <TagExample key={state} state={state} />}
        </Scenario>
      </Specimen>
      <p role="status" className="review-wide text-sm text-muted-foreground">
        {notice}
      </p>
    </div>
  );
}
