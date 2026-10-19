import { Route, Routes } from 'react-router-dom';
import { HostRoute } from './components/HostRoute';
import { Layout } from './components/Layout';
import { Admin } from './pages/Admin';
import { Host } from './pages/Host';
import { HostConsole } from './pages/HostConsole';
import { Join } from './pages/Join';
import { Landing } from './pages/Landing';
import { LearnerProfilePage } from './pages/LearnerProfilePage';
import { Login } from './pages/Login';
import { Play } from './pages/Play';
import { QuestionBankPage } from './pages/QuestionBankPage';
import { QuizEditor } from './pages/QuizEditor';
import { SessionSummaryPage } from './pages/SessionSummaryPage';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<Admin />} />
        <Route element={<HostRoute />}>
          <Route path="/host" element={<Host />} />
          <Route path="/host/quizzes/:quizId" element={<QuizEditor />} />
          <Route path="/host/sessions/:sessionId" element={<HostConsole />} />
          <Route path="/sessions/:sessionId/summary" element={<SessionSummaryPage />} />
          <Route path="/host/questions" element={<QuestionBankPage />} />
        </Route>
        <Route path="/join" element={<Join />} />
        <Route path="/join/:code" element={<Join />} />
        <Route path="/me/learner-profile" element={<LearnerProfilePage />} />
        <Route path="/play/:code" element={<Play />} />
      </Route>
    </Routes>
  );
}
