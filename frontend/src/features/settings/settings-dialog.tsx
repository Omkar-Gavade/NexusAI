import clsx from 'clsx';
import { Monitor, Moon, Sun } from 'lucide-react';
import type { RoutingMode, ThemePreference } from '@nexusai/contracts';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Rule } from '@/components/ui/rule';
import { ChangePasswordForm } from './change-password-form';
import { useLogout, useSession, useUpdateProfile } from '@/features/auth/use-session';
import { useAccountTheme } from '@/features/auth/use-account-theme';

/**
 * The same three modes the composer's model selector offers, named the same
 * way — literally the same strings, because two surfaces describing one setting
 * in two vocabularies is how a user comes to believe there are two settings.
 * This sets the default a new conversation starts from; the selector still
 * overrides it per conversation.
 *
 * `pinnedModelId` is deliberately absent. The server stores it and nothing has
 * ever read it — not the orchestrator, not the chat route, not this client — so
 * offering it here would be a control that appears to work and changes nothing.
 * It is left unavailable rather than faked.
 */
const ROUTING: ReadonlyArray<{ value: RoutingMode; label: string; note: string }> = [
  { value: 'single', label: 'Single model', note: 'one model · fastest' },
  { value: 'balanced', label: 'Synthesis · 3 models', note: 'three models · reconciled' },
  { value: 'thorough', label: 'Synthesis · 5 models', note: 'five models · reconciled' },
];

const THEMES: ReadonlyArray<{ value: ThemePreference; label: string; Icon: typeof Sun }> = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
];

/**
 * Grouped by measure rules rather than cards, in the order a reader looks for
 * them: who you are, how it looks, how it answers, how it is secured, and the
 * way out. Sign out used to sit under ACCOUNT beneath the name and email,
 * which put the one irreversible control in the dialog directly under two
 * read-only lines of text. Settings that do not exist in the product are not
 * invented to fill the screen.
 */
export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: user } = useSession();
  const logout = useLogout();
  const { preference, setTheme } = useAccountTheme();
  const updateProfile = useUpdateProfile();
  const routing = user?.preferences.routingMode ?? 'balanced';

  return (
    <Dialog open={open} onClose={onClose} title="Settings">
      <div className="flex flex-col gap-6">
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
        </section>

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
                onClick={() => setTheme(value)}
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
          <Rule label="DEFAULT ROUTING" className="mb-3" />
          <div role="radiogroup" aria-label="Default routing" className="flex flex-col gap-1">
            {ROUTING.map(({ value, label, note }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={routing === value}
                disabled={!user || updateProfile.isPending}
                onClick={() => updateProfile.mutate({ preferences: { routingMode: value } })}
                className={clsx(
                  'flex min-h-11 items-baseline gap-3 rounded-control px-3 text-left',
                  'transition-colors duration-(--duration-instant) disabled:opacity-60',
                  routing === value ? 'bg-selected' : 'hover:bg-hover',
                )}
              >
                <span
                  className={clsx('text-ui', routing === value ? 'font-[550] text-ink' : 'text-ink-2')}
                >
                  {label}
                </span>
                <span data-register="machine" className="text-note text-ink-3">
                  {note}
                </span>
              </button>
            ))}
          </div>
          {updateProfile.isError && (
            <p className="mt-2 text-ui text-ink-2">
              That preference could not be saved. It is unchanged.
            </p>
          )}
        </section>

        <section>
          <Rule label="SECURITY" className="mb-3" />
          <ChangePasswordForm />
        </section>

        <section>
          <Rule label="SESSION" className="mb-3" />
          <p className="mb-3 max-w-[46ch] text-ui text-ink-2">
            Signing out ends this session on this device. Changing your password ends every
            other one.
          </p>
          <Button
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
