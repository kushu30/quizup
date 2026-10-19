import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

export function Layout() {
  const { session, canHost, isAdmin, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <nav className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-lg font-semibold">
            QuizUp
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link to="/join" className="hover:underline">
              Join
            </Link>
            {canHost && (
              <Link to="/host" className="hover:underline">
                Host
              </Link>
            )}
            {isAdmin && (
              <Link to="/admin" className="hover:underline">
                Admin
              </Link>
            )}
            {session ? (
              <button type="button" onClick={() => void signOut()} className="hover:underline">
                Sign out
              </button>
            ) : (
              <Link to="/login" className="hover:underline">
                Log in
              </Link>
            )}
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
