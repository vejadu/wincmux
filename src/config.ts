// config.ts — ~/.wincmux/config.json loader
// TODO: Use `conf` package for typed, validated config persistence

export interface SessionConfig {
  issue?: number;
  label: string;
  command?: string;
}

export interface WinCMuxConfig {
  sessions: SessionConfig[];
  github?: {
    token: string;
  };
  voice?: {
    picovoiceAccessKey?: string;
    azureSpeechKey?: string;
    azureSpeechRegion?: string;
  };
  teams?: {
    tenantId: string;
    clientId: string;
  };
}

/**
 * Load config from ~/.wincmux/config.json.
 * TODO: Implement using the `conf` package with schema validation.
 */
export function loadConfig(): WinCMuxConfig {
  // TODO: read and validate ~/.wincmux/config.json
  return {
    sessions: [],
  };
}
