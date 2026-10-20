import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuestionImageField } from './QuestionImageField';

const storage = vi.hoisted(() => ({
  upload: vi.fn(async () => ({ data: { path: 'p' }, error: null as null | { message: string } })),
  getPublicUrl: vi.fn((path: string) => ({
    data: { publicUrl: `https://abc.supabase.co/storage/v1/object/public/question-images/${path}` },
  })),
  from: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'host-1' } } } }),
    },
    storage: {
      from: (bucket: string) => {
        storage.from(bucket);
        return { upload: storage.upload, getPublicUrl: storage.getPublicUrl };
      },
    },
  },
}));

function file(name: string, type: string, size: number) {
  return new File([new Uint8Array(size)], name, { type });
}

function renderField(value: { imageUrl?: string | null; imageAlt?: string | null } = {}) {
  const onChange = vi.fn();
  render(
    <QuestionImageField
      imageUrl={value.imageUrl ?? null}
      imageAlt={value.imageAlt ?? null}
      onChange={onChange}
    />,
  );
  return { onChange, input: screen.getByLabelText('Image (optional)') as HTMLInputElement };
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

describe('QuestionImageField', () => {
  it('refuses a file that is not PNG, JPEG or WebP before uploading', async () => {
    const { input, onChange } = renderField();
    await choose(input, file('a.gif', 'image/gif', 100));
    expect(screen.getByText('Use a PNG, JPEG or WebP image.')).toBeTruthy();
    expect(storage.upload).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('refuses an image over 2 MB before uploading', async () => {
    const { input } = renderField();
    await choose(input, file('big.png', 'image/png', 2 * 1024 * 1024 + 1));
    expect(screen.getByText('The image must be 2 MB or smaller.')).toBeTruthy();
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('uploads into the host’s own folder and passes the public address on', async () => {
    const { input, onChange } = renderField();
    await choose(input, file('cat.png', 'image/png', 500));
    expect(storage.from).toHaveBeenCalledWith('question-images');
    const [path] = storage.upload.mock.calls[0] as unknown as [string];
    expect(path).toMatch(/^host-1\/[0-9a-f-]{36}\.png$/);
    expect(onChange).toHaveBeenCalledWith({
      imageUrl: expect.stringContaining('/question-images/host-1/'),
      imageAlt: '',
    });
  });

  it('says so when the upload fails and keeps the old image', async () => {
    storage.upload.mockResolvedValueOnce({ data: { path: '' }, error: { message: 'quota' } });
    const { input, onChange } = renderField();
    await choose(input, file('cat.png', 'image/png', 500));
    expect(screen.getByText(/could not be uploaded: quota/i)).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('asks for a description once an image is chosen and passes edits on', () => {
    const { onChange } = renderField({ imageUrl: 'https://x.test/a.png', imageAlt: '' });
    expect(screen.getByRole('img', { name: 'Chosen image' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Describe the image'), { target: { value: 'A cat' } });
    expect(onChange).toHaveBeenCalledWith({ imageUrl: 'https://x.test/a.png', imageAlt: 'A cat' });
  });

  it('has no description box until there is an image, and removes the image on request', () => {
    const { onChange } = renderField();
    expect(screen.queryByLabelText('Describe the image')).toBeNull();
    cleanup();
    const second = renderField({ imageUrl: 'https://x.test/a.png', imageAlt: 'A cat' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove image' }));
    expect(second.onChange).toHaveBeenCalledWith({ imageUrl: null, imageAlt: null });
    expect(onChange).not.toHaveBeenCalled();
  });
});
