import { describe, expect, it } from 'vitest';
import { readSSE } from './sse';

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(...chunks: string[]): Promise<string[]> {
  const out: string[] = [];
  for await (const payload of readSSE(streamOf(...chunks))) out.push(payload);
  return out;
}

describe('readSSE', () => {
  it('reads a single frame', async () => {
    expect(await collect('data: {"a":1}\n\n')).toEqual(['{"a":1}']);
  });

  it('reads several frames from one chunk', async () => {
    expect(await collect('data: one\n\ndata: two\n\ndata: three\n\n')).toEqual([
      'one',
      'two',
      'three',
    ]);
  });

  it('reassembles a frame split across chunk boundaries', async () => {
    // The network splits wherever it likes, including mid-field.
    expect(await collect('data: {"te', 'xt":"hel', 'lo"}\n\n')).toEqual(['{"text":"hello"}']);
  });

  it('reassembles a split that lands inside the frame separator', async () => {
    expect(await collect('data: one\n', '\ndata: two\n\n')).toEqual(['one', 'two']);
  });

  it('handles CRLF framing', async () => {
    expect(await collect('data: one\r\n\r\ndata: two\r\n\r\n')).toEqual(['one', 'two']);
  });

  it('skips keepalive comments without emitting them', async () => {
    expect(await collect(': keepalive\n\ndata: real\n\n')).toEqual(['real']);
  });

  it('ignores non-data fields', async () => {
    expect(await collect('event: message\nid: 7\ndata: payload\n\n')).toEqual(['payload']);
  });

  it('joins multi-line data fields with newlines, per the SSE spec', async () => {
    expect(await collect('data: line one\ndata: line two\n\n')).toEqual(['line one\nline two']);
  });

  it('emits a trailing frame that arrives without a final separator', async () => {
    expect(await collect('data: last')).toEqual(['last']);
  });

  it('emits nothing for an empty stream', async () => {
    expect(await collect('')).toEqual([]);
  });

  it('preserves leading spaces beyond the single optional one', async () => {
    expect(await collect('data:  indented\n\n')).toEqual([' indented']);
  });

  it('stops when the signal aborts', async () => {
    const controller = new AbortController();
    const out: string[] = [];
    const stream = streamOf('data: one\n\ndata: two\n\n');
    for await (const payload of readSSE(stream, controller.signal)) {
      out.push(payload);
      controller.abort();
    }
    expect(out.length).toBeLessThanOrEqual(2);
    expect(out[0]).toBe('one');
  });
});
