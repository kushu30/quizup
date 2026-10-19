import { joinFormSchema } from '@quizup/shared';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

export function Join() {
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = joinFormSchema.safeParse({ joinCode, displayName });
    if (!result.success) {
      setErrors(result.error.issues.map((issue) => issue.message));
      return;
    }
    navigate(`/play/${result.data.joinCode}`, { state: { displayName: result.data.displayName } });
  }

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <h1 className="text-2xl font-bold">Join a quiz</h1>
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block text-sm">
          Join code
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-3 text-center text-2xl uppercase tracking-widest"
            autoCapitalize="characters"
            autoComplete="off"
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value)}
          />
        </label>
        <label className="block text-sm">
          Display name
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-3 text-lg"
            autoComplete="off"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </label>
        {errors.map((error) => (
          <p key={error} className="text-sm text-red-700">
            {error}
          </p>
        ))}
        <button
          type="submit"
          className="w-full rounded-md bg-slate-900 px-4 py-3 text-lg text-white"
        >
          Join
        </button>
      </form>
    </div>
  );
}
