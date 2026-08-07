import { logoHorizontalDark, logoHorizontalLight } from "@/shared/images"
import { ThemeToggle } from "@/shared/ui"
import { SignInForm } from "./sign-in-form"

export function SignInPage() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex h-16 shrink-0 items-center justify-end px-3">
        <ThemeToggle />
      </header>
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md rounded-[10px] border border-border bg-card p-8">
          <div className="pb-6">
            <img
              src={logoHorizontalLight}
              alt="Supabase Heartbeat"
              className="h-8 w-auto dark:hidden"
            />
            <img
              src={logoHorizontalDark}
              alt="Supabase Heartbeat"
              className="hidden h-8 w-auto dark:block"
            />
          </div>
          <div className="border-t border-border" />
          <div className="pt-6">
            <h1 className="text-2xl font-bold text-card-foreground">Sign in</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Access your projects and workflows.
            </p>
          </div>
          <div className="pt-6">
            <SignInForm />
          </div>
        </div>
      </div>
    </div>
  )
}
