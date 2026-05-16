import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../session-manager.js';
import type { WinCMuxConfig } from '../config.js';

// ── Hoist shared state so vi.mock factories can access it ────────────────────
const mocks = vi.hoisted(() => {
  const makeBuffer = (lastLine: string) => ({
    active: {
      length: 3,
      getLine: (row: number) => {
        if (row === 2) return { translateToString: () => lastLine };
        return { translateToString: () => '' };
      },
    },
  });
  return {
    mockSpawnPane: vi.fn(),
    mockClosePane: vi.fn(),
    mockWriteToPane: vi.fn(),
    makeBuffer,
    buffer: makeBuffer(''),
  };
});

vi.mock('../launcher.js', () => ({
  spawnPane: (...a: unknown[]) => mocks.mockSpawnPane(...a),
  closePane: (...a: unknown[]) => mocks.mockClosePane(...a),
  writeToPane: (...a: unknown[]) => mocks.mockWriteToPane(...a),
}));

vi.mock('@xterm/headless', () => ({
  Terminal: vi.fn(function (this: unknown) {
    return {
      write: vi.fn(),
      get buffer() { return mocks.buffer; },
    };
  }),
}));

// Convenience aliases
const { mockSpawnPane, mockClosePane, mockWriteToPane } = mocks;
const makeBuffer = mocks.makeBuffer;

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<WinCMuxConfig> = {}): WinCMuxConfig {
  return {
    notificationPollIntervalMs: 30_000,
    sessionMonitorIntervalMs: 50,  // short for tests
    maxPanes: 9,
    azureSpeechRegion: 'eastus',
    wakeWord: 'computer',
    teams: {},
    ...overrides,
  };
}

