import Link from "next/link";
import Logo from "@/components/brand/Logo";

export default function AuthPage({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <main className="animate-ns-in min-h-screen bg-background px-5 py-12">
      <div className="mx-auto flex w-full max-w-[400px] flex-col gap-[26px]">
        <Link href="/"><Logo size={30}/></Link>
        <section>
          <h1 className="text-[26px] font-extrabold tracking-[-.02em]">{title}</h1>
          <p className="mb-6 mt-1.5 text-[15px] text-foreground-muted">{description}</p>
          {children}
        </section>
      </div>
    </main>
  );
}
