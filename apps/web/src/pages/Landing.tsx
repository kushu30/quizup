import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { ServerStatus } from '../components/ServerStatus';

export function Landing() {
  const { canHost } = useAuth();
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice;

  return (
    <div className="space-y-8">
      {notice && (
        <p className="rounded-md bg-amber-100 px-4 py-2 text-sm text-amber-900">{notice}</p>
      )}
      <section className="space-y-3">
        <h1 className="text-3xl font-bold">QuizUp</h1>
        <p className="text-slate-600">
          Open-source, self-hostable, AI-assisted real-time assessment platform.
        </p>
        <div className="flex gap-3">
          <Link to="/join" className="rounded-md bg-slate-900 px-4 py-2 text-white">
            Join a quiz
          </Link>
          {canHost && (
            <Link to="/host" className="rounded-md border border-slate-300 bg-white px-4 py-2">
              Host dashboard
            </Link>
          )}
        </div>
      </section>
      <ServerStatus />
    </div>
  );
}
