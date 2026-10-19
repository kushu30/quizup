import { Outlet } from 'react-router-dom';
import { RequireRole } from './RequireRole';

export function HostRoute() {
  return (
    <RequireRole roles={['host', 'admin']} deniedNotice="Host access required.">
      <Outlet />
    </RequireRole>
  );
}
