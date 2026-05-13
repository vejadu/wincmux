// integrations/email-agent.ts — hook for squad email-watcher agents → feed alerts
// Phase 3 placeholder: real HTTP IPC integration is deferred.

import type { FeedItem } from '../notification-feed.js';

export interface EmailAgentFeedOptions {
  onItem: (item: FeedItem) => void;
  /** Port to listen on for incoming agent POST requests, default 52731 */
  port?: number;
}

export class EmailAgentFeed {
  constructor(private readonly options: EmailAgentFeedOptions) {}

  async start(): Promise<void> {
    console.log(
      'Email agent integration not yet implemented — extend this class to add email monitoring',
    );
    void this.options; // referenced to satisfy strict checks; wired up in Phase 3
  }

  stop(): void {
    // No-op until Phase 3 HTTP listener is implemented
  }
}
