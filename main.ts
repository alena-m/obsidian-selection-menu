import { Plugin, Editor, MarkdownView, TFile, Notice, Modal, Setting, PluginSettingTab, App, Component, HoverPopover, Menu, requestUrl } from 'obsidian';

interface CustomPrompt {
    id: string;
    name: string;
    prompt: string;
    provider: 'openai' | 'anthropic' | 'ollama';
    apiKey: string;
    model: string;
}

interface SelectionMenuSettings {
    canvasFolder: string;
    nodeWidth: number;
    nodeHeight: number;
    autoCreateCanvas: boolean;
    customPrompts: CustomPrompt[];
    ollamaUrl: string;
    shortcut: string;
}

const DEFAULT_SETTINGS: SelectionMenuSettings = {
    canvasFolder: 'Canvas',
    nodeWidth: 250,
    nodeHeight: 150,
    autoCreateCanvas: true,
    customPrompts: [
        {
            id: '1',
            name: 'Summarize',
            prompt: 'Please summarize the following text: {selected_text}',
            provider: 'openai',
            apiKey: '',
            model: 'gpt-3.5-turbo'
        },
        {
            id: '2',
            name: 'Explain',
            prompt: 'Please explain the following text in simple terms: {selected_text}',
            provider: 'anthropic',
            apiKey: '',
            model: 'claude-3-haiku-20240307'
        }
    ],
    ollamaUrl: 'http://localhost:11434',
    shortcut: 'Ctrl+Shift+S'
}

interface CanvasNode {
    id: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    text?: string;
    label?: string;
}

interface CanvasData {
    nodes: CanvasNode[];
    edges: any[];
}

class LLMResponseModal extends Modal {
    response: string;
    title: string;
    plugin: SelectionMenuPlugin;

