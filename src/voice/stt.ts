// voice/stt.ts — Azure Speech SDK triggered transcription

export interface SttOptions {
  subscriptionKey: string;
  region: string;
  onResult: (text: string) => void;
  onEnd: () => void;
}

export class SpeechTranscriber {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private recognizer: any = null;

  constructor(private readonly options: SttOptions) {}

  /**
   * Capture a single utterance from the default microphone.
   * Called immediately after the wake word fires.
   * Resolves with the transcribed text, or '' on no-match / error.
   */
  async captureUtterance(): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sdk: any;
    try {
      sdk = await import('microsoft-cognitiveservices-speech-sdk');
    } catch {
      throw new Error(
        'Missing optional dependency microsoft-cognitiveservices-speech-sdk — install it with: npm install microsoft-cognitiveservices-speech-sdk',
      );
    }

    const speechConfig = sdk.SpeechConfig.fromSubscription(
      this.options.subscriptionKey,
      this.options.region,
    );
    speechConfig.speechRecognitionLanguage = 'en-US';

    const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
    this.recognizer = recognizer;

    return new Promise<string>((resolve) => {
      recognizer.recognizeOnceAsync(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (result: any) => {
          const text: string =
            result.reason === sdk.ResultReason.RecognizedSpeech
              ? (result.text as string)
              : '';
          if (text) {
            this.options.onResult(text);
          } else {
            this.options.onEnd();
          }
          resolve(text);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (_err: any) => {
          this.options.onEnd();
          resolve('');
        },
      );
    });
  }

  dispose(): void {
    try {
      this.recognizer?.close();
    } catch {
      // best-effort cleanup
    }
    this.recognizer = null;
  }
}
