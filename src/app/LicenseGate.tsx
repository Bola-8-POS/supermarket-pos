import { KeyRound } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LicenseActivationForm } from '@features/activate-license';
import { resetTerminalForNewDemo, startDemoTrial } from '@shared/lib/license/actions';
import { isDemoAutoStart } from '@shared/lib/license/config';
import { useLicenseEvaluation, useLicenseStore } from '@shared/lib/license/store';
import { getTerminalId } from '@shared/lib/license/terminal-id';
import { LoadingSpinner } from '@shared/ui';

interface Props {
  children: ReactNode;
}

const DAY_MS = 86_400_000;

/**
 * Boot-time license wall. Renders the app only while the terminal is licensed (active,
 * warning, or grace). When locked, shows why plus the activation / offline-token form.
 * Sits outside the router on purpose: activation must work before anyone can log in.
 */
export function LicenseGate({ children }: Props) {
  const evaluation = useLicenseEvaluation();
  const payload = useLicenseStore(s => s.payload);
  const lastError = useLicenseStore(s => s.lastError);
  const { t } = useTranslation('common');

  const autoStart = isDemoAutoStart();
  const [autoState, setAutoState] = useState<'idle' | 'running' | 'failed'>('idle');
  useEffect(() => {
    if (!autoStart || evaluation.state !== 'locked' || autoState !== 'idle') return;
    if (
      evaluation.reason !== 'unlicensed' &&
      evaluation.reason !== 'demo_expired' &&
      evaluation.reason !== 'invalid'
    )
      return;
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot guard (autoState !== 'idle' above) prevents re-entrancy; must flip before the async call starts */
    setAutoState('running');
    const run = evaluation.reason === 'unlicensed' ? startDemoTrial : resetTerminalForNewDemo;
    void run().then(res => {
      if (res.ok) return;
      const code = 'serverCode' in res.error ? String(res.error.serverCode) : '';
      if (code === 'DEMO_ALREADY_USED' && evaluation.reason === 'unlicensed') {
        void resetTerminalForNewDemo().then(r => {
          setAutoState(r.ok ? 'idle' : 'failed');
        });
        return;
      }
      setAutoState('failed');
    });
  }, [autoStart, evaluation, autoState]);

  if (evaluation.state !== 'locked') return <>{children}</>;

  if (autoState === 'running') {
    return (
      <main
        className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background p-6"
        data-testid="license-gate-preparing"
      >
        <LoadingSpinner size={32} />
        <p className="text-sm text-muted-foreground">{t('license.gate.preparingDemo')}</p>
      </main>
    );
  }

  const leaseDays = payload
    ? Math.round(
        (new Date(payload.lease_until).getTime() - new Date(payload.issued_at).getTime()) / DAY_MS
      )
    : 60;

  return (
    <main
      className="flex min-h-dvh items-center justify-center bg-background p-6"
      data-testid="license-gate"
      data-reason={evaluation.reason}
    >
      <section className="w-full max-w-lg space-y-5 rounded-2xl border border-border bg-card p-8 shadow-lg">
        <header className="flex items-center gap-3">
          <span className="rounded-full bg-primary/10 p-2 text-primary">
            <KeyRound size={22} aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-xl font-semibold">{t('license.gate.title')}</h1>
            {payload && <p className="text-sm text-muted-foreground">{payload.tenant_name}</p>}
          </div>
        </header>

        <p className="text-sm text-foreground/90">
          {t(`license.gate.reason.${evaluation.reason}`, { days: leaseDays })}
        </p>
        {lastError && evaluation.reason !== 'suspended' && (
          <p className="text-xs text-destructive" data-testid="license-gate-error">
            {lastError}
          </p>
        )}

        {evaluation.reason !== 'suspended' && (
          <LicenseActivationForm
            showDemo={evaluation.reason === 'unlicensed' || evaluation.reason === 'invalid'}
          />
        )}

        <footer className="space-y-1 border-t border-border pt-4 text-xs text-muted-foreground">
          <div className="flex items-center justify-between gap-2">
            <span>{t('license.gate.terminalId')}</span>
            <code
              className="select-all rounded bg-muted px-1.5 py-0.5 font-mono"
              data-testid="license-terminal-id"
            >
              {getTerminalId()}
            </code>
          </div>
          <p>{t('license.gate.support')}</p>
        </footer>
      </section>
    </main>
  );
}
