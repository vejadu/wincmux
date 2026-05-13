// voice/command-parser.ts — Map transcribed text to dispatchable actions

export type VoiceCommand =
  | { type: 'switch'; paneIndex: number }             // "switch to 2", "go to pane 3"
  | { type: 'tell'; paneIndex: number; text: string } // "tell agent 1: fix the tests"
  | { type: 'new' }                                   // "new session", "open new pane"
  | { type: 'close' }                                 // "close this", "close current"
  | { type: 'unknown'; raw: string };                 // anything else

/**
 * Parse a transcribed voice utterance into a VoiceCommand.
 *
 * Pane numbers in speech are 1-based; paneIndex in the returned command is 0-based.
 *
 * Examples:
 *   "switch to 2"           → { type: 'switch', paneIndex: 1 }
 *   "go to pane 3"          → { type: 'switch', paneIndex: 2 }
 *   "tell agent 1: do it"   → { type: 'tell', paneIndex: 0, text: 'do it' }
 *   "new session"           → { type: 'new' }
 *   "close this"            → { type: 'close' }
 */
export function parseVoiceCommand(utterance: string): VoiceCommand {
  const normalized = utterance.trim().toLowerCase();

  // Switch: "switch to N", "go to N", "go to pane N", "pane N", "number N"
  const switchMatch = normalized.match(
    /^(?:switch\s+to|go\s+to(?:\s+pane)?|pane|number)\s+(\d+)$/,
  );
  if (switchMatch) {
    return { type: 'switch', paneIndex: parseInt(switchMatch[1], 10) - 1 };
  }

  // Tell: "tell agent N: <text>", "tell N: <text>", "send to N: <text>"
  const tellMatch = normalized.match(
    /^(?:tell(?:\s+agent)?|send\s+to)\s+(\d+)\s*:\s*(.+)$/,
  );
  if (tellMatch) {
    return {
      type: 'tell',
      paneIndex: parseInt(tellMatch[1], 10) - 1,
      // Preserve original casing from the raw utterance for the message text
      text: utterance.slice(utterance.toLowerCase().indexOf(tellMatch[2])).trim(),
    };
  }

  // New session / pane
  if (/^(?:new\s+(?:session|pane)|open\s+new)$/.test(normalized)) {
    return { type: 'new' };
  }

  // Close
  if (/^close\s+(?:this|current|pane)$/.test(normalized)) {
    return { type: 'close' };
  }

  return { type: 'unknown', raw: utterance };
}
