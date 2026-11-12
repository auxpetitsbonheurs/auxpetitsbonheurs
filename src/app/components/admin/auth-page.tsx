import type { ReactNode } from "react";
import { AdminHeader } from "~/components/admin/admin-header";
import { SkipLink } from "~/components/shell/skip-link";

/**
 * Frame of the signed-out admin pages (forgot, reset): the same card as sign-in. Tighter
 * padding below 20rem (200% zoom on a 320 px phone) keeps fields and the links of an error
 * summary at least 44 px wide.
 */
export function AuthPage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <AdminHeader />
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-md flex-1 px-2 py-8 outline-none min-[20rem]:px-4">
        <div className="rounded-card border border-border bg-card p-2 min-[20rem]:p-5 sm:p-6">{children}</div>
      </main>
    </div>
  );
}
