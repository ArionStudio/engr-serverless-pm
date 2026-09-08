import { useEffect, useRef, useState } from "react";
import type {
  GeneratePasswordCommandParams,
  GenerateUsernameCommandParams,
} from "@lfspm/core";
import { EntryForm, type EntryDraft } from "./entry-form.view";
import type { TagOption } from "./entries.view";
import { PasswordStrengthFeedback } from "@/ui/components/forms/fields.view";
import { Button } from "@/ui/components/primitives/button";
import {
  GeneratorControls,
  UsernameControls,
  type PasswordSettings,
} from "@/ui/features/password-tools/generator.view";

export type EntryTools = {
  assess: (password: string) => Promise<{ score: 0 | 1 | 2 | 3 | 4 }>;
  generate: (
    settings: GeneratePasswordCommandParams,
  ) => Promise<{ password: string }>;
  username: (
    settings: GenerateUsernameCommandParams,
  ) => Promise<{ username: string }>;
};
const defaultSettings: PasswordSettings = {
  length: 24,
  uppercase: true,
  lowercase: true,
  numbers: true,
  special: true,
  minNumbers: 1,
  minSpecial: 1,
  avoidAmbiguousCharacters: false,
};

export function EntryEditor({
  initial,
  mode,
  tags,
  tools,
  pending = false,
  error,
  onSave,
  onCancel,
}: {
  initial: EntryDraft;
  mode: "add" | "edit";
  tags: readonly TagOption[];
  tools: EntryTools;
  pending?: boolean;
  error?: string;
  onSave: (draft: EntryDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [settings, setSettings] = useState(defaultSettings);
  const [username, setUsername] = useState({
    capitalize: false,
    includeNumber: true,
  });
  const [generating, setGenerating] = useState(false);
  const [toolError, setToolError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [assessment, setAssessment] = useState<
    { score: 0 | 1 | 2 | 3 | 4 } | "error"
  >();
  const [submitted, setSubmitted] = useState(false);
  const generation = useRef(0);
  useEffect(
    () => () => {
      ++generation.current;
    },
    [],
  );
  useEffect(() => {
    let current = true;
    if (!draft.password) return;
    const timer = setTimeout(() => {
      void tools.assess(draft.password).then(
        (result) => {
          if (current) setAssessment(result);
        },
        () => {
          if (current) setAssessment("error");
        },
      );
    }, 150);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [draft.password, tools, attempt]);
  const score =
    assessment && assessment !== "error" ? assessment.score : undefined;
  function change(next: EntryDraft) {
    if (next.password !== draft.password) setAssessment(undefined);
    setDraft(next);
  }
  async function generate(kind: "password" | "username") {
    if (generating || pending) return;
    const owner = ++generation.current;
    setGenerating(true);
    setToolError(undefined);
    try {
      if (kind === "password") {
        const result = await tools.generate(settings);
        if (owner === generation.current) {
          setAssessment(undefined);
          setDraft((previous) => ({
            ...previous,
            password: result.password,
            allowWeakPassword: false,
          }));
        }
      } else {
        const result = await tools.username(username);
        if (owner === generation.current)
          setDraft((previous) => ({ ...previous, login: result.username }));
      }
    } catch {
      if (owner === generation.current)
        setToolError(
          "Could not generate a value. Check the selected options and try again.",
        );
    } finally {
      if (owner === generation.current) setGenerating(false);
    }
  }
  const passwordError = !draft.password
    ? "Enter a password."
    : score !== 4 && !draft.allowWeakPassword
      ? "Use a strong password or explicitly allow this existing weak password."
      : undefined;
  return (
    <section
      className="max-w-xl space-y-6"
      aria-label={mode === "add" ? "Add entry" : "Edit entry"}
    >
      <h2 className="text-xl font-semibold">
        {mode === "add" ? "Add entry" : "Edit entry"}
      </h2>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <EntryForm
        value={draft}
        onChange={change}
        mode={mode}
        tags={tags}
        state={pending || generating ? "pending" : "idle"}
        errors={
          submitted
            ? {
                login: !draft.login.trim() ? "Enter a login." : undefined,
                url: !draft.url ? "Enter a website." : undefined,
                password: passwordError,
              }
            : undefined
        }
        weakPassword={!!draft.password && score !== undefined && score < 4}
        onCancel={onCancel}
        onSubmit={() => {
          setSubmitted(true);
          if (
            !pending &&
            !generating &&
            draft.login.trim() &&
            draft.url &&
            !passwordError &&
            assessment &&
            assessment !== "error"
          )
            onSave(draft);
        }}
        passwordFeedback={
          draft.password ? (
            <>
              <PasswordStrengthFeedback
                score={score}
                state={
                  assessment === "error"
                    ? "unavailable"
                    : assessment
                      ? "ready"
                      : "pending"
                }
              />
              {assessment === "error" ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setAssessment(undefined);
                    setAttempt((n) => n + 1);
                  }}
                >
                  Try strength check again
                </Button>
              ) : null}
            </>
          ) : null
        }
        tools={
          <details className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Password and username tools
            </summary>
            <div className="mt-5 space-y-6">
              {toolError ? (
                <p role="alert" className="text-sm text-destructive">
                  {toolError}
                </p>
              ) : null}
              <GeneratorControls
                value={settings}
                onChange={setSettings}
                pending={generating || pending}
                onGenerate={() => void generate("password")}
              />
              <div className="border-t pt-5">
                <UsernameControls
                  {...username}
                  onChange={setUsername}
                  onGenerate={() => void generate("username")}
                />
              </div>
            </div>
          </details>
        }
      />
    </section>
  );
}
