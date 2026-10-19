import { QuestionBank } from '../components/QuestionBank';
import { PageHeader, Panel } from '../components/ui';

export function QuestionBankPage() {
  return (
    <div>
      <PageHeader
        title="Question bank"
        description="Every question across your quizzes."
        back={{ to: '/host', label: 'Back to dashboard' }}
      />
      <Panel>
        <QuestionBank />
      </Panel>
    </div>
  );
}
