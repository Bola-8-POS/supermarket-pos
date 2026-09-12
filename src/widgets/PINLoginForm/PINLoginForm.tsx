import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useLoginUiStore } from '@entities/staff/model/loginUiStore';
import { useMutationClockIn } from '@entities/staff/model/queries';
import { useStaffStore } from '@entities/staff/model/store';
import { logger } from '@shared/lib/logger-instance';
import { supabase } from '@shared/lib/supabase';
import { getTerminalId } from '@shared/lib/terminal';
import { ConfirmDialog } from '@shared/ui/ConfirmDialog';
import { MoneyInput } from '@shared/ui/MoneyInput';
import { PINKeypad } from '@shared/ui/PINKeypad';
import { Button } from '@shared/ui/button';

type Phase = 'pin' | 'forced_pin_change' | 'opening_cash';

export function PINLoginForm() {
  const { t } = useTranslation('wPanels');
  const selectedStaff = useLoginUiStore(s => s.selectedStaff);
  const clearSelection = useLoginUiStore(s => s.clearSelection);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<Phase>('pin');
  const [openingCash, setOpeningCash] = useState(0);
  const [isClockingIn, setIsClockingIn] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinChangeError, setPinChangeError] = useState('');
  const [isSubmittingNewPin, setIsSubmittingNewPin] = useState(false);
  const navigate = useNavigate();
  const clockInMutation = useMutationClockIn();

  if (!selectedStaff) return null;

  // Runs immediately after a successful auth (either the normal 'pin' phase or
  // after the forced-PIN-change flow clears the mustChangePin flag): looks for an
  // existing open shift to resume, otherwise prompts for an opening-cash amount.
  const proceedAfterAuth = async (): Promise<void> => {
    // Check for an existing open shift — if found, resume it instead of starting a new one.
    // supabase.types.ts may lag behind schema; cast to any until types are regenerated.
    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, i18next/no-literal-string */
    const db = supabase as any;
    const { data: existingShift } = (await db
      .from('shifts')
      .select('*')
      .eq('staff_id', selectedStaff.id)
      .is('clock_out', null)
      .order('clock_in', { ascending: false })
      .limit(1)
      .maybeSingle()) as { data: any };
    /* eslint-enable i18next/no-literal-string */

    if (existingShift) {
      useStaffStore.getState().login(selectedStaff, {
        id: existingShift.id,
        staffId: existingShift.staff_id,
        clockIn: new Date(existingShift.clock_in),
        clockOut: null,
        openingCash: existingShift.opening_cash,
        closingCash: existingShift.closing_cash,
      });
      /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
      clearSelection();
      void navigate('/home');
      return;
    }

    // No open shift — ask for opening cash to start a new one.
    setPhase('opening_cash');
    setOpeningCash(0);
  };

  const handlePinComplete = async (enteredPin: string): Promise<void> => {
    if (enteredPin !== selectedStaff.pin) {
      setError(t('pinLoginForm.incorrectPin'));
      setPin('');
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: selectedStaff.email,
      password: enteredPin,
    });
    if (signInError) {
      logger.error('login.supabase_sign_in_failed', { message: signInError.message });
      setError(t('pinLoginForm.signInFailed'));
      setPin('');
      return;
    }

    if (selectedStaff.mustChangePin) {
      setPhase('forced_pin_change');
      return;
    }

    await proceedAfterAuth();
  };

  const resetForcedPinChangeFields = (): void => {
    setNewPin('');
    setConfirmPin('');
  };

  const handleConfirmPinComplete = async (enteredConfirmPin: string): Promise<void> => {
    if (newPin !== enteredConfirmPin) {
      setPinChangeError(t('pinLoginForm.pinsDontMatch'));
      resetForcedPinChangeFields();
      return;
    }

    if (newPin === selectedStaff.pin) {
      setPinChangeError(t('pinLoginForm.choosePinDifferent'));
      resetForcedPinChangeFields();
      return;
    }

    setIsSubmittingNewPin(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPin });
      if (updateError) {
        logger.error('login.forced_pin_change.update_user_failed', {
          message: updateError.message,
        });
        setPinChangeError(t('pinLoginForm.couldNotSetPin'));
        resetForcedPinChangeFields();
        return;
      }

      /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
      const db = supabase as any;
      const { error: clearError } = (await db.rpc('clear_must_change_pin', {
        p_new_pin: newPin,
        p_terminal_id: getTerminalId(),
      })) as { error: { message: string } | null };
      /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
      if (clearError) {
        logger.error('login.forced_pin_change.clear_flag_failed', {
          message: clearError.message,
        });
        setPinChangeError(t('pinLoginForm.couldNotFinishPin'));
        resetForcedPinChangeFields();
        return;
      }

      await proceedAfterAuth();
    } finally {
      setIsSubmittingNewPin(false);
    }
  };

  const handleOpeningCashCancel = () => {
    setPhase('pin');
    setPin('');
    setOpeningCash(0);
  };

  const handleOpeningCashConfirm = async (): Promise<void> => {
    setIsClockingIn(true);
    try {
      const result = await clockInMutation.mutateAsync({
        staffId: selectedStaff.id,
        openingCash,
      });

      if (!result.ok) {
        logger.error('login.clock_in.failed', { message: result.error.message });
        toast.error(result.error.message);
        return;
      }

      useStaffStore.getState().login(selectedStaff, result.data);
      clearSelection();
      void navigate('/home');
    } finally {
      setIsClockingIn(false);
    }
  };

  const handlePinChange = (value: string) => {
    setPin(value);
    if (error) setError('');
  };

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
      <div className="text-center">
        <div className="mx-auto mb-3 flex size-16 items-center justify-center rounded-full bg-brand text-2xl font-semibold text-brand-foreground shadow-md">
          {selectedStaff.name.charAt(0).toUpperCase()}
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">{selectedStaff.name}</h2>
        <p className="text-sm text-muted-foreground capitalize">{selectedStaff.role}</p>
      </div>

      {phase === 'pin' && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <PINKeypad
            value={pin}
            onChange={handlePinChange}
            onComplete={pin => {
              void handlePinComplete(pin);
            }}
            label={t('pinLoginForm.enterPinLabel')}
            error={error}
          />
        </div>
      )}

      {phase === 'forced_pin_change' && (
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="text-center">
            <h3 className="text-lg font-semibold tracking-tight">
              {t('pinLoginForm.setNewPinTitle')}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t('pinLoginForm.setNewPinDescription')}
            </p>
          </div>

          {newPin.length < 6 ? (
            <PINKeypad
              key="new-pin"
              value={newPin}
              onChange={value => {
                setNewPin(value);
                if (pinChangeError) setPinChangeError('');
              }}
              onComplete={pin => {
                setNewPin(pin);
              }}
              label={t('pinLoginForm.newPinLabel')}
              error={pinChangeError}
              isLoading={isSubmittingNewPin}
            />
          ) : (
            <PINKeypad
              key="confirm-pin"
              value={confirmPin}
              onChange={value => {
                setConfirmPin(value);
                if (pinChangeError) setPinChangeError('');
              }}
              onComplete={pin => {
                void handleConfirmPinComplete(pin);
              }}
              label={t('pinLoginForm.confirmNewPinLabel')}
              error={pinChangeError}
              isLoading={isSubmittingNewPin}
            />
          )}
        </div>
      )}

      {phase === 'opening_cash' && (
        <p className="text-center text-sm text-muted-foreground">
          {t('pinLoginForm.enterOpeningCashFloat')}
        </p>
      )}

      {phase !== 'forced_pin_change' && (
        <Button
          type="button"
          variant="link"
          onClick={clearSelection}
          className="mx-auto text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {t('pinLoginForm.notYouGoBack')}
        </Button>
      )}

      <ConfirmDialog
        open={phase === 'opening_cash'}
        title={t('pinLoginForm.openingCashTitle')}
        description={t('pinLoginForm.openingCashDescription')}
        confirmLabel={t('pinLoginForm.startShift')}
        cancelLabel={t('pinLoginForm.back')}
        onConfirm={handleOpeningCashConfirm}
        onCancel={handleOpeningCashCancel}
        isLoading={isClockingIn}
        confirmDisabled={isClockingIn}
      >
        <div className="py-4">
          <MoneyInput
            label={t('pinLoginForm.drawerFloat')}
            value={openingCash}
            onChange={setOpeningCash}
            disabled={isClockingIn}
            placeholder="0.00"
          />
        </div>
      </ConfirmDialog>
    </div>
  );
}
