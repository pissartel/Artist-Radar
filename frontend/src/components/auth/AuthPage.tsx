import Image from "next/image";
import Link from "next/link";

export default function AuthPage({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <Link href="/" className="mb-8 flex justify-center"><Image src="/brand/logo-next-stage-dark.png" alt="NextStage" width={150} height={36} priority /></Link>
        <section className="rounded-xl border border-border bg-surface p-6 shadow-card-glow sm:p-8">
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mb-6 mt-2 text-sm text-foreground-secondary">{description}</p>
          {children}
        </section>
      </div>
    </main>
  );
}
