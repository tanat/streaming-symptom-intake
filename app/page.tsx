'use client';

import { useEffect, useRef, useState } from 'react';
import { experimental_useObject as useObject } from '@ai-sdk/react';
import {
  Activity,
  ArrowRight,
  Loader2,
  Sparkles,
  Stethoscope,
  TriangleAlert,
} from 'lucide-react';
import { FormSpec } from '@/schemas/v1/form-spec';
import { FormRenderer } from '@/render/FormRenderer';
import { FormSkeleton } from '@/render/FormSkeleton';
import { isFieldRenderable } from '@/fields/__helpers__/is-renderable';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { VoiceButton } from '@/voice/VoiceButton';

const SAMPLE_COMPLAINTS = [
  '55-year-old female, chest pressure radiating to jaw, started 2 hours ago, nauseous',
  '14-month-old toddler, fever 39.4°C for 2 days, decreased appetite, mild rash on torso',
  '32-year-old male, sudden severe headache, "worst of life", photophobia',
  '8-year-old, audible wheezing, used albuterol twice with little relief',
];

const SAMPLE_LABELS = [
  'Chest pain · 55F',
  'Toddler fever · 14mo',
  'Thunderclap headache · 32M',
  'Wheezing · 8yo',
];

function postLog(event: Record<string, unknown>) {
  void fetch('/api/log', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(event),
    keepalive: true,
  }).catch(() => {
    // Best-effort telemetry — never block UI.
  });
}

type ModelKey = 'haiku' | 'gpt-mini' | 'gemini';

const MODEL_LABELS: Record<ModelKey, string> = {
  haiku: 'Claude Haiku',
  'gpt-mini': 'GPT-4o mini',
  gemini: 'Gemini 2.5 Flash',
};

