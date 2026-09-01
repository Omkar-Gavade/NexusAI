import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/render';
import { slot } from '@/test/fixtures';
import { ProvenanceRail } from './provenance-rail';

describe('ProvenanceRail', () => {
  it('renders nothing when no model contributed', () => {
    const { container } = render(<ProvenanceRail slots={[]} live={false} onSelect={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one control per model, in plan order', () => {
    render(
      <ProvenanceRail
        slots={[slot({ id: 'alpha' }), slot({ id: 'beta' }), slot({ id: 'gamma' })]}
        live={false}
        onSelect={vi.fn()}
      />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
    expect(buttons[0]).toHaveAccessibleName(/alpha/);
    expect(buttons[2]).toHaveAccessibleName(/gamma/);
  });

  // The rail encodes stance as geometry. That geometry must never be the only
  // route to the information.
  it('states each stance in words, not only in geometry', () => {
    render(
      <ProvenanceRail
        slots={[slot({ id: 'alpha', stance: 'concurs' }), slot({ id: 'beta', stance: 'diverges' })]}
        live={false}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /alpha concurs/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /beta diverges/i })).toBeInTheDocument();
  });

  it('describes a failed model as failed rather than silently omitting it', () => {
    render(
      <ProvenanceRail
        slots={[slot({ id: 'alpha', phase: 'failed', outcome: 'failed', stance: 'unknown' })]}
        live={false}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /alpha failed to respond/i })).toBeInTheDocument();
  });

  it('describes an in-flight model as still responding', () => {
    render(
      <ProvenanceRail
        slots={[slot({ id: 'alpha', phase: 'running', stance: 'unknown' })]}
        live
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /alpha is responding/i })).toBeInTheDocument();
  });

  it('selects a model on click', async () => {
    const onSelect = vi.fn();
    render(<ProvenanceRail slots={[slot({ id: 'alpha' })]} live={false} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith('alpha');
  });

  it('is operable by keyboard', async () => {
    const onSelect = vi.fn();
    render(
      <ProvenanceRail
        slots={[slot({ id: 'alpha' }), slot({ id: 'beta' })]}
        live={false}
        onSelect={onSelect}
      />,
    );
    await userEvent.tab();
    expect(screen.getAllByRole('button')[0]).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('alpha');
  });

  it('exposes the rail as a labelled list', () => {
    render(<ProvenanceRail slots={[slot({ id: 'alpha' })]} live={false} onSelect={vi.fn()} />);
    expect(screen.getByRole('list', { name: /model provenance/i })).toBeInTheDocument();
  });

  it('shows a live indicator only while a model is in flight', () => {
    const { rerender } = render(
      <ProvenanceRail slots={[slot({ id: 'alpha' })]} live onSelect={vi.fn()} />,
    );
    const liveItems = () =>
      document.querySelectorAll('li[aria-hidden="true"]').length;
    expect(liveItems()).toBe(1);

    rerender(<ProvenanceRail slots={[slot({ id: 'alpha' })]} live={false} onSelect={vi.fn()} />);
    expect(liveItems()).toBe(0);
  });
});
