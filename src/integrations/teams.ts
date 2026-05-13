// integrations/teams.ts — Microsoft Graph API polling for Teams messages

const SCOPES = [
  'https://graph.microsoft.com/Chat.Read',
  'https://graph.microsoft.com/ChannelMessage.Read.All',
];

const DEFAULT_POLL_INTERVAL_MS = 30_000;

export interface TeamsMonitorOptions {
  tenantId: string;
  clientId: string;
  onAlert: (message: string) => void;
  /** Polling interval in ms, default 30000 */
  pollIntervalMs?: number;
}

interface ChatPreview {
  id: string;
  lastMessagePreview?: {
    id: string;
    body?: { content?: string };
    from?: { user?: { displayName?: string } };
  };
}

export class TeamsMonitor {
  private pollTimer: NodeJS.Timeout | null = null;
  private lastSeenMessageId: string | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private msalApp: any = null;
  private accessToken: string | null = null;

  constructor(private readonly options: TeamsMonitorOptions) {}

  async start(): Promise<void> {
    try {
      await import('@azure/msal-node');
      await import('@microsoft/microsoft-graph-client');
    } catch {
      throw new Error(
        'Teams integration requires @azure/msal-node and @microsoft/microsoft-graph-client. ' +
          'Run: npm install @azure/msal-node @microsoft/microsoft-graph-client',
      );
    }

    await this.authenticate();
    void this.poll();

    const interval = this.options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.pollTimer = setInterval(() => {
      void this.poll();
    }, interval);
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.msalApp = null;
    this.accessToken = null;
  }

  private async authenticate(): Promise<void> {
    const msalNode = await import('@azure/msal-node');

    this.msalApp = new msalNode.PublicClientApplication({
      auth: {
        clientId: this.options.clientId,
        authority: `https://login.microsoftonline.com/${this.options.tenantId}`,
      },
    });

    // Try silent auth first (uses cached tokens from a previous session)
    const accounts = await this.msalApp.getTokenCache().getAllAccounts() as unknown[];
    if (accounts.length > 0) {
      try {
        const result = await this.msalApp.acquireTokenSilent({
          scopes: SCOPES,
          account: accounts[0],
        }) as { accessToken?: string } | null;
        if (result?.accessToken) {
          this.accessToken = result.accessToken;
          return;
        }
      } catch {
        // Fall through to device code flow
      }
    }

    // Device code flow — prints a URL and code; user visits URL and enters the code
    const result = await this.msalApp.acquireTokenByDeviceCode({
      scopes: SCOPES,
      deviceCodeCallback: (response: { message: string }) => {
        console.log(response.message);
      },
    }) as { accessToken?: string } | null;

    if (!result?.accessToken) {
      throw new Error('Teams authentication failed: no access token received');
    }
    this.accessToken = result.accessToken;
  }

  private async poll(): Promise<void> {
    try {
      const token = await this.getAccessToken();
      const graphModule = await import('@microsoft/microsoft-graph-client');

      const client = graphModule.Client.init({
        authProvider: (done: (err: null | Error, token: string | null) => void) => {
          done(null, token);
        },
      });

      const response = (await client
        .api('/me/chats')
        .expand('lastMessagePreview')
        .get()) as { value?: ChatPreview[] };

      const chats = response.value ?? [];

      for (const chat of chats) {
        const preview = chat.lastMessagePreview;
        if (!preview?.id) continue;

        // On the very first poll, record the latest seen ID without alerting
        if (this.lastSeenMessageId === null) {
          this.lastSeenMessageId = preview.id;
          break;
        }

        if (preview.id !== this.lastSeenMessageId) {
          this.lastSeenMessageId = preview.id;
          const sender = preview.from?.user?.displayName ?? 'Unknown';
          const content = preview.body?.content ?? '';
          this.options.onAlert(`${sender}: ${content}`);
          break;
        }
      }
    } catch (err) {
      console.error('[TeamsMonitor] poll error:', err);
    }
  }

  private async getAccessToken(): Promise<string> {
    if (!this.msalApp) {
      throw new Error('Teams monitor not authenticated. Call start() first.');
    }

    // Attempt silent refresh before falling back to the cached token
    const accounts = await this.msalApp.getTokenCache().getAllAccounts() as unknown[];
    if (accounts.length > 0) {
      try {
        const result = await this.msalApp.acquireTokenSilent({
          scopes: SCOPES,
          account: accounts[0],
        }) as { accessToken?: string } | null;
        if (result?.accessToken) {
          this.accessToken = result.accessToken;
        }
      } catch {
        // Use cached token if silent refresh fails
      }
    }

    if (!this.accessToken) {
      throw new Error('Teams auth expired. Call start() to re-authenticate.');
    }
    return this.accessToken;
  }
}
