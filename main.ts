import { App, Plugin, PluginSettingTab, Setting, Notice, TFile, TFolder, FuzzySuggestModal, TextComponent, TextAreaComponent, FuzzyMatch, ButtonComponent, setIcon, Modal, PluginManifest } from 'obsidian';
import moment from 'moment';
import { transliterate } from 'transliteration';

interface ElevenLabsTTSSettings {
    apiKey: string;
    primaryVoice: string;
    secondaryVoice: string;
    tertiaryVoice: string;
    outputFolder: string;
    attachmentOption: 'current' | 'daily' | 'none';
    dailyNoteFormat: string;
    dailyNoteSubheader: string;
    stability: number;
    similarityBoost: number;
    playAudioInObsidian: boolean;
    outputTextPreview: boolean;
}

class MultiVoiceTTSModal extends Modal {
    plugin: ElevenLabsTTSPlugin;
    text: string;
    textComponent: TextAreaComponent;

    constructor(app: App, plugin: ElevenLabsTTSPlugin, initialText: string = '') {
        super(app);
        this.plugin = plugin;
        this.text = initialText;
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl('h2', { text: 'Multi-Voice Text-to-Speech' });

        const explanationEl = contentEl.createEl('p', { 
            text: 'This feature uses different voices for various parts of the text. ',
            cls: 'setting-item-description'
        });
        const settingsLink = explanationEl.createEl('a', {
            text: 'Configure voices in plugin settings',
            href: '#'
        });
        settingsLink.addEventListener('click', (e) => {
            e.preventDefault();
            this.close();
            this.plugin.openSettings();
        });

        new Setting(contentEl)
            .setName('Text')
            .setDesc('Enter your text here. Headers will use the secondary voice, quotes and code blocks will use the tertiary voice, and regular text will use the primary voice.')
            .addTextArea(text => {
                this.textComponent = text;
                text.setValue(this.text)
                    .setPlaceholder('Enter text for multi-voice TTS')
                    .onChange(value => this.text = value);
                text.inputEl.rows = 10;
                text.inputEl.cols = 50;
            });

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Generate')
                .setCta()
                .onClick(() => {
                    if (this.text) {
                        this.plugin.generateMultiVoiceAudio(this.text);
                        this.close();
                    } else {
                        new Notice('Please enter text for conversion.');
                    }
                }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

interface SoundGenerationRequest {
    text: string;
    duration_seconds: number;
    prompt_influence?: number;
}

const DEFAULT_SETTINGS: ElevenLabsTTSSettings = {
    apiKey: '',
    primaryVoice: 'Rachel',
    secondaryVoice: 'Rachel',
    tertiaryVoice: 'Rachel',
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
    manifest: PluginManifest;

    constructor(app: App, manifest: PluginManifest) {
        super(app, manifest);
        this.manifest = manifest;
    }

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

        this.addCommand({
            id: 'multi-voice-tts',
            name: 'Multi-Voice Text-to-Speech',
            editorCallback: (editor, view) => {
                const selectedText = editor.getSelection();
                new MultiVoiceTTSModal(this.app, this, selectedText).open();
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

    openSettings() {
        try {
            // @ts-ignore
            if (this.app.setting && typeof this.app.setting.open === 'function') {
                // @ts-ignore
                this.app.setting.open();
                // @ts-ignore
                this.app.setting.openTabById(this.manifest.id);
            } else {
                throw new Error('Settings API not available');
            }
        } catch (error) {
            new Notice('Unable to open settings. Please open them manually.');
            console.warn('Error opening settings:', error);
        }
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

            const voices = [this.settings.primaryVoice, this.settings.secondaryVoice, this.settings.tertiaryVoice];
            const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
            let audioBuffers: ArrayBuffer[] = [];

            for (let i = 0; i < sentences.length; i++) {
                const voiceId = voices[i % voices.length];
                const data: TextToSpeechRequest = {
                    model_id: "eleven_multilingual_v2",
                    text: sentences[i].trim(),
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

                const response = await fetch(`${BASE_URL}/text-to-speech/${voiceId}`, requestOptions);
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const audioData = await response.arrayBuffer();
                audioBuffers.push(audioData);
            }

            const combinedAudioBuffer = this.combineAudioBuffers(audioBuffers);

            const date = moment().format('yyyymmdd hhmmss');
            const truncatedText = transliterate(text.slice(0, 20)).replace(/[^a-zA-Z0-9]/g, '_');
            const fileName = `${date}_${truncatedText}.mp3`.toLowerCase();
            const filePath = `${this.settings.outputFolder}/${fileName}`;

            await this.app.vault.adapter.writeBinary(filePath, combinedAudioBuffer);

            new Notice(`Audio file created: ${fileName}`);

            const textPreview = this.settings.outputTextPreview ? text.slice(0, 50) + (text.length > 50 ? '...' : '') : '';

            if (this.settings.attachmentOption === 'daily') {
                await this.attachToDaily(filePath, textPreview, text);
            } else if (this.settings.attachmentOption === 'current') {
                await this.attachToCurrent(filePath, textPreview, text);
            }

            // Play the audio if the setting is enabled
            if (this.settings.playAudioInObsidian) {
                const audioBlob = new Blob([combinedAudioBuffer], { type: 'audio/mpeg' });
                const audioUrl = URL.createObjectURL(audioBlob);

                const audioElement = new Audio(audioUrl);
                audioElement.play();
            }
        } catch (error) {
            console.error('Error generating audio:', error);
            new Notice('Error generating audio file');
        }
    }

    async generateMultiVoiceAudio(text: string): Promise<void> {
        if (!this.settings.apiKey) {
            new Notice('API key not set. Please set your API key in the plugin settings.');
            return;
        }

        try {
            console.log('Starting multi-voice audio generation');
            const voiceSettings: VoiceSettings = {
                stability: this.settings.stability,
                similarity_boost: this.settings.similarityBoost,
            };

            const voices = {
                primary: this.settings.primaryVoice,
                secondary: this.settings.secondaryVoice,
                tertiary: this.settings.tertiaryVoice
            };

            const parsedContent = this.parseMarkdownContent(text);
            let audioBuffers: ArrayBuffer[] = [];

            for (const segment of parsedContent) {
                const voiceId = voices[segment.voiceType];
                const data: TextToSpeechRequest = {
                    model_id: "eleven_multilingual_v2",
                    text: segment.text.trim(),
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

                console.log(`Sending request for voice: ${voiceId}, text: "${segment.text.slice(0, 30)}..."`);
                const response = await fetch(`${BASE_URL}/text-to-speech/${voiceId}`, requestOptions);
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const audioData = await response.arrayBuffer();
                audioBuffers.push(audioData);
                console.log(`Received audio data for voice: ${voiceId}, length: ${audioData.byteLength} bytes`);
            }

            console.log('Merging audio buffers');
            const combinedAudioBuffer = this.combineAudioBuffers(audioBuffers);
            console.log(`Combined audio buffer length: ${combinedAudioBuffer.byteLength} bytes`);

            const date = moment().format('yyyymmdd hhmmss');
            const truncatedText = transliterate(text.slice(0, 20)).replace(/[^a-zA-Z0-9]/g, '_');
            const fileName = `${date}_${truncatedText}_multi_voice.mp3`.toLowerCase();
            const filePath = `${this.settings.outputFolder}/${fileName}`;

            console.log(`Writing audio file: ${filePath}`);
            await this.app.vault.adapter.writeBinary(filePath, combinedAudioBuffer);
            console.log('Audio file written successfully');

            new Notice(`Multi-voice audio file created: ${fileName}`);

            const textPreview = this.settings.outputTextPreview ? text.slice(0, 50) + (text.length > 50 ? '...' : '') : '';

            if (this.settings.attachmentOption === 'daily') {
                console.log('Attaching to daily note');
                await this.attachToDaily(filePath, textPreview, text);
            } else if (this.settings.attachmentOption === 'current') {
                console.log('Attaching to current note');
                await this.attachToCurrent(filePath, textPreview, text);
            }

            // Play the audio if the setting is enabled
            if (this.settings.playAudioInObsidian) {
                console.log('Playing audio in Obsidian');
                const audioBlob = new Blob([combinedAudioBuffer], { type: 'audio/mpeg' });
                const audioUrl = URL.createObjectURL(audioBlob);

                const audioElement = new Audio(audioUrl);
                audioElement.play();
            }

            console.log('Multi-voice audio generation completed successfully');
        } catch (error) {
            console.error('Error generating multi-voice audio:', error);
            new Notice('Error generating multi-voice audio file');
        }
    }

    parseMarkdownContent(text: string): Array<{voiceType: 'primary' | 'secondary' | 'tertiary', text: string}> {
        const lines = text.split('\n');
        const parsedContent: Array<{voiceType: 'primary' | 'secondary' | 'tertiary', text: string}> = [];
        let currentVoice: 'primary' | 'secondary' | 'tertiary' = 'primary';
        let currentBlock = '';

        for (const line of lines) {
            if (line.startsWith('#')) {
                if (currentBlock) {
                    parsedContent.push({voiceType: currentVoice, text: currentBlock.trim()});
                    currentBlock = '';
                }
                currentVoice = 'secondary';
                currentBlock = line + '\n';
            } else if (line.startsWith('>') || line.startsWith('```')) {
                if (currentBlock) {
                    parsedContent.push({voiceType: currentVoice, text: currentBlock.trim()});
                    currentBlock = '';
                }
                currentVoice = 'tertiary';
                currentBlock = line + '\n';
            } else {
                if (currentVoice !== 'primary' && !line.trim()) {
                    if (currentBlock) {
                        parsedContent.push({voiceType: currentVoice, text: currentBlock.trim()});
                        currentBlock = '';
                    }
                    currentVoice = 'primary';
                }
                currentBlock += line + '\n';
            }
        }

        if (currentBlock) {
            parsedContent.push({voiceType: currentVoice, text: currentBlock.trim()});
        }

        return parsedContent;
    }

    combineAudioBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
        const totalLength = buffers.reduce((acc, buffer) => acc + buffer.byteLength, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const buffer of buffers) {
            result.set(new Uint8Array(buffer), offset);
            offset += buffer.byteLength;
        }
        return result.buffer;
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

            const date = moment().format('YYYYMMDD HHmmss');
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
        this.duration = 5; // Initialize duration with default value
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
                    .setValue(this.duration.toString())
                    .onChange(value => {
                        let duration = parseFloat(value);
                        if (!isNaN(duration)) {
                            if (duration > 22) duration = 22;
                            if (duration < 0.5) duration = 0.5;
                            this.duration = duration;
                            this.durationComponent.setValue(duration.toString());
                        } else {
                            this.duration = 0; // Set to invalid value if input is not a number
                        }
                    });
            });

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Generate')
                .setCta()
                .onClick(() => {
                    if (this.text && this.duration && this.duration >= 0.5 && this.duration <= 22) {
                        this.plugin.generateSound({
                            text: this.text,
                            duration_seconds: this.duration
                        });
                        this.close();
                    } else {
                        new Notice('Please enter both text and a valid duration (between 0.5 and 22 seconds).');
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

        let primaryPreviewButton: ButtonComponent;
        let secondaryPreviewButton: ButtonComponent;
        let tertiaryPreviewButton: ButtonComponent;
        let audio: HTMLAudioElement | null = null;

        const createVoiceSetting = (containerEl: HTMLElement, settingName: string, settingKey: 'primaryVoice' | 'secondaryVoice' | 'tertiaryVoice') => {
            const voiceSetting = new Setting(containerEl)
                .setName(`${settingName} Voice`)
                .setDesc(`Select the ${settingName.toLowerCase()} voice to use. ${
                    settingKey === 'primaryVoice' ? 'Used for regular text.' :
                    settingKey === 'secondaryVoice' ? 'Used for headers.' :
                    'Used for quotes, code blocks, and callouts.'
                }`)
                .addDropdown(async (dropdown) => {
                    const voices = await this.fetchVoices();
                    voices.forEach((voice: any) => {
                        const voiceName = voice.labels?.accent ? `${voice.name} (${voice.labels.accent})` : voice.name;
                        dropdown.addOption(voice.voice_id, voiceName);
                        this.voiceLanguages.set(voice.voice_id, voice.labels.language);
                    });
                    dropdown.setValue(this.plugin.settings[settingKey]);
                    dropdown.onChange(async (value) => {
                        this.plugin.settings[settingKey] = value;
                        await this.plugin.saveSettings();
                        this.updateVoiceInfo(value, voiceSetting);
                        this.updatePreviewButton(value, voiceSetting.controlEl.querySelector('.play-button') as HTMLElement);
                        if (audio) {
                            audio.pause();
                            audio = null;
                        }
                        setIcon(voiceSetting.controlEl.querySelector('.play-button') as HTMLElement, 'play');
                    });
                
                    // Set initial voice info
                    this.updateVoiceInfo(this.plugin.settings[settingKey], voiceSetting);
                });

            const previewButton = new ButtonComponent(voiceSetting.controlEl)
                .setIcon('play')
                .setClass('play-button')
                .onClick(() => {
                    if (audio && !audio.paused) {
                        audio.pause();
                        setIcon(previewButton.buttonEl, 'play');
                    } else {
                        this.playVoicePreview(this.plugin.settings[settingKey], previewButton.buttonEl);
                    }
                });

            this.updatePreviewButton(this.plugin.settings[settingKey], previewButton);

            // Add voice characteristics directly under the dropdown and play button
            const characteristicsEl = voiceSetting.descEl.createDiv();
            characteristicsEl.setText(this.getVoiceCharacteristics(this.plugin.settings[settingKey]));

            return { voiceSetting, previewButton };
        };

        const { voiceSetting: primaryVoiceSetting, previewButton: primaryPreviewBtn } = createVoiceSetting(containerEl, 'Primary', 'primaryVoice');
        primaryPreviewButton = primaryPreviewBtn;

        const { voiceSetting: secondaryVoiceSetting, previewButton: secondaryPreviewBtn } = createVoiceSetting(containerEl, 'Secondary', 'secondaryVoice');
        secondaryPreviewButton = secondaryPreviewBtn;

        const { voiceSetting: tertiaryVoiceSetting, previewButton: tertiaryPreviewBtn } = createVoiceSetting(containerEl, 'Tertiary', 'tertiaryVoice');
        tertiaryPreviewButton = tertiaryPreviewBtn;

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

    updatePreviewButton(voiceId: string, previewButton: ButtonComponent | HTMLElement): void {
        const voice = this.voices.find(v => v.voice_id === voiceId);
        if (previewButton instanceof ButtonComponent) {
            previewButton.setDisabled(!voice || !voice.preview_url);
        } else if (previewButton instanceof HTMLElement) {
            previewButton.toggleAttribute('disabled', !voice || !voice.preview_url);
        }
    }

    async playVoicePreview(voiceId: string, previewButton: ButtonComponent | HTMLElement): Promise<void> {
        const voice = this.voices.find(v => v.voice_id === voiceId);
        if (voice && voice.preview_url) {
            const audio = new Audio(voice.preview_url);
            const buttonEl = previewButton instanceof ButtonComponent ? previewButton.buttonEl : previewButton;
            setIcon(buttonEl, 'pause');
            
            audio.onended = () => {
                setIcon(buttonEl, 'play');
            };

            audio.onpause = () => {
                setIcon(buttonEl, 'play');
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
