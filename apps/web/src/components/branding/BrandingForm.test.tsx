import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrandingForm } from './BrandingForm';

vi.mock('../../lib/supabase', () => ({ supabase: { storage: { from: vi.fn() } } }));

afterEach(cleanup);

function renderForm(initial = {}) {
  const onSave = vi.fn(async () => undefined);
  render(
    <BrandingForm
      initial={initial}
      hostId="22222222-2222-4222-8222-222222222222"
      quizId="11111111-1111-4111-8111-111111111111"
      onSave={onSave}
    />,
  );
  return { onSave };
}

describe('BrandingForm', () => {
  it('labels every branding field', () => {
    renderForm();
    for (const label of [
      'Institution name',
      'Tagline',
      'Brand colour',
      'Welcome message',
      'Instructions for students',
      'Logo',
    ]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  it('shows a colour problem on the colour field and does not save', async () => {
    const { onSave } = renderForm();
    fireEvent.change(screen.getByLabelText('Brand colour'), { target: { value: '#12' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save branding' }));
    });
    expect(screen.getByLabelText('Brand colour').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Use a colour like #1E5446')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves cleaned up branding and confirms', async () => {
    const { onSave } = renderForm({ tagline: 'Old tagline' });
    fireEvent.change(screen.getByLabelText('Institution name'), {
      target: { value: '  Lincoln High ' },
    });
    fireEvent.change(screen.getByLabelText('Tagline'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Brand colour'), { target: { value: '#7a1f2b' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save branding' }));
    });
    expect(onSave).toHaveBeenCalledWith({ institutionName: 'Lincoln High', brandColor: '#7a1f2b' });
    expect(screen.getByRole('status').textContent).toBe('Branding saved');
  });

  it('previews the student intro as the host types', () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('Institution name'), {
      target: { value: 'Lincoln High' },
    });
    const preview = screen.getByRole('region', { name: 'Preview' });
    expect(within(preview).getByText('Lincoln High')).toBeTruthy();
    expect(within(preview).getByText(/Powered by/)).toBeTruthy();
  });
});
