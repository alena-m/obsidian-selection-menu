var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => SelectionMenuPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  canvasFolder: "Canvas",
  nodeWidth: 250,
  nodeHeight: 150,
  autoCreateCanvas: true,
  customPrompts: [
    {
      id: "1",
      name: "Summarize",
      prompt: "Please summarize the following text: {selected_text}",
      provider: "openai",
      apiKey: "",
      model: "gpt-3.5-turbo"
    },
    {
      id: "2",
      name: "Explain",
      prompt: "Please explain the following text in simple terms: {selected_text}",
      provider: "anthropic",
      apiKey: "",
      model: "claude-3-haiku-20240307"
    }
  ],
  ollamaUrl: "http://localhost:11434",
  shortcut: "Ctrl+Shift+S"
};
var LLMResponseModal = class extends import_obsidian.Modal {
  constructor(app, title, response, plugin) {
    super(app);
    this.title = title;
    this.response = response;
    this.plugin = plugin;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.title });
    const responseContainer = contentEl.createDiv("llm-response-container");
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
    const buttonContainer = contentEl.createDiv();
    buttonContainer.style.cssText = "display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px;";
    const copyButton = buttonContainer.createEl("button", { text: "Copy to Clipboard" });
    copyButton.className = "mod-cta";
    copyButton.onclick = () => {
      navigator.clipboard.writeText(this.response);
      new import_obsidian.Notice("Response copied to clipboard");
    };
    const addToCanvasButton = buttonContainer.createEl("button", { text: "Add to Canvas" });
    addToCanvasButton.onclick = () => __async(this, null, function* () {
      yield this.plugin.createCanvasNodeFromResponse(this.title, this.response);
      this.close();
    });
    const closeButton = buttonContainer.createEl("button", { text: "Close" });
    closeButton.onclick = () => this.close();
  }
  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
};
var SelectionMenuPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.selectionMenu = null;
  }
  onload() {
    return __async(this, null, function* () {
      yield this.loadSettings();
      this.addSettingTab(new SelectionMenuSettingTab(this.app, this));
      this.registerDomEvent(document, "keydown", this.handleKeyboardShortcut.bind(this));
    });
  }
  handleKeyboardShortcut(evt) {
    if (this.isShortcutMatch(evt, this.settings.shortcut)) {
      evt.preventDefault();
      this.handleTextSelection(evt);
    }
  }
  isShortcutMatch(evt, shortcut) {
    const parts = shortcut.toLowerCase().split("+");
    const key = parts[parts.length - 1];
    const modifiers = parts.slice(0, -1);
    if (evt.key.toLowerCase() !== key) {
      return false;
    }
    const requiredCtrl = modifiers.includes("ctrl");
    const requiredShift = modifiers.includes("shift");
    const requiredAlt = modifiers.includes("alt");
    const requiredMeta = modifiers.includes("meta") || modifiers.includes("cmd");
    return evt.ctrlKey === requiredCtrl && evt.shiftKey === requiredShift && evt.altKey === requiredAlt && evt.metaKey === requiredMeta;
  }
  handleTextSelection(evt) {
    const selection = window.getSelection();
    if (!selection || selection.toString().trim().length === 0) {
      new import_obsidian.Notice("No text selected");
      return;
    }
    const activeView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    if (!activeView || activeView.getMode() !== "source") {
      new import_obsidian.Notice("Selection menu only works in markdown source mode");
      return;
    }
    this.showSelectionMenu(evt, selection.toString().trim());
  }
  showSelectionMenu(evt, selectedText) {
    var _a, _b;
    this.hideSelectionMenu();
    const menu = new import_obsidian.Menu();
    menu.addItem((item) => {
      item.setTitle("Add to Canvas").setIcon("layout-grid").onClick(() => {
        this.createCanvasNodeFromText(selectedText);
      });
    });
    this.settings.customPrompts.forEach((prompt) => {
      menu.addItem((item) => {
        item.setTitle(prompt.name).setIcon("bot").onClick(() => {
          this.runCustomPrompt(prompt, selectedText);
        });
      });
    });
    const rect = (_b = (_a = window.getSelection()) == null ? void 0 : _a.getRangeAt(0)) == null ? void 0 : _b.getBoundingClientRect();
    if (rect) {
      menu.showAtPosition({ x: rect.left + rect.width / 2, y: rect.bottom + 10 });
    } else {
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
  createCanvasNodeFromText(selectedText) {
    return __async(this, null, function* () {
      const activeView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
      if (!activeView || !activeView.file) {
        new import_obsidian.Notice("No active file");
        return;
      }
      try {
        const nodeId = this.generateId();
        const canvasFile = yield this.getOrCreateCanvasFile(activeView.file);
        yield this.addNodeToCanvas(canvasFile, nodeId, selectedText);
        new import_obsidian.Notice(`Created canvas node in ${canvasFile.name}`);
      } catch (error) {
        new import_obsidian.Notice(`Error creating canvas node: ${error.message}`);
      }
    });
  }
  createCanvasNodeFromResponse(promptName, response) {
    return __async(this, null, function* () {
      const activeView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
      if (!activeView || !activeView.file) {
        new import_obsidian.Notice("No active file");
        return;
      }
      try {
        const nodeId = this.generateId();
        const canvasFile = yield this.getOrCreateCanvasFile(activeView.file);
        const nodeContent = `${promptName}

${response}`;
        yield this.addNodeToAIResponseGroup(canvasFile, nodeId, nodeContent);
        new import_obsidian.Notice(`Added AI response to canvas in ${canvasFile.name}`);
      } catch (error) {
        new import_obsidian.Notice(`Error creating canvas node: ${error.message}`);
      }
    });
  }
  runCustomPrompt(prompt, selectedText) {
    return __async(this, null, function* () {
      if (!prompt.apiKey && prompt.provider !== "ollama") {
        new import_obsidian.Notice(`No API key configured for ${prompt.provider}`);
        return;
      }
      const finalPrompt = prompt.prompt.replace("{selected_text}", selectedText);
      try {
        new import_obsidian.Notice("Sending request to LLM...");
        const response = yield this.callLLMAPI(prompt, finalPrompt);
        const modal = new LLMResponseModal(this.app, prompt.name, response, this);
        modal.open();
      } catch (error) {
        new import_obsidian.Notice(`Error calling LLM: ${error.message}`);
      }
    });
  }
  callLLMAPI(prompt, text) {
    return __async(this, null, function* () {
      switch (prompt.provider) {
        case "openai":
          return this.callOpenAI(prompt, text);
        case "anthropic":
          return this.callAnthropic(prompt, text);
        case "ollama":
          return this.callOllama(prompt, text);
        default:
          throw new Error(`Unsupported provider: ${prompt.provider}`);
      }
    });
  }
  callOpenAI(prompt, text) {
    return __async(this, null, function* () {
      const response = yield (0, import_obsidian.requestUrl)({
        url: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${prompt.apiKey}`
        },
        body: JSON.stringify({
          model: prompt.model,
          messages: [{ role: "user", content: text }],
          max_tokens: 3e3
        })
      });
      if (response.status !== 200) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }
      return response.json.choices[0].message.content;
    });
  }
  callAnthropic(prompt, text) {
    return __async(this, null, function* () {
      const response = yield (0, import_obsidian.requestUrl)({
        url: "https://api.anthropic.com/v1/messages",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": prompt.apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: prompt.model,
          max_tokens: 3e3,
          messages: [{ role: "user", content: text }]
        })
      });
      if (response.status !== 200) {
        throw new Error(`Anthropic API error: ${response.status}`);
      }
      return response.json.content[0].text;
    });
  }
  callOllama(prompt, text) {
    return __async(this, null, function* () {
      const response = yield (0, import_obsidian.requestUrl)({
        url: `${this.settings.ollamaUrl}/api/generate`,
        method: "POST",
        headers: {
          "Content-Type": "application/json"
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
    });
  }
  getOrCreateCanvasFile(sourceFile) {
    return __async(this, null, function* () {
      const canvasName = `${sourceFile.basename}.canvas`;
      const canvasPath = `${this.settings.canvasFolder}/${canvasName}`;
      if (!(yield this.app.vault.adapter.exists(this.settings.canvasFolder))) {
        yield this.app.vault.createFolder(this.settings.canvasFolder);
      }
      let canvasFile = this.app.vault.getAbstractFileByPath(canvasPath);
      if (!canvasFile) {
        if (this.settings.autoCreateCanvas) {
          const initialData = { nodes: [], edges: [] };
          canvasFile = yield this.app.vault.create(canvasPath, JSON.stringify(initialData, null, 2));
        } else {
          throw new Error("Canvas file does not exist and auto-creation is disabled");
        }
      }
      return canvasFile;
    });
  }
  addNodeToAIResponseGroup(canvasFile, nodeId, text) {
    return __async(this, null, function* () {
      const content = yield this.app.vault.read(canvasFile);
      let canvasData;
      try {
        canvasData = JSON.parse(content);
      } catch (error) {
        canvasData = { nodes: [], edges: [] };
      }
      if (!canvasData.nodes) {
        canvasData.nodes = [];
      }
      let aiResponseGroup = canvasData.nodes.find(
        (node) => node.type === "group" && node.label === "AI response"
      );
      const existingNodes = canvasData.nodes.filter((node) => node.type !== "group");
      let contentBounds = this.calculateContentBounds(existingNodes);
      if (!aiResponseGroup) {
        const groupId = this.generateId();
        const allGroups = canvasData.nodes.filter((node) => node.type === "group");
        let groupX = contentBounds.maxX + 100;
        if (allGroups.length > 0) {
          const rightmostGroup = allGroups.reduce(
            (rightmost, group) => group.x + group.width > rightmost.x + rightmost.width ? group : rightmost
          );
          groupX = rightmostGroup.x + rightmostGroup.width + 100;
        }
        const groupY = contentBounds.minY;
        aiResponseGroup = {
          id: groupId,
          type: "group",
          x: groupX,
          y: groupY,
          width: this.settings.nodeWidth + 40,
          // Initial size with padding
          height: this.settings.nodeHeight + 40,
          label: "AI response"
        };
        canvasData.nodes.push(aiResponseGroup);
      }
      const aiResponseNodes = canvasData.nodes.filter(
        (node) => node.type === "text" && this.isNodeInGroup(node, aiResponseGroup)
      );
      const { x: nodeX, y: nodeY } = this.calculateNodePositionInGroup(aiResponseGroup, aiResponseNodes);
      const newNode = {
        id: nodeId,
        type: "text",
        x: nodeX,
        y: nodeY,
        width: this.settings.nodeWidth,
        height: this.settings.nodeHeight,
        text
      };
      canvasData.nodes.push(newNode);
      this.updateGroupSize(aiResponseGroup, [...aiResponseNodes, newNode]);
      yield this.app.vault.modify(canvasFile, JSON.stringify(canvasData, null, 2));
    });
  }
  addNodeToCanvas(canvasFile, nodeId, text) {
    return __async(this, null, function* () {
      const content = yield this.app.vault.read(canvasFile);
      let canvasData;
      try {
        canvasData = JSON.parse(content);
      } catch (error) {
        canvasData = { nodes: [], edges: [] };
      }
      if (!canvasData.nodes) {
        canvasData.nodes = [];
      }
      let quotesGroup = canvasData.nodes.find(
        (node) => node.type === "group" && node.label === "Quotes"
      );
      const existingNodes = canvasData.nodes.filter((node) => node.type !== "group");
      const existingGroups = canvasData.nodes.filter((node) => node.type === "group");
      let contentBounds = this.calculateContentBounds(existingNodes);
      if (!quotesGroup) {
        const groupId = this.generateId();
        const groupX = contentBounds.maxX + 100;
        const groupY = contentBounds.minY;
        quotesGroup = {
          id: groupId,
          type: "group",
          x: groupX,
          y: groupY,
          width: this.settings.nodeWidth + 40,
          // Initial size with padding
          height: this.settings.nodeHeight + 40,
          label: "Quotes"
        };
        canvasData.nodes.push(quotesGroup);
      }
      const quotesNodes = canvasData.nodes.filter(
        (node) => node.type === "text" && this.isNodeInGroup(node, quotesGroup)
      );
      const { x: nodeX, y: nodeY } = this.calculateNodePositionInGroup(quotesGroup, quotesNodes);
      const newNode = {
        id: nodeId,
        type: "text",
        x: nodeX,
        y: nodeY,
        width: this.settings.nodeWidth,
        height: this.settings.nodeHeight,
        text
      };
      canvasData.nodes.push(newNode);
      this.updateGroupSize(quotesGroup, [...quotesNodes, newNode]);
      yield this.app.vault.modify(canvasFile, JSON.stringify(canvasData, null, 2));
    });
  }
  calculateContentBounds(nodes) {
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
  isNodeInGroup(node, group) {
    return node.x >= group.x && node.y >= group.y && node.x + node.width <= group.x + group.width && node.y + node.height <= group.y + group.height;
  }
  calculateNodePositionInGroup(group, existingNodes) {
    const padding = 20;
    const nodeSpacing = 10;
    if (existingNodes.length === 0) {
      return {
        x: group.x + padding,
        y: group.y + padding
      };
    }
    const lastNode = existingNodes[existingNodes.length - 1];
    return {
      x: group.x + padding,
      y: lastNode.y + lastNode.height + nodeSpacing
    };
  }
  updateGroupSize(group, nodesInGroup) {
    if (nodesInGroup.length === 0) {
      return;
    }
    const padding = 20;
    const bounds = this.calculateContentBounds(nodesInGroup);
    const requiredWidth = bounds.maxX - group.x + padding;
    const requiredHeight = bounds.maxY - group.y + padding;
    group.width = Math.max(group.width, requiredWidth);
    group.height = Math.max(group.height, requiredHeight);
  }
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
  loadSettings() {
    return __async(this, null, function* () {
      this.settings = Object.assign({}, DEFAULT_SETTINGS, yield this.loadData());
    });
  }
  saveSettings() {
    return __async(this, null, function* () {
      yield this.saveData(this.settings);
    });
  }
};
var SelectionMenuSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Selection Menu Settings" });
    containerEl.createEl("h3", { text: "Shortcut Settings" });
    new import_obsidian.Setting(containerEl).setName("Selection menu shortcut").setDesc("Keyboard shortcut to trigger the selection menu (e.g., Ctrl+Shift+S, Alt+M)").addText((text) => text.setPlaceholder("Ctrl+Shift+S").setValue(this.plugin.settings.shortcut).onChange((value) => __async(this, null, function* () {
      this.plugin.settings.shortcut = value;
      yield this.plugin.saveSettings();
    })));
    containerEl.createEl("h3", { text: "Canvas Settings" });
    new import_obsidian.Setting(containerEl).setName("Canvas folder").setDesc("Folder where canvas files will be created").addText((text) => text.setPlaceholder("Canvas").setValue(this.plugin.settings.canvasFolder).onChange((value) => __async(this, null, function* () {
      this.plugin.settings.canvasFolder = value;
      yield this.plugin.saveSettings();
    })));
    new import_obsidian.Setting(containerEl).setName("Node width").setDesc("Default width for created nodes").addText((text) => text.setPlaceholder("250").setValue(this.plugin.settings.nodeWidth.toString()).onChange((value) => __async(this, null, function* () {
      const numValue = parseInt(value);
      if (!isNaN(numValue) && numValue > 0) {
        this.plugin.settings.nodeWidth = numValue;
        yield this.plugin.saveSettings();
      }
    })));
    new import_obsidian.Setting(containerEl).setName("Node height").setDesc("Default height for created nodes").addText((text) => text.setPlaceholder("150").setValue(this.plugin.settings.nodeHeight.toString()).onChange((value) => __async(this, null, function* () {
      const numValue = parseInt(value);
      if (!isNaN(numValue) && numValue > 0) {
        this.plugin.settings.nodeHeight = numValue;
        yield this.plugin.saveSettings();
      }
    })));
    new import_obsidian.Setting(containerEl).setName("Auto-create canvas").setDesc("Automatically create canvas file if it doesn't exist").addToggle((toggle) => toggle.setValue(this.plugin.settings.autoCreateCanvas).onChange((value) => __async(this, null, function* () {
      this.plugin.settings.autoCreateCanvas = value;
      yield this.plugin.saveSettings();
    })));
    containerEl.createEl("h3", { text: "LLM Settings" });
    new import_obsidian.Setting(containerEl).setName("Ollama URL").setDesc("URL for local Ollama instance").addText((text) => text.setPlaceholder("http://localhost:11434").setValue(this.plugin.settings.ollamaUrl).onChange((value) => __async(this, null, function* () {
      this.plugin.settings.ollamaUrl = value;
      yield this.plugin.saveSettings();
    })));
    containerEl.createEl("h3", { text: "Custom Prompts" });
    const promptsContainer = containerEl.createDiv();
    this.displayPrompts(promptsContainer);
    new import_obsidian.Setting(containerEl).setName("Add new prompt").setDesc("Add a new custom prompt (max 10)").addButton((button) => button.setButtonText("Add Prompt").setDisabled(this.plugin.settings.customPrompts.length >= 10).onClick(() => {
      if (this.plugin.settings.customPrompts.length < 10) {
        this.addNewPrompt();
        this.display();
      }
    }));
  }
  displayPrompts(container) {
    container.empty();
    this.plugin.settings.customPrompts.forEach((prompt, index) => {
      const promptContainer = container.createDiv("prompt-setting");
      promptContainer.style.cssText = "border: 1px solid var(--background-modifier-border); padding: 12px; margin: 8px 0; border-radius: 4px;";
      new import_obsidian.Setting(promptContainer).setName("Prompt name").addText((text) => text.setValue(prompt.name).onChange((value) => __async(this, null, function* () {
        this.plugin.settings.customPrompts[index].name = value;
        yield this.plugin.saveSettings();
      })));
      new import_obsidian.Setting(promptContainer).setName("Provider").addDropdown((dropdown) => dropdown.addOption("openai", "OpenAI").addOption("anthropic", "Anthropic").addOption("ollama", "Ollama").setValue(prompt.provider).onChange((value) => __async(this, null, function* () {
        this.plugin.settings.customPrompts[index].provider = value;
        yield this.plugin.saveSettings();
        this.display();
      })));
      new import_obsidian.Setting(promptContainer).setName("Model").addText((text) => text.setValue(prompt.model).onChange((value) => __async(this, null, function* () {
        this.plugin.settings.customPrompts[index].model = value;
        yield this.plugin.saveSettings();
      })));
      if (prompt.provider !== "ollama") {
        new import_obsidian.Setting(promptContainer).setName("API Key").addText((text) => {
          text.inputEl.type = "password";
          text.setValue(prompt.apiKey).onChange((value) => __async(this, null, function* () {
            this.plugin.settings.customPrompts[index].apiKey = value;
            yield this.plugin.saveSettings();
          }));
        });
      }
      new import_obsidian.Setting(promptContainer).setName("Prompt").setDesc("Use {selected_text} as placeholder for the selected text").addTextArea((text) => text.setValue(prompt.prompt).onChange((value) => __async(this, null, function* () {
        this.plugin.settings.customPrompts[index].prompt = value;
        yield this.plugin.saveSettings();
      })));
      const controlsContainer = promptContainer.createDiv();
      controlsContainer.style.cssText = "display: flex; gap: 8px; margin-top: 12px;";
      if (index > 0) {
        const moveUpBtn = controlsContainer.createEl("button", { text: "\u2191" });
        moveUpBtn.onclick = () => {
          this.movePrompt(index, index - 1);
        };
      }
      if (index < this.plugin.settings.customPrompts.length - 1) {
        const moveDownBtn = controlsContainer.createEl("button", { text: "\u2193" });
        moveDownBtn.onclick = () => {
          this.movePrompt(index, index + 1);
        };
      }
      const deleteBtn = controlsContainer.createEl("button", { text: "Delete" });
      deleteBtn.style.backgroundColor = "var(--interactive-accent-danger)";
      deleteBtn.onclick = () => {
        this.deletePrompt(index);
      };
    });
  }
  addNewPrompt() {
    const newPrompt = {
      id: Date.now().toString(),
      name: "New Prompt",
      prompt: "Please process this text: {selected_text}",
      provider: "openai",
      apiKey: "",
      model: "gpt-3.5-turbo"
    };
    this.plugin.settings.customPrompts.push(newPrompt);
    this.plugin.saveSettings();
  }
  movePrompt(fromIndex, toIndex) {
    const prompts = this.plugin.settings.customPrompts;
    const [moved] = prompts.splice(fromIndex, 1);
    prompts.splice(toIndex, 0, moved);
    this.plugin.saveSettings();
    this.display();
  }
  deletePrompt(index) {
    this.plugin.settings.customPrompts.splice(index, 1);
    this.plugin.saveSettings();
    this.display();
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {});
