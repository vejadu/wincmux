// voice/wake-word.ts — Porcupine passive wake-word listener
// TODO: Integrate @picovoice/porcupine-node for always-on "Hey WinCMux" detection

export interface WakeWordListenerOptions {
  accessKey: string;
  /** Path to custom .ppn model, defaults to built-in "Hey WinCMux" keyword */
  keywordPath?: string;
  onWakeWord: () => void;
}

export class WakeWordListener {
  constructor(private readonly options: WakeWordListenerOptions) {}

  // TODO: start(): Promise<void> — initialize Porcupine, open microphone stream
  // TODO: stop(): void — release Porcupine and close mic

  async start(): Promise<void> {
    throw new Error('WakeWordListener.start not yet implemented');
  }

  stop(): void {
    // TODO: release resources
  }
}
