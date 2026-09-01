import clsx from 'clsx';
import { Monitor, Moon, Sun } from 'lucide-react';
import type { ThemePreference } from '@nexusai/contracts';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Rule } from '@/components/ui/rule';
import { useLogout, useSession } from '@/features/auth/use-session';
import { useThemeStore } from '@/stores/theme-store';

const THEMES: ReadonlyArray<{ value: ThemePreference; label: string; Icon: typeof Sun }> = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
];

/**
 * Four controls, grouped by measure rules rather than cards. Settings that do
 * not exist in the product are not invented to fill the screen.
 */
export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: user } = useSession();
  const logout = useLogout();
  const { preference, setPreference } = useThemeStore();

  return (
    <Dialog open={open} onClose={onClose} title="Settings">
      <div className="flex flex-col gap-6">
        <section>
          <Rule label="APPEARANCE" className="mb-3" />
          <div
            role="radiogroup"
            aria-label="Theme"
            className="flex gap-1 rounded-control border border-line p-1"
          >
            {THEMES.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={preference === value}
                onClick={() => setPreference(value)}
                className={clsx(
                  'flex h-8 flex-1 items-center justify-center gap-1.5 rounded-control text-ui',
                  'transition-colors duration-(--duration-instant)',
                  preference === value
                    ? 'bg-selected font-[550] text-ink'
                    : 'text-ink-2 hover:bg-hover hover:text-ink',
                )}
              >
                <Icon size={13} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <Rule label="ACCOUNT" className="mb-3" />
          {user ? (
            <dl className="flex flex-col gap-2 text-ui">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-2">Name</dt>
                <dd className="truncate text-ink">{user.displayName}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-2">Email</dt>
                <dd data-register="machine" className="truncate text-meta text-ink-2">
                  {user.email}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-ui text-ink-3">Account details are unavailable right now.</p>
          )}

          <Button
            className="mt-4"
            loading={logout.isPending}
            onClick={() => logout.mutate(undefined, { onSuccess: onClose })}
          >
            Sign out
          </Button>
        </section>
      </div>
    </Dialog>
  );
}
