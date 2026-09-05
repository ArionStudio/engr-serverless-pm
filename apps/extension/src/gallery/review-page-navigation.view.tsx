export function ReviewPageNavigation({
  current,
}: {
  current: "components" | "screens";
}) {
  return (
    <nav aria-label="Review pages" className="flex flex-wrap gap-2">
      {[
        { id: "components", label: "Components", href: "./gallery.html" },
        { id: "screens", label: "Screens", href: "./screens.html" },
      ].map((page) => (
        <a
          key={page.id}
          href={page.href}
          aria-current={current === page.id ? "page" : undefined}
          className={`rounded-md border px-4 py-2 text-sm font-medium ${current === page.id ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent"}`}
        >
          {page.label}
        </a>
      ))}
    </nav>
  );
}
