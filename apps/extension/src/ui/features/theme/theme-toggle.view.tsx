import {
  Sun03Icon,
  Moon02Icon,
  ComputerIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Button } from "@/ui/components/primitives/button";
import type { ThemePreference } from "./theme.hook";

interface ThemeOption {
  value: ThemePreference;
  label: string;
  icon: IconSvgElement;
}

const THEME_OPTIONS: ThemeOption[] = [
  { value: "light", label: "Light", icon: Sun03Icon },
  { value: "dark", label: "Dark", icon: Moon02Icon },
  { value: "system", label: "System", icon: ComputerIcon },
];

interface ThemeToggleProps {
  preference: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  className?: string;
}

export function ThemeToggle({
  preference,
  onThemeChange,
  className,
}: ThemeToggleProps) {
  return (
    <div
      role="group"
      aria-label="Color theme"
      className={`flex flex-wrap gap-1 ${className ?? ""}`}
    >
      {THEME_OPTIONS.map(({ value, label, icon }) => (
        <Button
          key={value}
          variant={preference === value ? "default" : "outline"}
          size="sm"
          aria-pressed={preference === value}
          onClick={() => onThemeChange(value)}
        >
          <HugeiconsIcon
            icon={icon}
            data-icon="inline-start"
            aria-hidden="true"
          />
          {label}
        </Button>
      ))}
    </div>
  );
}