export default function Home() {
  const [complaint, setComplaint] = useState('');
  const [model, setModel] = useState<ModelKey>('haiku');
  const sessionIdRef = useRef<string | null>(null);
  const submittedAtRef = useRef<number | null>(null);
  const deltaIdxRef = useRef<number>(0);
  const sawFirstFieldRef = useRef<boolean>(false);

  const { object: spec, submit, isLoading, error } = useObject({
    api: '/api/intake',
    schema: FormSpec,
  });

  const onSubmit = () => {
    const text = complaint.trim();
    if (!text) return;
    const sid = crypto.randomUUID();
    sessionIdRef.current = sid;
    submittedAtRef.current = Date.now();
    deltaIdxRef.current = 0;
    sawFirstFieldRef.current = false;
    postLog({
      event: 'submit',
      sessionId: sid,
      ts: new Date().toISOString(),
      complaint: text,
      model,
      source: 'client',
    });
    submit({ complaint: text, sessionId: sid, model });
  };

  // Delta + first_field telemetry.
  useEffect(() => {
    const sid = sessionIdRef.current;
    if (!sid || !spec) return;
    const idx = deltaIdxRef.current++;
    postLog({
      event: 'delta',
      sessionId: sid,
      ts: new Date().toISOString(),
      deltaIdx: idx,
      partialSpec: spec,
    });

    if (!sawFirstFieldRef.current) {
      const renderable = (spec.sections ?? []).some((section) =>
        (section?.fields ?? []).some((f) =>
          isFieldRenderable(f as Parameters<typeof isFieldRenderable>[0]),
        ),
      );
      if (renderable) {
        sawFirstFieldRef.current = true;
        const startedAt = submittedAtRef.current ?? Date.now();
        postLog({
          event: 'first_field',
          sessionId: sid,
          ts: new Date().toISOString(),
          timeToFirstFieldMs: Date.now() - startedAt,
        });
      }
    }
  }, [spec]);

  // Finish telemetry — fires when isLoading flips to false after a stream.
  const wasLoadingRef = useRef(false);
  useEffect(() => {
    if (wasLoadingRef.current && !isLoading && sessionIdRef.current) {
      postLog({
        event: 'finish',
        sessionId: sessionIdRef.current,
        ts: new Date().toISOString(),
        totalMs: submittedAtRef.current
          ? Date.now() - submittedAtRef.current
          : undefined,
        finalSpec: spec ?? null,
      });
    }
    wasLoadingRef.current = isLoading;
  }, [isLoading, spec]);

  const hasComplaint = complaint.trim().length > 0;
  const showInitialSkeleton = isLoading && !spec;
  const showResultColumn = Boolean(spec) || isLoading;

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/20">
              <Stethoscope className="size-5" aria-hidden />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight">
                Streaming Symptom Intake
              </p>
              <p className="text-xs text-muted-foreground">
                AI-generated triage forms, field by field
              </p>
            </div>
          </div>
          <a
            href="/eval"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Activity className="size-4" aria-hidden />
            <span className="hidden sm:inline">Eval results</span>
          </a>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 content-start gap-6 px-4 py-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:py-10">
        <Card className="self-start lg:sticky lg:top-20">
          <CardHeader className="gap-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 text-primary" aria-hidden />
              Chief complaint
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Describe the patient and their presenting symptoms in plain
              language.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Textarea
              placeholder="e.g. 55-year-old female, chest pressure radiating to jaw, started 2 hours ago, nauseous…"
              value={complaint}
              onChange={(e) => setComplaint(e.target.value)}
              className="min-h-32 resize-none leading-relaxed"
            />

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="lg"
                onClick={onSubmit}
                disabled={isLoading || !hasComplaint}
                className="gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Generating…
                  </>
                ) : (
                  <>
                    Generate form
                    <ArrowRight className="size-4" aria-hidden />
                  </>
                )}
              </Button>
              <VoiceButton onTranscript={(t) => setComplaint(t)} />
            </div>

            <div className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Model
              </span>
              <div className="inline-flex w-full rounded-lg bg-muted p-0.5">
                {(Object.entries(MODEL_LABELS) as [ModelKey, string][]).map(
                  ([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setModel(key)}
                      aria-pressed={model === key}
                      className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-all ${
                        model === key
                          ? 'bg-card text-foreground shadow-sm ring-1 ring-foreground/10'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {label}
                    </button>
                  ),
                )}
              </div>
            </div>

            <div className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Try an example
              </span>
              <div className="grid gap-2 sm:grid-cols-2">
                {SAMPLE_COMPLAINTS.map((s, i) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setComplaint(s)}
                    className="rounded-lg border border-border bg-card px-3 py-2 text-left text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-accent/50"
                  >
                    {SAMPLE_LABELS[i] ?? `${s.slice(0, 40)}…`}
                  </button>
                ))}
              </div>
            </div>

            {error ? (
              <div className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <div>
                  <p className="font-medium">Stream error</p>
                  <p className="text-xs text-destructive/90">{error.message}</p>
                </div>
              </div>
            ) : null}

            <p className="text-[0.7rem] leading-relaxed text-muted-foreground">
              Demo only — not for clinical use. Forms are generated by an LLM
              and stream in as they are produced.
            </p>
          </CardContent>
        </Card>

        <div className="grid content-start gap-4">
          {showResultColumn ? (
            <div className="flex items-center gap-2 text-sm">
              {isLoading ? (
                <>
                  <span
                    className="intake-live-dot size-2 rounded-full bg-primary"
                    aria-hidden
                  />
                  <span className="font-medium text-foreground">
                    Streaming form…
                  </span>
                  <span className="text-muted-foreground">
                    fields appear as the model produces them
                  </span>
                </>
              ) : spec ? (
                <>
                  <span
                    className="size-2 rounded-full bg-emerald-500"
                    aria-hidden
                  />
                  <span className="font-medium text-foreground">
                    Form ready
                  </span>
                  <span className="text-muted-foreground">
                    generated from the chief complaint
                  </span>
                </>
              ) : null}
            </div>
          ) : null}

          {!showResultColumn ? (
            <EmptyState />
          ) : showInitialSkeleton ? (
            <FormSkeleton />
          ) : (
            <FormRenderer spec={spec} isStreaming={isLoading} />
          )}
        </div>
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 px-6 py-14 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground ring-1 ring-primary/10">
        <Stethoscope className="size-7" aria-hidden />
      </span>
      <h2 className="mt-5 text-lg font-semibold tracking-tight">
        Your triage form will appear here
      </h2>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
        Enter a chief complaint and generate a form. It streams in live — a
        triage banner, then grouped sections for vitals, OPQRST, risk factors,
        and red flags.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-full bg-muted px-2.5 py-1 font-medium">
          Vitals
        </span>
        <span className="rounded-full bg-muted px-2.5 py-1 font-medium">
          OPQRST
        </span>
        <span className="rounded-full bg-muted px-2.5 py-1 font-medium">
          Risk factors
        </span>
        <span className="rounded-full bg-muted px-2.5 py-1 font-medium">
          Red flags
        </span>
      </div>
    </div>
  );
}
