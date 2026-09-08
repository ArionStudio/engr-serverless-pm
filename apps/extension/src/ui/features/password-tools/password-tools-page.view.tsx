import { useEffect, useRef, useState } from "react";
import type { EntryTools } from "@/ui/features/password-tools/password-tools.type";
import { Button } from "@/ui/components/primitives/button";
import { Input } from "@/ui/components/primitives/input";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/ui/components/primitives/tabs";
import { PasswordStrengthFeedback } from "@/ui/components/forms/fields.view";
import { GeneratorControls, UsernameControls } from "./generator.view";
import { defaultPasswordSettings } from "./generator-settings";
import { cn } from "cn";

export function PasswordToolsPage({
  tools,
  onUse,
  onPendingChange,
  presentation = "page",
}: {
  tools: EntryTools;
  onUse: (value: { password?: string; login?: string }) => void;
  onPendingChange?: (pending: boolean) => void;
  presentation?: "page" | "popup";
}) {
  const [kind, setKind] = useState("password");
  const [settings, setSettings] = useState(defaultPasswordSettings);
  const [username, setUsername] = useState({
    capitalize: false,
    includeNumber: true,
  });
  const [value, setValue] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState<0 | 1 | 2 | 3 | 4>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const epoch = useRef(0);
  const busy = useRef(false);
  const result = useRef<HTMLElement>(null);
  useEffect(() => {
    onPendingChange?.(pending);
    return () => onPendingChange?.(false);
  }, [onPendingChange, pending]);
  useEffect(() => {
    if (value && presentation === "popup") result.current?.focus();
  }, [presentation, value]);
  useEffect(() => {
    const generation = epoch;
    const hide = () => setRevealed(false);
    window.addEventListener("blur", hide);
    document.addEventListener("visibilitychange", hide);
    return () => {
      ++generation.current;
      window.removeEventListener("blur", hide);
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);
  function changeKind(next: string) {
    ++epoch.current;
    busy.current = false;
    setPending(false);
    setKind(next);
    setValue("");
    setScore(undefined);
    setRevealed(false);
    setError(undefined);
  }
  async function generate() {
    if (busy.current) return;
    busy.current = true;
    const owner = ++epoch.current;
    setPending(true);
    setValue("");
    setScore(undefined);
    setRevealed(false);
    setError(undefined);
    try {
      if (kind === "password") {
        const result = await tools.generate(settings);
        const assessment = await tools.assess(result.password);
        if (owner !== epoch.current) return;
        setValue(result.password);
        setScore(assessment.score);
      } else {
        const result = await tools.username(username);
        if (owner !== epoch.current) return;
        setValue(result.username);
      }
    } catch {
      if (owner === epoch.current)
        setError(
          "Could not generate a value. Check the selected options and try again.",
        );
    } finally {
      if (owner === epoch.current) {
        busy.current = false;
        setPending(false);
      }
    }
  }
  return (
    <section
      className={presentation === "popup" ? "space-y-4" : "space-y-6"}
      aria-label="Password tools"
    >
      {presentation === "page" ? (
        <h1 className="text-2xl font-semibold tracking-tight">
          Password tools
        </h1>
      ) : null}
      <Tabs value={kind} onValueChange={changeKind}>
        <TabsList
          aria-label="Generator"
          className={presentation === "popup" ? "grid w-full grid-cols-2" : ""}
        >
          <TabsTrigger value="password">Password</TabsTrigger>
          <TabsTrigger value="username">Username</TabsTrigger>
        </TabsList>
        <div
          className={cn(
            "grid items-start",
            presentation === "popup"
              ? "mt-4 gap-4"
              : "mt-6 gap-6 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]",
          )}
        >
          <div
            className={cn(
              "bg-card",
              presentation === "popup"
                ? "rounded-md border p-4"
                : "rounded-lg border p-5 @lg:p-6",
            )}
          >
            <TabsContent value="password" className="mt-0">
              <GeneratorControls
                value={settings}
                onChange={setSettings}
                pending={pending}
                onGenerate={() => void generate()}
              />
            </TabsContent>
            <TabsContent value="username" className="mt-0">
              <fieldset disabled={pending}>
                <UsernameControls
                  {...username}
                  onChange={setUsername}
                  onGenerate={() => void generate()}
                />
              </fieldset>
            </TabsContent>
          </div>
          <div className={presentation === "popup" ? "space-y-4" : "space-y-5"}>
            {error ? (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            ) : null}
            {pending ? <p role="status">Generating…</p> : null}
            {value ? (
              <section
                ref={result}
                tabIndex={-1}
                data-focus-target
                className={cn(
                  "space-y-4 border bg-card outline-none",
                  presentation === "popup"
                    ? "rounded-md p-4"
                    : "rounded-lg p-5 @lg:p-6",
                )}
                aria-label="Generated value"
              >
                <p role="status" className="sr-only">
                  {kind === "password"
                    ? "Password generated"
                    : "Username generated"}
                </p>
                <h2 className="text-lg font-semibold">
                  {kind === "password"
                    ? "Generated password"
                    : "Generated username"}
                </h2>
                <div className="flex gap-2">
                  <Input
                    aria-label={
                      kind === "password"
                        ? "Generated password"
                        : "Generated username"
                    }
                    readOnly
                    value={value}
                    type={
                      kind === "password" && !revealed ? "password" : "text"
                    }
                    className="min-w-0 font-mono"
                  />
                  {kind === "password" ? (
                    <Button
                      variant="outline"
                      onClick={() => setRevealed(!revealed)}
                    >
                      {revealed ? "Hide" : "Show"}
                    </Button>
                  ) : null}
                </div>
                {kind === "password" ? (
                  <PasswordStrengthFeedback score={score} state="ready" />
                ) : null}
                {kind === "password" ? (
                  <p className="text-sm text-muted-foreground">
                    Save this password in your vault before changing it on the
                    website.
                  </p>
                ) : null}
                <Button
                  onClick={() => {
                    onUse(
                      kind === "password"
                        ? { password: value }
                        : { login: value },
                    );
                    setValue("");
                  }}
                >
                  Use in new entry
                </Button>
              </section>
            ) : null}
          </div>
        </div>
      </Tabs>
    </section>
  );
}
