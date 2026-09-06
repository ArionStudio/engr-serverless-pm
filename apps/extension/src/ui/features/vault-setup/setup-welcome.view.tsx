import { useId, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  SecurityCheckIcon,
  ComputerIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/ui/components/primitives/button";
import { Card } from "@/ui/components/primitives/card";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/ui/components/primitives/radio-group";

const setupOptions = [
  {
    value: "create",
    title: "New vault",
    icon: SecurityCheckIcon,
    requirements: [
      "A strong password for this device.",
      "A private place to store your recovery words.",
    ],
  },
  {
    value: "connect",
    title: "Existing vault",
    icon: ComputerIcon,
    requirements: [
      "A trusted device where you can unlock the vault and approve access.",
      "A way to transfer the access request and approval between devices.",
      "A strong password for this device.",
    ],
  },
] as const;

export function SetupWelcome({
  onCreate,
  onConnect,
}: {
  onCreate: () => void;
  onConnect: () => void;
}) {
  const id = useId();
  const [selected, setSelected] = useState<"create" | "connect">("create");
  return (
    <section className="space-y-8">
      <h1 id={`${id}-title`} className="text-2xl font-semibold tracking-tight">
        Set up vault
      </h1>
      <RadioGroup
        aria-labelledby={`${id}-title`}
        value={selected}
        onValueChange={(value) => {
          if (value === "create" || value === "connect") setSelected(value);
        }}
        className="gap-5 @2xl:grid-cols-2"
      >
        {setupOptions.map((option) => (
          <Card
            key={option.value}
            data-focus-group
            className="gap-0 border p-0 ring-0 has-[[data-checked]]:border-primary"
          >
            <label
              htmlFor={`${id}-${option.value}`}
              className="flex h-full min-h-72 cursor-pointer flex-col gap-6 p-6"
            >
              <span className="flex items-start justify-between gap-4">
                <HugeiconsIcon
                  icon={option.icon}
                  size={36}
                  className="text-primary"
                  aria-hidden="true"
                />
                <RadioGroupItem
                  id={`${id}-${option.value}`}
                  value={option.value}
                  aria-labelledby={`${id}-${option.value}-title`}
                  className="size-5"
                />
              </span>
              <span
                id={`${id}-${option.value}-title`}
                className="text-xl font-semibold"
              >
                {option.title}
              </span>
              <span className="space-y-3 text-sm leading-relaxed">
                <span className="block font-medium">What do I need?</span>
                <span role="list" className="block space-y-2">
                  {option.requirements.map((requirement) => (
                    <span
                      role="listitem"
                      key={requirement}
                      className="flex gap-3"
                    >
                      <span aria-hidden="true" className="text-primary">
                        •
                      </span>
                      <span>{requirement}</span>
                    </span>
                  ))}
                </span>
              </span>
            </label>
          </Card>
        ))}
      </RadioGroup>
      <div className="flex justify-end">
        <Button
          onClick={selected === "create" ? onCreate : onConnect}
          size="lg"
          className="min-h-11 gap-3 px-6 text-sm"
        >
          Continue
          <HugeiconsIcon icon={ArrowRight01Icon} size={16} aria-hidden="true" />
        </Button>
      </div>
    </section>
  );
}
