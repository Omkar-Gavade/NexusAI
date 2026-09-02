import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient } from '@/test/render';
import { ChangePasswordForm } from './change-password-form';

vi.mock('@/features/auth/api', () => ({
  me: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  updateProfile: vi.fn(),
  changePassword: vi.fn(),
}));
const api = await import('@/features/auth/api');

function setup() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ChangePasswordForm />
    </QueryClientProvider>,
  );
}

const fill = async (user: ReturnType<typeof userEvent.setup>, cur: string, next: string, confirm: string) => {
  await user.type(screen.getByLabelText(/current password/i), cur);
  await user.type(screen.getByLabelText(/^new password$/i), next);
  await user.type(screen.getByLabelText(/confirm new password/i), confirm);
};

beforeEach(() => vi.mocked(api.changePassword).mockReset());

describe('change password', () => {
  it('sends only the two passwords the server needs', async () => {
    const user = userEvent.setup();
    vi.mocked(api.changePassword).mockResolvedValue(undefined);
    setup();

    await fill(user, 'old-secret', 'new-secret', 'new-secret');
    await user.click(screen.getByRole('button', { name: /change password/i }));

    await waitFor(() => {
      // Confirmation is a property of the form, not of the request.
      expect(vi.mocked(api.changePassword).mock.calls[0]?.[0]).toEqual({
        currentPassword: 'old-secret',
        newPassword: 'new-secret',
      });
    });
  });

  it('catches a mismatched confirmation without calling the server', async () => {
    const user = userEvent.setup();
    setup();

    await fill(user, 'old-secret', 'new-secret', 'different');
    await user.click(screen.getByRole('button', { name: /change password/i }));

    expect(await screen.findByText(/do not match/i)).toBeInTheDocument();
    expect(vi.mocked(api.changePassword)).not.toHaveBeenCalled();
  });

  it('keeps submit disabled until every field is usable', async () => {
    const user = userEvent.setup();
    setup();
    const submit = screen.getByRole('button', { name: /change password/i });

    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText(/current password/i), 'old-secret');
    expect(submit).toBeDisabled();
  });

  it('clears the fields and confirms once the change succeeds', async () => {
    const user = userEvent.setup();
    vi.mocked(api.changePassword).mockResolvedValue(undefined);
    setup();

    await fill(user, 'old-secret', 'new-secret', 'new-secret');
    await user.click(screen.getByRole('button', { name: /change password/i }));

    // No credential stays in component state after the request succeeds.
    await waitFor(() => {
      expect(screen.getByLabelText(/current password/i)).toHaveValue('');
      expect(screen.getByLabelText(/^new password$/i)).toHaveValue('');
    });
    expect(screen.getByRole('status')).toHaveTextContent(/password changed/i);
  });

  it('uses password fields with the right autocomplete hints', () => {
    setup();
    expect(screen.getByLabelText(/current password/i)).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText(/current password/i)).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByLabelText(/^new password$/i)).toHaveAttribute('autocomplete', 'new-password');
  });
});
