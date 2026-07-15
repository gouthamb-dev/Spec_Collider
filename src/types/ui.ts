import type { ModerationDecision } from './domain.ts';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface ConflictResult {
  hasConflict: boolean;
  conflictingDecision?: ModerationDecision;
  affectedSection?: string;
}

export interface ExportResult {
  success: boolean;
  writtenFiles: string[];
  failedFiles: { path: string; error: string }[];
}

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

export type ModerationAction =
  | { type: 'accept' }
  | { type: 'reject'; reason: string }
  | { type: 'edit'; modifiedText: string };
