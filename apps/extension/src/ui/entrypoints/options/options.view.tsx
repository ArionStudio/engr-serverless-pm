import { ThemeToggle, useTheme } from "@/ui/features/theme";

export function OptionsView() {
  const { preference, setTheme } = useTheme();
  return (
    <div className="min-h-screen p-8">
      <div className="max-w-md mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Manage your preferences</p>
        </div>

        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-medium mb-3">Theme</h2>
            <ThemeToggle preference={preference} onThemeChange={setTheme} />
          </div>
        </div>
      </div>
    </div>
  );
}
