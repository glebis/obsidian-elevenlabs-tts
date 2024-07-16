import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { v4 as uuid } from "uuid";

interface ElevenLabsTTSSettings {
    apiKey: string;
    selectedVoice: string;
    outputFolder: string;
    attachToDaily: boolean;
}

const DEFAULT_SETTINGS: ElevenLabsTTSSettings = {
    apiKey: '',
    selectedVoice: 'Rachel',
    outputFolder: '',
    attachToDaily: false
}

const BASE_URL = "https://api.elevenlabs.io/v1";

interface VoiceSettings {
    stability: number;
    similarity_boost: number;
}

interface TextToSpeechRequest {
    model_id: string;
    text: string;
    voice_settings?: VoiceSettings;
}

export default class ElevenLabsTTSPlugin extends Plugin {
    settings: ElevenLabsTTSSettings;

    async onload() {
        await this.loadSettings();

        this.addCommand({
            id: 'read-with-eleventy',
            name: 'Read with Eleventy',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                this.generateAudio(editor.getSelection());
            }
        });

        this.addSettingTab(new ElevenLabsTTSSettingTab(this.app, this));
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async generateAudio(text: string): Promise<void> {
        if (!this.settings.apiKey) {
            new Notice('API key not set. Please set your API key in the plugin settings.');
            return;
        }

        try {
            const voiceSettings: VoiceSettings = {
                stability: 0.5, // Replace with your desired value
                similarity_boost: 0.5, // Replace with your desired value
            };

            const data: TextToSpeechRequest = {
                model_id: "eleven_multilingual_v2", // Replace with your desired model ID
                text: text,
                voice_settings: voiceSettings,
            };

            const requestOptions = {
                method: "POST",
                headers: {
                    Accept: "audio/mpeg",
                    "xi-api-key": this.settings.apiKey,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(data),
            };

            const response = await fetch(`${BASE_URL}/text-to-speech/${this.settings.selectedVoice}`, requestOptions);
            const audioData = await response.arrayBuffer();

            const fileName = `${uuid()}.mp3`;
            const filePath = `${this.settings.outputFolder}/${fileName}`;

            // Write the audio data to a file using Obsidian's API
            await this.app.vault.adapter.writeBinary(filePath, audioData);

            new Notice(`Audio file created: ${fileName}`);

            if (this.settings.attachToDaily) {
                await this.attachToDaily(filePath);
            }

            // Play the audio
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const source = audioContext.createBufferSource();
            const audioBuffer = await audioContext.decodeAudioData(audioData);
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);
            source.start();
        } catch (error) {
            console.error('Error generating audio:', error);
            new Notice('Error generating audio file');
        }
    }

    async attachToDaily(filePath: string) {
        const dailyNote = this.app.workspace.getActiveFile();
        if (dailyNote) {
            const content = await this.app.vault.read(dailyNote);
            const updatedContent = `${content}\n\n![[${filePath}]]`;
            await this.app.vault.modify(dailyNote, updatedContent);
            new Notice('Audio file attached to daily note');
        } else {
            new Notice('No active daily note found');
        }
    }
}

class ElevenLabsTTSSettingTab extends PluginSettingTab {
    plugin: ElevenLabsTTSPlugin;

    constructor(app: App, plugin: ElevenLabsTTSPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    async display(): Promise<void> {
        const {containerEl} = this;

        containerEl.empty();

        new Setting(containerEl)
            .setName('API Key')
            .setDesc('Enter your ElevenLabs API key')
            .addText(text => text
                .setPlaceholder('Enter your API key')
                .setValue(this.plugin.settings.apiKey)
                .onChange(async (value) => {
                    this.plugin.settings.apiKey = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Voice')
            .setDesc('Select the voice to use')
            .addDropdown(async (dropdown) => {
                const requestOptions = {
                    method: "GET",
                    headers: {
                        "xi-api-key": this.plugin.settings.apiKey,
                    },
                };

                const voices = await fetch(`${BASE_URL}/voices`, requestOptions);
                const voicesData = await voices.json();

                voicesData.voices.forEach((voice: any) => {
                    dropdown.addOption(voice.voice_id, voice.name);
                });
                dropdown.setValue(this.plugin.settings.selectedVoice);
                dropdown.onChange(async (value) => {
                    this.plugin.settings.selectedVoice = value;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName('Output Folder')
            .setDesc('Select the folder where audio files will be saved')
            .addText(text => text
                .setPlaceholder('Enter folder path')
                .setValue(this.plugin.settings.outputFolder)
                .onChange(async (value) => {
                    this.plugin.settings.outputFolder = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Attach to Daily Note')
            .setDesc('Automatically attach generated audio files to the daily note')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.attachToDaily)
                .onChange(async (value) => {
                    this.plugin.settings.attachToDaily = value;
                    await this.plugin.saveSettings();
                }));
    }
}