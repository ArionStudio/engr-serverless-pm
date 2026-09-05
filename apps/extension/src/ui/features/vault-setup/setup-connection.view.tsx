import { Button } from "@/ui/components/primitives/button";

export function SetupConnection({ onBack }: { onBack: () => void }) {
  return (
    <section className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Connect a vault</h1>
      <ol className="list-inside list-decimal space-y-4 text-sm marker:text-muted-foreground">
        <li className="border-b pb-4">Request access on this device</li>
        <li className="border-b pb-4">Approve on a trusted device</li>
        <li>Import the approval here</li>
      </ol>
      <Button variant="outline" onClick={onBack}>
        Back to setup choices
      </Button>
    </section>
  );
}
