import { MAX_POOL_COUNT, MAX_POOL_RULES, type PoolRule } from '@quizup/shared';
import { useId, useState } from 'react';
import { ctaLight, ctaQuiet, ctaSize } from './landing/cta';

export interface ModuleCount {
  name: string;
  count: number;
}

interface DeliveryOptionsProps {
  assessmentType: 'live' | 'exam';
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  pools: PoolRule[];
  modules: ModuleCount[];
  onShuffleQuestionsChange: (value: boolean) => void;
  onShuffleOptionsChange: (value: boolean) => void;
  onPoolsChange: (pools: PoolRule[]) => void;
}

export function Switch({
  title,
  hint,
  checked,
  onChange,
}: {
  title: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const titleId = useId();
  const hintId = useId();
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-white p-3 shadow-[0_0_0_1px_rgba(17,16,20,0.12)] transition-shadow duration-200 ease-soft hover:shadow-[0_0_0_1px_rgba(17,16,20,0.25)] has-[:focus-visible]:shadow-[0_0_0_2px_var(--color-accent-500)]">
      <input
        type="checkbox"
        className="peer sr-only"
        aria-labelledby={titleId}
        aria-describedby={hintId}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span
        aria-hidden="true"
        className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-night/20 transition-colors duration-200 ease-soft peer-checked:bg-night after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:duration-200 after:ease-soft peer-checked:after:translate-x-4"
      />
      <span className="min-w-0">
        <span id={titleId} className="block text-[0.9375rem] font-medium">
          {title}
        </span>
        <span id={hintId} className="block text-[0.8125rem] leading-snug text-night/55">
          {hint}
        </span>
      </span>
    </label>
  );
}

function PoolCount({
  module,
  value,
  onChange,
}: {
  module: string;
  value: number;
  onChange: (count: number) => void;
}) {
  const [text, setText] = useState(String(value));
  return (
    <input
      type="number"
      min={1}
      max={MAX_POOL_COUNT}
      aria-label={`Questions to draw from ${module}`}
      className="h-9 w-16 rounded-lg bg-white px-2 text-center font-geist-mono text-sm shadow-[0_0_0_1px_rgba(17,16,20,0.14)] transition-shadow duration-200 ease-soft focus:shadow-[0_0_0_2px_var(--color-accent-500)] focus:outline-none"
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        const count = Number(event.target.value);
        if (Number.isInteger(count) && count >= 1 && count <= MAX_POOL_COUNT) {
          onChange(count);
        }
      }}
    />
  );
}

function ruleNotice(rule: PoolRule, available: number): string | null {
  if (available === 0) {
    return `${rule.module} has no approved questions, so this rule does nothing.`;
  }
  if (rule.count > available) {
    return available === 1
      ? `${rule.module} has only 1 approved question, so it is used.`
      : `${rule.module} has only ${available} approved questions, so all ${available} are used.`;
  }
  return null;
}

export function DeliveryOptions({
  assessmentType,
  shuffleQuestions,
  shuffleOptions,
  pools,
  modules,
  onShuffleQuestionsChange,
  onShuffleOptionsChange,
  onPoolsChange,
}: DeliveryOptionsProps) {
  const exam = assessmentType === 'exam';
  const countOf = (name: string) =>
    modules.find((module) => module.name.toLowerCase() === name.toLowerCase())?.count ?? 0;
  const hasRule = (name: string) =>
    pools.some((rule) => rule.module.toLowerCase() === name.toLowerCase());
  const nextModule = modules.find((module) => !hasRule(module.name));
  const total = modules.reduce((sum, module) => sum + module.count, 0);
  const always = modules.reduce(
    (sum, module) => sum + (hasRule(module.name) ? 0 : module.count),
    0,
  );
  const drawn = pools.reduce((sum, rule) => sum + Math.min(rule.count, countOf(rule.module)), 0);

  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium text-night">Delivery</legend>
      <Switch
        title="Shuffle question order"
        checked={shuffleQuestions}
        onChange={onShuffleQuestionsChange}
        hint={
          exam
            ? shuffleQuestions
              ? 'On: every student gets the questions in their own random order.'
              : 'Off: every student gets the questions in the order shown below.'
            : shuffleQuestions
              ? 'On: each session mixes the questions into a new random order.'
              : 'Off: students get the questions in the order shown below.'
        }
      />
      {exam && (
        <Switch
          title="Shuffle answer options"
          checked={shuffleOptions}
          onChange={onShuffleOptionsChange}
          hint={
            shuffleOptions
              ? 'On: every student sees the answers in their own order.'
              : 'Off: answers appear in the order you wrote them.'
          }
        />
      )}

      <div className="space-y-2 rounded-xl bg-white p-3 shadow-[0_0_0_1px_rgba(17,16,20,0.12)]">
        <p className="text-[0.9375rem] font-medium">Question pools</p>
        <p className="text-[0.8125rem] leading-snug text-night/55">
          Give {exam ? 'each student' : 'each session'} a random selection from a module. Modules
          without a rule are always included.
        </p>
        {pools.map((rule) => {
          const available = countOf(rule.module);
          const notice = ruleNotice(rule, available);
          return (
            <div
              key={rule.module}
              role="group"
              aria-label={`Pool rule for ${rule.module}`}
              className="space-y-1 rounded-lg bg-night/[0.035] p-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm">Draw</span>
                <PoolCount
                  module={rule.module}
                  value={rule.count}
                  onChange={(count) =>
                    onPoolsChange(
                      pools.map((candidate) =>
                        candidate.module === rule.module ? { ...candidate, count } : candidate,
                      ),
                    )
                  }
                />
                <span className="text-sm">from</span>
                <strong className="text-sm font-medium break-words">{rule.module}</strong>
                <span className="text-[0.8125rem] text-night/50">
                  of {available} approved questions
                </span>
                <button
                  type="button"
                  className={`${ctaQuiet} ${ctaSize.sm} ml-auto`}
                  aria-label={`Remove the rule for ${rule.module}`}
                  onClick={() =>
                    onPoolsChange(pools.filter((candidate) => candidate.module !== rule.module))
                  }
                >
                  Remove
                </button>
              </div>
              {notice && <p className="text-[0.8125rem] text-amber-800">{notice}</p>}
            </div>
          );
        })}
        <button
          type="button"
          className={`${ctaLight} ${ctaSize.sm}`}
          disabled={!nextModule || pools.length >= MAX_POOL_RULES}
          onClick={() =>
            nextModule && onPoolsChange([...pools, { module: nextModule.name, count: 1 }])
          }
        >
          Add a pool rule
        </button>
        {pools.length > 0 && (
          <p className="text-[0.8125rem]">
            <strong className="font-medium">
              Each student gets {always + drawn} of {total} questions.
            </strong>{' '}
            {always > 0 && `The other ${always} are always included.`}
          </p>
        )}
      </div>
    </fieldset>
  );
}
