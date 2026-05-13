// tui/feed-panel.tsx — GitHub + Teams + email notifications sidebar
import React from 'react';
import { Box, Text } from 'ink';
import type { FeedItem } from '../notification-feed.js';

interface FeedPanelProps {
  items?: FeedItem[];
}

// TODO: Render unread feed items with source badge (GitHub/Teams/email)
// TODO: Highlight unread items
// TODO: Support keyboard navigation to mark items read

export function FeedPanel({ items = [] }: FeedPanelProps): React.ReactElement {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray">
      <Text bold>Notifications</Text>
      {items.length === 0 && <Text dimColor>No new notifications</Text>}
      {/* TODO: map items to FeedRow components */}
    </Box>
  );
}
