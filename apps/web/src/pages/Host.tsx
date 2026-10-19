import { RequireRole } from '../components/RequireRole';
import { useAuth } from '../lib/AuthContext';

function HostDashboard() {
  const { profile } = useAuth();

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold">Host dashboard</h1>
      <p className="text-slate-600">
        Signed in as {profile?.name ?? profile?.email}. Quiz creation arrives in Phase 1.
      </p>
    </div>
  );
}

export function Host() {
  return (
    <RequireRole roles={['host', 'admin']} deniedNotice="Host access required.">
      <HostDashboard />
    </RequireRole>
  );
}
