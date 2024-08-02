# TODO List for ElevenLabs TTS Plugin

- [ ] If the folder is root (/), file is not inserted into note
- [x] Implement proper folder selection (Completed: Using FolderSuggestModal)
- [ ] Create more flexible config for adding audio file
- [x] Allow customization of voice settings (stability and similarity boost)
- [x] Make playing generated audio directly in Obsidian optional
- [ ] Add check to ensure response is actually an audio file and output error message instead of storing it as a file
- [x] Implement more readable filename (Completed: Using date and beginning of text)
- [ ] Add option to customize audio file naming format
- [ ] Implement error handling for API rate limits and quota exceeded
- [x] Allow selection of multiple voices: Primary, Secondary, Tertiary (default to Primary)

## Multi-Voice Text-to-Speech Feature

- [x] Implement a new menu item for multi-voice text-to-speech conversion
  - [x] Add a new command in the plugin's `onload` method
  - [x] Create a new modal for initiating the multi-voice conversion process
- [x] Develop a text parsing function to separate content based on Markdown elements
  - [x] Identify regular text, headers, quotes, code blocks, and callouts
  - [x] Create a data structure to store text segments with their corresponding voice type
- [x] Implement a function to generate audio for each text segment
  - [x] Use primary voice for regular text
  - [x] Use secondary voice for Markdown headers
  - [x] Use tertiary voice for quotes, code blocks, and callouts
- [x] Create a function to merge multiple audio files
  - [x] Ensure proper ordering of audio segments
- [x] Add error handling and progress feedback
  - [x] Display progress notifications for long-running processes
  - [x] Implement proper error handling for API calls and file operations
- [x] Update the settings tab to include options for the multi-voice feature
  - [x] Add toggles for enabling/disabling specific Markdown element voice assignments
- [x] Create a user guide or documentation for the new feature
- [ ] Implement a caching mechanism to avoid regenerating unchanged sections
- [ ] Add an option to export the multi-voice audio file without attaching it to a note
- [ ] Create roleplay functionality for playwright-style conversations with configurable voice assignments
