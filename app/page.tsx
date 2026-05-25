'use client';

import { useEffect, useRef, useState } from 'react';
import { experimental_useObject as useObject } from '@ai-sdk/react';
import { FormSpec } from '@/schemas/v1/form-spec';
import { FormRenderer } from '@/render/FormRenderer';
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

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 lg:grid-cols-2 lg:py-12">
      <Card className="self-start">
        <CardHeader>
          <CardTitle>Symptom intake</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Textarea
            placeholder="55-year-old female, chest pressure radiating to jaw, started 2 hours ago…"
            value={complaint}
            onChange={(e) => setComplaint(e.target.value)}
            className="min-h-32"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={onSubmit} disabled={isLoading || !complaint.trim()}>
              {isLoading ? 'Generating…' : 'Generate form'}
            </Button>
            <VoiceButton onTranscript={(t) => setComplaint(t)} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Model:</span>
            {(Object.entries(MODEL_LABELS) as [ModelKey, string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setModel(key)}
                className={`rounded-full px-2.5 py-0.5 text-xs transition-colors ${
                  model === key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_COMPLAINTS.map((s) => (
              <Button
                key={s}
                size="sm"
                variant="outline"
                onClick={() => setComplaint(s)}
              >
                {s.slice(0, 40)}…
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            <a href="/eval" className="underline">
              View eval results →
            </a>
          </p>
          {error ? (
            <p className="text-sm text-destructive">
              Stream error: {error.message}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {!spec && !isLoading ? (
          <p className="text-sm text-muted-foreground">
            Type a chief complaint and submit. The form will stream in,
            field-by-field, generated by Claude Haiku 4.5.
          </p>
        ) : null}
        <FormRenderer spec={spec} />
      </div>
    </main>
  );
}
