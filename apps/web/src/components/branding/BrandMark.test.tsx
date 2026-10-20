import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BrandMark } from './BrandMark';

afterEach(cleanup);

describe('BrandMark', () => {
  it('shows the institution with its logo, powered by QuizUp', () => {
    render(
      <BrandMark
        branding={{
          institutionName: 'Lincoln High',
          tagline: 'Learning together',
          logoUrl: 'https://abc.supabase.co/storage/v1/object/public/branding/l.png',
        }}
      />,
    );
    expect(screen.getByRole('img', { name: 'Lincoln High logo' })).toBeTruthy();
    expect(screen.getByText('Lincoln High')).toBeTruthy();
    expect(screen.getByText('Learning together')).toBeTruthy();
    expect(screen.getByText(/Powered by/).textContent).toContain('QuizUp');
  });

  it('uses the institution initials on the brand colour when there is no logo', () => {
    render(
      <BrandMark branding={{ institutionName: 'Lincoln High School', brandColor: '#FFFF00' }} />,
    );
    const initials = screen.getByText('LH');
    expect(initials.getAttribute('style')).toContain('background-color: rgb(255, 255, 0)');
    expect(initials.getAttribute('style')).toContain('color: rgb(28, 37, 51)');
  });

  it('falls back to QuizUp alone without branding', () => {
    render(<BrandMark branding={null} />);
    expect(screen.getByRole('img', { name: 'QuizUp' })).toBeTruthy();
    expect(screen.queryByText(/Powered by/)).toBeNull();
  });
});
