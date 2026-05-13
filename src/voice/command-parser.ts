// voice/command-parser.ts — Map transcribed text to dispatchable actions

export type VoiceAction =
  | { type: 'SWITCH_SESSION'; sessionId: number }
  | { type: 'STATUS' }
  | { type: 'PAUSE_ALL' }
  | { type: 'UNKNOWN'; raw: string };

/**
 * Parse a transcribed voice utterance into a VoiceAction.
 * Examples:
 *   "switch to 2"  → { type: 'SWITCH_SESSION', sessionId: 2 }
 *   "status"       → { type: 'STATUS' }
 *   "pause all"    → { type: 'PAUSE_ALL' }
 * TODO: Expand with more commands and fuzzy matching.
 */
export function parseVoiceCommand(text: string): VoiceAction {
  const normalized = text.trim().toLowerCase();

  const switchMatch = normalized.match(/^switch\s+to\s+(\d+)$/);
  if (switchMatch) {
    return { type: 'SWITCH_SESSION', sessionId: parseInt(switchMatch[1], 10) };
  }

  if (normalized === 'status') return { type: 'STATUS' };
  if (normalized === 'pause all') return { type: 'PAUSE_ALL' };

  return { type: 'UNKNOWN', raw: text };
}
