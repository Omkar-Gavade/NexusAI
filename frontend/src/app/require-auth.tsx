import { Navigate, Outlet, useLocation } from 'react-router';
import { Logo } from '@/components/ui/logo';
import { useSession } from '@/features/auth/use-session';
import { routes } from '@/lib/routes';

export function RequireAuth() {
  const { data: user, isPending } = useSession();
  const location = useLocation();

  if (isPending) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Logo size={22} className="text-ink-3" />
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  if (!user) {
    // Preserved so the user lands where they were headed after signing in.
    return <Navigate to={routes.loginWithNext(location.pathname)} replace />;
  }

  return <Outlet />;
}
