// session-manager.ts — track N agent sessions
// TODO: Integrate with launcher.ts pty handles and xterm headless buffers

export type SessionStatus = 'idle' | 'running' | 'waiting' | 'done' | 'error';

export interface Session {
  id: number;
  label: string;
  pid: number;
  issue?: number;
  status: SessionStatus;
  /** Raw xterm buffer snapshot */
  bufferSnapshot?: string;
}

export class SessionManager {
  private sessions: Map<number, Session> = new Map();

  // TODO: add(session: Session): void
  // TODO: remove(id: number): void
  // TODO: updateStatus(id: number, status: SessionStatus): void
  // TODO: getAll(): Session[]
  // TODO: focusSession(id: number): void — bring pane to foreground via wt.exe

  getAll(): Session[] {
    return Array.from(this.sessions.values());
  }
}
