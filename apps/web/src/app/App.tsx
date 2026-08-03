import { Button } from "@/shared/ui"
import { useQueryClient } from "@tanstack/react-query"
import { useSessionContext } from "@/entities/session"
import { useProjects } from "@/entities/project"
import { useWorkflows } from "@/entities/workflow"
import { SignInPage } from "@/pages/sign-in"

export function App() {
  const { status, user, isAuthenticated, signOut } = useSessionContext()
  const queryClient = useQueryClient()
  const projectsQuery = useProjects(isAuthenticated)
  const workflowsQuery = useWorkflows(isAuthenticated)

  const handleSignOut = async () => {
    await signOut()
    queryClient.clear()
  }

  if (status === "loading") {
    return (
      <div className="flex min-h-svh items-center justify-center p-6 text-sm">
        Loading...
      </div>
    )
  }

  if (status === "unauthenticated") {
    return <SignInPage />
  }

  return (
    <div className="flex min-h-svh p-6">
      <div className="flex max-w-md min-w-0 flex-col gap-4 text-sm leading-loose">
        <div>
          <h1 className="font-medium">Project ready!</h1>
          <p>
            Signed in as {user?.name} ({user?.email}).
          </p>
          <p>We&apos;ve already added the button component for you.</p>
          <Button
            variant="outline"
            className="mt-2"
            onClick={() => void handleSignOut()}
          >
            Sign out
          </Button>
        </div>
        <div>
          <p className="font-medium">Workspace summary</p>
          <pre className="mt-1 max-w-full overflow-x-auto rounded-md bg-muted p-2 font-mono text-xs">
            {JSON.stringify(
              {
                projects: projectsQuery.data,
                workflows: workflowsQuery.data,
                isLoading: projectsQuery.isLoading || workflowsQuery.isLoading,
                error:
                  projectsQuery.error?.message ?? workflowsQuery.error?.message,
              },
              null,
              2
            )}
          </pre>
        </div>
        <div className="font-mono text-xs text-muted-foreground">
          (Press <kbd>d</kbd> to toggle dark mode)
        </div>
      </div>
    </div>
  )
}

export default App
