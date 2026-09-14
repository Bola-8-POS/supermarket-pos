import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { startDemoTrial } from '@shared/lib/license/actions';
import type * as ConfigModule from '@shared/lib/license/config';
import { useLicenseStore } from '@shared/lib/license/store';
import { LicenseGate } from './LicenseGate';

const configState = { enforced: true, autoStart: false };
vi.mock('@shared/lib/license/config', async importOriginal => {
  const actual = await importOriginal<typeof ConfigModule>();
  return {
    ...actual,
    isLicenseEnforced: () => configState.enforced,
    isDemoAutoStart: () => configState.autoStart,
  };
});

vi.mock('@shared/lib/license/actions', () => ({
  startDemoTrial: vi.fn(() => new Promise(() => {})),
  resetTerminalForNewDemo: vi.fn(() => new Promise(() => {})),
}));

describe('LicenseGate', () => {
  beforeEach(() => {
    localStorage.clear();
    useLicenseStore.getState().clearLicense(null);
    configState.enforced = true;
    configState.autoStart = false;
    vi.mocked(startDemoTrial).mockClear();
  });

  it('shows the try-it-free button when enforced and unlicensed with auto-start off', () => {
    render(
      <LicenseGate>
        <div>App content</div>
      </LicenseGate>
    );

    expect(screen.getByTestId('start-demo-button')).toBeInTheDocument();
    expect(screen.queryByText('App content')).not.toBeInTheDocument();
  });

  it('auto-starts a demo and shows the preparing spinner when isDemoAutoStart is on', () => {
    configState.autoStart = true;

    render(
      <LicenseGate>
        <div>App content</div>
      </LicenseGate>
    );

    expect(screen.getByTestId('license-gate-preparing')).toBeInTheDocument();
    expect(startDemoTrial).toHaveBeenCalledTimes(1);
  });
});
