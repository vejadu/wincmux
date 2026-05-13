import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

export type LaunchConfig = {
  count: number;
  command: string;
  args: string[];
  cwd?: string;
};

export type WinCMuxConfig = {
  // Session defaults
  defaultSessionCount: number;    // default: 2
  launchConfig: LaunchConfig;

  // GitHub notification polling
  githubToken?: string;           // GITHUB_TOKEN env fallback
  githubPollIntervalMs: number;   // default: 30000
  watchedRepos: string[];         // ['owner/repo', ...]

  // Voice
  voiceEnabled: boolean;          // default: false
  picovoiceAccessKey?: string;    // PICOVOICE_ACCESS_KEY env fallback
  azureSpeechKey?: string;        // AZURE_SPEECH_KEY env fallback
  azureSpeechRegion?: string;     // default: 'eastus'
  wakePhrase: string;             // default: 'COMPUTER'

  // Teams (optional)
  teamsEnabled: boolean;          // default: false
  teamsTenantId?: string;
  teamsClientId?: string;

  // Notifications
  toastEnabled: boolean;          // default: true
};

const CONFIG_PATH = join(homedir(), '.wincmux', 'config.json');

const DEFAULTS: WinCMuxConfig = {
  defaultSessionCount: 2,
  launchConfig: {
    count: 2,
    command: 'powershell.exe',
    args: ['-NoLogo'],
  },
  githubPollIntervalMs: 30_000,
  watchedRepos: [],
  voiceEnabled: false,
  wakePhrase: 'COMPUTER',
  teamsEnabled: false,
  toastEnabled: true,
};

export async function loadConfig(): Promise<WinCMuxConfig> {
  let fileConfig: Partial<WinCMuxConfig> = {};
  if (existsSync(CONFIG_PATH)) {
    try {
      const raw = await readFile(CONFIG_PATH, 'utf-8');
      fileConfig = JSON.parse(raw);
    } catch {
      // Invalid JSON — ignore, use defaults
    }
  }

  const envOverrides: Partial<WinCMuxConfig> = {};
  if (process.env.GITHUB_TOKEN) envOverrides.githubToken = process.env.GITHUB_TOKEN;
  if (process.env.PICOVOICE_ACCESS_KEY) envOverrides.picovoiceAccessKey = process.env.PICOVOICE_ACCESS_KEY;
  if (process.env.AZURE_SPEECH_KEY) envOverrides.azureSpeechKey = process.env.AZURE_SPEECH_KEY;
  if (process.env.AZURE_SPEECH_REGION) envOverrides.azureSpeechRegion = process.env.AZURE_SPEECH_REGION;

  return { ...DEFAULTS, ...fileConfig, ...envOverrides };
}

export async function saveConfig(config: WinCMuxConfig): Promise<void> {
  const dir = join(homedir(), '.wincmux');
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}
