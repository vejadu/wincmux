import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

export type WinCMuxConfig = {
  // GitHub notification polling
  githubToken?: string;                  // GITHUB_TOKEN env fallback
  notificationPollIntervalMs: number;    // default: 30000

  // Session monitoring
  sessionMonitorIntervalMs: number;      // default: 2000
  maxPanes: number;                      // default: 9

  // Voice
  picovoiceAccessKey?: string;           // PICOVOICE_ACCESS_KEY env fallback
  azureSpeechKey?: string;               // AZURE_SPEECH_KEY env fallback
  azureSpeechRegion: string;             // default: 'eastus'
  wakeWord: string;                      // default: 'computer'

  // Teams (optional)
  teams: {
    tenantId?: string;
    clientId?: string;
  };
};

const CONFIG_PATH = join(homedir(), '.wincmux', 'config.json');

const DEFAULTS: WinCMuxConfig = {
  notificationPollIntervalMs: 30_000,
  sessionMonitorIntervalMs: 2_000,
  maxPanes: 9,
  azureSpeechRegion: 'eastus',
  wakeWord: 'computer',
  teams: {},
};

export async function loadConfig(): Promise<WinCMuxConfig> {
  let fileConfig: Partial<WinCMuxConfig> = {};
  if (existsSync(CONFIG_PATH)) {
    try {
      const raw = await readFile(CONFIG_PATH, 'utf-8');
      fileConfig = JSON.parse(raw) as Partial<WinCMuxConfig>;
    } catch {
      // Invalid JSON — ignore, use defaults
    }
  }

  const envOverrides: Partial<WinCMuxConfig> = {};
  if (process.env.GITHUB_TOKEN) envOverrides.githubToken = process.env.GITHUB_TOKEN;
  if (process.env.PICOVOICE_ACCESS_KEY) envOverrides.picovoiceAccessKey = process.env.PICOVOICE_ACCESS_KEY;
  if (process.env.AZURE_SPEECH_KEY) envOverrides.azureSpeechKey = process.env.AZURE_SPEECH_KEY;
  if (process.env.AZURE_SPEECH_REGION) envOverrides.azureSpeechRegion = process.env.AZURE_SPEECH_REGION;

  return {
    ...DEFAULTS,
    ...fileConfig,
    // Merge teams sub-object instead of overwriting
    teams: { ...DEFAULTS.teams, ...(fileConfig.teams ?? {}) },
    ...envOverrides,
  };
}

const DEFAULT_CONFIG_FILE = {
  _comment: 'WinCMux configuration. Edit and restart wincmux to apply changes.',
  githubToken: '',
  picovoiceAccessKey: '',
  azureSpeechKey: '',
  azureSpeechRegion: 'eastus',
  teams: {
    tenantId: '',
    clientId: '',
  },
  notificationPollIntervalMs: 30_000,
  sessionMonitorIntervalMs: 2_000,
  maxPanes: 9,
  wakeWord: 'computer',
};

export async function initConfig(): Promise<WinCMuxConfig> {
  if (existsSync(CONFIG_PATH)) {
    return loadConfig();
  }
  const dir = join(homedir(), '.wincmux');
  await mkdir(dir, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG_FILE, null, 2), 'utf-8');
  console.log('✨ Created ~/.wincmux/config.json — fill in your tokens and restart.');
  return { ...DEFAULTS };
}

export function validateConfig(config: WinCMuxConfig): string[] {
  const warnings: string[] = [];
  if (!config.githubToken) warnings.push('githubToken not set — GitHub notifications disabled');
  if (!config.picovoiceAccessKey) warnings.push('picovoiceAccessKey not set — voice control disabled');
  if (!config.azureSpeechKey) warnings.push('azureSpeechKey not set — speech-to-text disabled');
  return warnings;
}
