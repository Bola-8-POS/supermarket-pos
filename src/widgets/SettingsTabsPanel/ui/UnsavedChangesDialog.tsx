import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@shared/ui/alert-dialog';
import { Button } from '@shared/ui/button';

export interface UnsavedChangesDialogProps {
  open: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

/**
 * Save/Discard/Cancel prompt shown when leaving a Settings tab (or the page
 * entirely) while it has unsaved changes. Driven by
 * `useUnsavedChangesController`'s `dialogProps`.
 */
export function UnsavedChangesDialog({ open, saving, onSave, onDiscard, onCancel }: UnsavedChangesDialogProps) {
  const { t } = useTranslation('settings');
  const saveButtonRef = useRef<HTMLButtonElement>(null);

  // Ref+effect focus instead of the `autoFocus` prop — `jsx-a11y/no-autofocus`
  // is a lint error in this repo.
  useEffect(() => {
    if (open) {
      saveButtonRef.current?.focus();
    }
  }, [open]);

  return (
    <AlertDialog
      open={open}
      onOpenChange={isOpen => {
        if (!isOpen) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('unsavedChanges.title')}</AlertDialogTitle>
          <AlertDialogDescription>{t('unsavedChanges.description')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button ref={saveButtonRef} disabled={saving} onClick={onSave}>
            {t('unsavedChanges.save')}
          </Button>
          <Button variant="outline" className="text-destructive" disabled={saving} onClick={onDiscard}>
            {t('unsavedChanges.discard')}
          </Button>
          <Button variant="ghost" disabled={saving} onClick={onCancel}>
            {t('unsavedChanges.cancel')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
