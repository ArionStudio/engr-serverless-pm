import { SunIcon, MoonIcon, MonitorIcon } from "@phosphor-icons/react";
import { Button } from "@/ui/components/primitives/button";
import type { ThemePreference } from "./theme.hook";

interface ThemeOption {
  value: ThemePreference;
  label: string;
  icon: typeof SunIcon;
}

const THEME_OPTIONS: ThemeOption[] = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: MonitorIcon },
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
    <div className={`flex gap-1 ${className ?? ""}`}>
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
        <Button
          key={value}
          variant={preference === value ? "default" : "outline"}
          size="sm"
          onClick={() => onThemeChange(value)}
        >
          <Icon data-icon="inline-start" />
          {label}
        </Button>
      ))}
    </div>
  );
}
