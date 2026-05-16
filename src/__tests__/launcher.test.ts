import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawnPane, spawnPanes, closePane, writeToPane, resizePane } from '../launcher.js';
import type { LaunchConfig } from '../launcher.js';

// ── Mock node-pty ────────────────────────────────────────────────────────────

const mockPtyInstance = {
  pid: 42,
  onData: vi.fn(),
  write: vi.fn(),
  resize: vi.fn(),
  kill: vi.fn(),
};

const mockPtySpawn = vi.fn();
vi.mock('node-pty', () => ({
  spawn: (...a: unknown[]) => mockPtySpawn(...a),
}));

// ── Mock execa ────────────────────────────────────────────────────────────────

const mockExeca = vi.fn();
vi.mock('execa', () => ({ execa: (...a: unknown[]) => mockExeca(...a) }));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<LaunchConfig> = {}): LaunchConfig {
  return {
    count: 1,
    command: 'powershell.exe',
    args: [],
    cwd: '/tmp',
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('launcher', () => {
  beforeEach(() => {
    mockPtySpawn.mockReset();
    mockExeca.mockReset();
    mockPtySpawn.mockReturnValue(mockPtyInstance);
    mockExeca.mockResolvedValue({});
  });

  // ── spawnPane ────────────────────────────────────────────────────────────

  it('spawnPane returns pane with correct paneIndex and pid', async () => {
    const pane = await spawnPane(makeConfig(), 0);
    expect(pane.paneIndex).toBe(0);
    expect(pane.pid).toBe(42);
    expect(pane.pty).toBe(mockPtyInstance);
  });

  it('spawnPane uses "new-tab" for paneIndex 0', async () => {
    await spawnPane(makeConfig(), 0);
    expect(mockExeca).toHaveBeenCalledWith('wt.exe', expect.arrayContaining(['new-tab']));
  });

  it('spawnPane uses "split-pane" for paneIndex > 0', async () => {
    await spawnPane(makeConfig(), 1);
    expect(mockExeca).toHaveBeenCalledWith('wt.exe', expect.arrayContaining(['split-pane']));
  });

  it('spawnPane passes title option to wt.exe', async () => {
    await spawnPane(makeConfig(), 0, { title: 'My Tab' });
    expect(mockExeca).toHaveBeenCalledWith('wt.exe', expect.arrayContaining(['--title', 'My Tab']));
  });

  it('spawnPane uses default title when none provided', async () => {
    await spawnPane(makeConfig(), 2);
    expect(mockExeca).toHaveBeenCalledWith('wt.exe', expect.arrayContaining(['WinCMux 2']));
  });

  it('spawnPane throws helpful error when wt.exe is not found', async () => {
    const err = new Error('wt.exe not found') as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    mockExeca.mockRejectedValue(err);
    await expect(spawnPane(makeConfig(), 0)).rejects.toThrow('Windows Terminal');
  });

  it('spawnPane re-throws non-ENOENT errors', async () => {
    const err = new Error('permission denied') as NodeJS.ErrnoException;
    err.code = 'EACCES';
    mockExeca.mockRejectedValue(err);
    await expect(spawnPane(makeConfig(), 0)).rejects.toThrow('permission denied');
  });

  it('spawnPane passes WINCMUX_SESSION env var to node-pty', async () => {
    await spawnPane(makeConfig(), 3);
    expect(mockPtySpawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ env: expect.objectContaining({ WINCMUX_SESSION: '3' }) }),
    );
  });

  it('spawnPane uses config cwd', async () => {
    await spawnPane(makeConfig({ cwd: '/my/dir' }), 0);
    expect(mockPtySpawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ cwd: '/my/dir' }),
    );
  });

  it('spawnPane falls back to process.cwd() when cwd is undefined', async () => {
    const cfg = makeConfig();
    cfg.cwd = undefined;
    await spawnPane(cfg, 0);
    expect(mockPtySpawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ cwd: process.cwd() }),
    );
  });

  // ── spawnPanes ───────────────────────────────────────────────────────────

  it('spawnPanes returns correct number of panes', async () => {
    vi.useFakeTimers();
    const panes = spawnPanes(makeConfig({ count: 2, issueNumbers: [1, 2], repos: ['a/b', 'c/d'] }));
    // advance timers to skip the 500 ms delay between panes
    await vi.runAllTimersAsync();
    const result = await panes;
    expect(result).toHaveLength(2);
    vi.useRealTimers();
  });

  it('spawnPanes passes issueNumber and repo per pane', async () => {
    vi.useFakeTimers();
    const cfg = makeConfig({ count: 2, issueNumbers: [10, 20], repos: ['r/a', 'r/b'] });
    const promise = spawnPanes(cfg);
    await vi.runAllTimersAsync();
    const panes = await promise;
    // Both panes should have been spawned
    expect(mockPtySpawn).toHaveBeenCalledTimes(2);
    expect(panes[0].paneIndex).toBe(0);
    expect(panes[1].paneIndex).toBe(1); // second pane gets index 1
    vi.useRealTimers();
  });

  it('spawnPanes with count=1 skips the inter-pane delay', async () => {
    const result = await spawnPanes(makeConfig({ count: 1 }));
    expect(result).toHaveLength(1);
  });

  // ── closePane ────────────────────────────────────────────────────────────

  it('closePane calls pty.kill()', () => {
    closePane(mockPtyInstance as never);
    expect(mockPtyInstance.kill).toHaveBeenCalled();
  });

  // ── writeToPane ──────────────────────────────────────────────────────────

  it('writeToPane appends \\r and calls pty.write()', () => {
    writeToPane(mockPtyInstance as never, 'hello');
    expect(mockPtyInstance.write).toHaveBeenCalledWith('hello\r');
  });

  // ── resizePane ───────────────────────────────────────────────────────────

  it('resizePane calls pty.resize with cols and rows', () => {
    resizePane(mockPtyInstance as never, 80, 24);
    expect(mockPtyInstance.resize).toHaveBeenCalledWith(80, 24);
  });
});
