// session-manager.ts — track N agent sessions

import { Terminal } from '@xterm/headless';
import type { IPty } from 'node-pty';
import { spawnPane, closePane, writeToPane } from './launcher.js';
import type { WinCMuxConfig } from './config.js';
import type { LaunchConfig } from './launcher.js';
import type { Session, SessionStatus } from './types.js';

export type { Session, SessionStatus };

type InternalSession = Session & {
  pty?: IPty;
  vtBuffer?: Terminal;
  _monitorInterval?: ReturnType<typeof setInterval>;
};

export class SessionManager {
  private sessions: Map<number, InternalSession>;
  private nextId: number;
  private listeners: Set<(sessions: Session[]) => void>;
  private config: WinCMuxConfig;

  constructor(config: WinCMuxConfig) {
    this.config = config;
    this.sessions = new Map();
    this.nextId = 1;
    this.listeners = new Set();
  }

  async spawnSession(options?: { issueNumber?: number; repo?: string; title?: string }): Promise<Session> {
    const id = this.nextId++;
    const paneIndex = id - 1;

    const launchConfig: LaunchConfig = {
      count: 1,
      command: 'powershell.exe',
      args: [],
      cwd: process.cwd(),
    };

    const spawned = await spawnPane(launchConfig, paneIndex, options);
    const vtBuffer = new Terminal({ cols: 220, rows: 50 });

    const session: InternalSession = {
      id,
      paneIndex,
      issueNumber: options?.issueNumber,
      repo: options?.repo,
      title: options?.title ?? `WinCMux ${paneIndex}`,
      status: 'working',
      lastActivity: new Date(),
      pty: spawned.pty,
      vtBuffer,
    };

    spawned.pty.onData(data => vtBuffer.write(data));
    this.monitorPtyOutput(session);
    this.sessions.set(id, session);
    this.notifyListeners();
    return session;
  }

  async closeSession(id: number): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) return;

    if (session._monitorInterval) {
      clearInterval(session._monitorInterval);
    }
    if (session.pty) {
      closePane(session.pty);
    }
    session.status = 'closed';
    this.sessions.delete(id);
    this.notifyListeners();
  }

  getSession(id: number): Session | undefined {
    return this.sessions.get(id);
  }

  getSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  writeToSession(id: number, text: string): void {
    const session = this.sessions.get(id);
    if (session?.pty) {
      writeToPane(session.pty, text);
    }
  }

  focusSession(id: number): void {
    const session = this.sessions.get(id);
    if (session) {
      session.lastActivity = new Date();
      this.notifyListeners();
    }
  }

  onUpdate(listener: (sessions: Session[]) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notifyListeners(): void {
    const sessions = this.getSessions();
    for (const listener of this.listeners) {
      listener(sessions);
    }
  }

  private monitorPtyOutput(session: InternalSession): void {
    let lastStatus = session.status;
    session._monitorInterval = setInterval(() => {
      if (!session.vtBuffer) return;
      const status = this.detectStatus(session.vtBuffer);
      session.lastActivity = new Date();
      if (status !== lastStatus) {
        session.status = status;
        lastStatus = status;
        this.notifyListeners();
      }
    }, this.config.sessionMonitorIntervalMs);
  }

  private detectStatus(vtBuffer: Terminal): SessionStatus {
    const buffer = vtBuffer.buffer.active;
    let lastLine = '';
    for (let row = buffer.length - 1; row >= 0; row--) {
      const line = buffer.getLine(row)?.translateToString(true).trim();
      if (line) { lastLine = line; break; }
    }

    if (!lastLine) return 'working';
    if (/error|failed|✗/i.test(lastLine)) return 'error';
    if (/\?|confirm|press|continue/i.test(lastLine)) return 'waiting';
    if (/thinking|●|[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(lastLine)) return 'working';
    if (/[>❯$]/.test(lastLine)) return 'idle';

    return 'working';
  }
}
