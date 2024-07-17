import { App, Plugin, PluginSettingTab, Setting, Notice, TFile, TFolder, FuzzySuggestModal, TextComponent, FuzzyMatch, ButtonComponent } from 'obsidian';
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
    voiceLanguages: Map<string, string[]>;

    constructor(app: App, plugin: ElevenLabsTTSPlugin) {
        super(app, plugin);
        this.plugin = plugin;
        this.voiceLanguages = new Map();
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

        let languageInfoSetting: Setting;

        const voiceSetting = new Setting(containerEl)
            .setName('Voice')
            .setDesc('Select the voice to use')
            .addDropdown(async (dropdown) => {
                const voices = await this.fetchVoices();
                voices.forEach((voice: any) => {
                    dropdown.addOption(voice.voice_id, voice.name);
                    this.voiceLanguages.set(voice.voice_id, voice.labels.language);
                });
                dropdown.setValue(this.plugin.settings.selectedVoice);
                dropdown.onChange(async (value) => {
                    this.plugin.settings.selectedVoice = value;
                    await this.plugin.saveSettings();
                    this.updateLanguageInfo(value, languageInfoSetting);
                    this.updatePreviewButton(value, previewButton);
                });
            
                // Set initial language info
                this.updateLanguageInfo(this.plugin.settings.selectedVoice, languageInfoSetting);
            });

        const previewButton = new ButtonComponent(voiceSetting.controlEl)
            .setButtonText('Play')
            .onClick(() => this.playVoicePreview(this.plugin.settings.selectedVoice));

        this.updatePreviewButton(this.plugin.settings.selectedVoice, previewButton);

        // Add a new setting to display language information
        languageInfoSetting = new Setting(containerEl)
            .setName('Supported Languages')
            .setDesc('Languages supported by the selected voice')
            .addText(text => text
                .setDisabled(true)
                .setValue(this.getLanguageInfo(this.plugin.settings.selectedVoice)));

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
                    new FolderSuggestModal(this.app, async (folder: TFolder) => {
                        this.plugin.settings.outputFolder = folder.path;
                        await this.plugin.saveSettings();
                        this.display(); // Refresh the entire settings tab
                    }).open();
                }));

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

        new Setting(containerEl)
            .setName('Attach to Daily Note')
            .setDesc('Automatically attach generated audio files to the daily note')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.attachToDaily)
                .onChange(async (value) => {
                    this.plugin.settings.attachToDaily = value;
                    await this.plugin.saveSettings();
                }));

        // Add affiliate link
        const affiliateDiv = containerEl.createDiv();
        affiliateDiv.addClass('elevenlabs-affiliate-link');
        affiliateDiv.innerHTML = "Don't have an account? <a href='https://elevenlabs.io/?from=partneralvarado9322' target='_blank'>Sign up using this affiliate link</a>";
        affiliateDiv.style.fontSize = '12px';
        affiliateDiv.style.marginTop = '20px';
        affiliateDiv.style.textAlign = 'center';
    }

    voices: any[] = [];

    async fetchVoices(): Promise<any[]> {
        try {
            const response = await fetch(`${BASE_URL}/voices`, {
                method: "GET",
                headers: {
                    "xi-api-key": this.plugin.settings.apiKey,
                },
            });
            const data = await response.json();
            this.voices = (data.voices || []).filter((voice: any) => !voice.name.includes("Academy Award"));
            return this.voices;
        } catch (error) {
            console.error('Error fetching voices:', error);
            new Notice('Error fetching voices');
            return [];
        }
    }

    getLanguageInfo(voiceId: string): string {
        const languages = this.voiceLanguages.get(voiceId);
        return languages ? languages.join(', ') : 'Language information not available';
    }

    updateLanguageInfo(voiceId: string, languageInfoSetting: Setting): void {
        if (languageInfoSetting) {
            const languageInfo = this.getLanguageInfo(voiceId);
            const textComponent = languageInfoSetting.components[0] as TextComponent;
            textComponent.setValue(languageInfo);
        }
    }

    updatePreviewButton(voiceId: string, previewButton: ButtonComponent): void {
        const voice = this.voices.find(v => v.voice_id === voiceId);
        previewButton.setDisabled(!voice || !voice.preview_url);
    }

    async playVoicePreview(voiceId: string): Promise<void> {
        const voice = this.voices.find(v => v.voice_id === voiceId);
        if (voice && voice.preview_url) {
            const audio = new Audio(voice.preview_url);
            await audio.play();
        } else {
            new Notice('No preview available for this voice');
        }
    }
}

class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
    onChooseItem: (folder: TFolder) => void;

    constructor(app: App, onChooseItem: (folder: TFolder) => void) {
        super(app);
        this.onChooseItem = onChooseItem;
    }

    getItems(): TFolder[] {
        return this.app.vault.getAllLoadedFiles().filter((f) => f instanceof TFolder) as TFolder[];
    }

    getItemText(folder: TFolder): string {
        return folder.path;
    }

    onChooseSuggestedItem(folder: TFolder, evt: MouseEvent | KeyboardEvent): void {
        this.onChooseItem(folder);
    }
}
