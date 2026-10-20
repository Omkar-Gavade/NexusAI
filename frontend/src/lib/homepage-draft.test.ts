import { beforeEach, describe, expect, it } from 'vitest';
import type { Model } from '@nexusai/contracts';
import { arenaModelsFor, takeHomepageDraft, writeHomepageDraft } from './homepage-draft';
import { HOMEPAGE_DRAFT_STORAGE_KEY } from './routes';

function model(id: string, availability: Model['availability'] = 'AVAILABLE'): Model {
  return {
    id,
    provider: { id: 'p', displayName: 'P' },
    displayName: id,
    description: '',
    contextWindow: 1000,
    maxOutputTokens: 100,
    capabilities: {
      reasoning: false,
      vision: false,
      audio: false,
      video: false,
      documents: false,
      toolCalling: false,
    },
    availability,
    availabilityReason: null,
    deprecated: false,
  };
}

beforeEach(() => sessionStorage.clear());

describe('homepage draft handoff', () => {
  it('round-trips the prompt, mode and chosen Arena models, then clears itself', () => {
    writeHomepageDraft({ prompt: 'Compare Raft and Paxos', mode: 'compare', modelIds: ['a', 'b'] });
    expect(takeHomepageDraft()).toEqual({
      prompt: 'Compare Raft and Paxos',
      mode: 'compare',
      modelIds: ['a', 'b'],
    });
    expect(sessionStorage.getItem(HOMEPAGE_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('discards a malformed draft instead of trusting it', () => {
    sessionStorage.setItem(HOMEPAGE_DRAFT_STORAGE_KEY, JSON.stringify({ mode: 'root', modelIds: 7 }));
    expect(takeHomepageDraft()).toBeNull();
  });

  it('keeps the visitor’s picks when this deployment can run them', () => {
    const catalog = [model('a'), model('b'), model('c'), model('d')];
    expect(arenaModelsFor(['d', 'b'], catalog)).toEqual(['d', 'b']);
  });

  it('drops picks that cannot run here and tops up from what can', () => {
    const catalog = [model('a'), model('b', 'NOT_CONFIGURED'), model('c'), model('d')];
    // Only `d` survives, so the line-up is topped up to a three-model default.
    expect(arenaModelsFor(['b', 'd'], catalog)).toEqual(['d', 'a', 'c']);
  });

  it('never exceeds four models', () => {
    const catalog = ['a', 'b', 'c', 'd', 'e'].map((id) => model(id));
    expect(arenaModelsFor(['a', 'b', 'c', 'd', 'e'], catalog)).toHaveLength(4);
  });

  it('returns null when fewer than two models could run', () => {
    expect(arenaModelsFor(['a'], [model('a'), model('b', 'DISABLED')])).toBeNull();
  });
});
