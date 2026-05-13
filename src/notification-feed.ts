// notification-feed.ts — poll GitHub events via @octokit/rest
// TODO: Subscribe to repo/org webhook events and surface in the TUI feed panel

import type { Octokit } from '@octokit/rest';

export interface FeedItem {
  id: string;
  source: 'github' | 'teams' | 'email';
  title: string;
  body?: string;
  url?: string;
  timestamp: Date;
  read: boolean;
}

export class NotificationFeed {
  private items: FeedItem[] = [];

  constructor(
    private readonly octokit: Octokit,
    private readonly pollIntervalMs = 60_000,
  ) {}

  // TODO: start(): void — begin polling GitHub notifications endpoint
  // TODO: stop(): void — clear poll interval
  // TODO: markRead(id: string): void
  // TODO: getUnread(): FeedItem[]
  // TODO: on('item', handler): void — event emitter for new feed items

  getAll(): FeedItem[] {
    return this.items;
  }
}
