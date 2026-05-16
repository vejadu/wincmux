import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpeechTranscriber } from '../voice/stt.js';

// ── Shared recognizer state ───────────────────────────────────────────────────
const sttState = vi.hoisted(() => ({
  shouldThrow: false,
  recognizeResult: null as null | { reason: string; text: string },
  recognizeError: null as null | Error,
  closeThrows: false,
}));

vi.mock('microsoft-cognitiveservices-speech-sdk', async () => {
  if (sttState.shouldThrow) throw new Error('not found');
  const mockClose = vi.fn(function (this: unknown) {
    if (sttState.closeThrows) throw new Error('close error');
  });
  const mockRecognizer = {
    recognizeOnceAsync: vi.fn(function (
      this: unknown,
      onSuccess: (r: { reason: string; text: string }) => void,
      onError: (e: Error) => void,
    ) {
      if (sttState.recognizeError) { onError(sttState.recognizeError); return; }
      if (sttState.recognizeResult) { onSuccess(sttState.recognizeResult); return; }
      onSuccess({ reason: 'NoMatch', text: '' });
    }),
    close: mockClose,
  };
  return {
    SpeechConfig: { fromSubscription: vi.fn(function () { return { speechRecognitionLanguage: '' }; }) },
    AudioConfig: { fromDefaultMicrophoneInput: vi.fn(function () { return {}; }) },
    SpeechRecognizer: vi.fn(function (this: unknown) { return mockRecognizer; }),
    ResultReason: { RecognizedSpeech: 'RecognizedSpeech' },
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeOptions(overrides = {}) {
  return {
    subscriptionKey: 'key123',
    region: 'eastus',
    onResult: vi.fn(),
    onEnd: vi.fn(),
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('SpeechTranscriber', () => {
  beforeEach(() => {
    sttState.shouldThrow = false;
    sttState.recognizeResult = null;
    sttState.recognizeError = null;
    sttState.closeThrows = false;
  });

  it('throws when the Azure SDK is not installed', async () => {
    sttState.shouldThrow = true;
    const stt = new SpeechTranscriber(makeOptions());
    await expect(stt.captureUtterance()).rejects.toThrow('Missing optional dependency');
  });

  it('returns transcribed text on RecognizedSpeech', async () => {
    sttState.recognizeResult = { reason: 'RecognizedSpeech', text: 'fix the tests' };
    const opts = makeOptions();
    const stt = new SpeechTranscriber(opts);
    const text = await stt.captureUtterance();
    expect(text).toBe('fix the tests');
    expect(opts.onResult).toHaveBeenCalledWith('fix the tests');
  });

  it('returns empty string when no speech is recognised', async () => {
    sttState.recognizeResult = { reason: 'NoMatch', text: '' };
    const opts = makeOptions();
    const stt = new SpeechTranscriber(opts);
    const text = await stt.captureUtterance();
    expect(text).toBe('');
    expect(opts.onEnd).toHaveBeenCalled();
  });

  it('returns empty string and calls onEnd on recognizer error', async () => {
    sttState.recognizeError = new Error('mic error');
    const opts = makeOptions();
    const stt = new SpeechTranscriber(opts);
    const text = await stt.captureUtterance();
    expect(text).toBe('');
    expect(opts.onEnd).toHaveBeenCalled();
  });

  it('dispose closes the recognizer', async () => {
    sttState.recognizeResult = { reason: 'RecognizedSpeech', text: 'hello' };
    const stt = new SpeechTranscriber(makeOptions());
    await stt.captureUtterance();
    // Should not throw - recognizer is closed
    expect(() => stt.dispose()).not.toThrow();
  });

  it('dispose is safe when no recognizer is open', () => {
    const stt = new SpeechTranscriber(makeOptions());
    expect(() => stt.dispose()).not.toThrow();
  });

  it('dispose swallows errors from close()', async () => {
    sttState.recognizeResult = { reason: 'RecognizedSpeech', text: 'hi' };
    sttState.closeThrows = true;
    const stt = new SpeechTranscriber(makeOptions());
    await stt.captureUtterance();
    expect(() => stt.dispose()).not.toThrow();
  });
});

