import { App, Plugin, PluginSettingTab, Setting, Notice, TFile, TFolder, FuzzySuggestModal, TextComponent, FuzzyMatch, ButtonComponent, setIcon, Modal } from 'obsidian';
import moment from 'moment';
import { transliterate } from 'transliteration';

interface ElevenLabsTTSSettings {
    apiKey: string;
    selectedVoice: string;
    outputFolder: string;
    attachmentOption: 'current' | 'daily' | 'none';
    dailyNoteFormat: string;
    dailyNoteSubheader: string;
    stability: number;
    similarityBoost: number;
    playAudioInObsidian: boolean;
    outputTextPreview: boolean;
}

interface SoundGenerationRequest {
    text: string;
    duration_seconds: number;
    prompt_influence?: number;
}

const DEFAULT_SETTINGS: ElevenLabsTTSSettings = {
    apiKey: '',
    selectedVoice: 'Rachel',
    outputFolder: '',
    attachmentOption: 'current',
    dailyNoteFormat: 'YYYY-MM-DD',
    dailyNoteSubheader: '## Audio',
    stability: 0.5,
    similarityBoost: 0.5,
    playAudioInObsidian: true,
    outputTextPreview: true
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

        this.addCommand({
            id: 'generate-sound',
            name: 'Generate Sound',
            editorCallback: (editor, view) => {
                const selectedText = editor.getSelection();
                new SoundGenerationModal(this.app, this, selectedText).open();
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
            const truncatedText = transliterate(text.slice(0, 20)).replace(/[^a-zA-Z0-9]/g, '_');
            const fileName = `${date}_${truncatedText}.mp3`;
            const filePath = `${this.settings.outputFolder}/${fileName}`;

            await this.app.vault.adapter.writeBinary(filePath, audioData);

            new Notice(`Audio file created: ${fileName}`);

            const textPreview = this.settings.outputTextPreview ? text.slice(0, 50) + (text.length > 50 ? '...' : '') : '';

            if (this.settings.attachmentOption === 'daily') {
                await this.attachToDaily(filePath, textPreview, text);
            } else if (this.settings.attachmentOption === 'current') {
                await this.attachToCurrent(filePath, textPreview, text);
            }

            // Play the audio if the setting is enabled
            if (this.settings.playAudioInObsidian) {
                const audioBlob = new Blob([audioData], { type: 'audio/mpeg' });
                const audioUrl = URL.createObjectURL(audioBlob);

                const audioElement = new Audio(audioUrl);
                audioElement.play();
            }
        } catch (error) {
            console.error('Error generating audio:', error);
            new Notice('Error generating audio file');
        }
    }

    async attachToDaily(filePath: string, textPreview: string = '', fullText: string = '') {
        try {
            const moment = (window as any).moment;
            const dailyNoteFileName = moment().format(this.settings.dailyNoteFormat) + '.md';
            const dailyNotePath = dailyNoteFileName;
            
            console.log(`Attempting to attach to daily note: ${dailyNotePath}`);
            
            let dailyNote = this.app.vault.getAbstractFileByPath(dailyNotePath);
            
            if (!dailyNote) {
                console.log('Daily note not found, attempting to create...');
                // Create the daily note if it doesn't exist
                dailyNote = await this.app.vault.create(dailyNotePath, '');
            }
            
            if (dailyNote instanceof TFile) {
                console.log('Daily note found or created, appending audio file link...');
                const content = await this.app.vault.read(dailyNote);
                const subheader = this.settings.dailyNoteSubheader;
                let updatedContent: string;

                const truncatedText = fullText.split(' ').slice(0, 10).join(' ') + (fullText.split(' ').length > 10 ? '...' : '');
                const newItem = `${truncatedText}\n![[${filePath}]]`;
                if (content.includes(subheader)) {
                    // If subheader exists, append the new item to the list
                    updatedContent = content.replace(subheader, `${subheader}\n${newItem}`);
                } else {
                    // If subheader doesn't exist, add it with the new item
                    updatedContent = `${content}\n\n${subheader}\n${newItem}`;
                }

                await this.app.vault.modify(dailyNote, updatedContent);
                new Notice('Audio file attached to daily note');
            } else {
                console.error('Error: dailyNote is not an instance of TFile');
                new Notice('Error: Could not find or create daily note');
            }
        } catch (error) {
            console.error('Error in attachToDaily:', error);
            new Notice('Error attaching audio file to daily note');
        }
    }

    async attachToCurrent(filePath: string, textPreview: string = '', fullText: string = '') {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
            const truncatedText = fullText.split(' ').slice(0, 10).join(' ') + (fullText.split(' ').length > 10 ? '...' : '');
            const attachmentText = `\n\n${truncatedText}\n![[${filePath}]]`;
            await this.app.vault.append(activeFile, attachmentText);
            new Notice('Audio file attached to current note');
        } else {
            new Notice('Error: No active note found');
        }
    }

    async generateSound(request: SoundGenerationRequest): Promise<void> {
        if (!this.settings.apiKey) {
            new Notice('API key not set. Please set your API key in the plugin settings.');
            return;
        }

        try {
            const requestOptions: RequestInit = {
                method: "POST",
                headers: {
                    'Accept': "audio/mpeg",
                    'xi-api-key': this.settings.apiKey,
                    'Content-Type': "application/json",
                },
                body: JSON.stringify(request),
            };

            const response = await fetch(`${BASE_URL}/sound-generation`, requestOptions);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const audioData = await response.arrayBuffer();

            const date = moment().format('YYYYMMDD HH:mm');
            const truncatedText = transliterate(request.text.slice(0, 20)).replace(/[^a-zA-Z0-9]/g, '_');
            const fileName = `${date}_${truncatedText}_sound.mp3`;
            const filePath = `${this.settings.outputFolder}/${fileName}`;

            await this.app.vault.adapter.writeBinary(filePath, audioData);

            new Notice(`Sound file created: ${fileName}`);

            // Attach the file based on the attachment option
            if (this.settings.attachmentOption === 'current') {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) {
                    const fileContent = await this.app.vault.read(activeFile);
                    const updatedContent = fileContent + `\n\n![[${fileName}]]`;
                    await this.app.vault.modify(activeFile, updatedContent);
                }
            } else if (this.settings.attachmentOption === 'daily') {
                await this.attachToDaily(fileName);
            }

            // Play the audio
            const audioBlob = new Blob([audioData], { type: 'audio/mpeg' });
            const audioUrl = URL.createObjectURL(audioBlob);

            const audioElement = new Audio(audioUrl);
            audioElement.play();
        } catch (error) {
            console.error('Error generating sound:', error);
            new Notice('Error generating sound file');
        }
    }
}

