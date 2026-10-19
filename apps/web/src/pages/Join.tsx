import { joinFormSchema } from '@quizup/shared';
import { useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, PageHeader, TextField } from '../components/ui';

type FieldErrors = Partial<Record<'joinCode' | 'displayName', string>>;

export function Join() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { code: pathCode } = useParams();
  const prefilledCode = (pathCode ?? searchParams.get('code') ?? '').trim().toUpperCase();
  const [joinCode, setJoinCode] = useState(prefilledCode);
  const [displayName, setDisplayName] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = joinFormSchema.safeParse({ joinCode, displayName });
    if (!result.success) {
      const next: FieldErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if ((field === 'joinCode' || field === 'displayName') && !next[field]) {
          next[field] = issue.message;
        }
      }
      setErrors(next);
      return;
    }
    navigate(`/play/${result.data.joinCode}`, { state: { displayName: result.data.displayName } });
  }

  return (
    <div className="mx-auto max-w-md">
      <PageHeader
        title="Join a quiz"
        description="Enter the code your host shows on screen and the name others will see."
      />
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <TextField
          label="Join code"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          autoFocus={!prefilledCode}
          value={joinCode}
          error={errors.joinCode}
          onChange={(event) => setJoinCode(event.target.value)}
          inputClassName="py-3 text-center text-title font-semibold tracking-[0.3em] uppercase tabular-nums"
        />
        <TextField
          label="Display name"
          autoComplete="off"
          autoFocus={Boolean(prefilledCode)}
          value={displayName}
          error={errors.displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          inputClassName="py-3 text-lg"
        />
        <Button type="submit" size="lg" className="w-full">
          Join
        </Button>
      </form>
    </div>
  );
}
