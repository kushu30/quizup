import { Link } from 'react-router-dom';
import { ServerStatus } from '../components/ServerStatus';

export function Landing() {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-3xl font-bold">QuizUp</h1>
        <p className="text-slate-600">
          Open-source, self-hostable, AI-assisted real-time assessment platform.
        </p>
        <div className="flex gap-3">
          <Link to="/join" className="rounded-md bg-slate-900 px-4 py-2 text-white">
            Join a quiz
          </Link>
          <Link to="/host" className="rounded-md border border-slate-300 bg-white px-4 py-2">
            Host dashboard
          </Link>
        </div>
      </section>
      <ServerStatus />
    </div>
  );
}
