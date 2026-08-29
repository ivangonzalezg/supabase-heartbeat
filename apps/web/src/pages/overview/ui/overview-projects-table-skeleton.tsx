import {
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui"

export function OverviewProjectsTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Project</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Total workflows</TableHead>
          <TableHead>Active</TableHead>
          <TableHead>Last activity</TableHead>
          <TableHead>Next run</TableHead>
          <TableHead>Details</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 3 }).map((_, index) => (
          <TableRow key={index}>
            <TableCell className="py-3">
              <Skeleton className="h-4 w-28" />
            </TableCell>
            <TableCell className="py-3">
              <Skeleton className="h-5 w-16 rounded-full" />
            </TableCell>
            <TableCell className="py-3">
              <Skeleton className="h-4 w-8" />
            </TableCell>
            <TableCell className="py-3">
              <Skeleton className="h-4 w-8" />
            </TableCell>
            <TableCell className="py-3">
              <Skeleton className="h-4 w-24" />
            </TableCell>
            <TableCell className="py-3">
              <Skeleton className="h-4 w-24" />
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
