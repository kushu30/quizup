import { PageBody, PageHeader } from '../components/app/Page';
import { QuestionBank } from '../components/QuestionBank';

export function QuestionBankPage() {
  return (
    <section className="flex flex-1 flex-col">
      <PageHeader title="Question bank" description="Every question across your quizzes." />
      <PageBody className="pt-6">
        <QuestionBank edge />
      </PageBody>
    </section>
  );
}