    constructor(app: App, title: string, response: string, plugin: SelectionMenuPlugin) {
        super(app);
        this.title = title;
        this.response = response;
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        // Title
        contentEl.createEl('h2', { text: this.title });
        
        // Response content in a scrollable container
        const responseContainer = contentEl.createDiv('llm-response-container');
        responseContainer.style.cssText = `
            max-height: 400px;
            overflow-y: auto;
            padding: 12px;
            border: 1px solid var(--background-modifier-border);
            border-radius: 4px;
            background: var(--background-primary);
            margin: 12px 0;
            white-space: pre-wrap;
            font-family: var(--font-text);
            line-height: 1.5;
            user-select: text;
        `;
        responseContainer.textContent = this.response;
        
        // Copy and Add to Canvas buttons
        const buttonContainer = contentEl.createDiv();
        buttonContainer.style.cssText = 'display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px;';
        
        const copyButton = buttonContainer.createEl('button', { text: 'Copy to Clipboard' });
        copyButton.className = 'mod-cta';
        copyButton.onclick = () => {
            navigator.clipboard.writeText(this.response);
            new Notice('Response copied to clipboard');
        };
        
        const addToCanvasButton = buttonContainer.createEl('button', { text: 'Add to Canvas' });
        addToCanvasButton.onclick = async () => {
            await this.plugin.createCanvasNodeFromResponse(this.title, this.response);
            this.close();
        };
        
        const closeButton = buttonContainer.createEl('button', { text: 'Close' });
        closeButton.onclick = () => this.close();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export default class SelectionMenuPlugin extends Plugin {
    settings: SelectionMenuSettings;
    private selectionMenu: Menu | null = null;

    async onload() {
        await this.loadSettings();

        // Add settings tab
        this.addSettingTab(new SelectionMenuSettingTab(this.app, this));

        // Register keyboard shortcut for selection menu
        this.registerDomEvent(document, 'keydown', this.handleKeyboardShortcut.bind(this));
    }

    handleKeyboardShortcut(evt: KeyboardEvent) {
        if (this.isShortcutMatch(evt, this.settings.shortcut)) {
            evt.preventDefault();
            this.handleTextSelection(evt);
        }
    }

    isShortcutMatch(evt: KeyboardEvent, shortcut: string): boolean {
        const parts = shortcut.toLowerCase().split('+');
        const key = parts[parts.length - 1];
        const modifiers = parts.slice(0, -1);
        
        // Check if the pressed key matches
        if (evt.key.toLowerCase() !== key) {
            return false;
        }
        
        // Check modifiers
        const requiredCtrl = modifiers.includes('ctrl');
        const requiredShift = modifiers.includes('shift');
        const requiredAlt = modifiers.includes('alt');
        const requiredMeta = modifiers.includes('meta') || modifiers.includes('cmd');
        
        return evt.ctrlKey === requiredCtrl &&
               evt.shiftKey === requiredShift &&
               evt.altKey === requiredAlt &&
               evt.metaKey === requiredMeta;
    }

    handleTextSelection(evt: KeyboardEvent) {
        const selection = window.getSelection();
        if (!selection || selection.toString().trim().length === 0) {
            new Notice('No text selected');
            return;
        }

        // Check if we're in a markdown editor
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView || activeView.getMode() !== 'source') {
            new Notice('Selection menu only works in markdown source mode');
            return;
        }

        this.showSelectionMenu(evt, selection.toString().trim());
    }

    showSelectionMenu(evt: KeyboardEvent, selectedText: string) {
        this.hideSelectionMenu();

        const menu = new Menu();
        
        // Add to Canvas option
        menu.addItem((item) => {
            item.setTitle('Add to Canvas')
                .setIcon('layout-grid')
                .onClick(() => {
                    this.createCanvasNodeFromText(selectedText);
                });
        });

        // Add custom prompt options
        this.settings.customPrompts.forEach((prompt) => {
            menu.addItem((item) => {
                item.setTitle(prompt.name)
                    .setIcon('bot')
                    .onClick(() => {
                        this.runCustomPrompt(prompt, selectedText);
                    });
            });
        });

        // Position menu at cursor or center of selection
        const rect = window.getSelection()?.getRangeAt(0)?.getBoundingClientRect();
        if (rect) {
            menu.showAtPosition({ x: rect.left + rect.width / 2, y: rect.bottom + 10 });
        } else {
            // Fallback to center of screen
            menu.showAtPosition({ 
                x: window.innerWidth / 2, 
                y: window.innerHeight / 2 
            });
        }

        this.selectionMenu = menu;
    }

    hideSelectionMenu() {
        if (this.selectionMenu) {
            this.selectionMenu.hide();
            this.selectionMenu = null;
        }
    }

    async createCanvasNodeFromText(selectedText: string) {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView || !activeView.file) {
            new Notice('No active file');
            return;
        }

        try {
            // Generate unique ID for the node
            const nodeId = this.generateId();
            
            // Create or get canvas file
            const canvasFile = await this.getOrCreateCanvasFile(activeView.file);
            
            // Add node to canvas
            await this.addNodeToCanvas(canvasFile, nodeId, selectedText);
            
            new Notice(`Created canvas node in ${canvasFile.name}`);
        } catch (error) {
            new Notice(`Error creating canvas node: ${error.message}`);
        }
    }

    async createCanvasNodeFromResponse(promptName: string, response: string) {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView || !activeView.file) {
            new Notice('No active file');
            return;
        }

