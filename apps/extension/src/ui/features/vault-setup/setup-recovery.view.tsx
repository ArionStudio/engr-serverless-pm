import { useState } from "react";
import {
  RecoveryPhraseGrid,
  RecoveryExportChoices,
  RecoveryVerification,
} from "@/ui/features/recovery/recovery.view";
import {
  SafetyHelp,
  StepNavigation,
} from "@/ui/components/layout/sections.view";
import { Button } from "@/ui/components/primitives/button";
import type { RecoverySaveMethod, SetupRecovery } from "./setup.type";

export function SetupRecoveryView({
  recovery,
  verifying,
  pending,
  error,
  onVerify,
  onSave,
  onContinue,
  onReview,
  onLock,
}: {
  recovery: SetupRecovery;
  verifying: boolean;
  pending: boolean;
  error?: string;
  onVerify: (answers: Readonly<Record<number, string>>) => void;
  onSave: (method: RecoverySaveMethod) => Promise<void>;
  onContinue: () => void;
  onReview: () => void;
  onLock: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [answers, setAnswers] = useState<Readonly<Record<number, string>>>({});
  const [saveState, setSaveState] = useState<
    Partial<Record<RecoverySaveMethod, "pending" | "requested" | "error">>
  >({});
  async function save(method: RecoverySaveMethod) {
    setSaveState((state) => ({ ...state, [method]: "pending" }));
    try {
      await onSave(method);
      setSaveState((state) => ({ ...state, [method]: "requested" }));
    } catch {
      setSaveState((state) => ({ ...state, [method]: "error" }));
    }
  }
  return (
    <section className="space-y-6">
      <StepNavigation
        currentId={verifying ? "verify" : "recovery"}
        onNavigate={(id) => {
          if (id === "recovery" && !pending) {
            setAnswers({});
            setRevealed(false);
            onReview();
          }
        }}
        steps={[
          {
            id: "password",
            label: "Password",
            state: "complete",
            allowed: false,
          },
          { id: "device", label: "Device", state: "complete", allowed: false },
          {
            id: "recovery",
            label: "Recovery",
            state: verifying ? "complete" : "upcoming",
            allowed: !pending,
          },
          {
            id: "verify",
            label: "Verification",
            state: "upcoming",
            allowed: false,
          },
        ]}
      />
      <h1 className="text-2xl font-semibold tracking-tight">
        {verifying ? "Verify recovery words" : "Save recovery words"}
      </h1>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {verifying ? (
        <RecoveryVerification
          positions={recovery.positions}
          answers={answers}
          onChange={(position, value) =>
            setAnswers((current) => ({ ...current, [position]: value }))
          }
          pending={pending}
          onSubmit={() => onVerify(answers)}
          onReview={() => {
            setAnswers({});
            setRevealed(false);
            onReview();
          }}
        />
      ) : (
        <>
          <p className="font-medium">
            {recovery.vault.name} · {recovery.vault.deviceName}
          </p>
          <SafetyHelp
            title="Keep access to this device"
            essential="These words can recover access if you forget your password. Recovery also needs the matching data saved in this browser. Words alone cannot restore a lost device or deleted browser data."
          />
          <RecoveryPhraseGrid
            words={revealed ? recovery.words : undefined}
            onReveal={() => setRevealed(true)}
            onHide={() => setRevealed(false)}
          />
          <SafetyHelp
            title="Save a private copy"
            essential="Write all 24 words in order or save a copy outside this vault. Anyone with these words and the matching recovery data could recover your access. Never send them to support or enter them on a website."
          />
          <RecoveryExportChoices
            methods={[
              {
                id: "text",
                label: "Download text file",
                description:
                  "Unencrypted words and recovery instructions. Store the file somewhere private.",
                state: saveState.text,
              },
              {
                id: "print",
                label: "Print or save as PDF",
                description:
                  "Choose a trusted printer or Save as PDF in the print dialog. Both contain unencrypted words.",
                state: saveState.print,
              },
              {
                id: "copy",
                label: "Copy recovery words",
                description:
                  "The active clipboard is cleared after 30 seconds when it still contains these words. Clipboard history and synced copies may remain.",
                state: saveState.copy,
              },
            ]}
            onRequest={(id) => {
              if (id === "text" || id === "print" || id === "copy")
                void save(id);
            }}
          />
          <Button
            disabled={pending}
            onClick={() => {
              setRevealed(false);
              onContinue();
            }}
          >
            I saved all 24 words
          </Button>
        </>
      )}
      <div className="border-t pt-4">
        <Button variant="outline" disabled={pending} onClick={onLock}>
          Lock vault
        </Button>
      </div>
    </section>
  );
}
