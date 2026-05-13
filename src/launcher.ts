// launcher.ts — wt.exe pane spawning via node-pty

import * as nodePty from 'node-pty';
import { execa } from 'execa';

export type LaunchConfig = {
  count: number;
  command: string;
  args: string[];
  cwd?: string;
  issueNumbers?: number[];
  repos?: string[];
};

export type SpawnedPane = {
  paneIndex: number;
  pty: nodePty.IPty;
  pid: number;
};

type SpawnOptions = {
  issueNumber?: number;
  repo?: string;
  title?: string;
};

export async function spawnPane(
  config: LaunchConfig,
  paneIndex: number,
  options?: SpawnOptions
): Promise<SpawnedPane> {
  const { command = 'powershell.exe', args = [], cwd } = config;
  const title = options?.title ?? `WinCMux ${paneIndex}`;
  const wtSubCommand = paneIndex === 0 ? 'new-tab' : 'split-pane';

  try {
    await execa('wt.exe', [wtSubCommand, '--title', title]);
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOENT') {
      throw new Error('Windows Terminal (wt.exe) is required. Install from https://aka.ms/terminal');
    }
    throw err;
  }

  const pty = nodePty.spawn(command, args, {
    name: 'xterm-256color',
    cols: 220,
    rows: 50,
    cwd: cwd ?? process.cwd(),
    env: { ...process.env, WINCMUX_SESSION: String(paneIndex) },
  });

  return { paneIndex, pty, pid: pty.pid };
}

export async function spawnPanes(config: LaunchConfig): Promise<SpawnedPane[]> {
  const panes: SpawnedPane[] = [];
  for (let i = 0; i < config.count; i++) {
    const pane = await spawnPane(config, i, {
      issueNumber: config.issueNumbers?.[i],
      repo: config.repos?.[i],
    });
    panes.push(pane);
    if (i < config.count - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  return panes;
}

export function closePane(pty: nodePty.IPty): void {
  pty.kill();
}

export function writeToPane(pty: nodePty.IPty, text: string): void {
  pty.write(text + '\r');
}

export function resizePane(pty: nodePty.IPty, cols: number, rows: number): void {
  pty.resize(cols, rows);
}
