# TODO List for ElevenLabs TTS Plugin

- [ ] If the folder is root (/), file is not inserted into note
- [x] Implement proper folder selection (Completed: Using FolderSuggestModal)
- [ ] Create more flexible config for adding audio file
- [x] Allow customization of voice settings (stability and similarity boost)
- [ ] Make playing generated audio directly in Obsidian optional
- [ ] Add check to ensure response is actually an audio file and output error message instead of storing it as a file
- [x] Implement more readable filename (Completed: Using date and beginning of text)
- [ ] Add option to customize audio file naming format
- [ ] Implement error handling for API rate limits and quota exceeded
- [x] Allow selection of multiple voices: Primary, Secondary, Tertiary (default to Primary)

## Multi-Voice Text-to-Speech Feature

- [ ] Implement a new menu item for multi-voice text-to-speech conversion
  - [ ] Add a new command in the plugin's `onload` method
  - [ ] Create a new modal for initiating the multi-voice conversion process
- [ ] Develop a text parsing function to separate content based on Markdown elements
  - [ ] Identify regular text, headers, quotes, code blocks, and callouts
  - [ ] Create a data structure to store text segments with their corresponding voice type
- [ ] Implement a function to generate audio for each text segment
  - [ ] Use primary voice for regular text
  - [ ] Use secondary voice for Markdown headers
  - [ ] Use tertiary voice for quotes, code blocks, and callouts
- [ ] Create a function to merge multiple audio files
  - [ ] Use a library like ffmpeg.wasm for audio processing
  - [ ] Ensure proper ordering of audio segments
- [ ] Implement temporary file management
  - [ ] Create a temporary directory for storing individual audio files
  - [ ] Implement a cleanup function to delete temporary files after merging
- [ ] Add error handling and progress feedback
  - [ ] Display progress notifications for long-running processes
  - [ ] Implement proper error handling for API calls and file operations
- [ ] Update the settings tab to include options for the multi-voice feature
  - [ ] Add toggles for enabling/disabling specific Markdown element voice assignments
- [ ] Create a user guide or documentation for the new feature
- [ ] Implement a caching mechanism to avoid regenerating unchanged sections
- [ ] Add an option to export the multi-voice audio file without attaching it to a note
