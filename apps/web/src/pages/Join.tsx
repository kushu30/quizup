import { joinFormSchema } from '@quizup/shared';
import { useState, type FormEvent } from 'react';

export function Join() {
  const [joinCode, setJoinCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = joinFormSchema.safeParse({ joinCode, displayName });
    if (!result.success) {
      setErrors(result.error.issues.map((issue) => issue.message));
      setNotice(null);
      return;
    }
    setErrors([]);
    setNotice('joining arrives in Phase 1');
  }

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <h1 className="text-2xl font-bold">Join a quiz</h1>
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block text-sm">
          Join code
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 uppercase"
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value)}
          />
        </label>
        <label className="block text-sm">
          Display name
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </label>
        {errors.map((error) => (
          <p key={error} className="text-sm text-red-700">
            {error}
          </p>
        ))}
        {notice && <p className="text-sm text-slate-700">{notice}</p>}
        <button type="submit" className="w-full rounded-md bg-slate-900 px-4 py-2 text-white">
          Join
        </button>
      </form>
    </div>
  );
}
