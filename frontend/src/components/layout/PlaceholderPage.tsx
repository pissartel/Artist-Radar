interface PlaceholderPageProps {
  title: string;
  description: string;
}

export default function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-bold text-white">{title}</h1>
      <p className="text-sm text-gray-400 mt-1.5">{description}</p>
      <div className="mt-6 bg-card rounded-xl border border-slate-400/10 shadow-card-glow p-6 text-sm text-gray-500">
        This section is coming soon.
      </div>
    </div>
  );
}
