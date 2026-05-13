import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { FeedPanel } from './feed-panel.js';
import { VoiceOverlay } from './voice-overlay.js';
import { AlertBadge } from './alert-badge.js';

type SessionStatus = 'idle' | 'working' | 'waiting' | 'error' | 'closed';

type Session = {
  id: number;
  paneIndex: number;
  issueNumber?: number;
  repo?: string;
  status: SessionStatus;
  lastActivity: Date;
  title?: string;
};

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

type VoiceState = 'disabled' | 'sleeping' | 'wake-word-heard' | 'listening' | 'transcribing' | 'processing';

type DashboardProps = {
  sessions: Session[];
  notifications: Notification[];
  voiceState: VoiceState;
  focusedSessionId: number;
  onFocusSession: (id: number) => void;
  onNewSession: () => void;
  onCloseSession: (id: number) => void;
};

const STATUS_ICONS: Record<SessionStatus, string> = {
  working: '●',
  waiting: '◐',
  idle: '○',
  error: '✗',
  closed: '○',
};

const STATUS_COLORS: Record<SessionStatus, string> = {
  working: 'green',
  waiting: 'yellow',
  idle: 'gray',
  error: 'red',
  closed: 'gray',
};

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

type SessionTileProps = {
  session: Session;
  focused: boolean;
  flashActive: boolean;
};

function SessionTile({ session, focused, flashActive }: SessionTileProps) {
  const icon = STATUS_ICONS[session.status];
  const iconColor = flashActive ? 'magenta' : STATUS_COLORS[session.status];
  const borderColor = focused ? 'cyan' : flashActive ? 'magenta' : 'gray';

  const issueLabel = session.issueNumber ? `#${session.issueNumber}` : '—';
  const repoLabel = session.repo ? session.repo.split('/')[1] ?? session.repo : '';
  const titleLabel = session.title
    ? session.title.length > 24
      ? session.title.slice(0, 22) + '…'
      : session.title
    : '';

  return (
    <Box
      borderStyle="round"
      borderColor={borderColor}
      flexDirection="column"
      paddingX={1}
      width={36}
      marginRight={1}
      marginBottom={1}
    >
      <Box flexDirection="row" gap={1}>
        <Text color={focused ? 'cyan' : 'white'} bold={focused}>
          [{session.id}]
        </Text>
        <Text color={iconColor}>{icon}</Text>
        <Text color={iconColor} dimColor={session.status === 'idle' || session.status === 'closed'}>
          {session.status}
        </Text>
        <Text color="gray">{timeAgo(session.lastActivity)}</Text>
      </Box>
      <Box flexDirection="row" gap={1}>
        <Text color="blue">{issueLabel}</Text>
        {repoLabel ? <Text color="gray">{repoLabel}</Text> : null}
      </Box>
      {titleLabel ? (
        <Text color="white" dimColor={!focused} wrap="truncate">
          {titleLabel}
        </Text>
      ) : null}
    </Box>
  );
}

