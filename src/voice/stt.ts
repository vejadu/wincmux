// voice/stt.ts — Azure Speech SDK triggered transcription
// TODO: Integrate microsoft-cognitiveservices-speech-sdk

export interface SttConfig {
  subscriptionKey: string;
  region: string;
}

/**
 * Transcribe audio buffer to text using Azure Cognitive Services Speech SDK.
 * Called after wake-word detection fires.
 * TODO: Implement using SpeechRecognizer from the Azure SDK.
 */
export async function transcribe(
  audioBuffer: Buffer,
  config: SttConfig,
): Promise<string> {
  // TODO: pass audioBuffer to Azure Speech SDK recognizer, return transcript
  throw new Error('transcribe not yet implemented');
}
