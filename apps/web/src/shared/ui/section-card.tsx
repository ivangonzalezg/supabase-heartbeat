import { cn } from "@/shared/lib/utils"

function SectionCard({
  eyebrow,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { eyebrow: string }) {
  return (
    <div
      data-slot="section-card"
      className={cn("rounded-lg border bg-card p-6", className)}
      {...props}
    >
      <p className="mb-4 font-mono text-[10px] font-bold tracking-wide text-muted-foreground">
        {eyebrow}
      </p>
      {children}
    </div>
  )
}

export { SectionCard }
