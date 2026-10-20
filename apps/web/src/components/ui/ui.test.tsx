import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Badge,
  Button,
  Notice,
  PageHeader,
  Panel,
  SelectField,
  TableFrame,
  TextAreaField,
  TextField,
} from './index';

afterEach(cleanup);

describe('Button', () => {
  it('does not submit a surrounding form unless asked to', () => {
    const onSubmit = vi.fn((event: Event) => event.preventDefault());
    render(
      <form onSubmit={(event) => onSubmit(event.nativeEvent)}>
        <Button>Cancel</Button>
        <Button type="submit">Save</Button>
      </form>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('ignores clicks while disabled', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Start quiz
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Start quiz' });
    fireEvent.click(button);
    expect(button).toHaveProperty('disabled', true);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('TextField', () => {
  it('labels its input', () => {
    render(<TextField label="Join code" value="" onChange={() => undefined} />);
    expect(screen.getByLabelText('Join code').tagName).toBe('INPUT');
  });

  it('marks the input invalid and points it at the error message', () => {
    render(
      <TextField
        label="Display name"
        value=""
        onChange={() => undefined}
        error="Enter a display name"
      />,
    );
    const input = screen.getByLabelText('Display name');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const describedBy = input.getAttribute('aria-describedby') ?? '';
    const described = describedBy
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent)
      .join(' ');
    expect(described).toContain('Enter a display name');
  });

  it('describes the input with its hint and stays valid without an error', () => {
    render(
      <TextField label="Minutes" hint="Between 1 and 300" value="30" onChange={() => undefined} />,
    );
    const input = screen.getByLabelText('Minutes');
    expect(input.getAttribute('aria-invalid')).toBeNull();
    const hintId = input.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(hintId)?.textContent).toBe('Between 1 and 300');
  });

  it('forwards input attributes such as type and required', () => {
    render(<TextField label="Email" type="email" required value="" onChange={() => undefined} />);
    const input = screen.getByLabelText('Email') as HTMLInputElement;
    expect(input.type).toBe('email');
    expect(input.required).toBe(true);
  });
});

describe('SelectField and TextAreaField', () => {
  it('label their controls and report errors the same way', () => {
    render(
      <>
        <SelectField label="Difficulty" value="easy" onChange={() => undefined}>
          <option value="easy">Easy</option>
        </SelectField>
        <TextAreaField label="Question" value="" onChange={() => undefined} error="Required" />
      </>,
    );
    expect(screen.getByRole('combobox', { name: 'Difficulty' })).toBeTruthy();
    const textarea = screen.getByLabelText('Question');
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea.getAttribute('aria-invalid')).toBe('true');
  });
});

describe('Notice', () => {
  it('interrupts for errors and stays polite otherwise', () => {
    render(
      <>
        <Notice tone="danger">Could not save</Notice>
        <Notice tone="info">Saved</Notice>
      </>,
    );
    expect(screen.getByRole('alert').textContent).toBe('Could not save');
    expect(screen.getByRole('status').textContent).toBe('Saved');
  });
});

describe('PageHeader', () => {
  it('renders the page heading, a back link and actions', () => {
    render(
      <MemoryRouter>
        <PageHeader
          title="Question bank"
          description="Every question across your quizzes."
          back={{ to: '/host', label: 'Back to dashboard' }}
          actions={<Button>New quiz</Button>}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Question bank' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to dashboard' }).getAttribute('href')).toBe(
      '/host',
    );
    expect(screen.getByRole('button', { name: 'New quiz' })).toBeTruthy();
  });
});

describe('Panel', () => {
  it('is a region named by its title', () => {
    render(
      <Panel title="Needs review">
        <p>Nothing waiting</p>
      </Panel>,
    );
    expect(screen.getByRole('region', { name: 'Needs review' })).toBeTruthy();
  });

  it('is not a named region without a title', () => {
    render(
      <Panel>
        <p>Plain</p>
      </Panel>,
    );
    expect(screen.queryByRole('region')).toBeNull();
  });
});

describe('TableFrame', () => {
  it('makes a wide table a focusable, named scroll region', () => {
    render(
      <TableFrame label="Leaderboard">
        <table>
          <tbody>
            <tr>
              <td>Ada</td>
            </tr>
          </tbody>
        </table>
      </TableFrame>,
    );
    const region = screen.getByRole('region', { name: 'Leaderboard' });
    expect(region.getAttribute('tabindex')).toBe('0');
  });
});

describe('Badge', () => {
  it('shows its text', () => {
    render(<Badge tone="success">Approved</Badge>);
    expect(screen.getByText('Approved')).toBeTruthy();
  });
});