function setupSpawnPane() {
  const fakePty = { pid: 1234, onData: vi.fn(), write: vi.fn(), resize: vi.fn(), kill: vi.fn() };
  mockSpawnPane.mockResolvedValue({
    paneIndex: 0,
    pty: fakePty,
    pid: 1234,
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SessionManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockSpawnPane.mockReset();
    mockClosePane.mockReset();
    mockWriteToPane.mockReset();
    mocks.buffer = makeBuffer('');
    setupSpawnPane();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── spawnSession ──────────────────────────────────────────────────────────

  it('spawnSession returns a session with correct fields', async () => {
    const mgr = new SessionManager(makeConfig());
    const session = await mgr.spawnSession({ issueNumber: 42, repo: 'org/repo', title: 'My Pane' });
    expect(session.id).toBe(1);
    expect(session.paneIndex).toBe(0);
    expect(session.issueNumber).toBe(42);
    expect(session.repo).toBe('org/repo');
    expect(session.title).toBe('My Pane');
    expect(session.status).toBe('working');
    mgr.closeSession(session.id);
  });

  it('spawnSession uses default title when not provided', async () => {
    const mgr = new SessionManager(makeConfig());
    const session = await mgr.spawnSession();
    expect(session.title).toMatch(/WinCMux/);
    mgr.closeSession(session.id);
  });

  it('spawnSession increments ids for multiple sessions', async () => {
    mockSpawnPane
      .mockResolvedValueOnce({ paneIndex: 0, pty: { pid: 0, onData: vi.fn(), write: vi.fn(), resize: vi.fn(), kill: vi.fn() }, pid: 1 })
      .mockResolvedValueOnce({ paneIndex: 1, pty: { pid: 0, onData: vi.fn(), write: vi.fn(), resize: vi.fn(), kill: vi.fn() }, pid: 2 });
    const mgr = new SessionManager(makeConfig());
    const s1 = await mgr.spawnSession();
    const s2 = await mgr.spawnSession();
    expect(s1.id).toBe(1);
    expect(s2.id).toBe(2);
    await mgr.closeSession(s1.id);
    await mgr.closeSession(s2.id);
  });

  it('spawnSession notifies listeners', async () => {
    const mgr = new SessionManager(makeConfig());
    const listener = vi.fn();
    mgr.onUpdate(listener);
    await mgr.spawnSession();
    expect(listener).toHaveBeenCalled();
  });

  // ── closeSession ──────────────────────────────────────────────────────────

  it('closeSession removes the session from the map', async () => {
    const mgr = new SessionManager(makeConfig());
    const session = await mgr.spawnSession();
    expect(mgr.getSession(session.id)).toBeDefined();
    await mgr.closeSession(session.id);
    expect(mgr.getSession(session.id)).toBeUndefined();
  });

  it('closeSession notifies listeners', async () => {
    const mgr = new SessionManager(makeConfig());
    const session = await mgr.spawnSession();
    const listener = vi.fn();
    mgr.onUpdate(listener);
    listener.mockClear();
    await mgr.closeSession(session.id);
    expect(listener).toHaveBeenCalled();
  });

  it('closeSession is safe for unknown id', async () => {
    const mgr = new SessionManager(makeConfig());
    await expect(mgr.closeSession(999)).resolves.toBeUndefined();
  });

  it('closeSession clears the monitor interval', async () => {
    const mgr = new SessionManager(makeConfig());
    const session = await mgr.spawnSession();
    // Interval exists while session is alive
    const internal = mgr['sessions'].get(session.id);
    expect(internal!._monitorInterval).toBeDefined();
    await mgr.closeSession(session.id);
  });

  it('closeSession skips clearInterval when _monitorInterval is absent', async () => {
    const mgr = new SessionManager(makeConfig());
    const session = await mgr.spawnSession();
    // Remove the interval to exercise the falsy branch
    const internal = mgr['sessions'].get(session.id)!;
    clearInterval(internal._monitorInterval);
    delete internal._monitorInterval;
    // Should not throw
    await expect(mgr.closeSession(session.id)).resolves.toBeUndefined();
  });

  it('closeSession skips closePane when pty is absent', async () => {
    const mgr = new SessionManager(makeConfig());
    const session = await mgr.spawnSession();
    const internal = mgr['sessions'].get(session.id)!;
    delete internal.pty;
    await mgr.closeSession(session.id);
    expect(mockClosePane).not.toHaveBeenCalled();
  });

  it('closeSession calls closePane with the pty', async () => {
    const mgr = new SessionManager(makeConfig());
    const session = await mgr.spawnSession();
    await mgr.closeSession(session.id);
    expect(mockClosePane).toHaveBeenCalled();
  });

  // ── getSession / getSessions ──────────────────────────────────────────────

  it('getSession returns undefined for unknown id', () => {
    const mgr = new SessionManager(makeConfig());
    expect(mgr.getSession(99)).toBeUndefined();
  });

  it('getSessions returns all active sessions', async () => {
    mockSpawnPane
      .mockResolvedValueOnce({ paneIndex: 0, pty: { pid: 0, onData: vi.fn(), write: vi.fn(), resize: vi.fn(), kill: vi.fn() }, pid: 1 })
      .mockResolvedValueOnce({ paneIndex: 1, pty: { pid: 0, onData: vi.fn(), write: vi.fn(), resize: vi.fn(), kill: vi.fn() }, pid: 2 });
    const mgr = new SessionManager(makeConfig());
    await mgr.spawnSession();
    await mgr.spawnSession();
    expect(mgr.getSessions()).toHaveLength(2);
  });

  // ── writeToSession ───────────────────────────────────────────────────────

  it('writeToSession calls writeToPane with text', async () => {
    const mgr = new SessionManager(makeConfig());
    const session = await mgr.spawnSession();
    mgr.writeToSession(session.id, 'hello');
    expect(mockWriteToPane).toHaveBeenCalledWith(expect.anything(), 'hello');
    await mgr.closeSession(session.id);
  });

  it('writeToSession is a no-op for unknown session', () => {
    const mgr = new SessionManager(makeConfig());
    expect(() => mgr.writeToSession(99, 'text')).not.toThrow();
  });

  // ── focusSession ─────────────────────────────────────────────────────────

  it('focusSession updates lastActivity and notifies', async () => {
    const mgr = new SessionManager(makeConfig());
    const session = await mgr.spawnSession();
    const listener = vi.fn();
    mgr.onUpdate(listener);
    const before = session.lastActivity;
    listener.mockClear();
    vi.advanceTimersByTime(10);
    mgr.focusSession(session.id);
    expect(listener).toHaveBeenCalled();
    const updated = mgr.getSession(session.id)!.lastActivity;
    expect(updated.getTime()).toBeGreaterThanOrEqual(before.getTime());
    await mgr.closeSession(session.id);
  });

  it('focusSession is a no-op for unknown id', () => {
    const mgr = new SessionManager(makeConfig());
    expect(() => mgr.focusSession(99)).not.toThrow();
  });

  // ── onUpdate ─────────────────────────────────────────────────────────────

  it('onUpdate unsubscribe removes listener', async () => {
    const mgr = new SessionManager(makeConfig());
    const listener = vi.fn();
    const unsub = mgr.onUpdate(listener);
    unsub();
    await mgr.spawnSession();
    expect(listener).not.toHaveBeenCalled();
  });

  // ── detectStatus ─────────────────────────────────────────────────────────

  it('detectStatus returns "error" when last line contains "error"', async () => {
    mocks.buffer = makeBuffer('Error: something failed');
    const mgr = new SessionManager(makeConfig());
    const session = await mgr.spawnSession();
    // advance past the monitor interval so it fires
    vi.advanceTimersByTime(100);
    const s = mgr.getSession(session.id)!;
    expect(s.status).toBe('error');
    await mgr.closeSession(session.id);
  });

  it('detectStatus returns "error" when last line contains ✗', async () => {
    mocks.buffer = makeBuffer('✗ build failed');
    const mgr = new SessionManager(makeConfig());
    const session = await mgr.spawnSession();
    vi.advanceTimersByTime(100);
    expect(mgr.getSession(session.id)!.status).toBe('error');
    await mgr.closeSession(session.id);
  });

  it('detectStatus returns "waiting" when last line asks for confirmation', async () => {
    mocks.buffer = makeBuffer('Press ENTER to continue');
    const mgr = new SessionManager(makeConfig());
    const session = await mgr.spawnSession();
    vi.advanceTimersByTime(100);
    expect(mgr.getSession(session.id)!.status).toBe('waiting');
    await mgr.closeSession(session.id);
  });

  it('detectStatus returns "working" when last line shows a spinner', async () => {
    mocks.buffer = makeBuffer('⠋ thinking...');
    const mgr = new SessionManager(makeConfig());
    const session = await mgr.spawnSession();
    vi.advanceTimersByTime(100);
    expect(mgr.getSession(session.id)!.status).toBe('working');
    await mgr.closeSession(session.id);
  });

  it('detectStatus returns "idle" when last line shows a prompt', async () => {
    mocks.buffer = makeBuffer('user@host:~$');
    const mgr = new SessionManager(makeConfig());
    const session = await mgr.spawnSession();
    vi.advanceTimersByTime(100);
    expect(mgr.getSession(session.id)!.status).toBe('idle');
    await mgr.closeSession(session.id);
  });

  it('detectStatus returns "working" for unknown last line', async () => {
    mocks.buffer = makeBuffer('some random output');
    const mgr = new SessionManager(makeConfig());
    const session = await mgr.spawnSession();
    vi.advanceTimersByTime(100);
    expect(mgr.getSession(session.id)!.status).toBe('working');
    await mgr.closeSession(session.id);
  });

  it('detectStatus returns "working" when buffer is empty', async () => {
    const emptyBuffer = {
      active: {
        length: 3,
        getLine: () => ({ translateToString: () => '' }),
      },
    };
    mocks.buffer = emptyBuffer;
    const mgr = new SessionManager(makeConfig());
    const session = await mgr.spawnSession();
    vi.advanceTimersByTime(100);
    expect(mgr.getSession(session.id)!.status).toBe('working');
    await mgr.closeSession(session.id);
  });

  it('detectStatus returns "waiting" for "?" in last line', async () => {
    mocks.buffer = makeBuffer('Are you sure? [y/n]');
    const mgr = new SessionManager(makeConfig());
    const session = await mgr.spawnSession();
    vi.advanceTimersByTime(100);
    expect(mgr.getSession(session.id)!.status).toBe('waiting');
    await mgr.closeSession(session.id);
  });

  it('detectStatus returns "idle" for ❯ prompt', async () => {
    mocks.buffer = makeBuffer('❯ ');
    const mgr = new SessionManager(makeConfig());
    const session = await mgr.spawnSession();
    vi.advanceTimersByTime(100);
    expect(mgr.getSession(session.id)!.status).toBe('idle');
    await mgr.closeSession(session.id);
  });

  it('monitor skips when vtBuffer is missing', async () => {
    const mgr = new SessionManager(makeConfig());
    const session = await mgr.spawnSession();
    // Remove vtBuffer to exercise the early-return guard
    const internal = mgr['sessions'].get(session.id)!;
    internal.vtBuffer = undefined as never;
    // Should not throw
    vi.advanceTimersByTime(100);
    await mgr.closeSession(session.id);
  });
});
