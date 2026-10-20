import type { DeviceInfo } from '@quizup/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StudentDevice } from './StudentDevice';

afterEach(cleanup);

const PHONE: DeviceInfo = {
  kind: 'phone',
  os: 'iOS 17',
  browser: 'Safari 17',
  screen: { width: 390, height: 844 },
};
const LAPTOP: DeviceInfo = { kind: 'computer', os: 'Windows', browser: 'Chrome 120', screen: null };

describe('StudentDevice', () => {
  it('shows the kind of device and keeps the rest in a small dropdown', () => {
    render(<StudentDevice devices={[PHONE]} />);
    const toggle = screen.getByText('Phone');
    expect(toggle.closest('summary')).toBeTruthy();
    expect(screen.getByText('Phone, iOS 17, Safari 17, 390 × 844')).toBeTruthy();
    const details = toggle.closest('details');
    expect(details?.hasAttribute('open')).toBe(false);
    fireEvent.click(toggle);
  });

  it('lists every device when the student switched, newest last, and says so', () => {
    render(<StudentDevice devices={[PHONE, LAPTOP]} />);
    expect(screen.getByText('Computer')).toBeTruthy();
    expect(screen.getByText('Phone, iOS 17, Safari 17, 390 × 844')).toBeTruthy();
    expect(screen.getByText('Computer, Windows, Chrome 120')).toBeTruthy();
    expect(screen.getByText('Used 2 devices')).toBeTruthy();
  });

  it('says unknown when nothing was recorded', () => {
    render(<StudentDevice devices={[]} />);
    expect(screen.getByText('Unknown')).toBeTruthy();
    expect(screen.getByText('No device recorded')).toBeTruthy();
  });

  it('prints odd agent text as plain text', () => {
    render(
      <StudentDevice
        devices={[
          { kind: 'unknown', os: '<img src=x onerror=alert(1)>', browser: null, screen: null },
        ]}
      />,
    );
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
  });
});
