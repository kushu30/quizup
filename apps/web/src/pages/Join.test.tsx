import type { JoinInfo } from '@quizup/shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Layout } from '../components/Layout';
import { fetchJoinInfo } from '../lib/joinInfoClient';
import { Join } from './Join';

vi.mock('../lib/joinInfoClient', () => ({ fetchJoinInfo: vi.fn(async () => null) }));
vi.mock('../components/SystemStatus', () => ({ SystemStatus: () => null }));
vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({ session: null, canHost: false, isAdmin: false, signOut: vi.fn() }),
}));

const BRANDED: JoinInfo = {
  quizTitle: 'Mid-term assessment',
  branding: {
    institutionName: 'St. Xavier College',
    tagline: 'Department of Mathematics',
    brandColor: '#7A1F2B',
    welcomeMessage: 'Welcome to the mid-term.',
  },
  assessmentType: 'exam',
  accessMode: 'open',
  durationMinutes: 45,
  status: 'lobby',
};

function PlayProbe() {
  const { code } = useParams();
  const location = useLocation();
  const state = location.state as {
    displayName?: string;
    accessToken?: string;
    joinInfo?: JoinInfo;
  } | null;
  const name =
    state?.displayName ?? (state?.accessToken ? `token ${state.accessToken}` : undefined);
  const brand = state?.joinInfo?.branding?.institutionName;
  return (
    <p>
      Playing {code} as {name}
      {brand ? ` with brand ${brand}` : ''}
    </p>
  );
}

