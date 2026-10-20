import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LogoUpload } from './LogoUpload';

const storage = vi.hoisted(() => ({
  upload: vi.fn(async () => ({ data: { path: 'p' }, error: null as null | { message: string } })),
  getPublicUrl: vi.fn((path: string) => ({
    data: { publicUrl: `https://abc.supabase.co/storage/v1/object/public/branding/${path}` },
  })),
  from: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    storage: {
      from: (bucket: string) => {
        storage.from(bucket);
        return { upload: storage.upload, getPublicUrl: storage.getPublicUrl };
      },
    },
  },
}));

const HOST = '22222222-2222-4222-8222-222222222222';
const QUIZ = '11111111-1111-4111-8111-111111111111';

function file(name: string, type: string, size: number) {
  const blob = new File([new Uint8Array(size)], name, { type });
  return blob;
}

function renderUpload(value?: string) {
  const onChange = vi.fn();
  render(<LogoUpload hostId={HOST} quizId={QUIZ} value={value} onChange={onChange} />);
  return { onChange, input: screen.getByLabelText('Logo') as HTMLInputElement };
}

async function choose(input: HTMLInputElement, chosen: File) {
  await act(async () => {
    fireEvent.change(input, { target: { files: [chosen] } });
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('LogoUpload', () => {
  it('refuses SVG files before uploading', async () => {
    const { input, onChange } = renderUpload();
    await choose(input, file('logo.svg', 'image/svg+xml', 500));
    expect(screen.getByText('Use a PNG, JPEG or WebP image.')).toBeTruthy();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(storage.upload).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('refuses images over 1 MB before uploading', async () => {
    const { input } = renderUpload();
    await choose(input, file('logo.png', 'image/png', 1024 * 1024 + 1));
    expect(screen.getByText('The logo must be 1 MB or smaller.')).toBeTruthy();
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('uploads into the host folder and reports the public link', async () => {
    const { input, onChange } = renderUpload();
    await choose(input, file('School Logo.PNG', 'image/png', 2000));
    expect(storage.from).toHaveBeenCalledWith('branding');
    const [path, uploaded, options] = storage.upload.mock.calls[0] as unknown as [
      string,
      File,
      { contentType: string; upsert: boolean },
    ];
    expect(path).toMatch(new RegExp(`^${HOST}/${QUIZ}-\\d+\\.png$`));
    expect(uploaded.name).toBe('School Logo.PNG');
    expect(options).toMatchObject({ contentType: 'image/png', upsert: false });
    expect(onChange).toHaveBeenCalledWith(
      `https://abc.supabase.co/storage/v1/object/public/branding/${path}`,
    );
  });

  it('shows the storage error when the upload fails', async () => {
    storage.upload.mockResolvedValueOnce({
      data: { path: '' },
      error: { message: 'Bucket not found' },
    });
    const { input, onChange } = renderUpload();
    await choose(input, file('logo.webp', 'image/webp', 2000));
    expect(screen.getByRole('alert').textContent).toContain('Bucket not found');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('previews the current logo and can remove it', () => {
    const { onChange } = renderUpload(
      'https://abc.supabase.co/storage/v1/object/public/branding/x.png',
    );
    expect(screen.getByRole('img', { name: 'Current logo' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove logo' }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
