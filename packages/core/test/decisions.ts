import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Decider } from '../src/classify.ts';

// Answers a decision model gave once, saved so tests and accuracy never call a live model.
export const DECISIONS_FILE = new URL('../../../fixtures/decisions.json', import.meta.url);

type ChoiceQuestion<T extends string> = {
  instructions: string;
  options: Record<T, string>;
  state: unknown;
};
type Question = ChoiceQuestion<string>;
type Answer = { choice: string; probabilities: Record<string, number>; confidence: number };
export type RecordedDecisions = Record<string, { url: string; answer: Answer }>;

// Same question, same page facts, same key. A changed question or page means a new answer.
export function decisionKey(question: Question): string {
  const text = JSON.stringify([question.instructions, question.options, question.state]);
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

const urlOf = (question: Question) =>
  String((question.state as { url?: unknown } | null)?.url ?? '');

export class RecordingDecider implements Decider {
  readonly recorded: RecordedDecisions = {};
  private readonly inner: Decider;

  constructor(inner: Decider) {
    this.inner = inner;
  }

  async choose<T extends string>(
    question: ChoiceQuestion<T>,
  ): Promise<{ choice: T; probabilities: Record<T, number>; confidence: number }> {
    const answer = await this.inner.choose(question);
    this.recorded[decisionKey(question)] = { url: urlOf(question), answer };
    return answer;
  }
}

export class ReplayDecider implements Decider {
  readonly misses: string[] = [];
  private readonly recorded: RecordedDecisions;

  constructor(recorded: RecordedDecisions = loadDecisions()) {
    this.recorded = recorded;
  }

  async choose<T extends string>(
    question: ChoiceQuestion<T>,
  ): Promise<{ choice: T; probabilities: Record<T, number>; confidence: number }> {
    const entry = this.recorded[decisionKey(question)];
    if (!entry) {
      this.misses.push(urlOf(question));
      throw new Error(`No recorded decision for ${urlOf(question)}. Run pnpm record-decisions.`);
    }
    return entry.answer as { choice: T; probabilities: Record<T, number>; confidence: number };
  }
}

export function loadDecisions(): RecordedDecisions {
  return existsSync(DECISIONS_FILE) ? JSON.parse(readFileSync(DECISIONS_FILE, 'utf8')) : {};
}

export function saveDecisions(decisions: RecordedDecisions): void {
  const sorted = Object.fromEntries(
    Object.entries(decisions).sort(([, a], [, b]) => a.url.localeCompare(b.url)),
  );
  writeFileSync(DECISIONS_FILE, `${JSON.stringify(sorted, null, 2)}\n`);
}
