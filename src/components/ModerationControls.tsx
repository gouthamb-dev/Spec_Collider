import { useState, useCallback } from 'react';
import type { ModerationAction } from '../types/ui.ts';
import { validateRejectionReason, validateEditText } from '../core/validation.ts';

// === Types ===

type ModerationState = 'idle' | 'rejecting' | 'editing';

export interface ModerationControlsProps {
  mitigationId: string;
  mitigationDescription: string;
  hasConflict: boolean;
  onModerate: (mitigationId: string, action: ModerationAction) => void;
}

// === Component ===

export function ModerationControls({
  mitigationId,
  mitigationDescription,
  hasConflict,
  onModerate,
}: ModerationControlsProps) {
  const [state, setState] = useState<ModerationState>('idle');
  const [rejectionReason, setRejectionReason] = useState('');
  const [editText, setEditText] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleAccept = useCallback(() => {
    onModerate(mitigationId, { type: 'accept' });
  }, [mitigationId, onModerate]);

  const handleRejectStart = useCallback(() => {
    setRejectionReason('');
    setValidationError(null);
    setState('rejecting');
  }, []);

  const handleEditStart = useCallback(() => {
    setEditText(mitigationDescription);
    setValidationError(null);
    setState('editing');
  }, [mitigationDescription]);

  const handleCancel = useCallback(() => {
    setRejectionReason('');
    setEditText('');
    setValidationError(null);
    setState('idle');
  }, []);

  const handleRejectConfirm = useCallback(() => {
    const result = validateRejectionReason(rejectionReason);
    if (!result.valid) {
      setValidationError(result.error ?? 'Invalid rejection reason');
      return;
    }
    onModerate(mitigationId, { type: 'reject', reason: rejectionReason });
    setState('idle');
    setRejectionReason('');
    setValidationError(null);
  }, [mitigationId, rejectionReason, onModerate]);

  const handleEditConfirm = useCallback(() => {
    const result = validateEditText(editText);
    if (!result.valid) {
      setValidationError(result.error ?? 'Invalid edit text');
      return;
    }
    onModerate(mitigationId, { type: 'edit', modifiedText: editText });
    setState('idle');
    setEditText('');
    setValidationError(null);
  }, [mitigationId, editText, onModerate]);

  // Conflict state: show warning banner instead of controls
  if (hasConflict) {
    return (
      <div
        className="rounded-lg border border-outline-variant bg-error-container p-4"
        role="alert"
        aria-live="polite"
        data-testid="moderation-conflict"
      >
        <p className="text-sm font-medium text-error-on-container">
          Conflict: This section has already been modified by a prior decision.
        </p>
      </div>
    );
  }

  // Idle state: show Accept / Reject / Edit buttons
  if (state === 'idle') {
    return (
      <div
        className="flex gap-2 rounded-lg border border-outline-variant bg-surface-container p-4"
        data-testid="moderation-controls"
      >
        <button
          className="rounded-md bg-tertiary px-4 py-2 text-sm font-medium text-tertiary-on transition-colors hover:opacity-90"
          onClick={handleAccept}
          aria-label="Accept mitigation"
          data-testid="moderation-accept"
        >
          Accept
        </button>
        <button
          className="rounded-md bg-error px-4 py-2 text-sm font-medium text-error-on transition-colors hover:opacity-90"
          onClick={handleRejectStart}
          aria-label="Reject mitigation"
          data-testid="moderation-reject"
        >
          Reject
        </button>
        <button
          className="rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-on transition-colors hover:opacity-90"
          onClick={handleEditStart}
          aria-label="Edit mitigation"
          data-testid="moderation-edit"
        >
          Edit
        </button>
      </div>
    );
  }

  // Rejecting state: show textarea for reason + Confirm/Cancel
  if (state === 'rejecting') {
    return (
      <div
        className="rounded-lg border border-outline-variant bg-surface-container p-4"
        data-testid="moderation-reject-form"
      >
        <label
          htmlFor={`reject-reason-${mitigationId}`}
          className="mb-1 block text-sm font-medium text-surface-on"
        >
          Rejection Reason
        </label>
        <textarea
          id={`reject-reason-${mitigationId}`}
          className="w-full rounded-md border border-outline bg-surface p-2 text-sm text-surface-on placeholder:text-surface-on-variant focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Provide a reason for rejection (1–1000 characters)"
          value={rejectionReason}
          onChange={(e) => {
            setRejectionReason(e.target.value);
            setValidationError(null);
          }}
          maxLength={1000}
          rows={3}
          aria-describedby={`reject-char-count-${mitigationId} reject-error-${mitigationId}`}
          data-testid="moderation-reject-input"
        />
        <div className="mt-1 flex items-center justify-between">
          <span
            id={`reject-char-count-${mitigationId}`}
            className="text-xs text-surface-on-variant"
            data-testid="moderation-reject-char-count"
          >
            {rejectionReason.length}/1000
          </span>
          {validationError && (
            <span
              id={`reject-error-${mitigationId}`}
              className="text-xs text-error"
              role="alert"
              data-testid="moderation-validation-error"
            >
              {validationError}
            </span>
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <button
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-on transition-colors hover:opacity-90"
            onClick={handleRejectConfirm}
            aria-label="Confirm rejection"
            data-testid="moderation-confirm"
          >
            Confirm
          </button>
          <button
            className="rounded-md border border-outline bg-surface px-4 py-2 text-sm font-medium text-surface-on transition-colors hover:bg-surface-container"
            onClick={handleCancel}
            aria-label="Cancel rejection"
            data-testid="moderation-cancel"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Editing state: show editable textarea + Confirm/Cancel
  return (
    <div
      className="rounded-lg border border-outline-variant bg-surface-container p-4"
      data-testid="moderation-edit-form"
    >
      <label
        htmlFor={`edit-text-${mitigationId}`}
        className="mb-1 block text-sm font-medium text-surface-on"
      >
        Edit Mitigation
      </label>
      <textarea
        id={`edit-text-${mitigationId}`}
        className="w-full rounded-md border border-outline bg-surface p-2 text-sm text-surface-on placeholder:text-surface-on-variant focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        placeholder="Modify the mitigation text (up to 5000 characters)"
        value={editText}
        onChange={(e) => {
          setEditText(e.target.value);
          setValidationError(null);
        }}
        maxLength={5000}
        rows={5}
        aria-describedby={`edit-char-count-${mitigationId} edit-error-${mitigationId}`}
        data-testid="moderation-edit-input"
      />
      <div className="mt-1 flex items-center justify-between">
        <span
          id={`edit-char-count-${mitigationId}`}
          className="text-xs text-surface-on-variant"
          data-testid="moderation-edit-char-count"
        >
          {editText.length}/5000
        </span>
        {validationError && (
          <span
            id={`edit-error-${mitigationId}`}
            className="text-xs text-error"
            role="alert"
            data-testid="moderation-validation-error"
          >
            {validationError}
          </span>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-on transition-colors hover:opacity-90"
          onClick={handleEditConfirm}
          aria-label="Confirm edit"
          data-testid="moderation-confirm"
        >
          Confirm
        </button>
        <button
          className="rounded-md border border-outline bg-surface px-4 py-2 text-sm font-medium text-surface-on transition-colors hover:bg-surface-container"
          onClick={handleCancel}
          aria-label="Cancel edit"
          data-testid="moderation-cancel"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
