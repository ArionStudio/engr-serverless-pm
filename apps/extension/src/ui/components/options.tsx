import { useTheme, ThemeToggle } from "@/ui/theme";

export function Options() {
  const { preference, setTheme } = useTheme();

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-md mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground">Manage your preferences</p>
        </div>

        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-medium text-foreground mb-3">Theme</h2>
            <ThemeToggle preference={preference} onThemeChange={setTheme} />
          </div>
        </div>
      </div>
    </div>
  );
}
