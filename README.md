# ElevenLabs TTS Plugin for Obsidian

The ElevenLabs TTS Plugin for Obsidian allows you to generate high-quality audio from text using the ElevenLabs Text-to-Speech API. This plugin provides a seamless integration with Obsidian, enabling you to create audio files directly from selected text in your notes.

Плагин ElevenLabs TTS для Obsidian позволяет создавать высококачественные аудиофайлы из текста с помощью API ElevenLabs.

## Features

- Generate audio files from selected text in Obsidian
- Choose from a variety of voices provided by ElevenLabs
- Save generated audio files to a specified folder in your Obsidian vault
- Automatically attach generated audio files to current note (optional)
- Play generated audio directly in Obsidian

## Installation

1. Install the by downloading the latest release and placing a folder with the files into .obsidian/plugins folder in your vault.
2. After installation, the plugin will prompt you to enter your ElevenLabs API key, which you can obtain from the [ElevenLabs website](https://elevenlabs.io/).


## Usage

1. Select the text you want to convert to audio in any Obsidian note.
2. Use the `Read with Eleventy` command (available in the Command Palette or the Editor Menu)
3. Once the audio file is generated, it will be saved in the specified output folder, and the file will be played.
4. If the "Attach to Daily Note" option is enabled, the generated audio file will be automatically attached to your daily note.
5. The generated audio will also be played automatically in Obsidian.

To generate sound effects:
1. Use the `Generate Sound` command from the Command Palette.
2. Enter the text description of the sound you want to generate and set the duration.
3. The generated sound will be saved and attached to your current note or daily note, depending on your settings.

## Language Support

This plugin now supports multiple languages for its interface. It automatically detects your system language and switches between English and Russian. The plugin's interface will update in real-time when you change Obsidian's language settings.

To change the language:
1. Go to Obsidian Settings
2. Navigate to the "Language" section
3. Select your preferred language (English or Russian)
4. The plugin's interface will automatically update to reflect the chosen language

Note: If your system language is not English or Russian, the plugin will default to English.

## Contributions

Contributions to this plugin are welcome! If you encounter any issues or have suggestions for improvements, please open an issue or submit a pull request on the [GitHub repository](https://github.com/glebis/obsidian-elevenlabs-tts).

## License

This plugin is released under the [MIT License](https://opensource.org/licenses/MIT).

## Release Notes

### Version 1.1.0

- Added multivoice mode for enhanced text-to-speech conversion
- New feature allows different voices for various parts of the text:
  - Primary voice for regular text
  - Secondary voice for headers
  - Tertiary voice for quotes, code blocks, and callouts
- Implemented a new command "Multi-Voice Text-to-Speech" in the Command Palette
- Updated settings to include voice selection for primary, secondary, and tertiary voices
- Improved text parsing to identify different Markdown elements
- Enhanced error handling and progress feedback for long-running processes
