// tui/dashboard.tsx — Ink session tiles grid
import React from 'react';
import { Box, Text } from 'ink';

// TODO: Accept SessionManager and NotificationFeed as props
// TODO: Render a grid of SessionTile components
// TODO: Render FeedPanel alongside session tiles
// TODO: Render VoiceOverlay when voice is active

export function App(): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text bold color="cyan">WinCMux loading...</Text>
      {/* TODO: <SessionGrid /> */}
      {/* TODO: <FeedPanel /> */}
      {/* TODO: <VoiceOverlay /> */}
    </Box>
  );
}
