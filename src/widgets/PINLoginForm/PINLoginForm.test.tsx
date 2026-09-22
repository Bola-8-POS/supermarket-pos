import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLoginUiStore } from '@entities/staff/model/loginUiStore';
import * as staffQueries from '@entities/staff/model/queries';
import { useStaffStore } from '@entities/staff/model/store';
import { mockStaff } from '@entities/staff/model/types';
import type { Shift } from '@shared/lib/domain';
import { ok, err } from '@shared/lib/result';
import { PINLoginForm } from './PINLoginForm';

vi.mock('@entities/staff/model/queries', async importOriginal => {
  const actual = await importOriginal();
  return Object.assign({}, actual, { useMutationClockIn: vi.fn() });
});

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Overrides the global @shared/lib/supabase mock (src/shared/lib/test-setup.ts) for
// this file so the sign-in and forced_pin_change tests can control
// setSession/updateUser/rpc.
const { mockSetSession, mockUpdateUser, mockRpc } = vi.hoisted(() => ({
  mockSetSession: vi.fn().mockResolvedValue({ data: { session: null, user: null }, error: null }),
  mockUpdateUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
  mockRpc: vi.fn().mockResolvedValue({ data: null, error: null }),
}));

vi.mock('@shared/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    auth: {
      setSession: mockSetSession,
      updateUser: mockUpdateUser,
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    rpc: mockRpc,
  },
}));

// Staff PIN checks now run server-side (Task 4) — mock the edge-function
// client and the offline-unlock cache the login form calls after sign-in.
const { mockCallStaffSignIn, mockRememberOfflineUnlock } = vi.hoisted(() => ({
  mockCallStaffSignIn: vi.fn(),
  mockRememberOfflineUnlock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@shared/lib/edge-function-contracts', () => ({
  callStaffSignIn: mockCallStaffSignIn,
}));

vi.mock('@entities/staff/model/offlineUnlock', async importOriginal => {
  const actual = await importOriginal();
  return Object.assign({}, actual, { rememberOfflineUnlock: mockRememberOfflineUnlock });
});

const randomPin = (): string => String(100000 + Math.floor(Math.random() * 900000));

const shiftOk: Shift = {
  id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  staffId: mockStaff[0]!.id,
  clockIn: new Date(),
  clockOut: null,
  openingCash: 50,
  closingCash: null,
};

function renderLoginForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PINLoginForm />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function enterDigits(user: ReturnType<typeof userEvent.setup>, digits: string) {
  for (const d of digits) {
    await user.click(screen.getByRole('button', { name: `Key ${d}` }));
  }
}

