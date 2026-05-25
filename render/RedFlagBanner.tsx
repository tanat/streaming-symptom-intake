'use client';

type Props = {
  category?: string;
  urgency?: 'routine' | 'urgent' | 'emergent';
  redFlags?: string[];
};

const urgencyStyles: Record<NonNullable<Props['urgency']>, string> = {
  routine: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  urgent: 'border-amber-300 bg-amber-50 text-amber-900',
  emergent: 'border-red-400 bg-red-50 text-red-900',
};

export function RedFlagBanner({ category, urgency, redFlags }: Props) {
  if (!category && !urgency && (!redFlags || redFlags.length === 0)) {
    return null;
  }
  const cls = urgencyStyles[urgency ?? 'routine'] ?? urgencyStyles.routine;
  return (
    <div className={`rounded-md border px-3 py-2 text-sm ${cls}`}>
      <div className="flex flex-wrap items-center gap-2">
        {urgency ? (
          <span className="rounded bg-white/70 px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide">
            {urgency}
          </span>
        ) : null}
        {category ? <span className="font-medium">{category}</span> : null}
      </div>
      {redFlags && redFlags.length > 0 ? (
        <ul className="mt-1 list-disc pl-5">
          {redFlags
            .filter((f): f is string => typeof f === 'string' && f.length > 0)
            .map((flag) => (
              <li key={flag}>{flag}</li>
            ))}
        </ul>
      ) : null}
    </div>
  );
}
