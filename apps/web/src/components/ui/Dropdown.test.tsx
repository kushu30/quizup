import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dropdown } from './Dropdown';

afterEach(cleanup);

const OPTIONS = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
];

function renderDropdown(props: Partial<Parameters<typeof Dropdown>[0]> = {}) {
  const onChange = vi.fn();
  render(
    <Dropdown
      id="difficulty"
      label="Difficulty"
      value="medium"
      options={OPTIONS}
      onChange={onChange}
      {...props}
    />,
  );
  return { onChange, trigger: screen.getByRole('combobox', { name: 'Difficulty' }) };
}

describe('Dropdown', () => {
  it('shows the chosen option on a labelled button and keeps the list closed', () => {
    const { trigger } = renderDropdown();
    expect(trigger.textContent).toContain('Medium');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('opens a list with the chosen option marked, and picks another with a click', () => {
    const { trigger, onChange } = renderDropdown();
    fireEvent.click(trigger);
    const list = screen.getByRole('listbox', { name: 'Difficulty' });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const options = within(list).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['Easy', 'Medium', 'Hard']);
    expect(options[1]?.getAttribute('aria-selected')).toBe('true');
    fireEvent.click(options[2]!);
    expect(onChange).toHaveBeenCalledWith('hard');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('works from the keyboard: arrows move, Enter picks, Escape closes', () => {
    const { trigger, onChange } = renderDropdown();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(trigger.getAttribute('aria-activedescendant')).toBe(
      screen.getByRole('option', { name: 'Hard' }).id,
    );
    fireEvent.keyDown(trigger, { key: 'ArrowUp' });
    fireEvent.keyDown(trigger, { key: 'Home' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('easy');
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('jumps to an option by typing its first letter', () => {
    const { trigger, onChange } = renderDropdown();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'h' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('hard');
  });

  it('closes when you click elsewhere, without changing anything', () => {
    const { trigger, onChange } = renderDropdown();
    fireEvent.click(trigger);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does nothing when disabled', () => {
    const { trigger } = renderDropdown({ disabled: true });
    fireEvent.click(trigger);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('describes itself with the hint and error it is given', () => {
    const { trigger } = renderDropdown({ 'aria-describedby': 'hint-1', 'aria-invalid': true });
    expect(trigger.getAttribute('aria-describedby')).toBe('hint-1');
    expect(trigger.getAttribute('aria-invalid')).toBe('true');
  });
});
