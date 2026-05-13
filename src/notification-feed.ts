import { Octokit } from '@octokit/rest';
import { execa } from 'execa';
import type { WinCMuxConfig } from './config.js';

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

/** @deprecated Use Notification */
export type FeedItem = Notification;

export class NotificationFeed {
  private config: WinCMuxConfig;
  private octokit: Octokit | null = null;
  private notifications: Map<string, Notification> = new Map();
  private listeners: Set<(notifs: Notification[]) => void> = new Set();
  private pollHandle: NodeJS.Timeout | null = null;
  private lastPollTime: Date | null = null;

  constructor(config: WinCMuxConfig) {
    this.config = config;
    if (config.githubToken) {
      this.octokit = new Octokit({ auth: config.githubToken });
    }
  }

  start(): void {
    this.poll(); // immediate first poll
    this.pollHandle = setInterval(() => this.poll(), this.config.githubPollIntervalMs);
  }

  stop(): void {
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
  }

  onUpdate(listener: (notifs: Notification[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.getNotifications());
    return () => this.listeners.delete(listener);
  }

  getNotifications(): Notification[] {
    return [...this.notifications.values()].sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );
  }

  markRead(id: string): void {
    const n = this.notifications.get(id);
    if (n) {
      n.read = true;
      this.notify();
    }
  }

  addExternalNotification(notif: Notification): void {
    this.notifications.set(notif.id, notif);
    this.notify();
  }

  private async poll(): Promise<void> {
    try {
      if (this.octokit) {
        await this.pollGitHubApi();
      } else {
        await this.pollGhCli();
      }
    } catch {
      // Silent failure — polling will retry
    }
    this.lastPollTime = new Date();
  }

  private async pollGitHubApi(): Promise<void> {
    const params: { since?: string } = {};
    if (this.lastPollTime) {
      params.since = this.lastPollTime.toISOString();
    }

    const { data } = await this.octokit!.activity.listNotificationsForAuthenticatedUser({
      all: false, // only unread
      ...params,
    });

    let changed = false;
    for (const item of data) {
      const id = `gh-${item.id}`;
      if (!this.notifications.has(id)) {
        const reason = item.reason;
        const isHigh = reason === 'mention' || reason === 'review_requested' || reason === 'assign';

        this.notifications.set(id, {
          id,
          source: 'github',
          title: item.subject.title,
          body: `${item.repository.full_name} · ${item.subject.type}`,
          timestamp: new Date(item.updated_at),
          priority: isHigh ? 'high' : 'normal',
          read: !item.unread,
          url: item.subject.url ?? undefined,
        });
        changed = true;
      }
    }

    if (changed) this.notify();
  }

  private async pollGhCli(): Promise<void> {
    try {
      const { stdout } = await execa('gh', [
        'api', '/notifications',
        '--jq', '.[] | select(.unread==true) | {id,subject,repository,reason,updated_at}'
      ]);
      if (!stdout.trim()) return;

      // gh api --jq returns one JSON object per line
      const items = stdout
        .split('\n')
        .filter(Boolean)
        .map((line: string) => JSON.parse(line) as {
          id: string;
          subject: { title: string; type: string; url?: string };
          repository: { full_name: string };
          reason: string;
          updated_at: string;
        });

      let changed = false;
      for (const item of items) {
        const id = `gh-${item.id}`;
        if (!this.notifications.has(id)) {
          const isHigh = item.reason === 'mention' || item.reason === 'review_requested' || item.reason === 'assign';
          this.notifications.set(id, {
            id,
            source: 'github',
            title: item.subject.title,
            body: `${item.repository.full_name} · ${item.subject.type}`,
            timestamp: new Date(item.updated_at),
            priority: isHigh ? 'high' : 'normal',
            read: false,
            url: item.subject.url,
          });
          changed = true;
        }
      }

      if (changed) this.notify();
    } catch {
      // gh CLI not available or not authenticated — skip silently
    }
  }

  private notify(): void {
    const notifs = this.getNotifications();
    for (const listener of this.listeners) {
      listener(notifs);
    }
  }
}