class SoundGenerationModal extends Modal {
    plugin: ElevenLabsTTSPlugin;
    text: string;
    duration: number;
    textComponent: TextComponent;
    durationComponent: TextComponent;

    constructor(app: App, plugin: ElevenLabsTTSPlugin, initialText: string = '') {
        super(app);
        this.plugin = plugin;
        this.text = initialText;
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl('h2', { text: 'Generate Sound' });

        new Setting(contentEl)
            .setName('Text')
            .addText(text => {
                this.textComponent = text;
                text.setValue(this.text)
                    .setPlaceholder('Enter text for sound generation')
                    .onChange(value => this.text = value);
            });

        new Setting(contentEl)
            .setName('Duration (seconds)')
            .addText(text => {
                this.durationComponent = text;
                text.setPlaceholder('Enter duration (0.5 - 22)')
                    .setValue('5')
                    .onChange(value => {
                        let duration = parseFloat(value);
                        if (!isNaN(duration)) {
                            if (duration > 22) duration = 22;
                            if (duration < 0.5) duration = 0.5;
                            this.duration = duration;
                            this.durationComponent.setValue(duration.toString());
                        }
                    });
            });

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Generate')
                .setCta()
                .onClick(() => {
                    if (this.text && this.duration) {
                        this.plugin.generateSound({
                            text: this.text,
                            duration_seconds: this.duration
                        });
                        this.close();
                    } else {
                        new Notice('Please enter both text and a valid duration.');
                    }
                }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

class ElevenLabsTTSSettingTab extends PluginSettingTab {
    plugin: ElevenLabsTTSPlugin;
    voiceLanguages: Map<string, string[]>;
    updateDailyNotePreview: () => void;

    constructor(app: App, plugin: ElevenLabsTTSPlugin) {
        super(app, plugin);
        this.plugin = plugin;
        this.voiceLanguages = new Map();
        this.updateDailyNotePreview = () => {};
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

        let previewButton: ButtonComponent;
        let audio: HTMLAudioElement | null = null;

        const voiceSetting = new Setting(containerEl)
            .setName('Voice')
            .setDesc('Select the voice to use')
            .addDropdown(async (dropdown) => {
                const voices = await this.fetchVoices();
                voices.forEach((voice: any) => {
                    const voiceName = voice.labels?.accent ? `${voice.name} (${voice.labels.accent})` : voice.name;
                    dropdown.addOption(voice.voice_id, voiceName);
                    this.voiceLanguages.set(voice.voice_id, voice.labels.language);
                });
                dropdown.setValue(this.plugin.settings.selectedVoice);
                dropdown.onChange(async (value) => {
                    this.plugin.settings.selectedVoice = value;
                    await this.plugin.saveSettings();
                    this.updateVoiceInfo(value, voiceSetting);
                    this.updatePreviewButton(value, previewButton);
                    if (audio) {
                        audio.pause();
                        audio = null;
                    }
                    setIcon(previewButton.buttonEl, 'play');
                });
            
                // Set initial voice info
                this.updateVoiceInfo(this.plugin.settings.selectedVoice, voiceSetting);
            });

        previewButton = new ButtonComponent(voiceSetting.controlEl)
            .setIcon('play')
            .onClick(() => {
                if (audio && !audio.paused) {
                    audio.pause();
                    setIcon(previewButton.buttonEl, 'play');
                } else {
                    this.playVoicePreview(this.plugin.settings.selectedVoice, previewButton);
                }
            });

        this.updatePreviewButton(this.plugin.settings.selectedVoice, previewButton);

        // Add voice characteristics directly under the dropdown and play button
        const characteristicsEl = voiceSetting.descEl.createDiv();
        characteristicsEl.setText(this.getVoiceCharacteristics(this.plugin.settings.selectedVoice));

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
            .setName('Attachment Option')
            .setDesc('Choose where to attach generated audio files')
            .addDropdown(dropdown => dropdown
                .addOption('current', 'Current Note')
                .addOption('daily', 'Daily Note')
                .addOption('none', 'Do Not Attach')
                .setValue(this.plugin.settings.attachmentOption)
                .onChange(async (value: 'current' | 'daily' | 'none') => {
                    this.plugin.settings.attachmentOption = value;
                    await this.plugin.saveSettings();
                    this.updateDailyNotePreview();
                }));

        new Setting(containerEl)
            .setName('Daily Note Format')
            .setDesc('Format for daily note filenames (e.g., YYYY-MM-DD)')
            .addText(text => {
                text.setPlaceholder('YYYY-MM-DD')
                    .setValue(this.plugin.settings.dailyNoteFormat)
                    .onChange(async (value) => {
                        this.plugin.settings.dailyNoteFormat = value;
                        await this.plugin.saveSettings();
                        this.updateDailyNotePreview();
                    });
            });

        new Setting(containerEl)
            .setName('Daily Note Subheader')
            .setDesc('Subheader for audio attachments in daily notes')
            .addText(text => {
                text.setPlaceholder('## Audio')
                    .setValue(this.plugin.settings.dailyNoteSubheader)
                    .onChange(async (value) => {
                        this.plugin.settings.dailyNoteSubheader = value;
                        await this.plugin.saveSettings();
                    });
            });

        const dailyNotePreviewEl = containerEl.createEl('div', { cls: 'daily-note-preview' });
        dailyNotePreviewEl.style.marginLeft = '40px';
        dailyNotePreviewEl.style.fontSize = '12px';
        dailyNotePreviewEl.style.color = 'var(--text-muted)';

        this.updateDailyNotePreview = () => {
            if (this.plugin.settings.attachmentOption === 'daily') {
                const previewDate = moment().format(this.plugin.settings.dailyNoteFormat);
                dailyNotePreviewEl.setText(`Preview: ${previewDate}.md\n${this.plugin.settings.dailyNoteSubheader}\n- [[audio_file.mp3]]`);
                dailyNotePreviewEl.style.display = 'block';
            } else {
                dailyNotePreviewEl.style.display = 'none';
            }
        };

        this.updateDailyNotePreview();

        new Setting(containerEl)
            .setName('Play Audio in Obsidian')
            .setDesc('Automatically play generated audio files in Obsidian')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.playAudioInObsidian)
                .onChange(async (value) => {
                    this.plugin.settings.playAudioInObsidian = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Output Text Preview')
            .setDesc('Include a preview of the generated text or prompt in the attachment')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.outputTextPreview)
                .onChange(async (value) => {
                    this.plugin.settings.outputTextPreview = value;
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
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            if (!Array.isArray(data.voices)) {
                throw new Error('Unexpected API response format');
            }
            this.voices = data.voices.filter((voice: any) => !voice.name.includes("Academy Award"));
            console.log('Fetched voices:', this.voices); // For debugging
            return this.voices;
        } catch (error) {
            console.error('Error fetching voices:', error);
            new Notice('Error fetching voices');
            return [];
        }
    }

    getVoiceCharacteristics(voiceId: string): string {
        const voice = this.voices.find(v => v.voice_id === voiceId);
        if (voice) {
            const characteristics = [];
            if (voice.use_case) characteristics.push(`Use case: ${voice.use_case}`);
            if (voice.labels?.gender) characteristics.push(`Gender: ${voice.labels.gender}`);
            if (voice.labels?.age) characteristics.push(`Age: ${voice.labels.age}`);
            return characteristics.join(', ');
        }
        return '';
    }

    updateVoiceInfo(voiceId: string, voiceSetting: Setting): void {
        const voiceCharacteristics = this.getVoiceCharacteristics(voiceId);
        const characteristicsEl = voiceSetting.descEl.querySelector('div');
        if (characteristicsEl) {
            characteristicsEl.empty();
            characteristicsEl.createDiv({text: voiceCharacteristics, cls: 'voice-characteristics'});
        }
    }

    updatePreviewButton(voiceId: string, previewButton: ButtonComponent): void {
        const voice = this.voices.find(v => v.voice_id === voiceId);
        previewButton.setDisabled(!voice || !voice.preview_url);
    }

    async playVoicePreview(voiceId: string, previewButton: ButtonComponent): Promise<void> {
        const voice = this.voices.find(v => v.voice_id === voiceId);
        if (voice && voice.preview_url) {
            const audio = new Audio(voice.preview_url);
            setIcon(previewButton.buttonEl, 'pause');
            
            audio.onended = () => {
                setIcon(previewButton.buttonEl, 'play');
            };

            audio.onpause = () => {
                setIcon(previewButton.buttonEl, 'play');
            };

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
