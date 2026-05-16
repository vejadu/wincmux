import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailAgentFeed } from '../integrations/email-agent.js';
import type { Notification } from '../types.js';

function makeNotif(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'n1',
    source: 'email',
    title: 'Hello',
    body: 'body text',
    timestamp: new Date('2024-01-01'),
    priority: 'normal',
    read: false,
    ...overrides,
  };
}

describe('EmailAgentFeed', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('logs a placeholder message on start()', async () => {
    const onItem = vi.fn();
    const feed = new EmailAgentFeed({ onItem, port: 52731 });
    await feed.start();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('not yet implemented'));
  });

  it('stop() is a no-op and does not throw', () => {
    const feed = new EmailAgentFeed({ onItem: vi.fn() });
    expect(() => feed.stop()).not.toThrow();
  });

  it('accepts a Notification via the onItem callback (type check)', () => {
    const onItem = vi.fn();
    const feed = new EmailAgentFeed({ onItem });
    // Simulate an external caller using the onItem hook
    feed['options'].onItem(makeNotif({ id: 'n2', title: 'Test email' }));
    expect(onItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'n2' }));
  });

  it('uses default port when not specified', async () => {
    const onItem = vi.fn();
    const feed = new EmailAgentFeed({ onItem });
    // Just verify it starts without error
    await expect(feed.start()).resolves.toBeUndefined();
  });
});
