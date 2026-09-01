import { useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { PASSWORD_MIN } from '@nexusai/contracts';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fieldError, useRegister, useSession } from '@/features/auth/use-session';
import { isApiError } from '@/lib/http';
import { routes, safeNext, withNext } from '@/lib/routes';
import { AuthLayout } from './auth-layout';

export function RegisterPage() {
  const [params] = useSearchParams();
  const { data: user } = useSession();
  const register = useRegister();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Registration honours the same pending destination as sign-in, so a visitor
  // sent here from a protected route still lands where they were going.
  const next = params.get('next');
  if (user) return <Navigate to={safeNext(next)} replace />;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    register.mutate({ displayName, email, password });
  };

  const formError =
    register.error && !fieldError(register.error, 'email')
      ? isApiError(register.error)
        ? register.error.message
        : 'Something went wrong.'
      : null;

  return (
    <AuthLayout
      title="Create an account"
      description="One interface for several models."
      footer={
        <>
          Already have an account?{' '}
          <Link to={withNext(routes.login, next)} className="text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <fieldset disabled={register.isPending} className="flex flex-col gap-4">
          <Input
            label="Name"
            name="displayName"
            autoComplete="name"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            error={fieldError(register.error, 'displayName')}
          />
          <Input
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldError(register.error, 'email')}
          />
          <Input
            label="Password"
            type="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            // The rule is stated before submission, not discovered by rejection.
            hint={`At least ${PASSWORD_MIN} characters.`}
            error={fieldError(register.error, 'password')}
          />
        </fieldset>

        {formError && <Alert title={formError} />}

        <Button type="submit" variant="primary" size="lg" loading={register.isPending}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
