import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/render';
import { routes, safeNext, withNext } from '@/lib/routes';
import { LoginPage } from './login-page';
import { RegisterPage } from './register-page';

const SCHEME_RELATIVE = '//evil.example.com/steal';
const BACKSLASH_RELATIVE = '/\\evil.example.com';

/**
 * `?next=` is attacker-controlled: anyone can send someone a sign-in link
 * carrying any destination.
 *
 * React Router coerces an absolute URL into a nonsense in-app path rather than
 * leaving the origin, so this is not an open redirect today — but that is the
 * router's path parsing, not a decision this code made, and it would become one
 * the moment the value reached `window.location`. Meanwhile a crafted link
 * still lands a freshly signed-in user on a route that does not exist.
 */
describe('safeNext', () => {
  it('keeps an ordinary in-app destination, query string included', () => {
    expect(safeNext('/app/chat/abc123')).toBe('/app/chat/abc123');
    expect(safeNext('/app?panel=comparison')).toBe('/app?panel=comparison');
  });

  it.each([
    ['https://evil.example.com/steal', 'absolute URL'],
    [SCHEME_RELATIVE, 'scheme-relative, which browsers treat as absolute'],
    [BACKSLASH_RELATIVE, 'backslash form some browsers accept as scheme-relative'],
    ['javascript:alert(1)', 'javascript scheme'],
    ['app/chat/1', 'no leading slash'],
    ['', 'empty'],
  ])('refuses %s (%s)', (hostile) => {
    expect(safeNext(hostile)).toBe(routes.workspace);
  });

  it('is not fooled by whitespace smuggling a leading slash past the check', () => {
    // A browser strips these when resolving a URL, so the check must too.
    expect(safeNext('  //evil.example.com')).toBe(routes.workspace);
    expect(safeNext('\n/\\evil.example.com')).toBe(routes.workspace);
  });

  it('treats a missing value as the workspace', () => {
    expect(safeNext(null)).toBe(routes.workspace);
    expect(safeNext(undefined)).toBe(routes.workspace);
  });
});

describe('withNext', () => {
  it('carries a pending destination across the sign-in / register switch', () => {
    expect(withNext(routes.register, '/app/chat/x')).toBe('/register?next=%2Fapp%2Fchat%2Fx');
  });

  it('adds nothing when there is no usable destination to carry', () => {
    expect(withNext(routes.register, null)).toBe('/register');
    expect(withNext(routes.register, 'https://evil.example.com')).toBe('/register');
  });

  // `/app` is where a visitor was actually sent from, and is also the default.
  // Dropping it because it matches the default would be indistinguishable from
  // dropping a hostile value.
  it('carries the workspace itself rather than treating it as absent', () => {
    expect(withNext(routes.register, '/app')).toBe('/register?next=%2Fapp');
  });
});

/**
 * Losing the destination when the visitor switches form is a real gap: they
 * arrived from a protected route, decided to register instead, and then landed
 * somewhere they did not ask for.
 */
describe('the auth pages keep the pending destination', () => {
  it('sign-in offers registration without dropping it', () => {
    render(<LoginPage />, { route: '/login?next=%2Fapp%2Fchat%2Fx' });

    expect(screen.getByRole('link', { name: /create one/i })).toHaveAttribute(
      'href',
      '/register?next=%2Fapp%2Fchat%2Fx',
    );
  });

  it('registration offers sign-in without dropping it', () => {
    render(<RegisterPage />, { route: '/register?next=%2Fapp%2Fchat%2Fx' });

    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute(
      'href',
      '/login?next=%2Fapp%2Fchat%2Fx',
    );
  });

  it('does not pass a hostile destination along to the other form', () => {
    render(<LoginPage />, { route: '/login?next=https%3A%2F%2Fevil.example.com' });

    expect(screen.getByRole('link', { name: /create one/i })).toHaveAttribute(
      'href',
      '/register',
    );
  });
});
