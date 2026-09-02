import { useState, type FormEvent } from 'react';
import { PASSWORD_MIN } from '@nexusai/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useChangePassword } from '@/features/auth/use-session';
import { isApiError } from '@/lib/http';

/**
 * Changing the password.
 *
 * Confirmation is checked here and not sent: it exists to catch a typo while
 * typing, which is a property of this form rather than of the request. Sending
 * it would put a third copy of the new password on the wire for the server to
 * compare against itself.
 *
 * Server errors are shown as the server's own message. The two that matter —
 * a wrong current password and a new password equal to the old one — are
 * distinct codes, so the reader is told which mistake they made instead of a
 * single "something went wrong".
 */
export function ChangePasswordForm() {
  const change = useChangePassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [mismatch, setMismatch] = useState<string>();

  const tooShort = next.length > 0 && next.length < PASSWORD_MIN;
  const submittable = current.length > 0 && next.length >= PASSWORD_MIN && confirm.length > 0;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!submittable || change.isPending) return;

    if (next !== confirm) {
      setMismatch('Those two do not match.');
      return;
    }
    setMismatch(undefined);

    change.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          // Cleared immediately: there is no reason for a credential to stay
          // in component state once the request has succeeded.
          setCurrent('');
          setNext('');
          setConfirm('');
          setDone(true);
        },
      },
    );
  };

  const serverError =
    change.isError && isApiError(change.error) ? change.error.message : undefined;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" aria-label="Change password">
      <Input
        label="Current password"
        type="password"
        autoComplete="current-password"
        value={current}
        onChange={(e) => {
          setCurrent(e.target.value);
          setDone(false);
        }}
        error={serverError}
      />

      <Input
        label="New password"
        type="password"
        autoComplete="new-password"
        value={next}
        onChange={(e) => {
          setNext(e.target.value);
          setDone(false);
        }}
        hint={`At least ${PASSWORD_MIN} characters.`}
        error={tooShort ? `At least ${PASSWORD_MIN} characters.` : undefined}
      />

      <Input
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => {
          setConfirm(e.target.value);
          setMismatch(undefined);
          setDone(false);
        }}
        error={mismatch}
      />

      <div className="mt-1 flex items-center gap-3">
        <Button type="submit" variant="primary" size="sm" loading={change.isPending} disabled={!submittable}>
          Change password
        </Button>

        {done && (
          <p role="status" className="text-ui text-ink-2">
            Password changed. Other sessions were signed out.
          </p>
        )}
      </div>
    </form>
  );
}
