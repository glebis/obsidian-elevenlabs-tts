import { ElevenLabsClient } from "elevenlabs";

describe('ElevenLabsTTSPlugin', () => {
  it('should load the elevenlabs module', () => {
    // Arrange
    const apiKey = 'your_api_key';

    // Act
    const client = new ElevenLabsClient({
      apiKey: apiKey,
    });

    // Assert
    expect(client).toBeDefined();
  });
});