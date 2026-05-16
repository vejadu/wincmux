#!/usr/bin/env node
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { render } from 'ink';
import { Dashboard } from './tui/dashboard.js';
import { SessionManager } from './session-manager.js';
import { NotificationFeed } from './notification-feed.js';
import { execSync } from 'node:child_process';
import { initConfig, validateConfig } from './config.js';
import type { Session, Notification, VoiceState } from './types.js';
import type { WakeWordListener } from './voice/wake-word.js';
import type { SpeechTranscriber } from './voice/stt.js';
import type { TeamsMonitor } from './integrations/teams.js';

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
      const limited = issues.slice(0, config.maxPanes);
      for (const issue of limited) {
        await sessionManager.spawnSession({ title: `#${issue.number}: ${issue.title}`, issueNumber: issue.number });
      }
      console.log(`🚀 Auto-spawned ${limited.length} panes from open squad issues`);
    } catch {
      // gh not installed or failed — skip auto-spawn gracefully
    }
  }

  function App() {
    // Seed initial sessions so pre-render spawns are visible immediately
    const [sessions, setSessions] = useState<Session[]>(() => sessionManager.getSessions());
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [voiceState, setVoiceState] = useState<VoiceState>('disabled');
    const [focusedSessionId, setFocusedSessionId] = useState(1);

    // Keep a ref to focusedSessionId so voice callbacks always see the current value
    const focusedSessionIdRef = useRef(focusedSessionId);
    useEffect(() => {
      focusedSessionIdRef.current = focusedSessionId;
    }, [focusedSessionId]);

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

    // Voice pipeline — started only when picovoice + azure keys are configured
    useEffect(() => {
      if (!config.picovoiceAccessKey || !config.azureSpeechKey) return;

      let wakeWordListener: WakeWordListener | null = null;
      let speechTranscriber: SpeechTranscriber | null = null;
      let active = true;

      void (async () => {
        try {
          const { WakeWordListener } = await import('./voice/wake-word.js');
          const { SpeechTranscriber } = await import('./voice/stt.js');
          const { parseVoiceCommand } = await import('./voice/command-parser.js');

          speechTranscriber = new SpeechTranscriber({
            subscriptionKey: config.azureSpeechKey!,
            region: config.azureSpeechRegion,
            onResult: () => { if (active) setVoiceState('processing'); },
            onEnd: () => {},
          });

          wakeWordListener = new WakeWordListener({
            accessKey: config.picovoiceAccessKey!,
            wakeWord: config.wakeWord,
            onWakeWord: () => {
              void (async () => {
                if (!active || !speechTranscriber) return;

                setVoiceState('wake-word-heard');
                await new Promise<void>(r => setTimeout(r, 200));
                if (!active) return;

                setVoiceState('listening');
                const text = await speechTranscriber.captureUtterance();
                if (!active) return;

                if (text) {
                  const cmd = parseVoiceCommand(text);
                  const liveSessions = sessionManager.getSessions();

                  if (cmd.type === 'switch') {
                    const target = liveSessions.find(s => s.paneIndex === cmd.paneIndex);
                    if (target) setFocusedSessionId(target.id);
                  } else if (cmd.type === 'tell') {
                    const target = liveSessions.find(s => s.paneIndex === cmd.paneIndex);
                    if (target) sessionManager.writeToSession(target.id, cmd.text);
                  } else if (cmd.type === 'new') {
                    void sessionManager.spawnSession().then(s => setFocusedSessionId(s.id));
                  } else if (cmd.type === 'close') {
                    void sessionManager.closeSession(focusedSessionIdRef.current);
                  }
                }

                await new Promise<void>(r => setTimeout(r, 300));
                if (active) setVoiceState('sleeping');
              })();
            },
          });

          await wakeWordListener.start();
          if (active) setVoiceState('sleeping');
        } catch (err) {
          console.warn('[Voice] Initialization failed:', err);
        }
      })();

      return () => {
        active = false;
        wakeWordListener?.stop();
        speechTranscriber?.dispose();
      };
    }, []);

    // Teams integration — started only when tenantId + clientId are configured
    useEffect(() => {
      if (!config.teams?.tenantId || !config.teams?.clientId) return;

      let teamsMonitor: TeamsMonitor | null = null;
      let active = true;

      void (async () => {
        try {
          const { TeamsMonitor } = await import('./integrations/teams.js');
          teamsMonitor = new TeamsMonitor({
            tenantId: config.teams.tenantId!,
            clientId: config.teams.clientId!,
            pollIntervalMs: config.notificationPollIntervalMs,
            onAlert: message => {
              feed.addExternalNotification({
                id: `teams-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                source: 'teams',
                title: message,
                body: '',
                timestamp: new Date(),
                priority: 'high',
                read: false,
              });
            },
          });
          await teamsMonitor.start();
        } catch (err) {
          if (active) console.warn('[Teams] Initialization failed:', err);
        }
      })();

      return () => {
        active = false;
        teamsMonitor?.stop();
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
