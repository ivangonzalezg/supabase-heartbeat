import {
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui"

export function OverviewUpcomingRunsTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Workflow</TableHead>
          <TableHead>Project</TableHead>
          <TableHead>Scheduled for</TableHead>
          <TableHead>Schedule</TableHead>
          <TableHead>Details</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 3 }).map((_, index) => (
          <TableRow key={index}>
            <TableCell className="py-3">
              <Skeleton className="h-4 w-24" />
            </TableCell>
            <TableCell className="py-3">
              <Skeleton className="h-4 w-20" />
            </TableCell>
            <TableCell className="py-3">
              <Skeleton className="h-4 w-24" />
            </TableCell>
            <TableCell className="py-3">
              <Skeleton className="h-4 w-16" />
            </TableCell>
            <TableCell className="py-3">
              <Skeleton className="h-4 w-20" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
