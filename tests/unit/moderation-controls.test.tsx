import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ModerationControls } from '../../src/components/ModerationControls.tsx';

const defaultProps = {
  mitigationId: 'mit-1',
  mitigationDescription: 'Original mitigation description text',
  hasConflict: false,
  onModerate: vi.fn(),
};

describe('ModerationControls', () => {
  describe('Idle state (Req 4.1)', () => {
    it('renders Accept, Reject, Edit buttons', () => {
      render(<ModerationControls {...defaultProps} />);

      expect(screen.getByTestId('moderation-accept')).toBeInTheDocument();
      expect(screen.getByTestId('moderation-reject')).toBeInTheDocument();
      expect(screen.getByTestId('moderation-edit')).toBeInTheDocument();
    });

    it('calls onModerate with accept action immediately on Accept click', () => {
      const onModerate = vi.fn();
      render(<ModerationControls {...defaultProps} onModerate={onModerate} />);

      fireEvent.click(screen.getByTestId('moderation-accept'));

      expect(onModerate).toHaveBeenCalledWith('mit-1', { type: 'accept' });
    });
  });

  describe('Reject flow (Req 4.3)', () => {
    it('shows rejection reason textarea after clicking Reject', () => {
      render(<ModerationControls {...defaultProps} />);

      fireEvent.click(screen.getByTestId('moderation-reject'));

      expect(screen.getByTestId('moderation-reject-form')).toBeInTheDocument();
      expect(screen.getByTestId('moderation-reject-input')).toBeInTheDocument();
      expect(screen.getByTestId('moderation-confirm')).toBeInTheDocument();
      expect(screen.getByTestId('moderation-cancel')).toBeInTheDocument();
    });

    it('displays character count for rejection reason', () => {
      render(<ModerationControls {...defaultProps} />);

      fireEvent.click(screen.getByTestId('moderation-reject'));
      const input = screen.getByTestId('moderation-reject-input');
      fireEvent.change(input, { target: { value: 'Too risky' } });

      expect(screen.getByTestId('moderation-reject-char-count')).toHaveTextContent('9/1000');
    });

    it('shows validation error when confirming empty rejection reason', () => {
      render(<ModerationControls {...defaultProps} />);

      fireEvent.click(screen.getByTestId('moderation-reject'));
      fireEvent.click(screen.getByTestId('moderation-confirm'));

      expect(screen.getByTestId('moderation-validation-error')).toBeInTheDocument();
    });

    it('calls onModerate with reject action and reason on valid confirm', () => {
      const onModerate = vi.fn();
      render(<ModerationControls {...defaultProps} onModerate={onModerate} />);

      fireEvent.click(screen.getByTestId('moderation-reject'));
      const input = screen.getByTestId('moderation-reject-input');
      fireEvent.change(input, { target: { value: 'This mitigation is not sufficient' } });
      fireEvent.click(screen.getByTestId('moderation-confirm'));

      expect(onModerate).toHaveBeenCalledWith('mit-1', {
        type: 'reject',
        reason: 'This mitigation is not sufficient',
      });
    });

    it('returns to idle state after successful rejection', () => {
      render(<ModerationControls {...defaultProps} />);

      fireEvent.click(screen.getByTestId('moderation-reject'));
      const input = screen.getByTestId('moderation-reject-input');
      fireEvent.change(input, { target: { value: 'Reason text' } });
      fireEvent.click(screen.getByTestId('moderation-confirm'));

      expect(screen.getByTestId('moderation-controls')).toBeInTheDocument();
    });
  });

  describe('Edit flow (Req 4.4)', () => {
    it('shows edit textarea pre-filled with mitigation description after clicking Edit', () => {
      render(<ModerationControls {...defaultProps} />);

      fireEvent.click(screen.getByTestId('moderation-edit'));

      expect(screen.getByTestId('moderation-edit-form')).toBeInTheDocument();
      const input = screen.getByTestId('moderation-edit-input') as HTMLTextAreaElement;
      expect(input.value).toBe('Original mitigation description text');
    });

    it('displays character count for edit text', () => {
      render(<ModerationControls {...defaultProps} />);

      fireEvent.click(screen.getByTestId('moderation-edit'));

      expect(screen.getByTestId('moderation-edit-char-count')).toHaveTextContent(
        `${defaultProps.mitigationDescription.length}/5000`
      );
    });

    it('calls onModerate with edit action and modified text on confirm', () => {
      const onModerate = vi.fn();
      render(<ModerationControls {...defaultProps} onModerate={onModerate} />);

      fireEvent.click(screen.getByTestId('moderation-edit'));
      const input = screen.getByTestId('moderation-edit-input');
      fireEvent.change(input, { target: { value: 'Updated mitigation text' } });
      fireEvent.click(screen.getByTestId('moderation-confirm'));

      expect(onModerate).toHaveBeenCalledWith('mit-1', {
        type: 'edit',
        modifiedText: 'Updated mitigation text',
      });
    });

    it('shows validation error when confirming empty edit text', () => {
      render(<ModerationControls {...defaultProps} />);

      fireEvent.click(screen.getByTestId('moderation-edit'));
      const input = screen.getByTestId('moderation-edit-input');
      fireEvent.change(input, { target: { value: '' } });
      fireEvent.click(screen.getByTestId('moderation-confirm'));

      expect(screen.getByTestId('moderation-validation-error')).toBeInTheDocument();
    });
  });

  describe('Cancel behavior (Req 4.6)', () => {
    it('discards rejection input and returns to idle state on cancel', () => {
      render(<ModerationControls {...defaultProps} />);

      fireEvent.click(screen.getByTestId('moderation-reject'));
      const input = screen.getByTestId('moderation-reject-input');
      fireEvent.change(input, { target: { value: 'partial reason' } });
      fireEvent.click(screen.getByTestId('moderation-cancel'));

      // Back to idle
      expect(screen.getByTestId('moderation-controls')).toBeInTheDocument();
      expect(screen.queryByTestId('moderation-reject-form')).not.toBeInTheDocument();
    });

    it('discards edit input and returns to idle state on cancel', () => {
      render(<ModerationControls {...defaultProps} />);

      fireEvent.click(screen.getByTestId('moderation-edit'));
      const input = screen.getByTestId('moderation-edit-input');
      fireEvent.change(input, { target: { value: 'some changes' } });
      fireEvent.click(screen.getByTestId('moderation-cancel'));

      // Back to idle
      expect(screen.getByTestId('moderation-controls')).toBeInTheDocument();
      expect(screen.queryByTestId('moderation-edit-form')).not.toBeInTheDocument();
    });

    it('does not call onModerate when cancel is clicked', () => {
      const onModerate = vi.fn();
      render(<ModerationControls {...defaultProps} onModerate={onModerate} />);

      fireEvent.click(screen.getByTestId('moderation-reject'));
      fireEvent.click(screen.getByTestId('moderation-cancel'));

      // onModerate should not have been called (only the initial render buttons exist)
      expect(onModerate).not.toHaveBeenCalled();
    });
  });

  describe('Conflict notification (Req 4.7)', () => {
    it('shows conflict warning instead of action buttons when hasConflict is true', () => {
      render(<ModerationControls {...defaultProps} hasConflict={true} />);

      expect(screen.getByTestId('moderation-conflict')).toBeInTheDocument();
      expect(screen.queryByTestId('moderation-controls')).not.toBeInTheDocument();
      expect(screen.queryByTestId('moderation-accept')).not.toBeInTheDocument();
    });

    it('conflict notification has alert role for accessibility', () => {
      render(<ModerationControls {...defaultProps} hasConflict={true} />);

      const alert = screen.getByTestId('moderation-conflict');
      expect(alert).toHaveAttribute('role', 'alert');
    });
  });

  describe('Equal card dimensions (Req 8.4)', () => {
    it('uses consistent padding and border treatment in idle state', () => {
      render(<ModerationControls {...defaultProps} />);

      const container = screen.getByTestId('moderation-controls');
      expect(container.className).toContain('p-4');
      expect(container.className).toContain('rounded-lg');
      expect(container.className).toContain('border');
    });

    it('uses consistent padding and border treatment in reject form', () => {
      render(<ModerationControls {...defaultProps} />);
      fireEvent.click(screen.getByTestId('moderation-reject'));

      const container = screen.getByTestId('moderation-reject-form');
      expect(container.className).toContain('p-4');
      expect(container.className).toContain('rounded-lg');
      expect(container.className).toContain('border');
    });

    it('uses consistent padding and border treatment in edit form', () => {
      render(<ModerationControls {...defaultProps} />);
      fireEvent.click(screen.getByTestId('moderation-edit'));

      const container = screen.getByTestId('moderation-edit-form');
      expect(container.className).toContain('p-4');
      expect(container.className).toContain('rounded-lg');
      expect(container.className).toContain('border');
    });

    it('uses consistent padding and border treatment in conflict state', () => {
      render(<ModerationControls {...defaultProps} hasConflict={true} />);

      const container = screen.getByTestId('moderation-conflict');
      expect(container.className).toContain('p-4');
      expect(container.className).toContain('rounded-lg');
      expect(container.className).toContain('border');
    });
  });
});
