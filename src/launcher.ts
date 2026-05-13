// launcher.ts — wt.exe pane spawning via node-pty
// TODO: Use node-pty to spawn Windows Terminal panes for each session

export interface LaunchConfig {
  sessions: Array<{
    issue?: number;
    label: string;
    command?: string;
  }>;
  /** Path to wt.exe, defaults to "wt.exe" */
  wtPath?: string;
}

/**
 * Spawn Windows Terminal panes according to LaunchConfig.
 * TODO: Implement wt.exe invocation with node-pty for each session.
 */
export async function spawnPanes(config: LaunchConfig): Promise<void> {
  // TODO: iterate config.sessions, spawn pty per session
  throw new Error('spawnPanes not yet implemented');
}
