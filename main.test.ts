import { App, TFile } from 'obsidian';
import ElevenLabsTTSPlugin from './main';
import * as uuid from 'uuid';

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('mocked-uuid-value')
}));

// Mock fetch
global.fetch = jest.fn();

// Mock Notice
global.Notice = jest.fn();

describe('ElevenLabsTTSPlugin', () => {
  let app: App;
  let plugin: ElevenLabsTTSPlugin;

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
        getAbstractFileByPath: jest.fn().mockReturnValue({ path: 'test-path' }),
      },
      workspace: {
        getActiveFile: jest.fn(),
      },
    } as unknown as App;

    // Initialize plugin
    plugin = new ElevenLabsTTSPlugin(app, {});

    // Mock plugin methods
    plugin.loadData = jest.fn().mockResolvedValue({});
    plugin.saveData = jest.fn().mockResolvedValue(undefined);

    // Initialize settings
    plugin.settings = {
      apiKey: 'test-key',
      selectedVoice: 'Rachel',
      outputFolder: 'test-folder',
      attachToDaily: false
    };

    // Mock document.createElement
    document.createElement = jest.fn().mockReturnValue({
      src: '',
      play: jest.fn(),
    });
  });

  describe('Settings', () => {
    it('should load default settings', async () => {
      plugin.loadData = jest.fn().mockResolvedValue({});
      await plugin.loadSettings();
      expect(plugin.settings).toEqual({
        apiKey: '',
        selectedVoice: 'Rachel',
        outputFolder: '',
        attachToDaily: false
      });
    });

    it('should load settings from data.json', async () => {
      const mockData = {
        apiKey: 'test-api-key',
        selectedVoice: 'test-voice',
        outputFolder: 'test-folder',
        attachToDaily: true
      };
      plugin.loadData = jest.fn().mockResolvedValue(mockData);

      await plugin.loadSettings();

      expect(plugin.settings).toEqual(mockData);
    });

    it('should save settings', async () => {
      plugin.settings = {
        apiKey: 'new-test-key',
        selectedVoice: 'new-test-voice',
        outputFolder: 'new-test-folder',
        attachToDaily: true
      };
      await plugin.saveSettings();
      expect(plugin.saveData).toHaveBeenCalledWith(plugin.settings);
    });
  });

  describe('Audio Generation', () => {
    it('should generate audio file', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        arrayBuffer: jest.fn().mockResolvedValue(mockArrayBuffer),
      });

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
        'test-folder/mocked-uuid-value.mp3',
        mockArrayBuffer
      );

      expect(global.Notice).toHaveBeenCalledWith('Audio file created: mocked-uuid-value.mp3');
    });

    it('should show error when API key is not set', async () => {
      plugin.settings.apiKey = '';

      await plugin.generateAudio('Test text');

      expect(global.Notice).toHaveBeenCalledWith('API key not set. Please set your API key in the plugin settings.');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle API errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('API Error'));

      await plugin.generateAudio('Test text');

      expect(console.error).toHaveBeenCalledWith('Error generating audio:', expect.any(Error));
      expect(global.Notice).toHaveBeenCalledWith('Error generating audio file');
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
      expect(global.Notice).toHaveBeenCalledWith('Audio file attached to daily note');
    });

    it('should show error when no active daily note is found', async () => {
      (app.workspace.getActiveFile as jest.Mock).mockReturnValue(null);

      await plugin.attachToDaily('audio-file.mp3');

      expect(app.vault.adapter.append).not.toHaveBeenCalled();
      expect(global.Notice).toHaveBeenCalledWith('No active daily note found');
    });
  });
});