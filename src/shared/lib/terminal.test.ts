import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TERMINAL_ID, TERMINAL_ID_STORAGE_KEY, getTerminalId, setTerminalId } from './terminal';

describe('terminal identity', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
  });

  it('falls back to POS-1 when nothing is configured', () => {
    expect(getTerminalId()).toBe(DEFAULT_TERMINAL_ID);
  });
  it('prefers VITE_TERMINAL_ID over the default', () => {
    vi.stubEnv('VITE_TERMINAL_ID', 'POS-9');
    expect(getTerminalId()).toBe('POS-9');
  });
  it('prefers localStorage over the env var', () => {
    vi.stubEnv('VITE_TERMINAL_ID', 'POS-9');
    localStorage.setItem(TERMINAL_ID_STORAGE_KEY, 'CAJA_2');
    expect(getTerminalId()).toBe('CAJA_2');
  });
  it('setTerminalId persists a valid id and trims it', () => {
    expect(setTerminalId('  POS-2 ').ok).toBe(true);
    expect(getTerminalId()).toBe('POS-2');
  });
  it('setTerminalId rejects invalid ids', () => {
    expect(setTerminalId('').ok).toBe(false);
    expect(setTerminalId('has space').ok).toBe(false);
    expect(setTerminalId('x'.repeat(33)).ok).toBe(false);
    expect(getTerminalId()).toBe(DEFAULT_TERMINAL_ID);
  });
  it('ignores a corrupted localStorage value', () => {
    localStorage.setItem(TERMINAL_ID_STORAGE_KEY, 'bad value!');
    expect(getTerminalId()).toBe(DEFAULT_TERMINAL_ID);
  });
});
