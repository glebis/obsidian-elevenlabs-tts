import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { ElevenLabsClient } from "elevenlabs";

// const { ElevenLabsClient } = require('elevenlabs');

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

export default class ElevenLabsTTSPlugin extends Plugin {
    settings: ElevenLabsTTSSettings;
    client: ElevenLabsClient;

    async onload() {
        await this.loadSettings();
        
        this.client = new ElevenLabsClient({
            apiKey: this.settings.apiKey,
        });

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
            const audio = await this.client.generate({
                voice: this.settings.selectedVoice,
                text: text,
                model_id: "eleven_multilingual_v2"
            });

            const fileName = `${uuid()}.mp3`;
            const filePath = `${this.settings.outputFolder}/${fileName}`;

            // Convert the audio to an ArrayBuffer
            const arrayBuffer = await audio.arrayBuffer();

            // Write the ArrayBuffer to a file using Obsidian's API
            await this.app.vault.adapter.writeBinary(filePath, arrayBuffer);

            new Notice(`Audio file created: ${fileName}`);

            if (this.settings.attachToDaily) {
                await this.attachToDaily(filePath);
            }

            // Play the audio
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const source = audioContext.createBufferSource();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
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
                    this.plugin.client = new ElevenLabsClient({ apiKey: value });
                }));

        new Setting(containerEl)
            .setName('Voice')
            .setDesc('Select the voice to use')
            .addDropdown(async (dropdown) => {
                // const voices = await this.plugin.client.voices.getAll();
                const voices = await this.plugin.client.getVoices();
                voices.forEach((voice: any) => {
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
