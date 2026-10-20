import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Login } from './Login';

const auth = vi.hoisted(() => ({ session: null as unknown }));
const supabaseAuth = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
}));

vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({ session: auth.session, loading: false }),
}));
vi.mock('../lib/env', () => ({ webEnv: { VITE_GOOGLE_AUTH_ENABLED: false } }));
vi.mock('../lib/supabase', () => ({ supabase: { auth: supabaseAuth } }));

function Where() {
  return <p>At {useLocation().pathname}</p>;
}

function renderLogin(path = '/login') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Where />} />
        <Route path="/host" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  auth.session = null;
  supabaseAuth.signUp.mockResolvedValue({ data: { session: {} }, error: null });
  supabaseAuth.signInWithPassword.mockResolvedValue({ error: null });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Login', () => {
  it('tells new people how to get host access', () => {
    renderLogin();
    fireEvent.click(screen.getByRole('button', { name: /create an account|sign up/i }));
    const link = screen.getByRole('link', { name: 'kushagra.shukla2005@gmail.com' });
    expect(link.getAttribute('href')).toContain('mailto:kushagra.shukla2005@gmail.com');
  });

  it('opens as a plain sign-in with an empty, editable email when there is no invitation', () => {
    renderLogin();
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeTruthy();
    const email = screen.getByLabelText('Email') as HTMLInputElement;
    expect(email.value).toBe('');
    expect(email.readOnly).toBe(false);
  });
});

describe('Login from an invitation email', () => {
  const NEW_HOST = '/login?mode=sign-up&email=meera.iyer%40school.org&invite=host';
  const OLD_HOST = '/login?email=meera.iyer%40school.org&invite=host';

  it('opens on sign-up with the invited address filled in and locked', () => {
    renderLogin(NEW_HOST);
    expect(screen.getByRole('heading', { level: 1, name: 'Create an account' })).toBeTruthy();
    const email = screen.getByLabelText('Email') as HTMLInputElement;
    expect(email.value).toBe('meera.iyer@school.org');
    expect(email.readOnly).toBe(true);
    expect(screen.getByRole('status').textContent).toMatch(/invited to host/i);
    expect(screen.getByRole('status').textContent).toMatch(
      /create your account with this email address/i,
    );
    expect(screen.queryByRole('link', { name: 'kushagra.shukla2005@gmail.com' })).toBeNull();
  });

  it('opens on sign-in, address locked, for someone who already has an account', () => {
    renderLogin(OLD_HOST);
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeTruthy();
    expect((screen.getByLabelText('Email') as HTMLInputElement).readOnly).toBe(true);
    expect(screen.getByRole('status').textContent).toMatch(/sign in with this email address/i);
  });

  it('creates the account and goes straight to the host dashboard', async () => {
    renderLogin(NEW_HOST);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Meera Iyer' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret-pass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    await waitFor(() =>
      expect(supabaseAuth.signUp).toHaveBeenCalledWith({
        email: 'meera.iyer@school.org',
        password: 'secret-pass',
        options: { data: { name: 'Meera Iyer' } },
      }),
    );
    expect(await screen.findByText('At /host')).toBeTruthy();
  });

  it('signs an existing host in and goes to the host dashboard', async () => {
    renderLogin(OLD_HOST);
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret-pass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() =>
      expect(supabaseAuth.signInWithPassword).toHaveBeenCalledWith({
        email: 'meera.iyer@school.org',
        password: 'secret-pass',
      }),
    );
    expect(await screen.findByText('At /host')).toBeTruthy();
  });

  it('asks to confirm the email when the project requires it, and stays put', async () => {
    supabaseAuth.signUp.mockResolvedValue({ data: { session: null }, error: null });
    renderLogin(NEW_HOST);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Meera Iyer' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret-pass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(await screen.findByText(/Check your email to confirm/)).toBeTruthy();
    expect(screen.queryByText('At /host')).toBeNull();
  });

  it('sends someone who is already signed in straight to the dashboard', () => {
    auth.session = {};
    renderLogin(OLD_HOST);
    expect(screen.getByText('At /host')).toBeTruthy();
  });

  it('opens sign-up for a student invitation with the address filled in but still editable', () => {
    renderLogin('/login?mode=sign-up&email=asha%40example.com');
    expect(screen.getByRole('heading', { level: 1, name: 'Create an account' })).toBeTruthy();
    const email = screen.getByLabelText('Email') as HTMLInputElement;
    expect(email.value).toBe('asha@example.com');
    expect(email.readOnly).toBe(false);
    expect(screen.queryByText(/invited to host/i)).toBeNull();
  });

  it('ignores an address in the link that is not an email', () => {
    renderLogin('/login?mode=sign-up&email=nonsense&invite=host');
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Email') as HTMLInputElement).readOnly).toBe(false);
  });
});
