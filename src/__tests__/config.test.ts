import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadConfig, initConfig, validateConfig } from '../config.js';

// We mock node:fs, node:fs/promises, and node:os so tests are hermetic.
vi.mock('node:os', () => ({ homedir: () => '/fake/home' }));

const mockExistsSync = vi.fn<() => boolean>();
vi.mock('node:fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...(args as [])),
}));

const mockReadFile = vi.fn<() => Promise<string>>();
const mockWriteFile = vi.fn<() => Promise<void>>();
const mockMkdir = vi.fn<() => Promise<void>>();
vi.mock('node:fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...(args as [])),
  writeFile: (...args: unknown[]) => mockWriteFile(...(args as [])),
  mkdir: (...args: unknown[]) => mockMkdir(...(args as [])),
}));

describe('loadConfig', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Clear env vars
    delete process.env.GITHUB_TOKEN;
    delete process.env.PICOVOICE_ACCESS_KEY;
    delete process.env.AZURE_SPEECH_KEY;
    delete process.env.AZURE_SPEECH_REGION;
    mockReadFile.mockReset();
    mockWriteFile.mockReset();
    mockMkdir.mockReset();
  });

  afterEach(() => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.PICOVOICE_ACCESS_KEY;
    delete process.env.AZURE_SPEECH_KEY;
    delete process.env.AZURE_SPEECH_REGION;
  });

  it('returns defaults when no config file exists', async () => {
    mockExistsSync.mockReturnValue(false);
    const cfg = await loadConfig();
    expect(cfg.notificationPollIntervalMs).toBe(30_000);
    expect(cfg.sessionMonitorIntervalMs).toBe(2_000);
    expect(cfg.maxPanes).toBe(9);
    expect(cfg.azureSpeechRegion).toBe('eastus');
    expect(cfg.wakeWord).toBe('computer');
    expect(cfg.teams).toEqual({});
    expect(cfg.githubToken).toBeUndefined();
  });

  it('merges file config over defaults', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(JSON.stringify({
      notificationPollIntervalMs: 60_000,
      wakeWord: 'jarvis',
      teams: { tenantId: 'tid', clientId: 'cid' },
    }));
    const cfg = await loadConfig();
    expect(cfg.notificationPollIntervalMs).toBe(60_000);
    expect(cfg.wakeWord).toBe('jarvis');
    expect(cfg.teams).toEqual({ tenantId: 'tid', clientId: 'cid' });
    // unchanged defaults
    expect(cfg.maxPanes).toBe(9);
  });

  it('ignores invalid JSON in config file (falls back to defaults)', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue('not valid json{{{');
    const cfg = await loadConfig();
    expect(cfg.notificationPollIntervalMs).toBe(30_000);
  });

  it('picks up env var overrides', async () => {
    mockExistsSync.mockReturnValue(false);
    process.env.GITHUB_TOKEN = 'ghp_test';
    process.env.PICOVOICE_ACCESS_KEY = 'pv_key';
    process.env.AZURE_SPEECH_KEY = 'az_key';
    process.env.AZURE_SPEECH_REGION = 'westus';
    const cfg = await loadConfig();
    expect(cfg.githubToken).toBe('ghp_test');
    expect(cfg.picovoiceAccessKey).toBe('pv_key');
    expect(cfg.azureSpeechKey).toBe('az_key');
    expect(cfg.azureSpeechRegion).toBe('westus');
  });

  it('env overrides win over file config', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(JSON.stringify({ azureSpeechRegion: 'eastus' }));
    process.env.AZURE_SPEECH_REGION = 'australiaeast';
    const cfg = await loadConfig();
    expect(cfg.azureSpeechRegion).toBe('australiaeast');
  });

  it('merges teams sub-object (does not overwrite entire teams)', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(JSON.stringify({ teams: { tenantId: 'tid' } }));
    const cfg = await loadConfig();
    expect(cfg.teams.tenantId).toBe('tid');
    expect(cfg.teams.clientId).toBeUndefined();
  });
});

describe('initConfig', () => {
  beforeEach(() => {
    mockReadFile.mockReset();
    mockWriteFile.mockReset();
    mockMkdir.mockReset();
  });

  it('loads existing config when file already exists', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(JSON.stringify({ wakeWord: 'hey computer' }));
    const cfg = await initConfig();
    expect(cfg.wakeWord).toBe('hey computer');
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('creates default config file when none exists', async () => {
    mockExistsSync.mockReturnValue(false);
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    const cfg = await initConfig();
    expect(mockMkdir).toHaveBeenCalled();
    expect(mockWriteFile).toHaveBeenCalled();
    // Returns defaults
    expect(cfg.wakeWord).toBe('computer');
  });
});

describe('validateConfig', () => {
  it('returns no warnings when all keys are set', () => {
    const cfg = {
      githubToken: 'tok',
      picovoiceAccessKey: 'pv',
      azureSpeechKey: 'az',
      azureSpeechRegion: 'eastus',
      wakeWord: 'computer',
      notificationPollIntervalMs: 30_000,
      sessionMonitorIntervalMs: 2_000,
      maxPanes: 9,
      teams: {},
    };
    expect(validateConfig(cfg)).toHaveLength(0);
  });

  it('warns when githubToken is missing', () => {
    const cfg = {
      azureSpeechKey: 'az',
      picovoiceAccessKey: 'pv',
      azureSpeechRegion: 'eastus',
      wakeWord: 'computer',
      notificationPollIntervalMs: 30_000,
      sessionMonitorIntervalMs: 2_000,
      maxPanes: 9,
      teams: {},
    };
    const warnings = validateConfig(cfg);
    expect(warnings.some(w => /githubToken/.test(w))).toBe(true);
  });

  it('warns when picovoiceAccessKey is missing', () => {
    const cfg = {
      githubToken: 'tok',
      azureSpeechKey: 'az',
      azureSpeechRegion: 'eastus',
      wakeWord: 'computer',
      notificationPollIntervalMs: 30_000,
      sessionMonitorIntervalMs: 2_000,
      maxPanes: 9,
      teams: {},
    };
    const warnings = validateConfig(cfg);
    expect(warnings.some(w => /picovoiceAccessKey/.test(w))).toBe(true);
  });

  it('warns when azureSpeechKey is missing', () => {
    const cfg = {
      githubToken: 'tok',
      picovoiceAccessKey: 'pv',
      azureSpeechRegion: 'eastus',
      wakeWord: 'computer',
      notificationPollIntervalMs: 30_000,
      sessionMonitorIntervalMs: 2_000,
      maxPanes: 9,
      teams: {},
    };
    const warnings = validateConfig(cfg);
    expect(warnings.some(w => /azureSpeechKey/.test(w))).toBe(true);
  });

  it('returns all 3 warnings when nothing is set', () => {
    const cfg = {
      azureSpeechRegion: 'eastus',
      wakeWord: 'computer',
      notificationPollIntervalMs: 30_000,
      sessionMonitorIntervalMs: 2_000,
      maxPanes: 9,
      teams: {},
    };
    expect(validateConfig(cfg)).toHaveLength(3);
  });
});
