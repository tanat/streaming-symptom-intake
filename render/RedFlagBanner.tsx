'use client';

import { AlertTriangle, ShieldCheck, Siren } from 'lucide-react';

type Urgency = 'routine' | 'urgent' | 'emergent';

type Props = {
  category?: string;
  urgency?: Urgency;
  redFlags?: string[];
};

const urgencyStyles: Record<Urgency, string> = {
  routine:
    'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100',
  urgent:
    'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100',
  emergent:
    'border-red-300 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100',
};

const urgencyPill: Record<Urgency, string> = {
  routine: 'bg-emerald-600/90 text-white',
  urgent: 'bg-amber-500/90 text-white',
  emergent: 'bg-red-600 text-white',
};

const urgencyIcon: Record<Urgency, typeof ShieldCheck> = {
  routine: ShieldCheck,
  urgent: AlertTriangle,
  emergent: Siren,
};

export function RedFlagBanner({ category, urgency, redFlags }: Props) {
  if (!category && !urgency && (!redFlags || redFlags.length === 0)) {
    return null;
  }
  const level = urgency ?? 'routine';
  const cls = urgencyStyles[level] ?? urgencyStyles.routine;
  const Icon = urgencyIcon[level] ?? ShieldCheck;
  const flags = (redFlags ?? []).filter(
    (f): f is string => typeof f === 'string' && f.length > 0,
  );

  return (
    <div
      role="status"
      className={`animate-intake-rise rounded-xl border px-4 py-3 shadow-sm ${cls}`}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <Icon className="size-5 shrink-0" aria-hidden />
        {urgency ? (
          <span
            className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wider ${urgencyPill[level]}`}
          >
            {urgency}
          </span>
        ) : null}
        {category ? (
          <span className="text-sm font-semibold">{category}</span>
        ) : null}
      </div>
      {flags.length > 0 ? (
        <ul className="mt-2.5 grid gap-1.5 pl-0.5">
          {flags.map((flag) => (
            <li key={flag} className="flex items-start gap-2 text-sm">
              <span
                className="mt-1.5 size-1.5 shrink-0 rounded-full bg-current opacity-70"
                aria-hidden
              />
              <span className="leading-snug">{flag}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
