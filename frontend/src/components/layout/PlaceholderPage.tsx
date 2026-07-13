interface PlaceholderPageProps {
  title: string;
  description: string;
}

export default function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-bold text-foreground">{title}</h1>
      <p className="text-sm text-foreground-secondary mt-1.5">{description}</p>
      <div className="mt-6 bg-surface rounded-xl border border-border shadow-card-glow p-6 text-sm text-foreground-muted">
        This section is coming soon.
      </div>
    </div>
  );
}