        try {
            // Generate unique ID for the node
            const nodeId = this.generateId();
            
            // Create or get canvas file
            const canvasFile = await this.getOrCreateCanvasFile(activeView.file);
            
            // Format the content with title and response
            const nodeContent = `${promptName}\n\n${response}`;
            
            // Add node to "AI response" group
            await this.addNodeToAIResponseGroup(canvasFile, nodeId, nodeContent);
            
            new Notice(`Added AI response to canvas in ${canvasFile.name}`);
        } catch (error) {
            new Notice(`Error creating canvas node: ${error.message}`);
        }
    }

    async runCustomPrompt(prompt: CustomPrompt, selectedText: string) {
        if (!prompt.apiKey && prompt.provider !== 'ollama') {
            new Notice(`No API key configured for ${prompt.provider}`);
            return;
        }

        const finalPrompt = prompt.prompt.replace('{selected_text}', selectedText);
        
        try {
            new Notice('Sending request to LLM...');
            const response = await this.callLLMAPI(prompt, finalPrompt);
            
            // Show response in modal
            const modal = new LLMResponseModal(this.app, prompt.name, response, this);
            modal.open();
            
        } catch (error) {
            new Notice(`Error calling LLM: ${error.message}`);
        }
    }

    async callLLMAPI(prompt: CustomPrompt, text: string): Promise<string> {
        switch (prompt.provider) {
            case 'openai':
                return this.callOpenAI(prompt, text);
            case 'anthropic':
                return this.callAnthropic(prompt, text);
            case 'ollama':
                return this.callOllama(prompt, text);
            default:
                throw new Error(`Unsupported provider: ${prompt.provider}`);
        }
    }

    async callOpenAI(prompt: CustomPrompt, text: string): Promise<string> {
        const response = await requestUrl({
            url: 'https://api.openai.com/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${prompt.apiKey}`
            },
            body: JSON.stringify({
                model: prompt.model,
                messages: [{ role: 'user', content: text }],
                max_tokens: 3000
            })
        });

        if (response.status !== 200) {
            throw new Error(`OpenAI API error: ${response.status}`);
        }

        return response.json.choices[0].message.content;
    }

    async callAnthropic(prompt: CustomPrompt, text: string): Promise<string> {
        const response = await requestUrl({
            url: 'https://api.anthropic.com/v1/messages',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': prompt.apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: prompt.model,
                max_tokens: 3000,
                messages: [{ role: 'user', content: text }]
            })
        });

        if (response.status !== 200) {
            throw new Error(`Anthropic API error: ${response.status}`);
        }

        return response.json.content[0].text;
    }

    async callOllama(prompt: CustomPrompt, text: string): Promise<string> {
        const response = await requestUrl({
            url: `${this.settings.ollamaUrl}/api/generate`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: prompt.model,
                prompt: text,
                stream: false
            })
        });

        if (response.status !== 200) {
            throw new Error(`Ollama API error: ${response.status}`);
        }

        return response.json.response;
    }

    async getOrCreateCanvasFile(sourceFile: TFile): Promise<TFile> {
        const canvasName = `${sourceFile.basename}.canvas`;
        const canvasPath = `${this.settings.canvasFolder}/${canvasName}`;
        
        // Create canvas folder if it doesn't exist
        if (!await this.app.vault.adapter.exists(this.settings.canvasFolder)) {
            await this.app.vault.createFolder(this.settings.canvasFolder);
        }
        
        let canvasFile = this.app.vault.getAbstractFileByPath(canvasPath) as TFile;
        
        if (!canvasFile) {
            if (this.settings.autoCreateCanvas) {
                const initialData: CanvasData = { nodes: [], edges: [] };
                canvasFile = await this.app.vault.create(canvasPath, JSON.stringify(initialData, null, 2));
            } else {
                throw new Error('Canvas file does not exist and auto-creation is disabled');
            }
        }
        
        return canvasFile;
    }

    async addNodeToAIResponseGroup(canvasFile: TFile, nodeId: string, text: string) {
        const content = await this.app.vault.read(canvasFile);
        let canvasData: CanvasData;
        
        try {
            canvasData = JSON.parse(content);
        } catch (error) {
            canvasData = { nodes: [], edges: [] };
        }
        
        if (!canvasData.nodes) {
            canvasData.nodes = [];
        }
        
        // Find or create the "AI response" group
        let aiResponseGroup = canvasData.nodes.find(node => 
            node.type === 'group' && node.label === 'AI response'
        );
        
        // Get all existing nodes that are not groups
        const existingNodes = canvasData.nodes.filter(node => node.type !== 'group');
        
        // Calculate bounds of existing content
        let contentBounds = this.calculateContentBounds(existingNodes);
        
        if (!aiResponseGroup) {
            // Create new "AI response" group at upper right relative to existing content
            const groupId = this.generateId();
            
            // Find the rightmost group or content to position relative to it
            const allGroups = canvasData.nodes.filter(node => node.type === 'group');
            let groupX = contentBounds.maxX + 100; // Default position
            
            // If there are existing groups, position to the right of the rightmost group
            if (allGroups.length > 0) {
                const rightmostGroup = allGroups.reduce((rightmost, group) => 
                    (group.x + group.width) > (rightmost.x + rightmost.width) ? group : rightmost
                );
                groupX = rightmostGroup.x + rightmostGroup.width + 100;
            }
            
            const groupY = contentBounds.minY; // Same top level as existing content
            
            aiResponseGroup = {
                id: groupId,
                type: 'group',
                x: groupX,
                y: groupY,
                width: this.settings.nodeWidth + 40, // Initial size with padding
                height: this.settings.nodeHeight + 40,
                label: 'AI response'
            };
            
            canvasData.nodes.push(aiResponseGroup);
        }
        
        // Find existing nodes within the AI response group
        const aiResponseNodes = canvasData.nodes.filter(node => 
            node.type === 'text' && this.isNodeInGroup(node, aiResponseGroup!)
        );
        
        // Calculate position for new node within the group
        const { x: nodeX, y: nodeY } = this.calculateNodePositionInGroup(aiResponseGroup, aiResponseNodes);
        
        const newNode: CanvasNode = {
            id: nodeId,
            type: 'text',
            x: nodeX,
            y: nodeY,
            width: this.settings.nodeWidth,
            height: this.settings.nodeHeight,
            text: text
        };
        
        canvasData.nodes.push(newNode);
        
        // Update group size to encompass all nodes within it
        this.updateGroupSize(aiResponseGroup, [...aiResponseNodes, newNode]);
        
        await this.app.vault.modify(canvasFile, JSON.stringify(canvasData, null, 2));
    }

    async addNodeToCanvas(canvasFile: TFile, nodeId: string, text: string) {
        const content = await this.app.vault.read(canvasFile);
        let canvasData: CanvasData;
        
        try {
            canvasData = JSON.parse(content);
        } catch (error) {
            canvasData = { nodes: [], edges: [] };
        }
        
        if (!canvasData.nodes) {
            canvasData.nodes = [];
        }
        
        // Find or create the "Quotes" group
        let quotesGroup = canvasData.nodes.find(node => 
            node.type === 'group' && node.label === 'Quotes'
        );
        
        // Get all existing nodes that are not groups
        const existingNodes = canvasData.nodes.filter(node => node.type !== 'group');
        const existingGroups = canvasData.nodes.filter(node => node.type === 'group');
        
        // Calculate bounds of existing content
        let contentBounds = this.calculateContentBounds(existingNodes);
        
        if (!quotesGroup) {
            // Create new "Quotes" group at upper right relative to existing content
            const groupId = this.generateId();
            const groupX = contentBounds.maxX + 100; // 100px gap from existing content
            const groupY = contentBounds.minY; // Same top level as existing content
            
            quotesGroup = {
                id: groupId,
                type: 'group',
                x: groupX,
                y: groupY,
                width: this.settings.nodeWidth + 40, // Initial size with padding
                height: this.settings.nodeHeight + 40,
                label: 'Quotes'
            };
            
            canvasData.nodes.push(quotesGroup);
        }
        
        // Find existing nodes within the quotes group
        const quotesNodes = canvasData.nodes.filter(node => 
            node.type === 'text' && this.isNodeInGroup(node, quotesGroup!)
        );
        
        // Calculate position for new node within the group
        const { x: nodeX, y: nodeY } = this.calculateNodePositionInGroup(quotesGroup, quotesNodes);
        
        const newNode: CanvasNode = {
            id: nodeId,
            type: 'text',
            x: nodeX,
            y: nodeY,
            width: this.settings.nodeWidth,
            height: this.settings.nodeHeight,
            text: text
        };
        
        canvasData.nodes.push(newNode);
        
        // Update group size to encompass all nodes within it
        this.updateGroupSize(quotesGroup, [...quotesNodes, newNode]);
        
        await this.app.vault.modify(canvasFile, JSON.stringify(canvasData, null, 2));
    }

    calculateContentBounds(nodes: CanvasNode[]) {
        if (nodes.length === 0) {
            return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
        }
        
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        for (const node of nodes) {
            minX = Math.min(minX, node.x);
            minY = Math.min(minY, node.y);
            maxX = Math.max(maxX, node.x + node.width);
            maxY = Math.max(maxY, node.y + node.height);
        }
        
        return { minX, minY, maxX, maxY };
    }

    isNodeInGroup(node: CanvasNode, group: CanvasNode): boolean {
        return node.x >= group.x && 
               node.y >= group.y && 
               node.x + node.width <= group.x + group.width && 
               node.y + node.height <= group.y + group.height;
    }

    calculateNodePositionInGroup(group: CanvasNode, existingNodes: CanvasNode[]) {
        const padding = 20;
        const nodeSpacing = 10;
        
        if (existingNodes.length === 0) {
            // First node in group
            return {
                x: group.x + padding,
                y: group.y + padding
            };
        }
        
        // Arrange nodes in a vertical stack within the group
        const lastNode = existingNodes[existingNodes.length - 1];
        return {
            x: group.x + padding,
            y: lastNode.y + lastNode.height + nodeSpacing
        };
    }

    updateGroupSize(group: CanvasNode, nodesInGroup: CanvasNode[]) {
        if (nodesInGroup.length === 0) {
            return;
        }
        
        const padding = 20;
        const bounds = this.calculateContentBounds(nodesInGroup);
        
        // Ensure group encompasses all nodes with padding
        const requiredWidth = (bounds.maxX - group.x) + padding;
        const requiredHeight = (bounds.maxY - group.y) + padding;
        
        group.width = Math.max(group.width, requiredWidth);
        group.height = Math.max(group.height, requiredHeight);
    }

    generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class SelectionMenuSettingTab extends PluginSettingTab {
    plugin: SelectionMenuPlugin;

    constructor(app: App, plugin: SelectionMenuPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        
        containerEl.createEl('h2', { text: 'Selection Menu Settings' });

        // Shortcut Settings
        containerEl.createEl('h3', { text: 'Shortcut Settings' });

        new Setting(containerEl)
            .setName('Selection menu shortcut')
            .setDesc('Keyboard shortcut to trigger the selection menu (e.g., Ctrl+Shift+S, Alt+M)')
            .addText(text => text
                .setPlaceholder('Ctrl+Shift+S')
                .setValue(this.plugin.settings.shortcut)
                .onChange(async (value) => {
                    this.plugin.settings.shortcut = value;
                    await this.plugin.saveSettings();
                }));

        // Canvas Settings
        containerEl.createEl('h3', { text: 'Canvas Settings' });

        new Setting(containerEl)
            .setName('Canvas folder')
            .setDesc('Folder where canvas files will be created')
            .addText(text => text
                .setPlaceholder('Canvas')
                .setValue(this.plugin.settings.canvasFolder)
                .onChange(async (value) => {
                    this.plugin.settings.canvasFolder = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Node width')
            .setDesc('Default width for created nodes')
            .addText(text => text
                .setPlaceholder('250')
                .setValue(this.plugin.settings.nodeWidth.toString())
                .onChange(async (value) => {
                    const numValue = parseInt(value);
                    if (!isNaN(numValue) && numValue > 0) {
                        this.plugin.settings.nodeWidth = numValue;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('Node height')
            .setDesc('Default height for created nodes')
            .addText(text => text
                .setPlaceholder('150')
                .setValue(this.plugin.settings.nodeHeight.toString())
                .onChange(async (value) => {
                    const numValue = parseInt(value);
                    if (!isNaN(numValue) && numValue > 0) {
                        this.plugin.settings.nodeHeight = numValue;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('Auto-create canvas')
            .setDesc('Automatically create canvas file if it doesn\'t exist')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoCreateCanvas)
                .onChange(async (value) => {
                    this.plugin.settings.autoCreateCanvas = value;
                    await this.plugin.saveSettings();
                }));

        // LLM Settings
        containerEl.createEl('h3', { text: 'LLM Settings' });

        new Setting(containerEl)
            .setName('Ollama URL')
            .setDesc('URL for local Ollama instance')
            .addText(text => text
                .setPlaceholder('http://localhost:11434')
                .setValue(this.plugin.settings.ollamaUrl)
                .onChange(async (value) => {
                    this.plugin.settings.ollamaUrl = value;
                    await this.plugin.saveSettings();
                }));

        // Custom Prompts
        containerEl.createEl('h3', { text: 'Custom Prompts' });
        
        const promptsContainer = containerEl.createDiv();
        this.displayPrompts(promptsContainer);

        // Add new prompt button
        new Setting(containerEl)
            .setName('Add new prompt')
            .setDesc('Add a new custom prompt (max 10)')
            .addButton(button => button
                .setButtonText('Add Prompt')
                .setDisabled(this.plugin.settings.customPrompts.length >= 10)
                .onClick(() => {
                    if (this.plugin.settings.customPrompts.length < 10) {
                        this.addNewPrompt();
                        this.display(); // Refresh the display
                    }
                }));
    }

    displayPrompts(container: HTMLElement) {
        container.empty();
        
        this.plugin.settings.customPrompts.forEach((prompt, index) => {
            const promptContainer = container.createDiv('prompt-setting');
            promptContainer.style.cssText = 'border: 1px solid var(--background-modifier-border); padding: 12px; margin: 8px 0; border-radius: 4px;';
            
            // Prompt name
            new Setting(promptContainer)
                .setName('Prompt name')
                .addText(text => text
                    .setValue(prompt.name)
                    .onChange(async (value) => {
                        this.plugin.settings.customPrompts[index].name = value;
                        await this.plugin.saveSettings();
                    }));

            // Provider selection
            new Setting(promptContainer)
                .setName('Provider')
                .addDropdown(dropdown => dropdown
                    .addOption('openai', 'OpenAI')
                    .addOption('anthropic', 'Anthropic')
                    .addOption('ollama', 'Ollama')
                    .setValue(prompt.provider)
                    .onChange(async (value: 'openai' | 'anthropic' | 'ollama') => {
                        this.plugin.settings.customPrompts[index].provider = value;
                        await this.plugin.saveSettings();
                        this.display(); // Refresh to show appropriate fields
                    }));

            // Model
            new Setting(promptContainer)
                .setName('Model')
                .addText(text => text
                    .setValue(prompt.model)
                    .onChange(async (value) => {
                        this.plugin.settings.customPrompts[index].model = value;
                        await this.plugin.saveSettings();
                    }));

            // API Key (not for Ollama)
            if (prompt.provider !== 'ollama') {
                new Setting(promptContainer)
                    .setName('API Key')
                    .addText(text => {
                        text.inputEl.type = 'password';
                        text.setValue(prompt.apiKey)
                            .onChange(async (value) => {
                                this.plugin.settings.customPrompts[index].apiKey = value;
                                await this.plugin.saveSettings();
                            });
                    });
            }

            // Prompt text
            new Setting(promptContainer)
                .setName('Prompt')
                .setDesc('Use {selected_text} as placeholder for the selected text')
                .addTextArea(text => text
                    .setValue(prompt.prompt)
                    .onChange(async (value) => {
                        this.plugin.settings.customPrompts[index].prompt = value;
                        await this.plugin.saveSettings();
                    }));

            // Controls
            const controlsContainer = promptContainer.createDiv();
            controlsContainer.style.cssText = 'display: flex; gap: 8px; margin-top: 12px;';

            // Move up
            if (index > 0) {
                const moveUpBtn = controlsContainer.createEl('button', { text: '↑' });
                moveUpBtn.onclick = () => {
                    this.movePrompt(index, index - 1);
                };
            }

            // Move down
            if (index < this.plugin.settings.customPrompts.length - 1) {
                const moveDownBtn = controlsContainer.createEl('button', { text: '↓' });
                moveDownBtn.onclick = () => {
                    this.movePrompt(index, index + 1);
                };
            }

            // Delete
            const deleteBtn = controlsContainer.createEl('button', { text: 'Delete' });
            deleteBtn.style.backgroundColor = 'var(--interactive-accent-danger)';
            deleteBtn.onclick = () => {
                this.deletePrompt(index);
            };
        });
    }

    addNewPrompt() {
        const newPrompt: CustomPrompt = {
            id: Date.now().toString(),
            name: 'New Prompt',
            prompt: 'Please process this text: {selected_text}',
            provider: 'openai',
            apiKey: '',
            model: 'gpt-3.5-turbo'
        };
        
        this.plugin.settings.customPrompts.push(newPrompt);
        this.plugin.saveSettings();
    }

    movePrompt(fromIndex: number, toIndex: number) {
        const prompts = this.plugin.settings.customPrompts;
        const [moved] = prompts.splice(fromIndex, 1);
        prompts.splice(toIndex, 0, moved);
        this.plugin.saveSettings();
        this.display();
    }

    deletePrompt(index: number) {
        this.plugin.settings.customPrompts.splice(index, 1);
        this.plugin.saveSettings();
        this.display();
    }
}