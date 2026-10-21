import type { AssessmentType } from '@quizup/shared';
import { Switch } from './DeliveryOptions';

interface ResultsOptionsProps {
  assessmentType: AssessmentType;
  showCorrectAnswers: boolean;
  onChange: (value: boolean) => void;
}

export function ResultsOptions({
  assessmentType,
  showCorrectAnswers,
  onChange,
}: ResultsOptionsProps) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium text-night">Results</legend>
      <Switch
        title="Show correct answers to students"
        checked={showCorrectAnswers}
        onChange={onChange}
        hint={
          showCorrectAnswers
            ? 'On: in My results, students see which answers were right and what the correct answer was.'
            : assessmentType === 'exam'
              ? 'Off: students see their score and the answers they gave, but not which were right. This protects exam questions you reuse.'
              : 'Off: students see their score and the answers they gave, but not which were right.'
        }
      />
    </fieldset>
  );
}
