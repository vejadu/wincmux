import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationFeed } from '../notification-feed.js';
import type { WinCMuxConfig } from '../config.js';

// ── Hoist shared mock state so vi.mock factories can reference it ────────────
const { mockListNotifications, mockExeca } = vi.hoisted(() => ({
  mockListNotifications: vi.fn(),
  mockExeca: vi.fn(),
}));

// ── Mock @octokit/rest ──────────────────────────────────────────────────────
vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn(function (this: unknown) {
    return { activity: { listNotificationsForAuthenticatedUser: mockListNotifications } };
  }),
}));

// ── Mock execa ──────────────────────────────────────────────────────────────
vi.mock('execa', () => ({ execa: (...a: unknown[]) => mockExeca(...a) }));

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<WinCMuxConfig> = {}): WinCMuxConfig {
  return {
    notificationPollIntervalMs: 30_000,
    sessionMonitorIntervalMs: 2_000,
    maxPanes: 9,
    azureSpeechRegion: 'eastus',
    wakeWord: 'computer',
    teams: {},
    ...overrides,
  };
}

function makeGhItem(id: string, reason = 'subscribed', unread = true) {
  return {
    id,
    reason,
    unread,
    subject: { title: `Issue ${id}`, type: 'Issue', url: `https://api.github.com/issues/${id}` },
    repository: { full_name: 'org/repo' },
    updated_at: new Date().toISOString(),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('NotificationFeed', () => {
  beforeEach(() => {
    mockListNotifications.mockReset();
    mockExeca.mockReset();
  });

  // ── constructor ──────────────────────────────────────────────────────────

  it('creates Octokit when githubToken is set', () => {
    const feed = new NotificationFeed(makeConfig({ githubToken: 'tok' }));
    expect(feed).toBeDefined();
  });

  it('creates without Octokit when no githubToken', () => {
    const feed = new NotificationFeed(makeConfig());
    expect(feed).toBeDefined();
  });

  // ── start / stop ─────────────────────────────────────────────────────────

  it('start sets the poll interval handle', () => {
    const feed = new NotificationFeed(makeConfig({ githubToken: 'tok' }));
    expect(feed['pollHandle']).toBeNull();
    feed.start();
    expect(feed['pollHandle']).not.toBeNull();
    feed.stop();
  });

  it('stop clears the poll interval handle', () => {
    const feed = new NotificationFeed(makeConfig({ githubToken: 'tok' }));
    feed.start();
    feed.stop();
    expect(feed['pollHandle']).toBeNull();
  });

  it('stop() is safe to call when not started', () => {
    const feed = new NotificationFeed(makeConfig());
    expect(() => feed.stop()).not.toThrow();
  });

  // ── onUpdate / getNotifications ──────────────────────────────────────────

  it('onUpdate fires immediately with current notifications', () => {
    const feed = new NotificationFeed(makeConfig());
    const listener = vi.fn();
    const unsub = feed.onUpdate(listener);
    expect(listener).toHaveBeenCalledWith([]);
    unsub();
  });

  it('onUpdate unsubscribe removes the listener', () => {
    const feed = new NotificationFeed(makeConfig());
    const listener = vi.fn();
    const unsub = feed.onUpdate(listener);
    unsub();
    feed.addExternalNotification({
      id: 'ext-1',
      source: 'github',
      title: 'Test',
      body: '',
      timestamp: new Date(),
      priority: 'normal',
      read: false,
    });
    // Listener was removed — should not have been called again
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('getNotifications returns sorted by timestamp descending', () => {
    const feed = new NotificationFeed(makeConfig());
    const older = new Date('2024-01-01');
    const newer = new Date('2024-06-01');
    feed.addExternalNotification({ id: 'a', source: 'email', title: 'A', body: '', timestamp: older, priority: 'normal', read: false });
    feed.addExternalNotification({ id: 'b', source: 'teams', title: 'B', body: '', timestamp: newer, priority: 'high', read: false });
    const notifs = feed.getNotifications();
    expect(notifs[0].id).toBe('b');
    expect(notifs[1].id).toBe('a');
  });

  // ── markRead ─────────────────────────────────────────────────────────────

  it('markRead updates the notification and notifies listeners', () => {
    const feed = new NotificationFeed(makeConfig());
    feed.addExternalNotification({ id: 'x', source: 'github', title: 'X', body: '', timestamp: new Date(), priority: 'normal', read: false });
    const listener = vi.fn();
    feed.onUpdate(listener);
    listener.mockClear();
    feed.markRead('x');
    const notifs = feed.getNotifications();
    expect(notifs[0].read).toBe(true);
    expect(listener).toHaveBeenCalled();
  });

  it('markRead is a no-op for unknown id', () => {
    const feed = new NotificationFeed(makeConfig());
    const listener = vi.fn();
    feed.onUpdate(listener);
    listener.mockClear();
    feed.markRead('nonexistent');
    expect(listener).not.toHaveBeenCalled();
  });

  // ── addExternalNotification ──────────────────────────────────────────────

  it('addExternalNotification stores and fires listeners', () => {
    const feed = new NotificationFeed(makeConfig());
    const listener = vi.fn();
    feed.onUpdate(listener);
    listener.mockClear();
    feed.addExternalNotification({ id: 'ext', source: 'teams', title: 'T', body: '', timestamp: new Date(), priority: 'high', read: false });
    expect(listener).toHaveBeenCalledOnce();
    expect(feed.getNotifications()).toHaveLength(1);
  });

  // ── pollGitHubApi ────────────────────────────────────────────────────────

  it('pollGitHubApi adds new notifications from Octokit', async () => {
    mockListNotifications.mockResolvedValue({ data: [makeGhItem('1', 'mention')] });
    const feed = new NotificationFeed(makeConfig({ githubToken: 'tok' }));
    await feed['pollGitHubApi']();
    const notifs = feed.getNotifications();
    expect(notifs.length).toBe(1);
    expect(notifs[0].priority).toBe('high'); // mention => high
  });

  it('pollGitHubApi marks high priority for review_requested', async () => {
    mockListNotifications.mockResolvedValue({ data: [makeGhItem('2', 'review_requested')] });
    const feed = new NotificationFeed(makeConfig({ githubToken: 'tok' }));
    await feed['pollGitHubApi']();
    expect(feed.getNotifications()[0].priority).toBe('high');
  });

  it('pollGitHubApi marks high priority for assign', async () => {
    mockListNotifications.mockResolvedValue({ data: [makeGhItem('3', 'assign')] });
    const feed = new NotificationFeed(makeConfig({ githubToken: 'tok' }));
    await feed['pollGitHubApi']();
    expect(feed.getNotifications()[0].priority).toBe('high');
  });

  it('pollGitHubApi marks normal priority for subscribed', async () => {
    mockListNotifications.mockResolvedValue({ data: [makeGhItem('4', 'subscribed')] });
    const feed = new NotificationFeed(makeConfig({ githubToken: 'tok' }));
    await feed['pollGitHubApi']();
    expect(feed.getNotifications()[0].priority).toBe('normal');
  });

  it('pollGitHubApi does not duplicate already-seen notifications', async () => {
    mockListNotifications.mockResolvedValue({ data: [makeGhItem('dup')] });
    const feed = new NotificationFeed(makeConfig({ githubToken: 'tok' }));
    await feed['pollGitHubApi']();
    await feed['pollGitHubApi']();
    expect(feed.getNotifications()).toHaveLength(1);
  });

  it('pollGitHubApi passes "since" after first poll', async () => {
    mockListNotifications.mockResolvedValue({ data: [] });
    const feed = new NotificationFeed(makeConfig({ githubToken: 'tok' }));
    feed['lastPollTime'] = new Date('2024-01-01');
    await feed['pollGitHubApi']();
    expect(mockListNotifications).toHaveBeenCalledWith(expect.objectContaining({ since: expect.any(String) }));
  });

  it('pollGitHubApi handles empty item URL gracefully', async () => {
    const item = makeGhItem('5');
    item.subject = { title: 'No URL', type: 'Issue', url: undefined as unknown as string };
    mockListNotifications.mockResolvedValue({ data: [item] });
    const feed = new NotificationFeed(makeConfig({ githubToken: 'tok' }));
    await feed['pollGitHubApi']();
    expect(feed.getNotifications()[0].url).toBeUndefined();
  });

  it('poll() swallows errors from pollGitHubApi silently', async () => {
    mockListNotifications.mockRejectedValue(new Error('network error'));
    const feed = new NotificationFeed(makeConfig({ githubToken: 'tok' }));
    await expect(feed['poll']()).resolves.not.toThrow();
  });

  it('poll() falls back to pollGhCli when no octokit', async () => {
    mockExeca.mockResolvedValue({ stdout: '' });
    const feed = new NotificationFeed(makeConfig()); // no githubToken
    await expect(feed['poll']()).resolves.not.toThrow();
  });

  // ── pollGhCli ────────────────────────────────────────────────────────────

  it('pollGhCli skips when stdout is empty', async () => {
    mockExeca.mockResolvedValue({ stdout: '   ' });
    const feed = new NotificationFeed(makeConfig());
    await feed['pollGhCli']();
    expect(feed.getNotifications()).toHaveLength(0);
  });

  it('pollGhCli parses JSON-lines and adds notifications', async () => {
    const item = {
      id: 'cli-1',
      reason: 'mention',
      subject: { title: 'CLI Issue', type: 'Issue', url: 'https://example.com' },
      repository: { full_name: 'org/repo' },
      updated_at: new Date().toISOString(),
    };
    mockExeca.mockResolvedValue({ stdout: JSON.stringify(item) });
    const feed = new NotificationFeed(makeConfig());
    await feed['pollGhCli']();
    const notifs = feed.getNotifications();
    expect(notifs).toHaveLength(1);
    expect(notifs[0].priority).toBe('high');
  });

  it('pollGhCli marks high priority for review_requested', async () => {
    const item = {
      id: 'cli-rr',
      reason: 'review_requested',
      subject: { title: 'Review', type: 'PullRequest', url: null },
      repository: { full_name: 'org/repo' },
      updated_at: new Date().toISOString(),
    };
    mockExeca.mockResolvedValue({ stdout: JSON.stringify(item) });
    const feed = new NotificationFeed(makeConfig());
    await feed['pollGhCli']();
    expect(feed.getNotifications()[0].priority).toBe('high');
  });

  it('pollGhCli marks high priority for assign', async () => {
    const item = {
      id: 'cli-as',
      reason: 'assign',
      subject: { title: 'Assigned', type: 'Issue', url: null },
      repository: { full_name: 'org/repo' },
      updated_at: new Date().toISOString(),
    };
    mockExeca.mockResolvedValue({ stdout: JSON.stringify(item) });
    const feed = new NotificationFeed(makeConfig());
    await feed['pollGhCli']();
    expect(feed.getNotifications()[0].priority).toBe('high');
  });

  it('pollGhCli marks normal priority for subscribed', async () => {
    const item = {
      id: 'cli-sub',
      reason: 'subscribed',
      subject: { title: 'Sub', type: 'Issue', url: null },
      repository: { full_name: 'org/repo' },
      updated_at: new Date().toISOString(),
    };
    mockExeca.mockResolvedValue({ stdout: JSON.stringify(item) });
    const feed = new NotificationFeed(makeConfig());
    await feed['pollGhCli']();
    expect(feed.getNotifications()[0].priority).toBe('normal');
  });

  it('pollGhCli does not duplicate items', async () => {
    const item = {
      id: 'cli-dup',
      reason: 'subscribed',
      subject: { title: 'Dup', type: 'Issue', url: null },
      repository: { full_name: 'org/repo' },
      updated_at: new Date().toISOString(),
    };
    mockExeca.mockResolvedValue({ stdout: JSON.stringify(item) });
    const feed = new NotificationFeed(makeConfig());
    await feed['pollGhCli']();
    await feed['pollGhCli']();
    expect(feed.getNotifications()).toHaveLength(1);
  });

  it('pollGhCli swallows errors silently', async () => {
    mockExeca.mockRejectedValue(new Error('gh not found'));
    const feed = new NotificationFeed(makeConfig());
    await expect(feed['pollGhCli']()).resolves.not.toThrow();
  });

  it('pollGhCli handles multiple lines', async () => {
    const item1 = { id: 'm1', reason: 'mention', subject: { title: 'M1', type: 'Issue', url: null }, repository: { full_name: 'a/b' }, updated_at: new Date().toISOString() };
    const item2 = { id: 'm2', reason: 'subscribed', subject: { title: 'M2', type: 'PR', url: null }, repository: { full_name: 'a/b' }, updated_at: new Date().toISOString() };
    mockExeca.mockResolvedValue({ stdout: `${JSON.stringify(item1)}\n${JSON.stringify(item2)}` });
    const feed = new NotificationFeed(makeConfig());
    await feed['pollGhCli']();
    expect(feed.getNotifications()).toHaveLength(2);
  });
});
