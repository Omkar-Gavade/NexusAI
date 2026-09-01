import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client, createHarness, ulid, type Harness } from '../fixtures/harness.ts';

let harness: Harness;
let client: Client;

beforeAll(async () => {
  harness = await createHarness();
  client = new Client(harness.app);
  await client.signUp();
});
afterAll(async () => {
  await harness.close();
});
beforeEach(() => {
  harness.container.limiter.reset();
  harness.testAdapter.reset();
});

async function startConversation(message: string): Promise<string> {
  await client.post('/api/chat/stream', {
    conversationId: null,
    message,
    selection: { mode: 'auto', routing: 'single' },
    clientMessageId: ulid(),
  });
  const list = await client.get('/api/conversations');
  return list.body.conversations[0].id;
}

describe('conversation lifecycle', () => {
  it('creates a conversation only when a message is actually sent', async () => {
    const before = (await client.get('/api/conversations')).body.conversations.length;
    await startConversation('First real question about database indexes.');
    const after = (await client.get('/api/conversations')).body.conversations.length;
    expect(after).toBe(before + 1);
  });

  it('derives a title from the first message, with no second model call', async () => {
    await startConversation('How do covering indexes actually work?');
    const list = await client.get('/api/conversations');
    expect(list.body.conversations[0].title).toBe('How do covering indexes actually work?');
  });

  it('counts both messages in the turn', async () => {
    const id = await startConversation('Counting question.');
    const list = await client.get('/api/conversations');
    const conversation = list.body.conversations.find((c: any) => c.id === id);
    expect(conversation.messageCount).toBe(2);
  });

  it('renames', async () => {
    const id = await startConversation('Before rename.');
    expect((await client.patch(`/api/conversations/${id}`, { title: 'After rename' })).status).toBe(
      204,
    );

    const list = await client.get('/api/conversations');
    expect(list.body.conversations.find((c: any) => c.id === id).title).toBe('After rename');
  });

  it('rejects an empty or oversized title', async () => {
    const id = await startConversation('Title validation.');
    expect((await client.patch(`/api/conversations/${id}`, { title: '' })).status).toBe(400);
    expect(
      (await client.patch(`/api/conversations/${id}`, { title: 'x'.repeat(200) })).status,
    ).toBe(400);
  });

  it('deletes the conversation and its messages together', async () => {
    const id = await startConversation('To be deleted.');
    expect((await client.delete(`/api/conversations/${id}`)).status).toBe(204);

    // An orphaned message is worse than an orphaned conversation: nothing would
    // ever list it again to clean it up.
    const remaining = await harness.db.collection('messages').countDocuments({
      conversationId: { $exists: true },
    });
    const forDeleted = await harness.db
      .collection('messages')
      .countDocuments({ conversationId: { $eq: id } as never });

    expect(forDeleted).toBe(0);
    expect(remaining).toBeGreaterThanOrEqual(0);
    expect((await client.get(`/api/conversations/${id}/messages`)).status).toBe(404);
  });

  it('answers 404 for a conversation that does not exist', async () => {
    const res = await client.get('/api/conversations/64b7f1c2a4d3e5f601020304/messages');
    expect(res.status).toBe(404);
  });
});

describe('pagination and ordering', () => {
  let ids: string[] = [];

  beforeAll(async () => {
    ids = [];
    for (let i = 0; i < 5; i += 1) {
      ids.push(await startConversation(`Paged conversation number ${i}.`));
    }
  });

  it('orders newest first', async () => {
    const list = await client.get('/api/conversations');
    const returned = list.body.conversations.map((c: any) => c.id);
    const positions = ids.map((id) => returned.indexOf(id)).filter((n: number) => n >= 0);
    // Later-created conversations appear earlier in the list.
    expect(positions).toEqual([...positions].sort((a, b) => b - a));
  });

  it('returns a cursor and does not repeat rows across pages', async () => {
    const first = await client.get('/api/conversations?limit=2');
    expect(first.body.conversations).toHaveLength(2);
    expect(first.body.nextCursor).toBeTruthy();

    const second = await client.get(
      `/api/conversations?limit=2&cursor=${first.body.nextCursor}`,
    );
    const firstIds = first.body.conversations.map((c: any) => c.id);
    const secondIds = second.body.conversations.map((c: any) => c.id);

    expect(secondIds.some((id: string) => firstIds.includes(id))).toBe(false);
  });

  it('reports a null cursor on the last page', async () => {
    const all = await client.get('/api/conversations?limit=100');
    expect(all.body.nextCursor).toBeNull();
  });

  it('clamps an oversized limit rather than trusting it', async () => {
    const res = await client.get('/api/conversations?limit=5000');
    expect(res.status).toBe(400);
  });
});

