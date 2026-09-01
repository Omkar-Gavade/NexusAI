import { PASSWORD_MIN } from '@nexusai/contracts';
import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { createTestQueryClient, render, screen } from '@/test/render';
import { LoginPage } from './login-page';
import { RegisterPage } from './register-page';

const client = () => createTestQueryClient();

describe('LoginPage', () => {
  it('labels every field visibly, not by placeholder', () => {
    render(<LoginPage />, { client: client() });
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('sets autocomplete hints so password managers work', () => {
    render(<LoginPage />, { client: client() });
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password');
  });

  it('uses a real form so Enter submits', () => {
    const { container } = render(<LoginPage />, { client: client() });
    expect(container.querySelector('form')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toHaveAttribute('type', 'submit');
  });

  it('offers a route to registration', () => {
    render(<LoginPage />, { client: client() });
    expect(screen.getByRole('link', { name: /create one/i })).toHaveAttribute('href', '/register');
  });

  it('links the wordmark back to the public home page', () => {
    render(<LoginPage />, { client: client() });
    expect(screen.getByRole('link', { name: /nexusai home/i })).toHaveAttribute('href', '/');
  });

  it('is operable from the keyboard alone', async () => {
    render(<LoginPage />, { client: client() });
    await userEvent.tab(); // home link
    await userEvent.tab();
    expect(screen.getByLabelText('Email')).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByLabelText('Password')).toHaveFocus();
  });
});

describe('RegisterPage', () => {
  it('states the password rule before submission rather than after rejection', () => {
    render(<RegisterPage />, { client: client() });
    expect(
      screen.getByText(new RegExp(`at least ${PASSWORD_MIN} characters`, 'i')),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveAttribute('minlength', String(PASSWORD_MIN));
  });

  it('collects a name, email and password with correct autocomplete', () => {
    render(<RegisterPage />, { client: client() });
    expect(screen.getByLabelText('Name')).toHaveAttribute('autocomplete', 'name');
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'new-password');
  });

  it('ties the password hint to the field for screen readers', () => {
    render(<RegisterPage />, { client: client() });
    const password = screen.getByLabelText('Password');
    const describedBy = password.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      new RegExp(`at least ${PASSWORD_MIN} characters`, 'i'),
    );
  });

  it('offers a route back to sign-in', () => {
    render(<RegisterPage />, { client: client() });
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
  });
});
