import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_PROCTOR_OPTIONS, type ProctorOptionsValue } from './ProctorOptions';
import { ProctoringFields } from './ProctoringFields';

afterEach(cleanup);

function Harness({
  kind = 'exam',
  initialOn = false,
  initialOptions = DEFAULT_PROCTOR_OPTIONS,
  onChange,
}: {
  kind?: 'live' | 'exam';
  initialOn?: boolean;
  initialOptions?: ProctorOptionsValue;
  onChange?: (state: { on: boolean; options: ProctorOptionsValue }) => void;
}) {
  const [on, setOn] = useState(initialOn);
  const [options, setOptions] = useState(initialOptions);
  onChange?.({ on, options });
  return (
    <ProctoringFields
      kind={kind}
      enabled={on}
      onEnabledChange={setOn}
      options={options}
      onOptionsChange={setOptions}
    />
  );
}

describe('ProctoringFields', () => {
  it('asks only yes or no until the host says yes', () => {
    render(<Harness />);
    expect(screen.getByRole('checkbox', { name: /Proctor this assessment/ })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: /Watch the camera/ })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /Listen to the microphone/ })).toBeNull();
  });

  it('shows the camera and microphone options after yes', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Proctor this assessment/ }));
    expect(screen.getByRole('checkbox', { name: /Watch the camera/ })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /Listen to the microphone/ })).toBeTruthy();
  });

  it('offers auto-submit only for an exam with a device on', () => {
    render(<Harness initialOn />);
    expect(screen.queryByRole('checkbox', { name: /Submit the exam automatically/ })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: /Watch the camera/ }));
    expect(screen.getByRole('checkbox', { name: /Submit the exam automatically/ })).toBeTruthy();
    cleanup();
    render(<Harness kind="live" initialOn />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Watch the camera/ }));
    expect(screen.queryByRole('checkbox', { name: /Submit the exam automatically/ })).toBeNull();
  });

  it('keeps the choices when proctoring is switched off and on again', () => {
    let latest: { on: boolean; options: ProctorOptionsValue } | null = null;
    render(<Harness initialOn onChange={(state) => (latest = state)} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Watch the camera/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Proctor this assessment/ }));
    expect(screen.queryByRole('checkbox', { name: /Watch the camera/ })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: /Proctor this assessment/ }));
    expect(
      (screen.getByRole('checkbox', { name: /Watch the camera/ }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(latest).toMatchObject({ on: true, options: { camera: true } });
  });
});
