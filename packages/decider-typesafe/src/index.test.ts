import { describe, expect, test } from 'vitest';
import { deciderFromEnv, TYPESAFE_API, TypeSafeDecider, TypeSafeError } from './index.ts';

const question = {
  instructions: 'What is it?',
  options: { app: 'The product', marketing: 'The website' },
  state: { url: 'https://acme.test/' },
};
const answer = {
  model: 'jev-latest',
  answers: {
    kind: {
      type: 'choice',
      choice: 'app',
      probabilities: { app: 0.83, marketing: 0.17 },
      confidence: 0.66,
    },
  },
  usage: { input_tokens: 120, output_tokens: 0 },
};

function fakeFetch(responses: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error('no more responses');
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const noSleep = async () => {};

describe('TypeSafeDecider', () => {
  test('asks one choice question and returns the answer', async () => {
    const { fetch, calls } = fakeFetch([json(answer)]);
    const decider = new TypeSafeDecider({ apiKey: 'test-key', fetch, sleep: noSleep });
    expect(await decider.choose(question)).toEqual({
      choice: 'app',
      probabilities: { app: 0.83, marketing: 0.17 },
      confidence: 0.66,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(TYPESAFE_API);
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer test-key');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      model: 'jev-latest',
      state: { url: 'https://acme.test/' },
      questions: {
        kind: {
          type: 'choice',
          instructions: 'What is it?',
          criteria: { app: 'The product', marketing: 'The website' },
        },
      },
    });
  });

  test('retries rate limits, overload and network errors', async () => {
    const { fetch, calls } = fakeFetch([json({}, 429), new Error('reset'), json(answer)]);
    const waits: number[] = [];
    const decider = new TypeSafeDecider({
      apiKey: 'k',
      fetch,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    expect((await decider.choose(question)).choice).toBe('app');
    expect(calls).toHaveLength(3);
    expect(waits).toEqual([500, 1000]);
  });

  test('gives up after the last attempt', async () => {
    const { fetch } = fakeFetch([json({}, 529), json({}, 529), json({}, 529)]);
    const decider = new TypeSafeDecider({ apiKey: 'k', fetch, sleep: noSleep });
    await expect(decider.choose(question)).rejects.toMatchObject({ status: 529 });
  });

  test('does not retry a bad key', async () => {
    const { fetch, calls } = fakeFetch([json({ error: 'nope' }, 401)]);
    const decider = new TypeSafeDecider({ apiKey: 'k', fetch, sleep: noSleep });
    await expect(decider.choose(question)).rejects.toBeInstanceOf(TypeSafeError);
    expect(calls).toHaveLength(1);
  });

  test('rejects answers it did not ask for', async () => {
    const odd = structuredClone(answer);
    odd.answers.kind.choice = 'docs';
    const { fetch } = fakeFetch([json(odd)]);
    const decider = new TypeSafeDecider({ apiKey: 'k', fetch, sleep: noSleep });
    await expect(decider.choose(question)).rejects.toThrow(/unknown option/);
  });

  test('comes from the environment only when a key is set', () => {
    expect(deciderFromEnv({})).toBeUndefined();
    expect(deciderFromEnv({ TYPESAFE_API_KEY: 'k' })).toBeInstanceOf(TypeSafeDecider);
  });
});
