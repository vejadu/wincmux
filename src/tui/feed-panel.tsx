import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

type NotifSource = 'github' | 'teams' | 'email';
type NotifPriority = 'high' | 'normal';

type Notification = {
  id: string;
  source: NotifSource;
  title: string;
  body: string;
  timestamp: Date;
  priority: NotifPriority;
  read: boolean;
  sessionId?: number;
};

type FeedPanelProps = {
  notifications: Notification[];
  onSelect: (notif: Notification) => void;
};

const SOURCE_BADGES: Record<NotifSource, string> = {
  github: '[GH]',
  teams: '[TM]',
  email: '[EM]',
};

const SOURCE_COLORS: Record<NotifSource, string> = {
  github: 'blue',
  teams: 'magenta',
  email: 'yellow',
};

const MAX_VISIBLE = 20;

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h`;
}

export function FeedPanel({ notifications, onSelect }: FeedPanelProps) {
  const [scrollOffset, setScrollOffset] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const sorted = [...notifications].sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  );
  const total = sorted.length;
  const clampedOffset = Math.min(scrollOffset, Math.max(0, total - MAX_VISIBLE));
  const visible = sorted.slice(clampedOffset, clampedOffset + MAX_VISIBLE);

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex(i => {
        const next = Math.max(0, i - 1);
        if (next < clampedOffset) setScrollOffset(Math.max(0, clampedOffset - 1));
        return next;
      });
    }
    if (key.downArrow) {
      setSelectedIndex(i => {
        const next = Math.min(total - 1, i + 1);
        if (next >= clampedOffset + MAX_VISIBLE) setScrollOffset(clampedOffset + 1);
        return next;
      });
    }
    if (key.return && sorted[selectedIndex]) {
      onSelect(sorted[selectedIndex]!);
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      flexGrow={1}
    >
      <Box marginBottom={1}>
        <Text bold color="cyan">
          ◈ Feed
        </Text>
        <Text color="gray">  ↑↓:scroll  Enter:select</Text>
      </Box>

      {visible.length === 0 && (
        <Text color="gray" dimColor>
          No notifications
        </Text>
      )}

      {visible.map((notif, visIdx) => {
        const absoluteIndex = clampedOffset + visIdx;
        const isSelected = absoluteIndex === selectedIndex;
        const badge = SOURCE_BADGES[notif.source];
        const badgeColor = SOURCE_COLORS[notif.source];
        const isHigh = notif.priority === 'high';
        const ago = timeAgo(notif.timestamp);

        return (
          <Box
            key={notif.id}
            flexDirection="row"
            gap={1}
            paddingX={isSelected ? 1 : 0}
          >
            <Text color="cyan">{isSelected ? '›' : ' '}</Text>
            <Text color={badgeColor} bold>
              {badge}
            </Text>
            {isHigh ? <Text color="red" bold>!</Text> : <Text> </Text>}
            <Box flexGrow={1}>
              <Text
                bold={isHigh || !notif.read}
                dimColor={notif.read && !isSelected}
                color={isSelected ? 'white' : undefined}
                wrap="truncate"
              >
                {notif.title}
              </Text>
            </Box>
            <Text color="gray" dimColor>
              {ago}
            </Text>
            <Text color={notif.read ? 'gray' : 'cyan'}>
              {notif.read ? '·' : '•'}
            </Text>
          </Box>
        );
      })}

      {total > MAX_VISIBLE && (
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            {clampedOffset + 1}–{Math.min(clampedOffset + MAX_VISIBLE, total)} of {total}
          </Text>
        </Box>
      )}
    </Box>
  );
}
