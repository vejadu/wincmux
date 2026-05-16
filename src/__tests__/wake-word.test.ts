import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WakeWordListener } from '../voice/wake-word.js';

// ── Hoist shared mock state ───────────────────────────────────────────────────
const state = vi.hoisted(() => ({
  engine: null as null | {
    frameLength: number;
    sampleRate: number;
    process: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  },
  recorder: null as null | {
    start: ReturnType<typeof vi.fn>;
    read: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  },
  porcupineThrow: false as boolean,
  pvrecorderThrow: false as boolean,
  pvrecorderUseDefault: false as boolean,
}));

vi.mock('@picovoice/porcupine-node', async () => {
  if (state.porcupineThrow) throw new Error('not found');
  return {
    Porcupine: vi.fn(function (this: unknown) { return state.engine; }),
    BuiltinKeyword: { COMPUTER: 'computer', JARVIS: 'jarvis' },
  };
});

vi.mock('@picovoice/pvrecorder-node', async () => {
  if (state.pvrecorderThrow) throw new Error('not found');
  if (state.pvrecorderUseDefault) {
    return { default: vi.fn(function (this: unknown) { return state.recorder; }) };
  }
  return {
    PvRecorder: vi.fn(function (this: unknown) { return state.recorder; }),
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeEngine(processResult = -1) {
  return {
    frameLength: 512,
    sampleRate: 16000,
    process: vi.fn().mockReturnValue(processResult),
    release: vi.fn(),
  };
}

function makeRecorder(readImpl?: () => Promise<Int16Array>) {
  return {
    start: vi.fn(),
    read: vi.fn().mockImplementation(readImpl ?? (() => Promise.reject(new Error('done')))),
    stop: vi.fn(),
    release: vi.fn(),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('WakeWordListener', () => {
  beforeEach(() => {
    state.porcupineThrow = false;
    state.pvrecorderThrow = false;
    state.pvrecorderUseDefault = false;
    state.engine = makeEngine();
    state.recorder = makeRecorder();
  });

  it('throws when @picovoice/porcupine-node is missing', async () => {
    state.porcupineThrow = true;
    const listener = new WakeWordListener({ accessKey: 'k', onWakeWord: vi.fn() });
    await expect(listener.start()).rejects.toThrow('@picovoice/porcupine-node');
  });

  it('throws when @picovoice/pvrecorder-node is missing', async () => {
    state.pvrecorderThrow = true;
    const listener = new WakeWordListener({ accessKey: 'k', onWakeWord: vi.fn() });
    await expect(listener.start()).rejects.toThrow('@picovoice/pvrecorder-node');
  });

  it('starts successfully — recorder.start() is called', async () => {
    const listener = new WakeWordListener({ accessKey: 'k', onWakeWord: vi.fn() });
    await listener.start();
    expect(state.recorder!.start).toHaveBeenCalled();
    listener.stop();
  });

  it('fires onWakeWord when keyword is detected', async () => {
    let readCount = 0;
    state.recorder = makeRecorder(async () => {
      readCount++;
      if (readCount > 4) throw new Error('done');
      return new Int16Array(512);
    });
    // Return keyword detected on the second frame
    state.engine = {
      ...makeEngine(),
      process: vi.fn().mockImplementation(() => (readCount === 2 ? 0 : -1)),
    };

    const onWakeWord = vi.fn();
    const listener = new WakeWordListener({ accessKey: 'key', onWakeWord });
    await listener.start();
    // Allow the async read loop to run
    await new Promise(r => setTimeout(r, 20));
    expect(onWakeWord).toHaveBeenCalled();
    listener.stop();
  });

  it('uses custom keywordPath when provided', async () => {
    const { Porcupine } = await import('@picovoice/porcupine-node') as unknown as { Porcupine: ReturnType<typeof vi.fn> };
    vi.mocked(Porcupine).mockClear();
    const listener = new WakeWordListener({ accessKey: 'k', keywordPath: '/path/model.ppn', onWakeWord: vi.fn() });
    await listener.start();
    expect(vi.mocked(Porcupine)).toHaveBeenCalledWith(
      'k',
      expect.arrayContaining(['/path/model.ppn']),
      expect.any(Array),
    );
    listener.stop();
  });

  it('resolves wakeWord "jarvis" to JARVIS builtin', async () => {
    const { Porcupine } = await import('@picovoice/porcupine-node') as unknown as { Porcupine: ReturnType<typeof vi.fn> };
    vi.mocked(Porcupine).mockClear();
    const listener = new WakeWordListener({ accessKey: 'k', wakeWord: 'jarvis', onWakeWord: vi.fn() });
    await listener.start();
    expect(vi.mocked(Porcupine)).toHaveBeenCalledWith(
      'k',
      expect.arrayContaining(['jarvis']),
      expect.any(Array),
    );
    listener.stop();
  });

  it('resolveBuiltinKeyword falls back to COMPUTER for unknown wake word', async () => {
    const { Porcupine } = await import('@picovoice/porcupine-node') as unknown as { Porcupine: ReturnType<typeof vi.fn> };
    vi.mocked(Porcupine).mockClear();
    const listener = new WakeWordListener({ accessKey: 'k', wakeWord: 'unknown-word', onWakeWord: vi.fn() });
    await listener.start();
    expect(vi.mocked(Porcupine)).toHaveBeenCalledWith(
      'k',
      expect.arrayContaining(['computer']),
      expect.any(Array),
    );
    listener.stop();
  });

  it('stop() cleans up recorder and engine', async () => {
    const listener = new WakeWordListener({ accessKey: 'k', onWakeWord: vi.fn() });
    await listener.start();
    listener.stop();
    expect(state.recorder!.stop).toHaveBeenCalled();
    expect(state.recorder!.release).toHaveBeenCalled();
    expect(state.engine!.release).toHaveBeenCalled();
  });

  it('stop() before start() does not throw', () => {
    const listener = new WakeWordListener({ accessKey: 'k', onWakeWord: vi.fn() });
    expect(() => listener.stop()).not.toThrow();
  });

  it('stop() propagates recorder errors (try/finally without catch)', async () => {
    state.recorder = {
      ...makeRecorder(),
      stop: vi.fn().mockImplementation(() => { throw new Error('stop failed'); }),
    };
    const listener = new WakeWordListener({ accessKey: 'k', onWakeWord: vi.fn() });
    await listener.start();
    expect(() => listener.stop()).toThrow('stop failed');
  });

  it('uses PvRecorder from default export when named PvRecorder is absent', async () => {
    state.pvrecorderUseDefault = true;
    const listener = new WakeWordListener({ accessKey: 'k', onWakeWord: vi.fn() });
    await listener.start();
    expect(state.recorder!.start).toHaveBeenCalled();
    listener.stop();
  });
});

