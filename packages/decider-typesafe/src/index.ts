import type { Decider } from '@drippa/stackprobe-core';
import { z } from 'zod';

export const TYPESAFE_API = 'https://api.typesafe.ai/v1/systemone';

export interface TypeSafeDeciderOptions {
  apiKey: string;
  model?: string;
  // Per attempt.
  timeoutMs?: number;
  // Tries in all, for 429 (rate limit), 529 (overloaded) and other 5xx answers.
  attempts?: number;
  fetch?: typeof fetch;
  // Waits between tries; replaceable in tests.
  sleep?: (ms: number) => Promise<void>;
}

const Answer = z.object({
  answers: z.object({
    kind: z.object({
      choice: z.string(),
      probabilities: z.record(z.string(), z.number()),
      confidence: z.number(),
    }),
  }),
});

export class TypeSafeError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'TypeSafeError';
    this.status = status;
  }
}

// Asks Jev (TypeSafe's System One model) one choice question per call, straight over HTTP.
// See https://docs.typesafe.ai/api
export class TypeSafeDecider implements Decider {
  private readonly options: Required<Omit<TypeSafeDeciderOptions, 'fetch' | 'sleep'>> & {
    fetch: typeof fetch;
    sleep: (ms: number) => Promise<void>;
  };

  constructor(options: TypeSafeDeciderOptions) {
    if (!options.apiKey) throw new TypeSafeError('A TypeSafe API key is required');
    this.options = {
      model: 'jev-latest',
      timeoutMs: 15_000,
      attempts: 3,
      fetch: globalThis.fetch,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      ...options,
    };
  }

  async choose<T extends string>(question: {
    instructions: string;
    options: Record<T, string>;
    state: unknown;
  }): Promise<{ choice: T; probabilities: Record<T, number>; confidence: number }> {
    const body = JSON.stringify({
      model: this.options.model,
      state: question.state,
      questions: {
        kind: { type: 'choice', instructions: question.instructions, criteria: question.options },
      },
    });
    const { attempts } = this.options;
    for (let attempt = 1; ; attempt++) {
      let response: Response;
      try {
        response = await this.options.fetch(TYPESAFE_API, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.options.apiKey}`,
            'content-type': 'application/json',
          },
          body,
          signal: AbortSignal.timeout(this.options.timeoutMs),
        });
      } catch (error) {
        if (attempt >= attempts) {
          throw new TypeSafeError(`TypeSafe request failed: ${(error as Error).message}`);
        }
        await this.options.sleep(backoff(attempt));
        continue;
      }
      if (response.ok) return this.parse(await response.json(), question.options);
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt >= attempts) {
        throw new TypeSafeError(`TypeSafe answered ${response.status}`, response.status);
      }
      await this.options.sleep(backoff(attempt));
    }
  }

  private parse<T extends string>(json: unknown, options: Record<T, string>) {
    const parsed = Answer.safeParse(json);
    if (!parsed.success) throw new TypeSafeError('Unexpected answer from TypeSafe');
    const { choice, probabilities, confidence } = parsed.data.answers.kind;
    if (!(choice in options))
      throw new TypeSafeError(`TypeSafe chose an unknown option: ${choice}`);
    return { choice: choice as T, probabilities: probabilities as Record<T, number>, confidence };
  }
}

// 0.5 s, 1 s, 2 s...
function backoff(attempt: number): number {
  return 500 * 2 ** (attempt - 1);
}

// A decider from the environment, or none: stackprobe works without one, on rules only.
export function deciderFromEnv(env: Record<string, string | undefined> = process.env) {
  return env.TYPESAFE_API_KEY ? new TypeSafeDecider({ apiKey: env.TYPESAFE_API_KEY }) : undefined;
}
