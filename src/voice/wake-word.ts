// voice/wake-word.ts — Porcupine passive wake-word listener

export interface WakeWordListenerOptions {
  accessKey: string;
  /** Path to custom .ppn model. Takes precedence over wakeWord. */
  keywordPath?: string;
  /** Built-in wake word name (e.g. 'computer', 'jarvis'). Defaults to 'computer'. */
  wakeWord?: string;
  onWakeWord: () => void;
}

// Minimal interfaces for dynamically-imported Picovoice modules
interface PorcupineEngine {
  frameLength: number;
  sampleRate: number;
  process(pcm: Int16Array): number;
  release(): void;
}

interface PvRecorderInstance {
  start(): void;
  read(): Promise<Int16Array>;
  stop(): void;
  release(): void;
}

export class WakeWordListener {
  private running = false;
  private recorder: PvRecorderInstance | null = null;
  private engine: PorcupineEngine | null = null;

  constructor(private readonly options: WakeWordListenerOptions) {}

  async start(): Promise<void> {
    // Dynamic import so the package is optional at runtime
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let porcupineMod: any;
    try {
      porcupineMod = await import('@picovoice/porcupine-node');
    } catch {
      throw new Error(
        'Missing optional dependency @picovoice/porcupine-node — install it with: npm install @picovoice/porcupine-node',
      );
    }

    // Use a variable so TypeScript doesn't statically resolve this optional dep
    const pvRecorderPkg = '@picovoice/pvrecorder-node';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let recorderMod: any;
    try {
      recorderMod = await import(pvRecorderPkg);
    } catch {
      throw new Error(
        'Missing optional dependency @picovoice/pvrecorder-node — install it with: npm install @picovoice/pvrecorder-node',
      );
    }

    const { Porcupine, BuiltinKeyword } = porcupineMod;
    const PvRecorder = recorderMod.PvRecorder ?? recorderMod.default;

    const keywords = this.options.keywordPath
      ? [this.options.keywordPath]
      : [(BuiltinKeyword as Record<string, string>)[(this.options.wakeWord ?? 'computer').toUpperCase()] ?? BuiltinKeyword.COMPUTER];
    const sensitivities = keywords.map(() => 0.5);

    const engine: PorcupineEngine = new Porcupine(
      this.options.accessKey,
      keywords,
      sensitivities,
    ) as PorcupineEngine;
    this.engine = engine;

    const recorder: PvRecorderInstance = new PvRecorder(engine.frameLength, -1) as PvRecorderInstance;
    this.recorder = recorder;

    recorder.start();
    this.running = true;

    void this.#readLoop();
  }

  async #readLoop(): Promise<void> {
    while (this.running) {
      let frame: Int16Array;
      try {
        frame = await this.recorder!.read();
      } catch {
        break;
      }

      const keywordIndex = this.engine!.process(frame);
      if (keywordIndex >= 0) {
        this.options.onWakeWord();
      }

      // Yield to the event loop so other callbacks can run between audio frames
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }

  stop(): void {
    this.running = false;
    try {
      this.recorder?.stop();
      this.recorder?.release();
    } finally {
      this.engine?.release();
    }
    this.recorder = null;
    this.engine = null;
  }
}
