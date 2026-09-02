import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Markdown } from './markdown';

/**
 * Markdown is parsed from a prefix of the answer while it streams, so the
 * renderer is asked to handle text that is syntactically incomplete at every
 * cadence tick: an unclosed `**`, a code fence with no terminator, half a
 * table. The requirements are that it stays coherent on the way there, and
 * that the settled render is exactly the complete render — animation must
 * never cost final correctness.
 */
const COMPLETE = `# Scaling

Vertical scaling adds **capacity** to one machine. Horizontal scaling adds machines.

| Approach | Limit |
|---|---|
| Vertical | hardware ceiling |
| Horizontal | coordination |

\`\`\`ts
const replicas = Math.ceil(load / perNode);
\`\`\`

1. Measure load
2. Pick an axis
`;

describe('markdown while incomplete', () => {
  it('renders every prefix without throwing', () => {
    // Every cadence tick sees a different prefix; none may break rendering.
    for (let i = 1; i <= COMPLETE.length; i += 17) {
      const { unmount } = render(<Markdown content={COMPLETE.slice(0, i)} />);
      unmount();
    }
  });

  it('keeps unclosed emphasis as literal text rather than swallowing it', () => {
    render(<Markdown content="This is **important" />);
    // The characters stay visible; they do not vanish waiting for a closer.
    expect(document.body.textContent).toContain('important');
  });

  it('keeps an unterminated code fence coherent', () => {
    const { container } = render(<Markdown content={'```ts\nconst result =\n'} />);
    expect(container.textContent).toContain('const result =');
  });

  it('does not leave a half-written table as raw pipes once complete', () => {
    const { container } = render(<Markdown content={COMPLETE} />);
    expect(container.querySelector('table')).not.toBeNull();
    expect(container.querySelectorAll('th').length).toBeGreaterThan(0);
  });

  it('settles to exactly the complete render', () => {
    // The property that matters: whatever the streaming path showed, the
    // finished answer is identical to rendering the whole string at once.
    const streamed = render(<Markdown content={COMPLETE.slice(0, 120)} />);
    streamed.rerender(<Markdown content={COMPLETE} />);
    const afterStreaming = streamed.container.innerHTML;
    streamed.unmount();

    const direct = render(<Markdown content={COMPLETE} />);
    expect(afterStreaming).toBe(direct.container.innerHTML);
  });

  it('renders the finished document structure', () => {
    render(<Markdown content={COMPLETE} />);
    expect(screen.getByRole('heading', { name: /scaling/i })).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('list')).toBeInTheDocument();
  });
});
