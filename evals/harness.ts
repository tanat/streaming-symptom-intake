/**
 * Offline eval harness. Runs each fixture through `streamText`,
 * replays partial deltas through the renderer's guards, and appends
 * a result entry to `evals/results.json`.
 *
 * Usage:
 *   pnpm eval                 (default model: claude-haiku-4-5)
 *   pnpm eval:gpt-mini        (gpt-4o-mini)
 *   pnpm eval:gemini          (gemini-2.5-flash)
 *
 * Requires AI_GATEWAY_API_KEY in env (all models route through the
 * Vercel AI Gateway, including Gemini).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { config } from 'dotenv';
import { streamText, Output, gateway } from 'ai';
import {
  FormSpec,
  SCHEMA_VERSION,
  type FormSpec as FormSpecType,
} from '@/schemas/v1/form-spec';
import { FieldDescriptor } from '@/schemas/v1/fields';
import { intakeSystemPrompt, PROMPT_VERSION } from '@/intake/prompt';
import { isFieldRenderable } from '@/fields/__helpers__/is-renderable';
import {
  scoreComplaint,
  aggregate,
  type ExpectedShape,
  type ComplaintScore,
} from './score';

const ROOT = process.cwd();
const RESULTS_FILE = path.join(ROOT, 'evals', 'results.json');

type Fixture = { id: string; category: string; complaint: string };

type CliArgs = { model: 'haiku' | 'gpt-mini' | 'gemini' };

config({ path: path.join(process.cwd(), '.env.local') });

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let model: CliArgs['model'] = 'haiku';
  for (const a of args) {
    if (a === '--model=haiku') model = 'haiku';
    else if (a === '--model=gpt-mini') model = 'gpt-mini';
    else if (a === '--model=gemini') model = 'gemini';
  }
  return { model };
}

async function loadFixtures(): Promise<Fixture[]> {
  const data = await fs.readFile(
    path.join(ROOT, 'fixtures', 'complaints.json'),
    'utf8',
  );
  return JSON.parse(data) as Fixture[];
}

async function loadExpected(id: string): Promise<ExpectedShape | null> {
  const file = path.join(ROOT, 'fixtures', 'expected', `${id}.json`);
  try {
    const data = await fs.readFile(file, 'utf8');
    return JSON.parse(data) as ExpectedShape;
  } catch {
    return null;
  }
}

type RunMeta = {
  partialRenderSafe: boolean;
  timeToFirstFieldMs: number | null;
  totalMs: number | null;
};

async function runOne(
  complaint: string,
  modelKey: CliArgs['model'],
): Promise<{ spec: FormSpecType; meta: RunMeta }> {
  const llm =
    modelKey === 'gpt-mini' ? gateway('openai/gpt-4o-mini')
    : modelKey === 'gemini' ? gateway('google/gemini-2.5-flash')
    : gateway('anthropic/claude-haiku-4-5');
  const start = Date.now();
  let firstFieldAt: number | null = null;
  let partialRenderSafe = true;

  const result = streamText({
    model: llm,
    output: Output.object({ schema: FormSpec }),
    system: intakeSystemPrompt,
    prompt: complaint,
    ...(modelKey === 'gpt-mini' && {
      providerOptions: { openai: { strictJsonSchema: false } },
    }),
  });

  for await (const partial of result.partialOutputStream) {
    const sections = partial?.sections ?? [];
    for (const section of sections) {
      const fields = section?.fields ?? [];
      for (const field of fields) {
        if (
          isFieldRenderable(
            field as Parameters<typeof isFieldRenderable>[0],
          )
        ) {
          if (firstFieldAt === null) firstFieldAt = Date.now() - start;
          // Belt-and-suspenders: guard says renderable but Zod
          // disagrees → that would crash the component.
          if (!FieldDescriptor.safeParse(field).success) {
            partialRenderSafe = false;
          }
        }
      }
    }
  }

  const finalObject = await result.output;
  const totalMs = Date.now() - start;
  return {
    spec: finalObject as FormSpecType,
    meta: {
      partialRenderSafe,
      timeToFirstFieldMs: firstFieldAt,
      totalMs,
    },
  };
}

async function main() {
  const { model: modelKey } = parseArgs();
  const modelId =
    modelKey === 'gpt-mini' ? 'gpt-4o-mini'
    : modelKey === 'gemini' ? 'gemini-2.5-flash'
    : 'claude-haiku-4-5';

  // All models (incl. Gemini) route through the Vercel AI Gateway,
  // so the single AI_GATEWAY_API_KEY covers every provider.
  if (!process.env.AI_GATEWAY_API_KEY) {
    throw new Error('AI_GATEWAY_API_KEY not set');
  }

  const fixtures = await loadFixtures();
  console.log(
    `[eval] running ${fixtures.length} fixtures against ${modelId}…`,
  );

  const scores: ComplaintScore[] = [];
  for (const fx of fixtures) {
    const expected = await loadExpected(fx.id);
    if (!expected) {
      console.warn(`[eval] no expected file for ${fx.id}, skipping`);
      continue;
    }
    try {
      const { spec, meta } = await runOne(fx.complaint, modelKey);
      const score = scoreComplaint(spec, expected, meta);
      scores.push(score);
      console.log(
        `[eval] ${fx.id}\tfieldJ=${score.fieldJaccard.toFixed(2)}\tcrit=${score.criticalFieldHit}\tprs=${score.partialRenderSafe}\tttff=${score.timeToFirstFieldMs}ms`,
      );
    } catch (err) {
      console.error(`[eval] ${fx.id} failed:`, (err as Error).message);
      scores.push({
        complaintId: fx.id,
        fieldJaccard: 0,
        sectionJaccard: 0,
        criticalFieldHit: false,
        criticalFieldHitRate: 0,
        partialRenderSafe: false,
        timeToFirstFieldMs: null,
        totalMs: null,
      });
    }
  }

  const agg = aggregate(scores);
  const entry = {
    runId: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    promptVersion: PROMPT_VERSION,
    model: modelId,
    perComplaint: scores,
    aggregate: agg,
  };

  let history: unknown[] = [];
  try {
    const raw = await fs.readFile(RESULTS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) history = parsed;
  } catch {
    // first run
  }
  history.push(entry);
  await fs.writeFile(RESULTS_FILE, JSON.stringify(history, null, 2) + '\n');
  console.log(
    `[eval] appended run; aggregate fieldJaccard=${agg.fieldJaccard.toFixed(3)} criticalHit=${agg.criticalFieldHit.toFixed(3)} partialRenderSafe=${agg.partialRenderSafe.toFixed(3)}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
