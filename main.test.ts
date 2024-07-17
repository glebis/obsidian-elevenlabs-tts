import { App, TFile, PluginManifest } from 'obsidian';
import ElevenLabsTTSPlugin from './main';
import * as uuid from 'uuid';

// Explicitly import Jest types and functions
import { jest, describe, beforeEach, it, expect } from '@jest/globals';

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('mocked-uuid-value')
}));

// Mock fetch
global.fetch = jest.fn().mockResolvedValue({
  arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  ok: true,
  status: 200,
}) as unknown as jest.MockedFunction<typeof fetch>;

// Mock Notice
const mockNotice = jest.fn();
(global as any).Notice = mockNotice;

describe('ElevenLabsTTSPlugin', () => {
  let app: App;
  let plugin: ElevenLabsTTSPlugin;
  let manifest: PluginManifest;

  beforeEach(() => {
    // Mock Obsidian's App
    app = {
      vault: {
        adapter: {
          writeBinary: jest.fn().mockResolvedValue(undefined),
          read: jest.fn().mockResolvedValue('Existing content'),
          append: jest.fn().mockResolvedValue(undefined),
        },
        read: jest.fn().mockResolvedValue('Existing content'),
        modify: jest.fn().mockResolvedValue(undefined),
        getAbstractFileByPath: jest.fn().mockReturnValue({ path: 'test-path' } as TFile),
      },
      workspace: {
        getActiveFile: jest.fn(),
      },
    } as unknown as App;

    // Create a valid PluginManifest
    manifest = {
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
      minAppVersion: '0.15.0',
      author: 'Test Author',
      description: 'A test plugin',
    };

    // Initialize plugin
    plugin = new ElevenLabsTTSPlugin(app, manifest);

    // Mock plugin methods
    plugin.loadData = jest.fn().mockResolvedValue({}) as jest.MockedFunction<typeof plugin.loadData>;
    plugin.saveData = jest.fn().mockResolvedValue(undefined) as jest.MockedFunction<typeof plugin.saveData>;

    // Initialize settings
    plugin.settings = {
      apiKey: 'test-key',
      selectedVoice: 'Rachel',
      outputFolder: 'test-folder',
      attachToDaily: false,
      stability: 0.5,
      similarityBoost: 0.5,
    };

    // Mock document.createElement
    document.createElement = jest.fn().mockReturnValue({
      src: '',
      play: jest.fn(),
    }) as jest.MockedFunction<typeof document.createElement>;

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('Settings', () => {
    it('should load default settings', async () => {
      plugin.loadData = jest.fn().mockResolvedValue({}) as jest.MockedFunction<typeof plugin.loadData>;
      await plugin.loadSettings();
      expect(plugin.settings).toEqual({
        apiKey: '',
        selectedVoice: 'Rachel',
        outputFolder: '',
        attachToDaily: false,
        stability: 0.5,
        similarityBoost: 0.5,
        audioFileNameFormat: '{voiceName} - {text}',
        audioFileNamePrefix: '',
        audioFileNameSuffix: '',
      });
    });

    it('should load settings from data.json', async () => {
      const mockData = {
        apiKey: 'test-api-key',
        selectedVoice: 'test-voice',
        outputFolder: 'test-folder',
        attachToDaily: true,
        stability: 0.7,
        similarityBoost: 0.8,
        audioFileNameFormat: '{text} by {voiceName}',
        audioFileNamePrefix: 'prefix_',
        audioFileNameSuffix: '_suffix',
      };
      plugin.loadData = jest.fn().mockResolvedValue(mockData) as jest.MockedFunction<typeof plugin.loadData>;

      await plugin.loadSettings();

      expect(plugin.settings).toEqual(mockData);
    });

    it('should save settings', async () => {
      plugin.settings = {
        apiKey: 'new-test-key',
        selectedVoice: 'new-test-voice',
        outputFolder: 'new-test-folder',
        attachToDaily: true,
        stability: 0.7,
        similarityBoost: 0.8,
      };
      await plugin.saveSettings();
      expect(plugin.saveData).toHaveBeenCalledWith(plugin.settings);
    });
  });

  describe('Voice Settings', () => {
    it('should use default voice settings when not specified', async () => {
      (global.fetch as jest.Mock<Promise<Response>>).mockResolvedValueOnce({
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      } as unknown as Response);

      await plugin.generateAudio('Test text');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.elevenlabs.io/v1/text-to-speech/Rachel',
        expect.objectContaining({
          body: expect.stringContaining('"stability":0.5,"similarity_boost":0.5'),
        })
      );
    });

    it('should use custom voice settings when specified', async () => {
      plugin.settings.stability = 0.8;
      plugin.settings.similarityBoost = 0.9;

      (global.fetch as jest.Mock<Promise<Response>>).mockResolvedValueOnce({
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
      } as unknown as Response);

      await plugin.generateAudio('Test text');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.elevenlabs.io/v1/text-to-speech/Rachel',
        expect.objectContaining({
          body: expect.stringContaining('"stability":0.8,"similarity_boost":0.9'),
        })
      );
    });
  });

  describe('Audio Generation', () => {
    it('should generate audio file', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      (global.fetch as jest.Mock<Promise<Response>>).mockResolvedValueOnce({
        arrayBuffer: jest.fn().mockResolvedValue(mockArrayBuffer),
      } as unknown as Response);

      await plugin.generateAudio('Test text');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.elevenlabs.io/v1/text-to-speech/Rachel',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'xi-api-key': 'test-key',
          }),
          body: expect.stringContaining('Test text'),
        })
      );

      expect(app.vault.adapter.writeBinary).toHaveBeenCalledWith(
        expect.stringMatching(/test-folder\/.*\.mp3$/),
        mockArrayBuffer
      );

      expect(mockNotice).toHaveBeenCalledWith(expect.stringMatching(/Audio file created: .*\.mp3$/));
    });

    it('should show error when API key is not set', async () => {
      plugin.settings.apiKey = '';

      await plugin.generateAudio('Test text');

      expect(mockNotice).toHaveBeenCalledWith('API key not set. Please set your API key in the plugin settings.');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle API errors', async () => {
      (global.fetch as jest.Mock<Promise<Response>>).mockRejectedValueOnce(new Error('API Error'));

      await plugin.generateAudio('Test text');

      expect(console.error).toHaveBeenCalledWith('Error generating audio:', expect.any(Error));
      expect(mockNotice).toHaveBeenCalledWith('Error generating audio file');
    });
  });

  describe('Daily Note Attachment', () => {
    it('should attach audio file to daily note', async () => {
      const mockFile = { path: 'daily-note.md' } as TFile;
      (app.workspace.getActiveFile as jest.Mock).mockReturnValue(mockFile);

      await plugin.attachToDaily('audio-file.mp3');

      expect(app.vault.adapter.append).toHaveBeenCalledWith(
        'daily-note.md',
        '\n\n![[audio-file.mp3]]'
      );
      expect(mockNotice).toHaveBeenCalledWith('Audio file attached to daily note');
    });

    it('should show error when no active daily note is found', async () => {
      (app.workspace.getActiveFile as jest.Mock).mockReturnValue(null);

      await plugin.attachToDaily('audio-file.mp3');

      expect(app.vault.adapter.append).not.toHaveBeenCalled();
      expect(mockNotice).toHaveBeenCalledWith('No active daily note found');
    });
  });

  describe('File Name Generation', () => {
    it('should generate file name with default format', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      (global.fetch as jest.Mock<Promise<Response>>).mockResolvedValueOnce({
        arrayBuffer: jest.fn().mockResolvedValue(mockArrayBuffer),
      } as unknown as Response);

      await plugin.generateAudio('Test text');

      expect(app.vault.adapter.writeBinary).toHaveBeenCalledWith(
        expect.stringMatching(/test-folder\/Rachel - Test text\.mp3$/),
        mockArrayBuffer
      );
    });

    it('should generate file name with custom format', async () => {
      plugin.settings.audioFileNameFormat = '{text} by {voiceName}';
      const mockArrayBuffer = new ArrayBuffer(8);
      (global.fetch as jest.Mock<Promise<Response>>).mockResolvedValueOnce({
        arrayBuffer: jest.fn().mockResolvedValue(mockArrayBuffer),
      } as unknown as Response);

      await plugin.generateAudio('Test text');

      expect(app.vault.adapter.writeBinary).toHaveBeenCalledWith(
        expect.stringMatching(/test-folder\/Test text by Rachel\.mp3$/),
        mockArrayBuffer
      );
    });

    it('should generate file name with prefix and suffix', async () => {
      plugin.settings.audioFileNamePrefix = 'prefix_';
      plugin.settings.audioFileNameSuffix = '_suffix';
      const mockArrayBuffer = new ArrayBuffer(8);
      (global.fetch as jest.Mock<Promise<Response>>).mockResolvedValueOnce({
        arrayBuffer: jest.fn().mockResolvedValue(mockArrayBuffer),
      } as unknown as Response);

      await plugin.generateAudio('Test text');

      expect(app.vault.adapter.writeBinary).toHaveBeenCalledWith(
        expect.stringMatching(/test-folder\/prefix_Rachel - Test text_suffix\.mp3$/),
        mockArrayBuffer
      );
    });
  });
});
