import { Outlet } from "@tanstack/react-router"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  ThemeToggle,
} from "@/shared/ui"
import { AppSidebar } from "./app-sidebar"

export function DashboardLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center justify-between border-b px-3">
          <SidebarTrigger />
          <ThemeToggle />
        </header>
        <div className="flex flex-1 flex-col">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
