import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { Join } from './Join';

function PlayProbe() {
  const { code } = useParams();
  const location = useLocation();
  const name = (location.state as { displayName?: string } | null)?.displayName;
  return (
    <p>
      Playing {code} as {name}
    </p>
  );
}

function renderJoin(path = '/join') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/join" element={<Join />} />
        <Route path="/play/:code" element={<PlayProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe('Join', () => {
  it('prefills the join code from the link and moves on to the name', () => {
    renderJoin('/join?code=k7m2qx');
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
});