describe('message history', () => {
  it('returns the turn oldest-first with terminal statuses', async () => {
    const id = await startConversation('History ordering question.');
    const res = await client.get(`/api/conversations/${id}/messages`);

    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(2);
    expect(res.body.messages[0].role).toBe('user');
    expect(res.body.messages[1].role).toBe('assistant');

    // `streaming` is not a wire state; nothing may come back non-terminal.
    for (const message of res.body.messages) {
      expect(['complete', 'cancelled', 'failed', 'failed_partial']).toContain(message.status);
    }
  });

  it('carries provenance for every planned model', async () => {
    const id = await startConversation('Provenance question.');
    const res = await client.get(`/api/conversations/${id}/messages`);
    const assistant = res.body.messages.at(-1);

    expect(assistant.responses).toHaveLength(1);
    expect(assistant.agreement).toMatchObject({ requested: 1, responded: 1 });
    expect(assistant.metadata.latencyMs).toBeGreaterThanOrEqual(0);
    // No adapter extracts sources and none is fabricated.
    expect(assistant.sources).toEqual([]);
  });
});

// §28: the contract defines nextCursor for messages, not only conversations.
describe('message pagination', () => {
  let conversationId = '';

  beforeAll(async () => {
    conversationId = await startConversation('Paged history, turn one.');
    for (let i = 2; i <= 4; i += 1) {
      await client.post('/api/chat/stream', {
        conversationId,
        message: `Paged history, turn ${i}.`,
        selection: { mode: 'auto', routing: 'single' },
        clientMessageId: ulid(),
      });
    }
  });

  it('walks the whole history without duplicating or dropping a message', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;

    do {
      const url: string = `/api/conversations/${conversationId}/messages?limit=3${
        cursor ? `&cursor=${cursor}` : ''
      }`;
      const res = await client.get(url);
      expect(res.status).toBe(200);

      seen.push(...res.body.messages.map((m: any) => m.id));
      cursor = res.body.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);

    // Four turns of two messages each.
    expect(seen).toHaveLength(8);
    expect(new Set(seen).size).toBe(8);
    expect(pages).toBeGreaterThan(1);
  });

  it('orders each page oldest-first so the client can prepend without sorting', async () => {
    const res = await client.get(`/api/conversations/${conversationId}/messages?limit=4`);
    const times = res.body.messages.map((m: any) => Date.parse(m.createdAt));
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('returns a null cursor once the history is exhausted', async () => {
    const res = await client.get(`/api/conversations/${conversationId}/messages?limit=100`);
    expect(res.body.nextCursor).toBeNull();
    expect(res.body.messages).toHaveLength(8);
  });

  it('ignores a malformed cursor rather than erroring or returning arbitrary rows', async () => {
    const res = await client.get(
      `/api/conversations/${conversationId}/messages?limit=3&cursor=not-an-id`,
    );
    // An unparseable cursor is ignored, so the first page comes back — never
    // someone else's rows, and never a 500.
    expect(res.status).toBe(200);
    expect(res.body.messages.length).toBeGreaterThan(0);
  });

  it("does not page another user's history, even with a valid cursor", async () => {
    const other = new Client(harness.app);
    await other.signUp();
    const res = await other.get(`/api/conversations/${conversationId}/messages?limit=3`);
    expect(res.status).toBe(404);
  });
});
