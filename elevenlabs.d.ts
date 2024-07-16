declare module 'elevenlabs' {
  export class ElevenLabsClient {
    constructor(options: { apiKey: string });
    generate(options: {
      voice: string;
      model_id: string;
      text: string;
    }): Promise<{
      arrayBuffer(): Promise<ArrayBuffer>;
      pipe(destination: WritableStream): void;
    }>;
    getVoices(): Promise<Array<{
      voice_id: string;
      name: string;
    }>>;
  }
}
