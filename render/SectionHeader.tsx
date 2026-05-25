'use client';

type Props = { title?: string; description?: string };

export function SectionHeader({ title, description }: Props) {
  if (!title) return null;
  return (
    <div className="grid gap-1">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {description ? (
        <p className="text-sm text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
