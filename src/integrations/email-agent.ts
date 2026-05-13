// integrations/email-agent.ts — hook for squad email-watcher agents → feed alerts
// TODO: Expose an HTTP endpoint or IPC channel that squad email-watcher agents
//       can POST to, surfacing alerts in the WinCMux notification feed.

import type { FeedItem } from '../notification-feed.js';

export interface EmailAgentFeedOptions {
  onItem: (item: FeedItem) => void;
  /** Port to listen on for incoming agent POST requests, default 52731 */
  port?: number;
}

export class EmailAgentFeed {
  constructor(private readonly options: EmailAgentFeedOptions) {}

  // TODO: start(): Promise<void> — open HTTP listener for agent payloads
  // TODO: stop(): void — close listener

  async start(): Promise<void> {
    throw new Error('EmailAgentFeed.start not yet implemented');
  }

  stop(): void {
    // TODO: close HTTP server
  }
}
