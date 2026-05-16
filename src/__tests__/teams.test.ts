import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TeamsMonitor } from '../integrations/teams.js';
import type { TeamsMonitorOptions } from '../integrations/teams.js';

// ── Hoist shared msal + graph mock state ──────────────────────────────────────
const msalState = vi.hoisted(() => ({
  accounts: [] as unknown[],
  silentToken: 'access-token' as string | null,
  silentThrow: false,
  deviceCodeToken: 'device-token' as string | null,
  deviceCodeCallback: null as null | ((r: { message: string }) => void),
}));

const graphState = vi.hoisted(() => ({
  throw: false,
  chatPages: [] as Array<unknown[]>,
  pageIndex: 0,
}));

vi.mock('@azure/msal-node', () => ({
  PublicClientApplication: vi.fn(function (this: unknown) {
    return {
      getTokenCache: () => ({
        getAllAccounts: () => Promise.resolve(msalState.accounts),
      }),
      acquireTokenSilent: () => {
        if (msalState.silentThrow) return Promise.reject(new Error('expired'));
        return Promise.resolve(msalState.silentToken ? { accessToken: msalState.silentToken } : null);
      },
      acquireTokenByDeviceCode: (params: { deviceCodeCallback: (r: { message: string }) => void }) => {
        if (params.deviceCodeCallback) {
          msalState.deviceCodeCallback = params.deviceCodeCallback;
          params.deviceCodeCallback({ message: 'Visit https://example.com code ABC' });
        }
        return Promise.resolve(msalState.deviceCodeToken ? { accessToken: msalState.deviceCodeToken } : null);
      },
    };
  }),
}));

