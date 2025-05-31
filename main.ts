import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, Platform} from 'obsidian';
import * as path from 'path';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
    claudeConfigPath: string; 
    uvPath: string | null;
    historyFolder: string | null;
    maxHistoryFiles: number;
}

const DefaultClaudeConfigPaths = {
    "macOS": '~/Library/Application Support/Claude/claude_desktop_config.json',
    "windows": '%APPDATA%\\Claude\\claude_desktop_config.json'
}


const DEFAULT_SETTINGS: MyPluginSettings = {
    claudeConfigPath:  getDefaultClaudeConfigPath(),
    uvPath: null,
    historyFolder: null,
    maxHistoryFiles: 100,    
    
}

interface LocalRestApiPlugin {
    settings: {
        port: number;
        apiKey: string;
    };
}


export function getDefaultClaudeConfigPath(): string {
    if (Platform.isMacOS) {
        return DefaultClaudeConfigPaths.macOS;
    } else if (Platform.isWin) {
        return DefaultClaudeConfigPaths.windows;
    } else {
        return ""
    }
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('dice', 'Sample Plugin', (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			new Notice('This is a notice!');
		});
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status Bar Text');

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-sample-modal-simple',
			name: 'Open sample modal (simple)',
			callback: () => {
				new SampleModal(this.app).open();
			}
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'sample-editor-command',
			name: 'Sample editor command',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection('Sample Editor Command');
			}
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-sample-modal-complex',
			name: 'Open sample modal (complex)',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SampleModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
    plugin: MyPlugin;
    private configTextArea: HTMLTextAreaElement;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private McpJsonConfig: any;

    constructor(app: App, plugin: MyPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    checkLocalRestApiInstallation(): boolean {
        const installedPlugins = this.app.plugins.plugins;
        return installedPlugins.hasOwnProperty('obsidian-local-rest-api');
    }

    getLocalRestApiCredentials(): { url: string | null; apiKey: string | null } {
        const localRestApiPlugin = this.app.plugins.getPlugin('obsidian-local-rest-api') as LocalRestApiPlugin | null;
        if (localRestApiPlugin && localRestApiPlugin.settings) {
            const url = `https://127.0.0.1:${localRestApiPlugin.settings.port}`;
            const apiKey = localRestApiPlugin.settings.apiKey;
            return { url, apiKey };
        }
        return { url: null, apiKey: null };
    }

    private _adjustTextAreaHeight(element: HTMLTextAreaElement): void {
        element.style.height = 'auto';
        element.style.height = `${element.scrollHeight}px`;
    }

    private _updateMcpJsonConfigDisplay(
        textArea: HTMLTextAreaElement,
        credentials: { url: string | null; apiKey: string | null }
    ): void {
        this.McpJsonConfig = {                        
            "yor-dev/mcp-obsidian": {
                "command": this.plugin.settings.uvPath ? this.plugin.settings.uvPath : "uv",
                "args": ["tool", 
                         "run", 
                         path.join(this.app.vault.adapter.basePath, 
                            this.plugin.manifest.dir,
                            "/python-packages/obsidian-mcp-server")
                        ],
                "env": {
                    "OBSIDIAN_API_KEY": credentials.apiKey,
                    "OBSIDIAN_HOST": credentials.url,
                    "OBSIDIAN_HISTORY_FOLDER": this.plugin.settings.historyFolder,
                    "OBSIDIAN_MAX_HISTORY_FILES": String(this.plugin.settings.maxHistoryFiles),
                }
            }
        };
        textArea.value = JSON.stringify(this.McpJsonConfig, null, 2);
        this._adjustTextAreaHeight(textArea);
    }

    private _buildHeader(containerEl: HTMLElement): void {
        const headerContainer = containerEl.createDiv({ cls: 'setting-header' });
        headerContainer.createEl('h2', { text: 'Obsidian MCP Server' });
        const reloadButton = headerContainer.createEl('button', { text: 'Reload this page', cls: 'reload-button' });
        reloadButton.addEventListener('click', () => {
            this.display();
        });
    }

    private _buildLocalRestApiStatus(containerEl: HTMLElement): void {
        containerEl.createEl('h2', { text: 'Local REST API Status' });
        const isLocalRestApiInstalled = this.checkLocalRestApiInstallation();
        const apiStatusContainer = containerEl.createDiv();

        if (isLocalRestApiInstalled) {
            apiStatusContainer.createEl('span', { text: 'Installed ', cls: 'success' }).innerHTML += '✅';
        } else {
            apiStatusContainer.createEl('span', { text: 'Not installed ', cls: 'error' }).innerHTML += '❌';
            apiStatusContainer.createEl('p', { text: 'The Obsidian Local REST API plugin is required for this plugin to function.' });
            new Setting(apiStatusContainer)
                .addButton(button => {
                    button.setButtonText('Install Local REST API')
                        .onClick(() => window.open('obsidian://show-plugin?id=obsidian-local-rest-api', '_blank'));
                });
        }
        apiStatusContainer.style.marginBottom = '15px';
    }

    private _buildLocalRestApiCredentials(containerEl: HTMLElement, credentials: { url: string | null; apiKey: string | null }): void {
        new Setting(containerEl)
            .setName('Local REST API URL')
            .setDesc('The URL of the Local REST API.')
            .addText(text => text.setDisabled(true).setValue(credentials.url || 'Not available'));

        new Setting(containerEl)
            .setName('Local REST API Key')
            .setDesc('The API Key for the Local REST API.')
            .addText(text => text.setDisabled(true).setValue(credentials.apiKey ? credentials.apiKey : 'Not available'));
    }

    private _buildPluginSettingsUI(containerEl: HTMLElement): void {
        containerEl.createEl('h2', { text: 'Plugin Settings' });
        new Setting(containerEl)
            .setName('History Folder')
            .setDesc('Folder to save file history. If not set, no history will be saved.')
            .addText(text => {
                text.setPlaceholder('e.g., mcp-history')
                    .setValue(this.plugin.settings.historyFolder || '')
                    .onChange(async (value) => {
                        const trimmedValue = value.trim();
                        const valueToSave = trimmedValue === '' ? null : trimmedValue;
                        this.plugin.settings.historyFolder = valueToSave;
                        await this.plugin.saveSettings();
                        if (this.configTextArea) {
                            this._updateMcpJsonConfigDisplay(
                                this.configTextArea,
                                this.getLocalRestApiCredentials()
                            );
                        }
                    });
                });


        new Setting(containerEl)
        .setName('Max History Files')
        .setDesc('Maximum number of history files to keep. Must be an integer greater than 0.')
        .addText(text => {
            text.setPlaceholder('e.g., 10')
                .setValue(this.plugin.settings.maxHistoryFiles.toString())
                .onChange(async (value) => {
                    const numValue = parseInt(value, 10); 

                    if (!isNaN(numValue) && numValue >= 0) {
                        this.plugin.settings.maxHistoryFiles = numValue;
                        await this.plugin.saveSettings();
                        this._updateMcpJsonConfigDisplay(
                            this.configTextArea,
                            this.getLocalRestApiCredentials()
                        );
                    } else {
                        new Notice('Please enter a valid integer greater than or equal to 0.');
                        text.setValue(this.plugin.settings.maxHistoryFiles.toString());
                    }
                });

            text.inputEl.type = 'number';
            text.inputEl.min = '1';
            text.inputEl.step = '1';
        });

    }

    private _buildClaudeConfigPathSetting(containerEl: HTMLElement): void {
        containerEl.createEl('h2', { text: 'Claude Desktop' });

        const setting = new Setting(containerEl)
            .setName('Claude Desktop Configuration File')
            .setDesc('Path to your claude_desktop_config.json file.');
    

        const textInput = setting.controlEl.createEl('input', { type: 'text' });
        textInput.style.flexGrow = '1'; // fully utilize the available space
        textInput.style.marginRight = '8px'; // space between input and button
    
        textInput.value = this.plugin.settings.claudeConfigPath;
    
        textInput.addEventListener('input', async (event) => {
            const value = (event.target as HTMLInputElement).value;
            this.plugin.settings.claudeConfigPath = value.trim();
            await this.plugin.saveSettings();
        });
    
        const resetButton = setting.controlEl.createEl('button', { text: 'Reset' });
        resetButton.type = 'button';
    
        resetButton.addEventListener('click', async () => {
            const defaultPath = getDefaultClaudeConfigPath();
            textInput.value = defaultPath;
            this.plugin.settings.claudeConfigPath = defaultPath;
            await this.plugin.saveSettings();
            new Notice('Path has been reset to default.');
        });

        
        const defaultPathSetting = new Setting(containerEl)
        defaultPathSetting.setName('claude_desktop_config.json typical locations');
        const defaultPathsInfoContainer = defaultPathSetting.controlEl.createDiv();
        defaultPathsInfoContainer.style.color = 'var(--text-muted)'; // slightly lighter text color


        // macOS
        const macPathDiv = defaultPathsInfoContainer.createEl('div');
        macPathDiv.createEl('strong', { text: 'macOS: ' });
        macPathDiv.createEl('code', { text: DefaultClaudeConfigPaths["macOS"] });
        macPathDiv.style.fontSize = 'var(--font-ui-smaller)'; // smaller text size

        // Windows
        const winPathDiv = defaultPathsInfoContainer.createEl('div');
        winPathDiv.style.marginTop = 'var(--size-2-1)'; 
        winPathDiv.createEl('strong', { text: 'Windows: ' });
        winPathDiv.createEl('code', { text: DefaultClaudeConfigPaths["windows"]});
        winPathDiv.style.fontSize = 'var(--font-ui-smaller)'; // smaller text size


        // file update button
        this._buildUpdateClaudeDesktopConfigFile(containerEl);

    }

    private _buildMcpJsonConfigUI(containerEl: HTMLElement, credentials: { url: string | null; apiKey: string | null }): void {
        containerEl.createEl('h2', { text: 'JSON configuration of this MCP server' });        

        new Setting(containerEl)
            .setName('JSON Configuration')
            .setDesc('json configuration for MCP setting files.');
        
        this.configTextArea = containerEl.createEl('textarea');
        this.configTextArea.readOnly = true;
        this.configTextArea.style.width = '100%';
        this.configTextArea.style.whiteSpace = 'pre-wrap';
        this.configTextArea.style.overflowY = 'hidden';
        this.configTextArea.style.resize = 'none';
        this.configTextArea.style.marginBottom = '15px';        

        this._updateMcpJsonConfigDisplay(
            this.configTextArea,
            credentials
        );
    }

    private _buildUvPathSetting(containerEl: HTMLElement): void {
        containerEl.createEl('h2', { text: 'uv (Python Package Manager) Configuration' });
    
        const setting = new Setting(containerEl)
            .setName('uv Executable Path')
            .setDesc("Full path to the 'uv' executable. If empty, the plugin will try 'uv' from your system PATH (may not be reliable).");

        const div = containerEl.createDiv()

        div.createEl('a', {
                href: 'https://github.com/astral-sh/uv#installation',
                text: 'Install uv (Official Guide)'
            });
    
        // 警告メッセージを表示するための要素を、Settingコントロールの外（下）に配置
        // このコンテナはSetting項目自体とは別のdivとして作成
        const warningMessageEl = containerEl.createDiv(); 
        warningMessageEl.addClass('setting-item-description'); // 説明文のようなスタイルを借用
        warningMessageEl.style.color = 'var(--text-error)'; // エラー/警告色
        warningMessageEl.style.fontSize = 'var(--font-ui-smaller)';
        warningMessageEl.style.paddingLeft = 'var(--size-4-8)'; // SettingのName/Descのインデントに合わせる（任意）
        warningMessageEl.style.marginTop = 'var(--size-2-1)'; // 少し上にマージン
    
    
        // テキスト入力フィールド
        setting.addText(text => {
            text.setPlaceholder('e.g., /usr/local/bin/uv  OR  C:\\path\\to\\uv.exe')
                .setValue(this.plugin.settings.uvPath || '')
                .onChange(async (value) => {
                    const newPath = value.trim();
                    this.plugin.settings.uvPath = newPath;
                    await this.plugin.saveSettings();
                    this._updateUvPathWarningDisplay(warningMessageEl, newPath); // 警告表示を更新
                        this._updateMcpJsonConfigDisplay(
                            this.configTextArea,
                            this.getLocalRestApiCredentials()
                        );
                });
        });
    
        // 初期表示時の警告更新
        this._updateUvPathWarningDisplay(warningMessageEl, this.plugin.settings.uvPath || '');
    }
    
    // helper method to update the warning message on uv
    private _updateUvPathWarningDisplay(warningElement: HTMLElement, currentUvPath: string): void {
        if (currentUvPath === '') {
            warningElement.setText('⚠️ The path to "uv" is not set. uv is required to run the MCP server.');
            warningElement.style.display = 'block'; // 表示
        } else {
            warningElement.setText(''); // 警告をクリア
            warningElement.style.display = 'none';  // 非表示
        }
    }

    private _buildUpdateClaudeDesktopConfigFile(containerEl: HTMLElement): void {
        const setting = new Setting(containerEl)
            .setName('Update the Configuration File')
            .setDesc('Update the configuration json file with the current "JSON Configuration" (shown above) to the path specified in "Claude Desktop Config Path". This will overwrite the file or create it if it doesn\'t exist.');

        setting.addButton(button => {
            button.setButtonText("Update JSON")
                .setTooltip("Writes the current JSON configuration to the specified file.")
                .onClick(async () => {
                    let filePath = this.plugin.settings.claudeConfigPath;

                    if (!filePath || filePath.trim() === '') {
                        new Notice('Error: "Claude Desktop Config Path" is not set. Please specify the path first.');
                        return;
                    }

                    if (!this.McpJsonConfig || Object.keys(this.McpJsonConfig).length === 0) {
                        new Notice('Error: There is no configuration data.');
                        return;
                    }

                    if (filePath && (filePath.startsWith('~/') || filePath.startsWith('~\\'))) {
                        try {
                            // @ts-ignore - ESLint/TSの警告を抑制する場合
                            const os = require('os'); 
                            // @ts-ignore
                            const nodePath = require('path');
                            const homedir = os.homedir();
                    
                            if (homedir) {
                                // '~/' または '~\\' の2文字（または1文字）を除去して結合
                                filePath = nodePath.join(homedir, filePath.substring(filePath.startsWith('~/') ? 2 : 1));
                            } else {
                                console.warn('Could not determine home directory for tilde expansion.');
                                new Notice('Could not expand "~" to home directory automatically.');
                            }
                        } catch (error) {
                            console.error('Error during tilde expansion (os or path module might not be available):', error);
                            new Notice('Error during tilde expansion. Please use an absolute path.');
                        }
                    }

                    
                    try {
                        // @ts-ignore - Node.jsモジュールをレンダラプロセスで利用する前提
                        const fs = require('fs');
                        // @ts-ignore
                        const nodePath = require('path');
    
                        const dirPath = nodePath.dirname(filePath);

                        // 親ディレクトリが存在しない場合は再帰的に作成
                        if (!fs.existsSync(dirPath)) {
                            new Notice(`Creating directory: ${dirPath}`);
                            fs.mkdirSync(dirPath, { recursive: true });

                        }

                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        let fileConfig: any = {}; // ファイル全体の現在の内容または新規作成用

                        // 既存ファイルを読み込む (存在すれば)
                        if (fs.existsSync(filePath)) {
                            try {
                                const fileContent = fs.readFileSync(filePath, 'utf-8');
                                fileConfig = JSON.parse(fileContent);
                                // fileConfigがオブジェクトでない場合は初期化（不正なJSONだった場合など）
                                if (typeof fileConfig !== 'object' || fileConfig === null) {
                                    new Notice(`Warning: Existing file at "${filePath}" was not valid JSON. It cannnot be updated`, 5000);
                                    return;
                                }
                            } catch (readError) {
                                new Notice(`Error reading existing config file. A new file structure will be created. Check console for details.`, 7000);
                                fileConfig = {};
                            }
                        }                        

                        // if "mcpServers" not exist on the top-level, create it
                        if (typeof fileConfig.mcpServers !== 'object' || fileConfig.mcpServers === null) {
                            fileConfig.mcpServers = {};
                        }

                        fileConfig.mcpServers["yor-dev/mcp-obsidian"] = this.McpJsonConfig["yor-dev/mcp-obsidian"];
                    
                        // 更新された設定オブジェクト全体をファイルに書き込み
                        fs.writeFileSync(filePath, JSON.stringify(fileConfig, null, 2), 'utf-8');
                        new Notice(`"yor-dev/mcp-obsidian" configuration successfully updated in: ${filePath}`);

                    } catch (error) {
                        console.error("Error writing configuration to file:", error);
                        new Notice(`Failed to save configuration to "${filePath}". Check console for details. Ensure the path is valid and writable.`, 10000);
                    }
                });
        });


    }

    

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        this._buildHeader(containerEl);
        
        this._buildUvPathSetting(containerEl);
        
        this._buildLocalRestApiStatus(containerEl);
        const localRestApiCredentials = this.getLocalRestApiCredentials();
        this._buildLocalRestApiCredentials(containerEl, localRestApiCredentials);
        
        this._buildPluginSettingsUI(containerEl);

        this._buildMcpJsonConfigUI(containerEl, localRestApiCredentials);

        this._buildClaudeConfigPathSetting(containerEl);
        
        
        
    }
}