describe('PINLoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCallStaffSignIn.mockResolvedValue(
      ok({ accessToken: 'a', refreshToken: 'r', mustChangePin: false })
    );
    useStaffStore.getState().logout();
    useLoginUiStore.getState().clearSelection();
    useLoginUiStore.getState().setSelectedStaff(mockStaff[0]!);
  });

  it('on a right PIN, sets the session, remembers it for offline unlock, and proceeds to the shift check', async () => {
    const testPin = randomPin();
    const mutateAsync = vi.fn().mockResolvedValue(ok(shiftOk));
    vi.mocked(staffQueries.useMutationClockIn).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof staffQueries.useMutationClockIn>);

    const user = userEvent.setup();
    renderLoginForm();

    await enterDigits(user, testPin);

    await waitFor(() => {
      expect(mockCallStaffSignIn).toHaveBeenCalledWith({ staffId: mockStaff[0]!.id, pin: testPin });
    });
    expect(mockSetSession).toHaveBeenCalledWith({ access_token: 'a', refresh_token: 'r' });
    await waitFor(() => {
      expect(mockRememberOfflineUnlock).toHaveBeenCalledWith(mockStaff[0]!.id, testPin);
    });

    await waitFor(() => {
      expect(
        screen.getByText(
          'Enter the cash drawer float for this shift. You can use zero if nothing is counted yet.'
        )
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Start shift' }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        staffId: mockStaff[0]!.id,
        openingCash: 0,
      });
    });

    await waitFor(() => {
      const { currentStaff, currentShift, isAuthenticated } = useStaffStore.getState();
      expect(isAuthenticated).toBe(true);
      expect(currentStaff?.id).toBe(mockStaff[0]!.id);
      expect(currentShift?.id).toBe(shiftOk.id);
      expect(currentShift?.staffId).toBe(mockStaff[0]!.id);
      expect(useLoginUiStore.getState().selectedStaff).toBeNull();
    });
  });

  it('disables the keypad Backspace button while callStaffSignIn is pending', async () => {
    let resolveSignIn: ((value: ReturnType<typeof ok>) => void) | undefined;
    mockCallStaffSignIn.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveSignIn = resolve;
        })
    );

    const user = userEvent.setup();
    renderLoginForm();

    await enterDigits(user, randomPin());

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Backspace' })).toBeDisabled();
    });

    resolveSignIn?.(ok({ accessToken: 'a', refreshToken: 'r', mustChangePin: false }));

    await waitFor(() => {
      expect(mockSetSession).toHaveBeenCalled();
    });
  });

  it('on a wrong PIN, shows the incorrect-PIN message and never sets a session', async () => {
    mockCallStaffSignIn.mockResolvedValueOnce(
      err({ code: 'AUTH_REQUIRED', message: 'INVALID_CREDENTIALS', details: '0' })
    );

    const user = userEvent.setup();
    renderLoginForm();

    await enterDigits(user, randomPin());

    await waitFor(() => {
      expect(screen.getByText('Incorrect PIN. Try again.')).toBeInTheDocument();
    });
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('when locked out, shows the lockout message with the remaining seconds', async () => {
    mockCallStaffSignIn.mockResolvedValueOnce(
      err({ code: 'AUTH_FORBIDDEN', message: 'LOCKED', details: '30' })
    );

    const user = userEvent.setup();
    renderLoginForm();

    await enterDigits(user, randomPin());

    await waitFor(() => {
      expect(screen.getByText('Too many attempts. Try again in 30 s.')).toBeInTheDocument();
    });
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('on any other sign-in error, shows the generic sign-in-failed message', async () => {
    mockCallStaffSignIn.mockResolvedValueOnce(err({ code: 'SUPABASE_ERROR', message: 'boom' }));

    const user = userEvent.setup();
    renderLoginForm();

    await enterDigits(user, randomPin());

    await waitFor(() => {
      expect(
        screen.getByText('Sign-in failed. Please try again or contact your manager.')
      ).toBeInTheDocument();
    });
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  describe('forced_pin_change phase', () => {
    it('is entered after a successful sign-in when mustChangePin is true, and hides "Not you? Go back"', async () => {
      mockCallStaffSignIn.mockResolvedValueOnce(
        ok({ accessToken: 'a', refreshToken: 'r', mustChangePin: true })
      );

      const user = userEvent.setup();
      renderLoginForm();

      await enterDigits(user, randomPin());

      await waitFor(() => {
        expect(screen.getByText('Set a new PIN')).toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: 'Not you? Go back' })).not.toBeInTheDocument();
    });

    it('rejects a mismatched confirm PIN and resets back to New PIN entry', async () => {
      mockCallStaffSignIn.mockResolvedValueOnce(
        ok({ accessToken: 'a', refreshToken: 'r', mustChangePin: true })
      );

      const user = userEvent.setup();
      renderLoginForm();

      await enterDigits(user, randomPin());
      await waitFor(() => {
        expect(screen.getByText('New PIN')).toBeInTheDocument();
      });

      await enterDigits(user, '222222');
      await waitFor(() => {
        expect(screen.getByText('Confirm new PIN')).toBeInTheDocument();
      });

      await enterDigits(user, '333333');
      await waitFor(() => {
        expect(screen.getByText("PINs don't match. Try again.")).toBeInTheDocument();
      });
      // Reset back to the New PIN step
      await waitFor(() => {
        expect(screen.getByText('New PIN')).toBeInTheDocument();
      });
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it('rejects a new PIN identical to the one just typed at sign-in', async () => {
      const testPin = randomPin();
      mockCallStaffSignIn.mockResolvedValueOnce(
        ok({ accessToken: 'a', refreshToken: 'r', mustChangePin: true })
      );

      const user = userEvent.setup();
      renderLoginForm();

      await enterDigits(user, testPin);
      await waitFor(() => {
        expect(screen.getByText('New PIN')).toBeInTheDocument();
      });

      await enterDigits(user, testPin);
      await waitFor(() => {
        expect(screen.getByText('Confirm new PIN')).toBeInTheDocument();
      });

      await enterDigits(user, testPin);
      await waitFor(() => {
        expect(
          screen.getByText('Choose a PIN different from your current one.')
        ).toBeInTheDocument();
      });
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it('on a matching, different new PIN, updates auth password, remembers the new PIN for offline unlock, clears the flag, then proceeds to opening cash', async () => {
      mockCallStaffSignIn.mockResolvedValueOnce(
        ok({ accessToken: 'a', refreshToken: 'r', mustChangePin: true })
      );
      mockUpdateUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      mockRpc.mockResolvedValueOnce({ data: { ok: true }, error: null });

      const user = userEvent.setup();
      renderLoginForm();

      await enterDigits(user, randomPin());
      await waitFor(() => {
        expect(screen.getByText('New PIN')).toBeInTheDocument();
      });

      await enterDigits(user, '222222');
      await waitFor(() => {
        expect(screen.getByText('Confirm new PIN')).toBeInTheDocument();
      });

      await enterDigits(user, '222222');

      await waitFor(() => {
        expect(mockUpdateUser).toHaveBeenCalledWith({ password: '222222' });
      });
      await waitFor(() => {
        expect(mockRpc).toHaveBeenCalledWith('clear_must_change_pin', {
          p_new_pin: '222222',
          p_terminal_id: expect.any(String) as unknown as string,
        });
      });
      await waitFor(() => {
        expect(mockRememberOfflineUnlock).toHaveBeenCalledWith(mockStaff[0]!.id, '222222');
      });
      await waitFor(() => {
        expect(
          screen.getByText(
            'Enter the cash drawer float for this shift. You can use zero if nothing is counted yet.'
          )
        ).toBeInTheDocument();
      });
    });
  });

  it('does not log in when clock-in fails', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(err({ code: 'TEST', message: 'Network down' }));
    vi.mocked(staffQueries.useMutationClockIn).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof staffQueries.useMutationClockIn>);

    const user = userEvent.setup();
    renderLoginForm();

    await enterDigits(user, randomPin());

    await waitFor(() => {
      expect(
        screen.getByText(
          'Enter the cash drawer float for this shift. You can use zero if nothing is counted yet.'
        )
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Start shift' }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalled();
    });

    expect(useStaffStore.getState().isAuthenticated).toBe(false);
    expect(useStaffStore.getState().currentShift).toBeNull();
  });
});
