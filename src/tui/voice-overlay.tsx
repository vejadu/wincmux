// tui/voice-overlay.tsx — mic active / wake word detected indicator
import React from 'react';
import { Box, Text } from 'ink';

interface VoiceOverlayProps {
  listening?: boolean;
  wakeWordDetected?: boolean;
  transcript?: string;
}

// TODO: Animate mic icon while listening
// TODO: Show transcript as it streams in from STT

export function VoiceOverlay({
  listening = false,
  wakeWordDetected = false,
  transcript,
}: VoiceOverlayProps): React.ReactElement | null {
  if (!listening && !wakeWordDetected) return null;

  return (
    <Box borderStyle="single" borderColor="yellow" paddingX={1}>
      <Text color="yellow">
        {wakeWordDetected ? '🎙 Listening...' : '🔇 Wake word: "Hey WinCMux"'}
      </Text>
      {transcript && <Text> {transcript}</Text>}
    </Box>
  );
}
