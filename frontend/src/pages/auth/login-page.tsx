import { useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fieldError, useLogin, useSession } from '@/features/auth/use-session';
import { isApiError } from '@/lib/http';
import { routes, safeNext, withNext } from '@/lib/routes';
import { AuthLayout } from './auth-layout';

export function LoginPage() {
  const [params] = useSearchParams();
  const { data: user } = useSession();
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // `next` is attacker-controlled — see safeNext.
  const next = params.get('next');
  if (user) return <Navigate to={safeNext(next)} replace />;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate({ email, password });
  };

  // A field-scoped issue renders on the field; anything else is form-level.
  const formError =
    login.error && !fieldError(login.error, 'email') && !fieldError(login.error, 'password')
      ? isApiError(login.error)
        ? login.error.message
        : 'Something went wrong.'
      : null;

  return (
    <AuthLayout
      title="Sign in"
      description="Continue to your workspace."
      footer={
        <>
          No account?{' '}
          <Link to={withNext(routes.register, next)} className="text-accent hover:underline">
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <fieldset disabled={login.isPending} className="flex flex-col gap-4">
          <Input
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldError(login.error, 'email')}
          />
          <Input
            label="Password"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldError(login.error, 'password')}
          />
        </fieldset>

        {formError && <Alert title={formError} />}

        <Button type="submit" variant="primary" size="lg" loading={login.isPending}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
