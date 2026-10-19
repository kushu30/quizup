import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Admin } from './pages/Admin';
import { Host } from './pages/Host';
import { Join } from './pages/Join';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/host" element={<Host />} />
        <Route path="/join" element={<Join />} />
      </Route>
    </Routes>
  );
}
