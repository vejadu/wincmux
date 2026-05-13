#!/usr/bin/env node
import React, { useState, useCallback, useEffect } from 'react';
import { render } from 'ink';
import { Dashboard } from './tui/dashboard.js';
import { SessionManager } from './session-manager.js';
import { NotificationFeed } from './notification-feed.js';
import { loadConfig } from './config.js';

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
  const config = await loadConfig();
  const sessionManager = new SessionManager(config);
  const feed = new NotificationFeed(config);

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

  render(React.createElement(App));
}

main().catch(console.error);