vi.mock('@microsoft/microsoft-graph-client', () => ({
  Client: {
    init: vi.fn(function (opts: { authProvider?: (done: (err: Error | null, token: string | null) => void) => void }) {
      // Call authProvider to exercise that callback path in teams.ts
      if (opts?.authProvider) opts.authProvider((_err, _tok) => {});
      return {
        api: vi.fn(function (this: unknown) { return this; }),
        expand: vi.fn(function (this: unknown) { return this; }),
        get: vi.fn(async function () {
          if (graphState.throw) throw new Error('graph error');
          const page = graphState.chatPages[graphState.pageIndex] ?? [];
          graphState.pageIndex++;
          return { value: page };
        }),
      };
    }),
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeOptions(overrides: Partial<TeamsMonitorOptions> = {}): TeamsMonitorOptions {
  return {
    tenantId: 'tenant-1',
    clientId: 'client-1',
    onAlert: vi.fn(),
    pollIntervalMs: 50,
    ...overrides,
  };
}

function makeChat(msgId: string, content = 'hello', sender = 'Alice') {
  return { id: 'chat-1', lastMessagePreview: { id: msgId, body: { content }, from: { user: { displayName: sender } } } };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('TeamsMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    msalState.accounts = [];
    msalState.silentToken = 'access-token';
    msalState.silentThrow = false;
    msalState.deviceCodeToken = 'device-token';
    msalState.deviceCodeCallback = null;
    graphState.throw = false;
    graphState.chatPages = [];
    graphState.pageIndex = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('getAccessToken throws "not authenticated" when called before start()', async () => {
    const monitor = new TeamsMonitor(makeOptions());
    const err = await monitor['getAccessToken']().catch((e: Error) => e.message);
    expect(err).toContain('not authenticated');
  });

  it('stop() is safe to call before start()', () => {
    const monitor = new TeamsMonitor(makeOptions());
    expect(() => monitor.stop()).not.toThrow();
  });

  it('stop() clears the poll timer', async () => {
    graphState.chatPages = [[]];
    const monitor = new TeamsMonitor(makeOptions());
    await monitor.start();
    monitor.stop();
    expect(monitor['pollTimer']).toBeNull();
  });

  it('first poll records last-seen message id without alerting', async () => {
    graphState.chatPages = [[makeChat('msg-1')]];
    const opts = makeOptions();
    const monitor = new TeamsMonitor(opts);
    await monitor.start();
    // Advance a small amount to let the fire-and-forget poll() complete
    // without triggering the long setInterval
    await vi.advanceTimersByTimeAsync(1);
    expect(opts.onAlert).not.toHaveBeenCalled();
    monitor.stop();
  });

  it('second poll alerts when new message appears', async () => {
    graphState.chatPages = [
      [makeChat('msg-1', 'hi', 'Alice')],
      [makeChat('msg-2', 'new msg', 'Bob')],
    ];
    const opts = makeOptions({ pollIntervalMs: 50 });
    const monitor = new TeamsMonitor(opts);
    await monitor.start();
    await vi.advanceTimersByTimeAsync(200);
    expect(opts.onAlert).toHaveBeenCalledWith(expect.stringContaining('Bob'));
    monitor.stop();
  });

  it('poll handles empty chat list', async () => {
    graphState.chatPages = [[]];
    const opts = makeOptions();
    const monitor = new TeamsMonitor(opts);
    await monitor.start();
    expect(opts.onAlert).not.toHaveBeenCalled();
    monitor.stop();
  });

  it('poll handles chat with no lastMessagePreview', async () => {
    graphState.chatPages = [[{ id: 'c1' }]];
    const opts = makeOptions();
    const monitor = new TeamsMonitor(opts);
    await monitor.start();
    expect(opts.onAlert).not.toHaveBeenCalled();
    monitor.stop();
  });

  it('poll logs errors but does not throw', async () => {
    graphState.throw = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const monitor = new TeamsMonitor(makeOptions());
    await expect(monitor.start()).resolves.not.toThrow();
    // Call poll directly to avoid infinite timer loop
    await monitor['poll']();
    expect(console.error).toHaveBeenCalled();
    monitor.stop();
  });

  it('authenticate uses device code flow when no cached accounts', async () => {
    msalState.accounts = [];
    msalState.deviceCodeToken = 'fresh-token';
    const monitor = new TeamsMonitor(makeOptions());
    await monitor.start();
    expect(msalState.deviceCodeCallback).not.toBeNull();
    monitor.stop();
  });

  it('authenticate invokes deviceCodeCallback to print the code', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    msalState.accounts = [];
    const monitor = new TeamsMonitor(makeOptions());
    await monitor.start();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('ABC'));
    monitor.stop();
    consoleSpy.mockRestore();
  });

  it('authenticate uses silent auth when cached accounts exist', async () => {
    msalState.accounts = [{ account: 'existing' }];
    msalState.silentToken = 'silent-token';
    const monitor = new TeamsMonitor(makeOptions());
    await monitor.start();
    // Should succeed without deviceCode callback being called
    expect(msalState.deviceCodeCallback).toBeNull();
    monitor.stop();
  });

  it('authenticate falls back to device code when silent auth fails', async () => {
    msalState.accounts = [{ account: 'existing' }];
    msalState.silentThrow = true;
    msalState.deviceCodeToken = 'fallback-token';
    const monitor = new TeamsMonitor(makeOptions());
    await monitor.start();
    expect(msalState.deviceCodeCallback).not.toBeNull();
    monitor.stop();
  });

  it('authenticate throws when device code flow returns no token', async () => {
    msalState.accounts = [];
    msalState.deviceCodeToken = null;
    const monitor = new TeamsMonitor(makeOptions());
    await expect(monitor.start()).rejects.toThrow('Teams authentication failed');
  });

  it('getAccessToken throws when monitor was not started', async () => {
    const monitor = new TeamsMonitor(makeOptions());
    await expect(monitor['getAccessToken']()).rejects.toThrow('not authenticated');
  });

  it('getAccessToken throws when cached token is null', async () => {
    msalState.accounts = [];
    msalState.silentToken = null;
    msalState.deviceCodeToken = 'init-token';
    const monitor = new TeamsMonitor(makeOptions());
    await monitor.start();
    // Remove the token after start to simulate expiry
    monitor['accessToken'] = null;
    msalState.accounts = []; // no accounts to refresh silently
    await expect(monitor['getAccessToken']()).rejects.toThrow('Teams auth expired');
    monitor.stop();
  });

  it('getAccessToken silently refreshes when accounts are present', async () => {
    msalState.accounts = [{ account: 'acc' }];
    msalState.silentToken = 'refreshed-token';
    const monitor = new TeamsMonitor(makeOptions());
    await monitor.start();
    const token = await monitor['getAccessToken']();
    expect(token).toBe('refreshed-token');
    monitor.stop();
  });

  it('uses default poll interval when not provided', async () => {
    graphState.chatPages = [[]];
    const monitor = new TeamsMonitor({ tenantId: 'tid', clientId: 'cid', onAlert: vi.fn() });
    await monitor.start();
    expect(monitor['pollTimer']).not.toBeNull();
    monitor.stop();
  });

  it('poll uses "Unknown" when sender display name is absent', async () => {
    graphState.chatPages = [
      [makeChat('msg-1', 'hi', 'Alice')],
      [{ id: 'chat-1', lastMessagePreview: { id: 'msg-2', body: { content: 'new' }, from: undefined } }],
    ];
    const opts = makeOptions({ pollIntervalMs: 50 });
    const monitor = new TeamsMonitor(opts);
    await monitor.start();
    await vi.advanceTimersByTimeAsync(200);
    expect(opts.onAlert).toHaveBeenCalledWith(expect.stringContaining('Unknown'));
    monitor.stop();
  });

  it('stop() resets msalApp and accessToken', async () => {
    graphState.chatPages = [[]];
    const monitor = new TeamsMonitor(makeOptions());
    await monitor.start();
    monitor.stop();
    expect(monitor['msalApp']).toBeNull();
    expect(monitor['accessToken']).toBeNull();
  });
});

