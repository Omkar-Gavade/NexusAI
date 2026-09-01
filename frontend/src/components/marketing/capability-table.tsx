import clsx from 'clsx';

export type CapabilityStatus = 'interface' | 'planned';

export interface Capability {
  name: string;
  description: string;
  status: CapabilityStatus;
}

const LABEL: Record<CapabilityStatus, string> = {
  interface: 'Interface built',
  planned: 'Planned',
};

/**
 * Two states, stated with equal prominence.
 *
 * Deliberately not "Available": no backend runs, so nothing here is a live
 * service. "Interface built" says exactly what is true — the surface and its
 * protocol exist — without implying that a request reaches a model today.
 * Advertising unshipped functionality as shipped is the most common lie on a
 * SaaS landing page, and the qualifier is the whole point.
 */
export function CapabilityTable({ capabilities }: { capabilities: readonly Capability[] }) {
  return (
    <ul className="border-t border-line-subtle">
      {capabilities.map((capability) => (
        <li
          key={capability.name}
          className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line-subtle py-4"
        >
          <h3 className="w-full text-ui font-[550] text-ink sm:w-[220px] sm:shrink-0">
            {capability.name}
          </h3>
          <p className="min-w-0 flex-1 text-ui text-ink-2">{capability.description}</p>
          <span
            data-register="machine"
            className={clsx(
              'shrink-0 text-note uppercase',
              capability.status === 'interface' ? 'text-ink-3' : 'text-ink-off',
            )}
          >
            {LABEL[capability.status]}
          </span>
        </li>
      ))}
    </ul>
  );
}
