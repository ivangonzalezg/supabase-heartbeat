import {
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui"

export function RecentRunsTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Status</TableHead>
          <TableHead>Trigger</TableHead>
          <TableHead>Started</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead>Failed step</TableHead>
          <TableHead>Details</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, index) => (
          <TableRow key={index}>
            <TableCell className="py-3">
              <Skeleton className="h-5 w-16 rounded-full" />
            </TableCell>
            <TableCell className="py-3">
              <Skeleton className="h-4 w-14" />
            </TableCell>
            <TableCell className="py-3">
              <Skeleton className="h-4 w-24" />
            </TableCell>
            <TableCell className="py-3">
              <Skeleton className="h-4 w-10" />
            </TableCell>
            <TableCell className="py-3">
              <Skeleton className="h-4 w-20" />
            </TableCell>
            <TableCell className="py-3">
              <Skeleton className="h-4 w-16" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
