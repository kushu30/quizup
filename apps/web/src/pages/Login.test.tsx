import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Login } from './Login';

vi.mock('../lib/AuthContext', () => ({ useAuth: () => ({ session: null, loading: false }) }));
vi.mock('../lib/env', () => ({ webEnv: { VITE_GOOGLE_AUTH_ENABLED: false } }));
vi.mock('../lib/supabase', () => ({ supabase: { auth: {} } }));

afterEach(cleanup);

describe('Login', () => {
  it('tells new people how to get host access', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /create an account|sign up/i }));
    const link = screen.getByRole('link', { name: 'kushagra.shukla2005@gmail.com' });
    expect(link.getAttribute('href')).toContain('mailto:kushagra.shukla2005@gmail.com');
  });
});
