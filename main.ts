import { App, Plugin, PluginSettingTab, Setting, Notice, TFile, TFolder, FuzzySuggestModal, TextComponent } from 'obsidian';
import moment from 'moment';

interface ElevenLabsTTSSettings {
    apiKey: string;
    selectedVoice: string;
    outputFolder: string;
    attachToDaily: boolean;
    stability: number;
    similarityBoost: number;
}

const DEFAULT_SETTINGS: ElevenLabsTTSSettings = {
    apiKey: '',
    selectedVoice: 'Rachel',
    outputFolder: '',
    attachToDaily: false,
    stability: 0.5,
    similarityBoost: 0.5
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
            editorCallback: (editor, view) => {
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
                stability: this.settings.stability,
                similarity_boost: this.settings.similarityBoost,
            };

            const data: TextToSpeechRequest = {
                model_id: "eleven_multilingual_v2",
                text: text,
                voice_settings: voiceSettings,
            };

            const requestOptions: RequestInit = {
                method: "POST",
                headers: {
                    'Accept': "audio/mpeg",
                    'xi-api-key': this.settings.apiKey,
                    'Content-Type': "application/json",
                },
                body: JSON.stringify(data),
            };

            const response = await fetch(`${BASE_URL}/text-to-speech/${this.settings.selectedVoice}`, requestOptions);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const audioData = await response.arrayBuffer();

            const date = moment().format('YYYYMMDD HH:mm');
            const truncatedText = text.slice(0, 20).replace(/[^a-zA-Z0-9]/g, '_');
            const fileName = `${date}_${truncatedText}.mp3`;
            const filePath = `${this.settings.outputFolder}/${fileName}`;

            await this.app.vault.adapter.writeBinary(filePath, audioData);

            new Notice(`Audio file created: ${fileName}`);

            if (this.settings.attachToDaily) {
                await this.attachToDaily(filePath);
            }

            // Play the audio
            const audioBlob = new Blob([audioData], { type: 'audio/mpeg' });
            const audioUrl = URL.createObjectURL(audioBlob);

            const audioElement = new Audio(audioUrl);
            audioElement.play();
        } catch (error) {
            console.error('Error generating audio:', error);
            new Notice('Error generating audio file');
        }
    }

    async attachToDaily(filePath: string) {
        const dailyNote = this.app.workspace.getActiveFile();
        if (dailyNote) {
            await this.app.vault.adapter.append(dailyNote.path, `\n\n![[${filePath}]]`);
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

    display(): void {
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
                const voices = await this.fetchVoices();
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
            .addText(text => {
                text.setPlaceholder('Enter folder path')
                    .setValue(this.plugin.settings.outputFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.outputFolder = value;
                        await this.plugin.saveSettings();
                    });
            })
            .addButton(button => button
                .setButtonText('Select')
                .onClick(() => {
                    new FolderSuggestModal(this.app, (folder) => {
                        this.plugin.settings.outputFolder = folder.path;
                        this.plugin.saveSettings();
                        const textComponent = containerEl.querySelector('input[type="text"]') as HTMLInputElement;
                        if (textComponent) {
                            textComponent.value = folder.path;
                        }
                    }).open();
                }));
    }

        new Setting(containerEl)
            .setName('Voice Stability')
            .setDesc('Set the stability of the voice (0.0 to 1.0)')
            .addSlider(slider => slider
                .setLimits(0, 1, 0.1)
                .setValue(this.plugin.settings.stability || 0.5)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.stability = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Similarity Boost')
            .setDesc('Set the similarity boost of the voice (0.0 to 1.0)')
            .addSlider(slider => slider
                .setLimits(0, 1, 0.1)
                .setValue(this.plugin.settings.similarityBoost || 0.5)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.similarityBoost = value;
                    await this.plugin.saveSettings();
                }));

    class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
        constructor(app: App, private onChoose: (folder: TFolder) => void) {
            super(app);
        }

        getItems(): TFolder[] {
            return this.app.vault.getAllLoadedFiles().filter((f): f is TFolder => f instanceof TFolder);
        }

        getItemText(folder: TFolder): string {
            return folder.path;
        }

        onChooseItem(folder: TFolder, evt: MouseEvent | KeyboardEvent): void {
            this.onChoose(folder);
            this.close();
        }
    }

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

    async fetchVoices(): Promise<any[]> {
        try {
            const response = await fetch(`${BASE_URL}/voices`, {
                method: "GET",
                headers: {
                    "xi-api-key": this.plugin.settings.apiKey,
                },
            });
            const data = await response.json();
            return data.voices || [];
        } catch (error) {
            console.error('Error fetching voices:', error);
            new Notice('Error fetching voices');
            return [];
        }
    }
}
