export abstract class Plugin {
  app: App;
  manifest: any;

  constructor(app: App, manifest: any) {
    this.app = app;
    this.manifest = manifest;
  }

  abstract onload(): Promise<void>;
  abstract onunload(): Promise<void>;

  loadData(): Promise<any> { return Promise.resolve({}); }
  saveData(data: any): Promise<void> { return Promise.resolve(); }
}

export class App {
  vault = {
    adapter: {
      writeBinary: jest.fn(),
      read: jest.fn(),
      modify: jest.fn(),
    },
  };
  workspace = {
    getActiveFile: jest.fn(),
  };
}

export class Notice {
  constructor(message: string) {
    console.log('Notice:', message);
  }
}

export class Setting {
  setName() { return this; }
  setDesc() { return this; }
  addText() { return this; }
  addDropdown() { return this; }
  addToggle() { return this; }
}

export class Editor {
  getSelection() { return ''; }
}

export class MarkdownView {}

export class TFile {}

export class PluginSettingTab {
  constructor(app: App, plugin: Plugin) {}
  display(): void {}
}