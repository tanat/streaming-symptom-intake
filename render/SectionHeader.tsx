'use client';

import {
  Activity,
  ClipboardList,
  HeartPulse,
  ShieldAlert,
  Stethoscope,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';

type Props = { title?: string; description?: string };

/**
 * Maps a section's title/id to a thematic icon for visual grouping
 * (vitals / OPQRST / risk / red-flags). Presentation only — falls back
 * to a neutral clipboard icon for anything unrecognized.
 */
function pickIcon(label: string): LucideIcon {
  const t = label.toLowerCase();
  if (/(vital|temperature|heart\s*rate|blood\s*pressure|spo2|oxygen)/.test(t)) {
    return HeartPulse;
  }
  if (/(red\s*flag|warning|emergency|emergent)/.test(t)) return TriangleAlert;
  if (/(risk|history|comorbid|factor)/.test(t)) return ShieldAlert;
  if (/(opqrst|onset|pain|symptom|character|severity|timing)/.test(t)) {
    return Activity;
  }
  if (/(exam|assessment|review)/.test(t)) return Stethoscope;
  return ClipboardList;
}

export function SectionHeader({ title, description }: Props) {
  if (!title) return null;
  const Icon = pickIcon(title);
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground ring-1 ring-primary/10">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="grid gap-1">
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