export function Dashboard({
  sessions,
  notifications,
  voiceState,
  focusedSessionId,
  onFocusSession,
  onNewSession,
  onCloseSession,
}: DashboardProps) {
  const { stdout } = useStdout();
  const termWidth = stdout?.columns ?? 120;
  const termHeight = stdout?.rows ?? 30;

  const [flashSessions, setFlashSessions] = useState<Record<number, number>>({});
  const [flashFrame, setFlashFrame] = useState(false);

  useEffect(() => {
    const unread = notifications.filter(
      n => !n.read && n.priority === 'high' && (n.source === 'teams' || n.source === 'email') && n.sessionId != null
    );
    if (unread.length === 0) return;
    setFlashSessions(prev => {
      const next = { ...prev };
      for (const n of unread) {
        if (n.sessionId != null) next[n.sessionId] = 6;
      }
      return next;
    });
  }, [notifications]);

  useEffect(() => {
    const hasActive = Object.values(flashSessions).some(v => v > 0);
    if (!hasActive) return;
    const t = setInterval(() => {
      setFlashFrame(f => !f);
      setFlashSessions(prev => {
        const next: Record<number, number> = {};
        let any = false;
        for (const [id, count] of Object.entries(prev)) {
          const remaining = count - 1;
          if (remaining > 0) {
            next[Number(id)] = remaining;
            any = true;
          }
        }
        return any ? next : {};
      });
    }, 100);
    return () => clearInterval(t);
  }, [flashSessions]);

  const gridWidth = Math.floor(termWidth * 0.7);
  const feedWidth = termWidth - gridWidth;
  const mainHeight = termHeight - 3;

  const activeSessions = sessions.filter(s => s.status !== 'closed');

  useInput((input, key) => {
    if (key.ctrl) {
      const digit = parseInt(input, 10);
      if (!isNaN(digit) && digit >= 1 && digit <= 9) {
        const pane = activeSessions[digit - 1];
        if (pane) onFocusSession(pane.id);
        return;
      }
      if (input === 'n' || input === 'N') {
        onNewSession();
        return;
      }
      if (input === 'w' || input === 'W') {
        onCloseSession(focusedSessionId);
        return;
      }
    }
  });

  const unreadCounts: Record<NotifSource, number> = { github: 0, teams: 0, email: 0 };
  for (const n of notifications) {
    if (!n.read) unreadCounts[n.source]++;
  }

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight}>
      <Box flexDirection="row" height={mainHeight}>
        <Box
          flexDirection="column"
          width={gridWidth}
          borderStyle="single"
          borderColor="gray"
          paddingX={1}
          paddingY={0}
        >
          <Box marginBottom={1}>
            <Text bold color="cyan">
              ◈ WinCMux Sessions
            </Text>
            <Text color="gray">  ^1-9:focus  ^N:new  ^W:close</Text>
          </Box>
          <Box flexDirection="row" flexWrap="wrap">
            {activeSessions.map(session => {
              const isFlashing = (flashSessions[session.id] ?? 0) > 0 && flashFrame;
              const alertNotif = notifications.find(
                n =>
                  n.sessionId === session.id &&
                  !n.read &&
                  n.priority === 'high' &&
                  (n.source === 'teams' || n.source === 'email')
              );
              return (
                <Box key={session.id} flexDirection="column">
                  <SessionTile
                    session={session}
                    focused={session.id === focusedSessionId}
                    flashActive={isFlashing}
                  />
                  {alertNotif ? (
                    <Box marginLeft={1} marginTop={-1} marginBottom={1}>
                      <AlertBadge
                        active={true}
                        label={
                          alertNotif.source === 'teams'
                            ? `Teams ${unreadCounts.teams} msg${unreadCounts.teams !== 1 ? 's' : ''}`
                            : `Email`
                        }
                        source={alertNotif.source}
                      />
                    </Box>
                  ) : null}
                </Box>
              );
            })}
            {activeSessions.length === 0 && (
              <Text color="gray" dimColor>
                No active sessions — press Ctrl+N to start one
              </Text>
            )}
          </Box>
        </Box>

        <Box flexDirection="column" width={feedWidth}>
          <FeedPanel
            notifications={notifications}
            onSelect={_n => {
              if (_n.sessionId != null) onFocusSession(_n.sessionId);
            }}
          />
        </Box>
      </Box>

      <Box flexDirection="column" height={2}>
        <VoiceOverlay voiceState={voiceState} />
        <Box flexDirection="row" paddingX={1}>
          <Text color="gray">
            sessions:{sessions.filter(s => s.status !== 'closed').length}  unread:
            {Object.values(unreadCounts).reduce((a, b) => a + b, 0)}
          </Text>
          <Text color="gray">
            {'  '}GH:{unreadCounts.github} TM:{unreadCounts.teams} EM:{unreadCounts.email}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
