import type { UserRole } from '@quizup/shared';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

interface RequireRoleProps {
  roles: UserRole[];
  deniedNotice: string;
  children: ReactNode;
}

export function RequireRole({ roles, deniedNotice, children }: RequireRoleProps) {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <p role="status" className="py-16 text-center text-muted">
        Loading...
      </p>
    );
  }
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  if (!profile || !roles.includes(profile.role)) {
    return <Navigate to="/" replace state={{ notice: deniedNotice }} />;
  }
  return <>{children}</>;
}
