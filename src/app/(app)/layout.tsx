import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/logo";
import { SignOutButton } from "@/components/signout";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: org } = await supabase.from("orgs").select("name").limit(1).maybeSingle();

  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-30 border-b border-edge bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/dashboard" aria-label="Dashboard">
            <Logo />
          </Link>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              {org?.name && <p className="text-xs font-semibold text-ink">{org.name}</p>}
              <p className="text-xs text-muted">{user?.email}</p>
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
