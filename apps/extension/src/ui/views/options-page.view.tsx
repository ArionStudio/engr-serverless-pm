import { useTheme } from "@/ui/theme";
import { OptionsView } from "./options.view";

export function OptionsPage() {
  const { preference, setTheme, isLoading } = useTheme();

  return (
    <OptionsView
      theme={preference}
      onThemeChange={setTheme}
      isLoading={isLoading}
    />
  );
}
