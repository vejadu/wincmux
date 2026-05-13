#!/usr/bin/env node
import React, { useState, useCallback, useEffect } from 'react';
import { render } from 'ink';
import { Dashboard } from './tui/dashboard.js';
import { SessionManager } from './session-manager.js';
import { NotificationFeed } from './notification-feed.js';
import { execSync } from 'node:child_process';
import { initConfig, validateConfig } from './config.js';

export type SessionStatus = 'idle' | 'working' | 'waiting' | 'error' | 'closed';
export type NotifSource = 'github' | 'teams' | 'email';
export type NotifPriority = 'high' | 'normal';
export type VoiceState = 'disabled' | 'sleeping' | 'wake-word-heard' | 'listening' | 'transcribing' | 'processing';

export type Session = {
  id: number;
  paneIndex: number;
  issueNumber?: number;
  repo?: string;
  status: SessionStatus;
  lastActivity: Date;
  title?: string;
};

export type Notification = {
  id: string;
  source: NotifSource;
  title: string;
  body: string;
  timestamp: Date;
  priority: NotifPriority;
  read: boolean;
  sessionId?: number;
};

async function main() {
  const config = await initConfig();
  const warnings = validateConfig(config);
  for (const w of warnings) console.warn(`⚠️  ${w}`);

  const sessionManager = new SessionManager(config);
  const feed = new NotificationFeed(config);

  if (process.argv.includes('--issues')) {
    try {
      const raw = execSync(
        'gh issue list --label "squad" --state open --json number,title,labels --limit 9',
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
      const issues: Array<{ number: number; title: string }> = JSON.parse(raw);
      const limited = issues.slice(0, 9);
      for (const issue of limited) {
        await sessionManager.spawnSession({ title: `#${issue.number}: ${issue.title}`, issueNumber: issue.number });
      }
      console.log(`🚀 Auto-spawned ${limited.length} panes from open squad issues`);
    } catch {
      // gh not installed or failed — skip auto-spawn gracefully
    }
  }

  function App() {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [voiceState, setVoiceState] = useState<VoiceState>('disabled');
    const [focusedSessionId, setFocusedSessionId] = useState(1);

    useEffect(() => {
      const unsub = sessionManager.onUpdate(setSessions);
      return unsub;
    }, []);

    useEffect(() => {
      feed.start();
      const unsub = feed.onUpdate(setNotifications);
      return () => {
        feed.stop();
        unsub();
      };
    }, []);

    const handleNewSession = useCallback(async () => {
      const session = await sessionManager.spawnSession();
      setFocusedSessionId(session.id);
    }, []);

    const handleCloseSession = useCallback(async (id: number) => {
      await sessionManager.closeSession(id);
    }, []);

    return React.createElement(Dashboard, {
      sessions,
      notifications,
      voiceState,
      focusedSessionId,
      onFocusSession: setFocusedSessionId,
      onNewSession: handleNewSession,
      onCloseSession: handleCloseSession,
    });
  }

  const { unmount } = render(React.createElement(App));

  function shutdown() {
    feed.stop();
    unmount();
    process.exit(0);
  }

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch(console.error);
