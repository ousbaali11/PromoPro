import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-navy-100/60", className)} />;
}

/** Squelette générique d'une page liste : titre + description + tableau. */
export function PageSkeleton({ rows = 6, stats = 0 }: { rows?: number; stats?: number }) {
  return (
    <div aria-busy="true" aria-label="Chargement">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      {stats > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: stats }).map((_, i) => (
            <div key={i} className="rounded-xl bg-white p-5 ring-1 ring-navy-100/70">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-3 h-7 w-20" />
            </div>
          ))}
        </div>
      )}
      <div className="overflow-hidden rounded-xl bg-white ring-1 ring-navy-100/70">
        <div className="flex gap-6 border-b border-navy-100 px-5 py-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="ml-auto h-3 w-16" />
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-6 border-b border-navy-50 px-5 py-4 last:border-0">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="hidden h-4 w-24 sm:block" />
            <Skeleton className="ml-auto h-5 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
