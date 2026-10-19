import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

export function Host() {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return <p className="text-slate-600">Loading...</p>;
  }
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  if (profile?.role !== 'host') {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Hosts only</h1>
        <p className="text-slate-600">This account is not a host account.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold">Host dashboard</h1>
      <p className="text-slate-600">
        Signed in as {profile.name ?? profile.email}. Quiz creation arrives in Phase 1.
      </p>
    </div>
  );
}
