import { Link } from 'react-router-dom';
import { QuestionBank } from '../components/QuestionBank';

export function QuestionBankPage() {
  return (
    <div className="space-y-4">
      <Link to="/host" className="text-sm hover:underline">
        Back to dashboard
      </Link>
      <h1 className="text-2xl font-bold">Question bank</h1>
      <p className="text-slate-600">Every question across your quizzes.</p>
      <QuestionBank />
    </div>
  );
}
