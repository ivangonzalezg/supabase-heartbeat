import { LogOutIcon } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { useSessionContext } from "@/entities/session"
import { Button, SidebarSeparator } from "@/shared/ui"

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

export function SidebarUserFooter() {
  const { user, role, signOut } = useSessionContext()
  const queryClient = useQueryClient()

  const handleSignOut = async () => {
    await signOut()
    queryClient.clear()
  }

  if (!user) return null

  return (
    <>
      <SidebarSeparator />
      <div className="flex items-center gap-2 px-2 py-1.5">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sidebar-primary font-mono text-[9px] font-bold text-primary">
          {getInitials(user.name)}
        </div>
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-xs font-semibold text-sidebar-foreground">
            {user.name}
          </span>
          <span className="truncate text-[10px] text-muted-foreground">
            {role}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Sign out"
          onClick={() => void handleSignOut()}
        >
          <LogOutIcon />
        </Button>
      </div>
    </>
  )
}
