'use client';

/**
 * Purely-presentational shimmer placeholders shown while the form spec
 * is still streaming in. No logic — these never read or mutate state.
 */

function SkeletonField() {
  return (
    <div className="grid gap-2">
      <div className="intake-skeleton h-3.5 w-32" />
      <div className="intake-skeleton h-8 w-full" />
    </div>
  );
}

export function SkeletonSection({ fields = 3 }: { fields?: number }) {
  return (
    <section
      aria-hidden
      className="grid gap-4 rounded-xl border border-border/70 bg-card/60 p-5"
    >
      <div className="grid gap-2">
        <div className="intake-skeleton h-4 w-40" />
        <div className="intake-skeleton h-3 w-56" />
      </div>
      <div className="grid gap-4">
        {Array.from({ length: fields }).map((_, i) => (
          <SkeletonField key={i} />
        ))}
      </div>
    </section>
  );
}

export function FormSkeleton() {
  return (
    <div aria-hidden className="grid gap-5">
      <div className="intake-skeleton h-12 w-full rounded-xl" />
      <SkeletonSection fields={3} />
      <SkeletonSection fields={2} />
    </div>
  );
}
