// integrations/teams.ts — Microsoft Graph API change notifications
// TODO: Use @microsoft/microsoft-graph-client + @azure/msal-node for auth

export interface TeamsMonitorOptions {
  tenantId: string;
  clientId: string;
  onAlert: (message: string) => void;
}

export class TeamsMonitor {
  constructor(private readonly options: TeamsMonitorOptions) {}

  // TODO: start(): Promise<void>
  //   - Acquire token via MSAL device code flow
  //   - Subscribe to /me/messages change notifications via Graph API
  //   - On new message, call options.onAlert with subject/sender
  // TODO: stop(): void — unsubscribe and release resources

  async start(): Promise<void> {
    throw new Error('TeamsMonitor.start not yet implemented');
  }

  stop(): void {
    // TODO: release resources
  }
}