function renderJoin(path = '/join') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/join" element={<Join />} />
          <Route path="/join/:code" element={<Join />} />
          <Route path="/play/:code" element={<PlayProbe />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(fetchJoinInfo).mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Join', () => {
  it('prefills the join code from the link and moves on to the name', () => {
    renderJoin('/join?code=k7m2qx');
    expect((screen.getByLabelText('Join code') as HTMLInputElement).value).toBe('K7M2QX');
    expect(document.activeElement).toBe(screen.getByLabelText('Display name'));
  });

  it('prefills the join code from a short link path', () => {
    renderJoin('/join/k7m2qx');
    expect((screen.getByLabelText('Join code') as HTMLInputElement).value).toBe('K7M2QX');
    expect(document.activeElement).toBe(screen.getByLabelText('Display name'));
  });

  it('starts empty without a code in the link', () => {
    renderJoin();
    expect((screen.getByLabelText('Join code') as HTMLInputElement).value).toBe('');
  });

  it('shows each problem on the field it belongs to', () => {
    renderJoin();
    fireEvent.change(screen.getByLabelText('Join code'), { target: { value: 'AB' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));

    const code = screen.getByLabelText('Join code');
    const name = screen.getByLabelText('Display name');
    expect(code.getAttribute('aria-invalid')).toBe('true');
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Join code is 6 characters')).toBeTruthy();
    expect(screen.getByText('Enter a display name')).toBeTruthy();
  });

  it('goes to the game with the cleaned-up code and name', () => {
    renderJoin();
    fireEvent.change(screen.getByLabelText('Join code'), { target: { value: ' k7m2qx ' } });
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: '  Ada ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(screen.getByText('Playing K7M2QX as Ada')).toBeTruthy();
  });

  it('looks up the quiz for the code in the link and dresses the page in its brand', async () => {
    vi.mocked(fetchJoinInfo).mockResolvedValue(BRANDED);
    renderJoin('/join/k7m2qx');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mid-term assessment' }),
    ).toBeTruthy();
    expect(fetchJoinInfo).toHaveBeenCalledWith('K7M2QX');
    expect(screen.getAllByText('St. Xavier College').length).toBeGreaterThan(0);
    expect(screen.getByText('Welcome to the mid-term.')).toBeTruthy();
    expect(screen.getByText(/Timed exam, 45 minutes/)).toBeTruthy();
    expect(screen.getByTestId('brand-stripe')).toBeTruthy();
    const join = screen.getByRole('button', { name: 'Join' });
    expect(join.getAttribute('style')).toContain('background-color: rgb(122, 31, 43)');
    expect(join.getAttribute('style')).toContain('color: rgb(255, 255, 255)');
  });

  it('looks the quiz up as soon as a full code is typed, and not for a partial one', async () => {
    vi.mocked(fetchJoinInfo).mockResolvedValue(BRANDED);
    renderJoin();
    fireEvent.change(screen.getByLabelText('Join code'), { target: { value: 'k7m' } });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(fetchJoinInfo).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Join code'), { target: { value: ' k7m2qx ' } });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mid-term assessment' }),
    ).toBeTruthy();
    expect(fetchJoinInfo).toHaveBeenCalledTimes(1);
    expect(fetchJoinInfo).toHaveBeenCalledWith('K7M2QX');
  });

  it('keeps the typing cursor in the code field when the brand appears', async () => {
    vi.mocked(fetchJoinInfo).mockResolvedValue(BRANDED);
    renderJoin();
    const field = screen.getByLabelText('Join code') as HTMLInputElement;
    field.focus();
    fireEvent.change(field, { target: { value: 'K7M2QX' } });
    await screen.findByRole('heading', { level: 1, name: 'Mid-term assessment' });
    expect(screen.getByLabelText('Join code')).toBe(field);
    expect(document.activeElement).toBe(field);
  });

  it('drops the brand again when the code changes to something unknown', async () => {
    vi.mocked(fetchJoinInfo).mockResolvedValueOnce(BRANDED).mockResolvedValue(null);
    renderJoin('/join/K7M2QX');
    await screen.findByRole('heading', { level: 1, name: 'Mid-term assessment' });
    fireEvent.change(screen.getByLabelText('Join code'), { target: { value: 'ZZZZZZ' } });
    await waitFor(() => expect(screen.queryByTestId('brand-stripe')).toBeNull());
    expect(screen.getByRole('heading', { level: 1, name: 'Join a quiz' })).toBeTruthy();
  });

  it('shows the quiz title but plain styling for a quiz without branding', async () => {
    vi.mocked(fetchJoinInfo).mockResolvedValue({
      quizTitle: 'Fractions review',
      branding: null,
      assessmentType: 'live',
      accessMode: 'open',
      durationMinutes: null,
      status: 'lobby',
    });
    renderJoin('/join/K7M2QX');
    expect(await screen.findByRole('heading', { level: 1, name: 'Fractions review' })).toBeTruthy();
    expect(screen.queryByTestId('brand-stripe')).toBeNull();
    expect(screen.getByRole('button', { name: 'Join' })).toBeTruthy();
  });

  it('says a finished quiz has ended and does not let anyone join it', async () => {
    vi.mocked(fetchJoinInfo).mockResolvedValue({ ...BRANDED, status: 'ended' });
    renderJoin('/join/K7M2QX');
    expect(await screen.findByText(/This quiz has ended/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Join' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('hands the looked-up brand to the game so it can be shown while connecting', async () => {
    vi.mocked(fetchJoinInfo).mockResolvedValue(BRANDED);
    renderJoin('/join/K7M2QX');
    await screen.findByRole('heading', { level: 1, name: 'Mid-term assessment' });
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Ada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(
      await screen.findByText('Playing K7M2QX as Ada with brand St. Xavier College'),
    ).toBeTruthy();
  });

  describe('access-token quizzes', () => {
    const TOKEN_INFO: JoinInfo = { ...BRANDED, accessMode: 'token' };

    it('asks for the access token instead of a name', async () => {
      vi.mocked(fetchJoinInfo).mockResolvedValue(TOKEN_INFO);
      renderJoin('/join/K7M2QX');
      expect(await screen.findByLabelText('Access token')).toBeTruthy();
      expect(screen.queryByLabelText('Display name')).toBeNull();
      expect(screen.getByText(/personal access token/i)).toBeTruthy();
    });

    it('fills the token from the link and goes to the quiz with it', async () => {
      vi.mocked(fetchJoinInfo).mockResolvedValue(TOKEN_INFO);
      renderJoin('/join/K7M2QX#token=abcde-23456');
      const field = (await screen.findByLabelText('Access token')) as HTMLInputElement;
      expect(field.value).toBe('ABCDE-23456');
      fireEvent.click(screen.getByRole('button', { name: 'Join' }));
      expect(
        await screen.findByText('Playing K7M2QX as token ABCDE23456 with brand St. Xavier College'),
      ).toBeTruthy();
    });

    it('rejects a token of the wrong length on the field', async () => {
      vi.mocked(fetchJoinInfo).mockResolvedValue(TOKEN_INFO);
      renderJoin('/join/K7M2QX');
      const field = await screen.findByLabelText('Access token');
      fireEvent.change(field, { target: { value: 'ABC' } });
      fireEvent.click(screen.getByRole('button', { name: 'Join' }));
      expect(field.getAttribute('aria-invalid')).toBe('true');
      expect(screen.getByText('Enter the 10-character token your host gave you')).toBeTruthy();
    });
  });
});
