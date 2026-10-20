import { Outlet } from 'react-router-dom';
import { HOST_ACCESS_CONTACT_EMAIL } from '../lib/contact';
import { RequireRole } from './RequireRole';

export function HostRoute() {
  return (
    <RequireRole
      roles={['host', 'admin']}
      deniedNotice={`Host access required. To request it, email ${HOST_ACCESS_CONTACT_EMAIL}.`}
    >
      <Outlet />
    </RequireRole>
  );
}
