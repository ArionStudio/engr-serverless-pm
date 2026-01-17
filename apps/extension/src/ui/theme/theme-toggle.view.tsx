import { Sun, Moon, Monitor } from "@phosphor-icons/react";
import { Button } from "@/ui/components/primitives/button";
import type { ThemePreference } from "@/core/theme";

interface ThemeOption {
  value: ThemePreference;
  label: string;
  icon: typeof Sun;
}

const THEME_OPTIONS: ThemeOption[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

interface ThemeToggleProps {
  preference: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  isLoading?: boolean;
  className?: string;
}

export function ThemeToggle({
  preference,
  onThemeChange,
  isLoading = false,
  className,
}: ThemeToggleProps) {
  if (isLoading) {
    return (
      <div className={`flex gap-2 ${className ?? ""}`}>
        {THEME_OPTIONS.map(({ value }) => (
          <Button key={value} variant="outline" size="sm" disabled>
            ...
          </Button>
        ))}
      </div>
    );
  }

  return (
    <div className={`flex gap-2 ${className ?? ""}`}>
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
        <Button
          key={value}
          variant={preference === value ? "default" : "outline"}
          size="sm"
          onClick={() => onThemeChange(value)}
        >
          <Icon className="h-4 w-4 mr-2" />
          {label}
        </Button>
      ))}
    </div>
  );
}
