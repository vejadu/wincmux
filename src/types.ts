// Shared public types used across the application.

export type SessionStatus = 'idle' | 'working' | 'waiting' | 'error' | 'closed';

export type Session = {
  id: number;
  paneIndex: number;
  issueNumber?: number;
  repo?: string;
  status: SessionStatus;
  lastActivity: Date;
  title?: string;
};

export type NotifSource = 'github' | 'teams' | 'email';
export type NotifPriority = 'high' | 'normal';

export type Notification = {
  id: string;
  source: NotifSource;
  title: string;
  body: string;
  timestamp: Date;
  priority: NotifPriority;
  read: boolean;
  sessionId?: number;
  url?: string;
};

export type VoiceState =
  | 'disabled'
  | 'sleeping'
  | 'wake-word-heard'
  | 'listening'
  | 'transcribing'
  | 'processing';
