# ElevenLabs TTS Plugin for Obsidian

The ElevenLabs TTS Plugin for Obsidian allows you to generate high-quality audio from text using the ElevenLabs Text-to-Speech API. This plugin provides a seamless integration with Obsidian, enabling you to create audio files directly from selected text in your notes.

## Features

- Generate audio files from selected text in Obsidian
- Choose from a variety of voices provided by ElevenLabs
- Save generated audio files to a specified folder in your Obsidian vault
- Automatically attach generated audio files to your daily note (optional)
- Play generated audio directly in Obsidian

## Installation

1. Install the plugin from the Obsidian Community Plugins store.
2. After installation, the plugin will prompt you to enter your ElevenLabs API key, which you can obtain from the [ElevenLabs website](https://elevenlabs.io/).

## Usage

1. Select the text you want to convert to audio in any Obsidian note.
2. Use the `Read with Eleventy` command (available in the Command Palette or the Editor Menu)
3. Once the audio file is generated, it will be saved in the specified output folder, and the file will be played.
6. If the "Attach to Daily Note" option is enabled, the generated audio file will be automatically attached to your daily note.
7. The generated audio will also be played automatically in Obsidian.

## Settings

The plugin settings can be accessed from the Obsidian settings panel. You can configure the following options:

- **API Key**: Your ElevenLabs API key (required for the plugin to function).
- **Voice**: Select the default voice to use for audio generation.
- **Output Folder**: Specify the folder in your Obsidian vault where the generated audio files will be saved.
- **Attach to Daily Note**: Enable or disable the automatic attachment of generated audio files to your daily note.

## TODO

- [ ] Proper folder selection (export class FolderSuggest extends TextInputSuggest<TFolder>)
- [ ] Fix Daily note not being added
- [ ] Customize voice settings (stability and similarity boost)
- [ ] Play generated audio directly in Obsidian should be optional

## Contributions

Contributions to this plugin are welcome! If you encounter any issues or have suggestions for improvements, please open an issue or submit a pull request on the [GitHub repository](https://github.com/glebis/obsidian-elevenlabs-tts).

## License

This plugin is released under the [MIT License](https://opensource.org/licenses/MIT).