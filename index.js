/**
 * Kibitzer - A SillyTavern Extension
 * A floating critic character that offers unsolicited commentary on your RPs
 * Now with proper SillyTavern Preset Integration!
 */

import { 
    saveSettingsDebounced,
    eventSource,
    event_types,
    getRequestHeaders,
    generateQuietPrompt,
} from '../../../../script.js';

import { 
    extension_settings, 
    getContext,
    renderExtensionTemplateAsync,
} from '../../../extensions.js';

const MODULE_NAME = 'kibitzer';
const DEBUG_PREFIX = '[Kibitzer]';

// Default settings
const defaultSettings = {
    enabled: true,
    characterId: null,
    characterName: '',
    characterAvatar: '',
    // API Settings
    apiMode: 'profile', // 'profile' or 'custom'
    connectionProfile: '', // Empty means use current profile
    customApiType: 'openai',
    customApiUrl: '',
    customApiKey: '',
    customModel: '',
    selectedPreset: '', // Selected prompt preset name
    // Generation settings
    frequency: 5,
    frequencyLocked: false,
    messageCount: 0,
    widgetPosition: { x: 20, y: 20 },
    widgetMinimized: false,
    customSystemPrompt: '',
    maxContextMessages: 10,
    contextLocked: false,
    autoShow: true,
    commentaryStyle: 'snarky',
    displayMode: 'widget',
    // UI Customization
    uiTheme: 'pink',
    uiAvatarSize: 'medium',
    uiBubblePosition: 'right',
    uiOpacity: 100,
    uiCustomColors: {
        primary: '#ffb6c1',
        secondary: '#ffe4e9',
        accent: '#ff8fa3',
        text: '#5a4a5c',
    },
    // Ticker settings
    uiTickerSpeed: 50,
    uiTickerAlwaysScroll: true,
};

// API Definitions for Auto-Fill
const API_TYPES = {
    openai: {
        name: 'OpenAI',
        defaultUrl: 'https://api.openai.com/v1',
        placeholder: 'gpt-3.5-turbo, gpt-4, gpt-4-turbo',
        settingsKeys: ['api_key_openai', 'openai_api_key'],
        urlKeys: ['openai_url', 'api_url_openai'],
    },
    openrouter: {
        name: 'OpenRouter',
        defaultUrl: 'https://openrouter.ai/api/v1',
        placeholder: 'mistralai/mistral-7b-instruct, anthropic/claude-3-haiku',
        settingsKeys: ['api_key_openrouter', 'openrouter_api_key'],
        urlKeys: ['openrouter_url', 'api_url_openrouter'],
    },
    claude: {
        name: 'Claude (Anthropic)',
        defaultUrl: 'https://api.anthropic.com',
        placeholder: 'claude-3-haiku-20240307, claude-3-sonnet-20240229',
        settingsKeys: ['api_key_claude', 'claude_api_key'],
        urlKeys: ['claude_url', 'api_url_claude'],
    },
    mistral: {
        name: 'Mistral AI',
        defaultUrl: 'https://api.mistral.ai/v1',
        placeholder: 'mistral-tiny, mistral-small, mistral-medium',
        settingsKeys: ['api_key_mistral', 'mistral_api_key'],
        urlKeys: ['mistral_url', 'api_url_mistral'],
    },
    cohere: {
        name: 'Cohere',
        defaultUrl: 'https://api.cohere.ai/v1',
        placeholder: 'command, command-light, command-nightly',
        settingsKeys: ['api_key_cohere', 'cohere_api_key'],
        urlKeys: ['cohere_url', 'api_url_cohere'],
    },
    palm: {
        name: 'Google AI (PaLM/Gemini)',
        defaultUrl: 'https://generativelanguage.googleapis.com/v1beta',
        placeholder: 'gemini-pro, text-bison-001',
        settingsKeys: ['api_key_makersuite', 'google_api_key', 'palm_api_key'],
        urlKeys: [],
    },
    kobold: {
        name: 'KoboldAI / CPP',
        defaultUrl: 'http://localhost:5001/api',
        placeholder: '(uses connected model)',
        settingsKeys: [],
        urlKeys: ['kobold_url', 'api_url_kobold'],
    },
    textgen: {
        name: 'Text Generation WebUI (oobabooga)',
        defaultUrl: 'http://localhost:5000/v1',
        placeholder: '(uses loaded model)',
        settingsKeys: [],
        urlKeys: ['textgen_url', 'api_url_textgen'],
    },
    custom: {
        name: 'Custom / Other',
        defaultUrl: '',
        placeholder: 'Enter model name',
        settingsKeys: [],
        urlKeys: ['custom_url', 'api_url_custom'],
    },
};

// Theme color presets
const UI_THEMES = {
    pink: { primary: '#ffb6c1', secondary: '#ffe4e9', accent: '#ff8fa3', text: '#5a4a5c', name: '🌸 Pink (Default)' },
    lavender: { primary: '#c9b1ff', secondary: '#ece4ff', accent: '#a78bfa', text: '#4a4063', name: '💜 Lavender' },
    mint: { primary: '#a8e6cf', secondary: '#dffff0', accent: '#56c596', text: '#2d5a47', name: '🌿 Mint' },
    peach: { primary: '#ffcba4', secondary: '#fff0e5', accent: '#ff9a5c', text: '#5c4a3d', name: '🍑 Peach' },
    sky: { primary: '#87ceeb', secondary: '#e0f4ff', accent: '#5bb5e0', text: '#3a5a6a', name: '☁️ Sky' },
    berry: { primary: '#e091b8', secondary: '#fce4ef', accent: '#c45a8a', text: '#5a3a4a', name: '🫐 Berry' },
    custom: { name: '🎨 Custom' },
};

const AVATAR_SIZES = { small: 55, medium: 70, large: 90 };

const COMMENTARY_STYLES = {
    none: '',
    snarky: 'Tone: Witty, slightly sardonic, entertaining but not mean-spirited.',
    supportive: 'Tone: Enthusiastic, encouraging, cheering on the participants.',
    analytical: 'Tone: Insightful, observant, focusing on choices and narrative.',
    chaotic: 'Tone: Unpredictable, humorous, absurd, breaking the fourth wall.',
};

let kibitzer = {
    widget: null,
    bar: null,
    isDragging: false,
    wasDragging: false,
    dragOffset: { x: 0, y: 0 },
    dragStartPos: { x: 0, y: 0 },
    lastCommentary: '',
    lastBarMessage: '',
    isGenerating: false,
    recentChatNames: [],
    availableProfiles: [],
    lastTriggerTime: 0,
    chatJustChanged: false,
    cachedModels: [],
    cachedPresets: [],
};

// --- SETTINGS UTILS ---

function loadSettings() {
    extension_settings[MODULE_NAME] = extension_settings[MODULE_NAME] || {};
    for (const [key, value] of Object.entries(defaultSettings)) {
        if (extension_settings[MODULE_NAME][key] === undefined) {
            extension_settings[MODULE_NAME][key] = value;
        }
    }
}

function getSettings() {
    return extension_settings[MODULE_NAME];
}

function saveSettings() {
    saveSettingsDebounced();
}

async function executeSlashCommand(command) {
    try {
        const context = SillyTavern.getContext();
        if (context.executeSlashCommandsWithOptions) {
            const result = await context.executeSlashCommandsWithOptions(command, {
                handleExecutionErrors: false,
                handleParserErrors: false,
            });
            return result?.pipe || '';
        }
    } catch (error) {
        console.error(DEBUG_PREFIX, 'Error executing slash command:', command, error);
    }
    return '';
}

// --- API HELPERS ---

function getApiUrlFromSillyTavern(apiType) {
    try {
        const typeInfo = API_TYPES[apiType];
        if (!typeInfo) return '';
        
        if (window.oai_settings) {
            if (window.oai_settings.reverse_proxy && ['openai', 'openrouter', 'custom'].includes(apiType)) {
                return window.oai_settings.reverse_proxy;
            }
            for (const key of typeInfo.urlKeys) {
                if (window.oai_settings[key]) return window.oai_settings[key];
            }
        }
        
        const inputs = {
            openai: '#api_url_openai',
            openrouter: '#api_url_openrouter',
            kobold: '#api_url_kobold',
            textgen: '#api_url_textgen'
        };
        if (inputs[apiType]) {
            const domVal = $(inputs[apiType]).val();
            if (domVal) return domVal;
        }

        return typeInfo.defaultUrl || '';
    } catch (error) {
        return API_TYPES[apiType]?.defaultUrl || '';
    }
}

function getApiKeyFromSillyTavern(apiType) {
    try {
        const typeInfo = API_TYPES[apiType];
        if (window.oai_settings && typeInfo?.settingsKeys) {
            for (const key of typeInfo.settingsKeys) {
                if (window.oai_settings[key]) return window.oai_settings[key];
            }
        }
        if (window.secret_state && typeInfo?.settingsKeys) {
            for (const key of typeInfo.settingsKeys) {
                if (window.secret_state[key]) return window.secret_state[key];
            }
        }
    } catch (error) { console.error(DEBUG_PREFIX, error); }
    return '';
}

async function fetchModelsFromCustomSettings(url, key, apiType) {
    if (!url) return [];
    
    console.log(DEBUG_PREFIX, `Fetching models from ${url} (${apiType})...`);
    try {
        let endpoint = url.replace(/\/$/, '');
        let headers = { 'Content-Type': 'application/json' };
        
        if (apiType === 'kobold') {
            endpoint += '/v1/model';
        } else if (!endpoint.endsWith('/models')) {
            if (endpoint.endsWith('/v1')) endpoint += '/models';
            else if (!endpoint.includes('/models')) endpoint += '/v1/models';
        }
        
        if (key) headers['Authorization'] = `Bearer ${key}`;
        
        const response = await fetch(endpoint, { method: 'GET', headers });
        if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data)) return data; 
            if (data.data && Array.isArray(data.data)) return data.data; 
            if (data.results && Array.isArray(data.results)) return data.results;
            if (data.id) return [data]; 
        }
    } catch (e) { console.error(DEBUG_PREFIX, 'Error fetching custom models:', e); }
    return [];
}

async function populateModelDropdown() {
    const dropdown = document.getElementById('kibitzer-model-select');
    const manualInput = document.getElementById('kibitzer-model-manual');
    const manualContainer = document.getElementById('kibitzer-model-manual-container');
    
    if (!dropdown) return;
    
    const settings = getSettings();
    dropdown.innerHTML = '<option value="">Loading...</option>';
    dropdown.disabled = true;
    
    let models = [];
    
    if (settings.apiMode === 'custom' && settings.customApiUrl) {
        const key = settings.customApiKey || getApiKeyFromSillyTavern(settings.customApiType);
        models = await fetchModelsFromCustomSettings(settings.customApiUrl, key, settings.customApiType);
    }
    
    if (!models || models.length === 0) {
        if (window.model_list && Array.isArray(window.model_list)) {
            models = window.model_list;
        } else if (window.oai_settings?.model_list) {
            models = window.oai_settings.model_list;
        }
    }
    
    kibitzer.cachedModels = models || [];
    
    dropdown.innerHTML = '';
    dropdown.disabled = false;
    
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '-- Select Model --';
    dropdown.appendChild(defaultOption);
    
    if (kibitzer.cachedModels.length > 0) {
        kibitzer.cachedModels.forEach(model => {
            const modelId = typeof model === 'string' ? model : (model.id || model.name || '');
            const modelName = typeof model === 'string' ? model : (model.name || model.id || '');
            if (!modelId) return;
            
            const option = document.createElement('option');
            option.value = modelId;
            option.textContent = modelName;
            if (settings.customModel === modelId) option.selected = true;
            dropdown.appendChild(option);
        });
    }
    
    const manualOption = document.createElement('option');
    manualOption.value = '__manual__';
    manualOption.textContent = '✏️ Enter manually...';
    dropdown.appendChild(manualOption);
    
    const exists = kibitzer.cachedModels.some(m => {
        const id = typeof m === 'string' ? m : (m.id || m.name || '');
        return id === settings.customModel;
    });
    
    if (settings.customModel && !exists) {
        dropdown.value = '__manual__';
        if (manualContainer) manualContainer.style.display = 'block';
        if (manualInput) manualInput.value = settings.customModel;
    } else if (manualContainer) {
        manualContainer.style.display = 'none';
    }
}

// --- PRESET LOGIC (FIXED FOR SILLYTAVERN STRUCTURE) ---

/**
 * Get list of Chat Completion presets from SillyTavern
 * @returns {Promise<Array<{name: string, displayName: string}>>} Array of preset info objects
 */
async function getChatCompletionPresets() {
    let presets = [];
    
    // Method 1: Get from window.oai_presets (most reliable for full data with names)
    if (window.oai_presets && Array.isArray(window.oai_presets)) {
        presets = window.oai_presets.map(p => {
            if (typeof p === 'string') {
                // If it's just a filename string, use it as both name and display
                return { name: p, displayName: p };
            } else if (p && typeof p === 'object') {
                // If it's an object, extract the name property
                const fileName = p.name || '';
                // Try to get a display name - some presets have a 'preset_name' or similar field
                const displayName = p.preset_name || p.display_name || p.name || fileName;
                return { name: fileName, displayName: displayName };
            }
            return null;
        }).filter(Boolean);
        console.log(DEBUG_PREFIX, 'Got presets from window.oai_presets:', presets.length);
    }
    
    // Method 2: Fallback to API endpoint
    if (presets.length === 0) {
        try {
            const response = await fetch('/api/presets/openai', {
                method: 'GET',
                headers: getRequestHeaders(),
            });
            if (response.ok) {
                const data = await response.json();
                if (Array.isArray(data)) {
                    presets = data.map(name => ({ name: name, displayName: name }));
                    console.log(DEBUG_PREFIX, 'Got preset names from API:', presets.length);
                }
            }
        } catch (error) { 
            console.error(DEBUG_PREFIX, 'Error fetching preset names from API:', error); 
        }
    }
    
    // Method 3: Try to get from the dropdown in SillyTavern UI (includes display text)
    if (presets.length === 0) {
        const presetSelect = document.getElementById('settings_preset_openai');
        if (presetSelect) {
            presets = Array.from(presetSelect.options)
                .filter(opt => opt.value)
                .map(opt => ({ 
                    name: opt.value, 
                    displayName: opt.textContent || opt.value 
                }));
            console.log(DEBUG_PREFIX, 'Got preset names from DOM:', presets.length);
        }
    }
    
    // Sort by display name
    return presets.sort((a, b) => a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase()));
}

/**
 * Load a specific preset's full data by name
 * @param {string} presetName - The name of the preset to load
 * @returns {Promise<object|null>} The preset data object or null
 */
async function loadPresetByName(presetName) {
    if (!presetName) return null;
    
    console.log(DEBUG_PREFIX, 'Loading preset:', presetName);
    
    // Method 1: Try fetching from API (most reliable for full data)
    try {
        const response = await fetch(`/api/presets/openai/${encodeURIComponent(presetName)}`, {
            method: 'POST',
            headers: getRequestHeaders(),
        });
        if (response.ok) {
            const preset = await response.json();
            console.log(DEBUG_PREFIX, 'Loaded preset from API:', Object.keys(preset));
            return preset;
        }
    } catch (error) { 
        console.log(DEBUG_PREFIX, 'API fetch failed, trying fallbacks...'); 
    }
    
    // Method 2: Try GET request instead
    try {
        const response = await fetch(`/api/presets/openai/${encodeURIComponent(presetName)}`, {
            method: 'GET',
            headers: getRequestHeaders(),
        });
        if (response.ok) {
            const preset = await response.json();
            console.log(DEBUG_PREFIX, 'Loaded preset from API (GET):', Object.keys(preset));
            return preset;
        }
    } catch (error) { 
        console.log(DEBUG_PREFIX, 'GET request also failed'); 
    }
    
    // Method 3: Search in window.oai_presets
    if (window.oai_presets && Array.isArray(window.oai_presets)) {
        const found = window.oai_presets.find(p => {
            if (typeof p === 'string') return p === presetName;
            return p.name === presetName;
        });
        if (found && typeof found === 'object') {
            console.log(DEBUG_PREFIX, 'Found preset in window.oai_presets');
            return found;
        }
    }
    
    // Method 4: Try to load from localStorage/settings
    try {
        const settingsKey = `OpenAI_${presetName}`;
        const stored = localStorage.getItem(settingsKey);
        if (stored) {
            const preset = JSON.parse(stored);
            console.log(DEBUG_PREFIX, 'Loaded preset from localStorage');
            return preset;
        }
    } catch (error) { }
    
    console.log(DEBUG_PREFIX, 'Could not load preset:', presetName);
    return null;
}

/**
 * Extract system prompt text from a SillyTavern preset
 * SillyTavern presets have a 'prompts' array with entries like:
 * { identifier: 'main', role: 'system', content: '...', name: 'Main Prompt' }
 * @param {object} preset - The preset object
 * @returns {string} The combined system prompt text
 */
function extractSystemPromptFromPreset(preset) {
    if (!preset) return '';
    
    const parts = [];
    
    // Check for 'prompts' array (SillyTavern's actual structure)
    if (preset.prompts && Array.isArray(preset.prompts)) {
        console.log(DEBUG_PREFIX, 'Preset has prompts array with', preset.prompts.length, 'entries');
        
        // Define the order of prompts to include
        const promptOrder = ['main', 'nsfw', 'jailbreak', 'enhanceDefinitions'];
        
        // First, add prompts in order
        for (const identifier of promptOrder) {
            const prompt = preset.prompts.find(p => p.identifier === identifier);
            if (prompt && prompt.content && prompt.enabled !== false) {
                console.log(DEBUG_PREFIX, `Found prompt: ${identifier} (${prompt.content.length} chars)`);
                parts.push(prompt.content);
            }
        }
        
        // Add any other enabled system prompts not in our list
        for (const prompt of preset.prompts) {
            if (prompt.content && 
                prompt.enabled !== false && 
                prompt.role === 'system' &&
                !promptOrder.includes(prompt.identifier)) {
                console.log(DEBUG_PREFIX, `Found additional prompt: ${prompt.identifier || prompt.name}`);
                parts.push(prompt.content);
            }
        }
    }
    
    // Fallback: Check for legacy/alternative field names
    if (parts.length === 0) {
        const legacyFields = [
            'system_prompt', 'systemPrompt', 'main_prompt', 'mainPrompt',
            'sys_prompt', 'assistant_prefill', 'jailbreak_prompt', 'jailbreakPrompt'
        ];
        
        for (const field of legacyFields) {
            if (preset[field] && typeof preset[field] === 'string') {
                console.log(DEBUG_PREFIX, `Found legacy field: ${field}`);
                parts.push(preset[field]);
            }
        }
    }
    
    // Check for 'prompt_order' which defines how prompts should be assembled
    if (parts.length === 0 && preset.prompt_order && Array.isArray(preset.prompt_order)) {
        console.log(DEBUG_PREFIX, 'Using prompt_order to assemble prompt');
        for (const orderItem of preset.prompt_order) {
            const identifier = typeof orderItem === 'string' ? orderItem : orderItem.identifier;
            if (preset.prompts) {
                const prompt = preset.prompts.find(p => p.identifier === identifier);
                if (prompt && prompt.content && prompt.enabled !== false) {
                    parts.push(prompt.content);
                }
            }
        }
    }
    
    const result = parts.join('\n\n');
    console.log(DEBUG_PREFIX, `Extracted system prompt: ${result.length} chars from ${parts.length} parts`);
    return result;
}

/**
 * Populate the preset dropdown with available presets
 */
async function populatePresetDropdown() {
    const dropdown = document.getElementById('kibitzer-preset-select');
    if (!dropdown) return;
    
    const settings = getSettings();
    dropdown.innerHTML = '<option value="">Loading presets...</option>';
    dropdown.disabled = true;
    
    const presets = await getChatCompletionPresets();
    kibitzer.cachedPresets = presets;
    
    dropdown.innerHTML = '';
    dropdown.disabled = false;
    
    // Default option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '-- Use Default Kibitzer Prompt --';
    dropdown.appendChild(defaultOption);
    
    if (presets && presets.length > 0) {
        for (const preset of presets) {
            const option = document.createElement('option');
            option.value = preset.name; // Use internal name for value
            option.textContent = preset.displayName; // Show display name to user
            if (settings.selectedPreset === preset.name) option.selected = true;
            dropdown.appendChild(option);
        }
        console.log(DEBUG_PREFIX, 'Populated preset dropdown with', presets.length, 'presets');
    } else {
        const errOption = document.createElement('option');
        errOption.value = '';
        errOption.textContent = '(No presets found)';
        errOption.disabled = true;
        dropdown.appendChild(errOption);
    }
}

function autoFillApiSettings(apiType) {
    const settings = getSettings();
    const apiUrlInput = document.getElementById('kibitzer-api-url');
    
    if (!apiUrlInput) return;
    
    const url = getApiUrlFromSillyTavern(apiType);
    if (url) {
        apiUrlInput.value = url;
        settings.customApiUrl = url;
        if (typeof toastr !== 'undefined') toastr.success(`Loaded URL for ${API_TYPES[apiType]?.name || apiType}`, 'Kibitzer');
    }
    
    const key = getApiKeyFromSillyTavern(apiType);
    if (key) {
        settings.customApiKey = key; 
    }

    saveSettings();
    updateApiHints(apiType);
    populateModelDropdown();
}

function updateApiHints(apiType) {
    const apiUrlHint = document.getElementById('kibitzer-api-url-hint');
    const modelHint = document.getElementById('kibitzer-model-hint');
    const typeInfo = API_TYPES[apiType] || API_TYPES.custom;
    
    if (apiUrlHint) {
        const defaultUrl = typeInfo.defaultUrl || 'Enter URL';
        apiUrlHint.textContent = `Default: ${defaultUrl}`;
    }
    if (modelHint) {
        modelHint.textContent = `Examples: ${typeInfo.placeholder || 'Enter model name'}`;
    }
}

// --- GENERATION LOGIC ---

async function generateWithCustomApi(prompt) {
    const settings = getSettings();
    if (!settings.customApiUrl || !settings.customModel) {
        throw new Error('Custom API settings incomplete. Please fill in URL and Model.');
    }
    
    const apiType = settings.customApiType || 'openai';
    let headers = { 'Content-Type': 'application/json' };
    let apiKey = settings.customApiKey || getApiKeyFromSillyTavern(apiType);
    
    // --- BUILD SYSTEM PROMPT ---
    let systemPrompt = '';
    
    // Priority 1: Use selected preset if available
    if (settings.selectedPreset) {
        console.log(DEBUG_PREFIX, 'Loading selected preset:', settings.selectedPreset);
        const preset = await loadPresetByName(settings.selectedPreset);
        
        if (preset) {
            systemPrompt = extractSystemPromptFromPreset(preset);
            
            // Replace macros with Kibitzer context
            const kibitzerName = settings.characterName || 'Kibitzer';
            const userName = 'User';
            
            systemPrompt = systemPrompt
                .replace(/\{\{char\}\}/gi, kibitzerName)
                .replace(/\{\{user\}\}/gi, userName)
                .replace(/\{\{original\}\}/gi, '')
                .replace(/\{\{personality\}\}/gi, '')
                .replace(/\{\{scenario\}\}/gi, '')
                .replace(/\{\{persona\}\}/gi, userName)
                .replace(/\{\{mesExamples\}\}/gi, '');
            
            console.log(DEBUG_PREFIX, `Using preset "${settings.selectedPreset}" - ${systemPrompt.length} chars`);
        }
    }
    
    // Priority 2: Use custom system prompt if set and no preset
    if (!systemPrompt && settings.customSystemPrompt) {
        systemPrompt = settings.customSystemPrompt;
    }
    
    // --- BUILD API REQUEST ---
    let apiUrl = settings.customApiUrl.replace(/\/$/, '');
    let requestBody;
    
    if (apiType === 'claude') {
        apiUrl += '/v1/messages';
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
        requestBody = {
            model: settings.customModel,
            max_tokens: 300,
            messages: [{ role: 'user', content: prompt }],
        };
        if (systemPrompt) {
            requestBody.system = systemPrompt;
        }
    } else if (apiType === 'kobold') {
        apiUrl += '/v1/generate';
        requestBody = {
            prompt: systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt,
            max_length: 300
        };
    } else {
        // OpenAI Compatible (OpenRouter, Mistral, Local, etc.)
        if (!apiUrl.endsWith('/chat/completions')) apiUrl += '/chat/completions';
        headers['Authorization'] = `Bearer ${apiKey}`;
        
        if (apiType === 'openrouter') {
            headers['HTTP-Referer'] = window.location.origin;
            headers['X-Title'] = 'Kibitzer';
        }

        const messages = [];
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }
        messages.push({ role: 'user', content: prompt });
        
        requestBody = {
            model: settings.customModel,
            messages: messages,
            max_tokens: 300,
            temperature: 0.7,
        };
    }
    
    console.log(DEBUG_PREFIX, 'Calling Custom API:', apiUrl, '| System prompt:', systemPrompt ? systemPrompt.substring(0, 100) + '...' : '(none)');
    
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error ${response.status}: ${errorText.substring(0, 200)}`);
    }
    
    const data = await response.json();
    
    if (apiType === 'claude') return data.content?.[0]?.text || '';
    if (apiType === 'kobold') return data.results?.[0]?.text || '';
    return data.choices?.[0]?.message?.content || '';
}

// --- UI WIDGET CREATION ---

function applyUITheme() {
    const settings = getSettings();
    const widget = kibitzer.widget;
    if (!widget) return;
    
    let colors;
    if (settings.uiTheme === 'custom') {
        colors = settings.uiCustomColors;
    } else {
        colors = UI_THEMES[settings.uiTheme] || UI_THEMES.pink;
    }
    
    widget.style.setProperty('--kb-primary', colors.primary);
    widget.style.setProperty('--kb-secondary', colors.secondary);
    widget.style.setProperty('--kb-accent', colors.accent);
    widget.style.setProperty('--kb-text', colors.text);
    
    const avatarSize = AVATAR_SIZES[settings.uiAvatarSize] || AVATAR_SIZES.medium;
    widget.style.setProperty('--kb-avatar-size', `${avatarSize}px`);
    widget.style.setProperty('--kb-bubble-offset', `${avatarSize + 10}px`);
    
    widget.classList.remove('bubble-left', 'bubble-right');
    widget.classList.add(`bubble-${settings.uiBubblePosition}`);
    widget.style.setProperty('--kb-opacity', settings.uiOpacity / 100);
}

function createWidget() {
    if (kibitzer.widget) kibitzer.widget.remove();
    const settings = getSettings();
    const widget = document.createElement('div');
    widget.id = 'kibitzer-widget';
    widget.className = settings.widgetMinimized ? 'minimized' : '';
    
    widget.innerHTML = `
        <div class="kibitzer-avatar-bubble">
            <img class="kibitzer-avatar" src="" alt="Kibitzer" />
            <div class="kibitzer-avatar-placeholder"><i class="fa-solid fa-cat"></i></div>
            <div class="kibitzer-notification-dot"></div>
        </div>
        <div class="kibitzer-speech-bubble">
            <div class="kibitzer-speech-content"><p class="kibitzer-text">Click me to get started~!</p></div>
            <div class="kibitzer-speech-tail"></div>
            <button class="kibitzer-bubble-close"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="kibitzer-typing-bubble">
            <div class="kibitzer-typing"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
            <div class="kibitzer-speech-tail"></div>
        </div>
        <div class="kibitzer-panel">
            <div class="kibitzer-panel-header">
                <div class="kibitzer-panel-title"><span class="kibitzer-name">Kibitzer</span></div>
                <div class="kibitzer-panel-controls">
                    <button class="kibitzer-btn kibitzer-panel-clear"><i class="fa-solid fa-trash-can"></i></button>
                    <button class="kibitzer-btn kibitzer-panel-close"><i class="fa-solid fa-xmark"></i></button>
                </div>
            </div>
            <div class="kibitzer-panel-body"><div class="kibitzer-history"></div></div>
            <div class="kibitzer-panel-footer">
                <div class="kibitzer-status-row"><span class="kibitzer-status-icon">♡</span><span class="kibitzer-status">Waiting...</span></div>
            </div>
        </div>
    `;
    
    document.body.appendChild(widget);
    kibitzer.widget = widget;
    widget.style.left = `${settings.widgetPosition.x}px`;
    widget.style.top = `${settings.widgetPosition.y}px`;
    
    applyUITheme();
    updateWidgetCharacter();
    setupWidgetEvents();
}

// --- BAR DISPLAY MODE ---

function createBar() {
    if (kibitzer.bar) {
        kibitzer.bar.remove();
    }

    const settings = getSettings();
    
    const bar = document.createElement('div');
    bar.id = 'kibitzer-bar';
    
    bar.innerHTML = `
        <div class="kibitzer-bar-avatar">
            <img class="kibitzer-bar-avatar-img" src="" alt="Kibitzer" />
            <div class="kibitzer-bar-avatar-placeholder">
                <i class="fa-solid fa-cat"></i>
            </div>
        </div>
        <div class="kibitzer-bar-content">
            <span class="kibitzer-bar-name">Kibitzer</span>
            <span class="kibitzer-bar-separator">:</span>
            <div class="kibitzer-bar-text-container">
                <span class="kibitzer-bar-text">Click me to get started~!</span>
            </div>
        </div>
        <div class="kibitzer-bar-typing">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
        </div>
        <div class="kibitzer-bar-panel">
            <div class="kibitzer-bar-panel-inner">
                <div class="kibitzer-panel-header">
                    <div class="kibitzer-panel-title">
                        <span class="kibitzer-name">Kibitzer</span>
                        <span class="kibitzer-subtitle">~ watching over you ~</span>
                    </div>
                    <div class="kibitzer-panel-controls">
                        <button class="kibitzer-btn kibitzer-panel-clear" title="Clear History">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                        <button class="kibitzer-btn kibitzer-panel-close" title="Close">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                </div>
                <div class="kibitzer-panel-body">
                    <div class="kibitzer-history">
                        <div class="kibitzer-history-item">
                            <p>Select a character in settings to begin~!</p>
                        </div>
                    </div>
                </div>
                <div class="kibitzer-panel-footer">
                    <div class="kibitzer-status-row">
                        <span class="kibitzer-status-icon">♡</span>
                        <span class="kibitzer-status">Waiting...</span>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const qrBar = document.getElementById('qr--bar');
    const sendForm = document.getElementById('send_form');
    if (qrBar?.parentNode) qrBar.parentNode.insertBefore(bar, qrBar);
    else if (sendForm?.parentNode) sendForm.parentNode.insertBefore(bar, sendForm);
    else document.body.appendChild(bar);
    
    kibitzer.bar = bar;
    applyBarTheme();
    updateBarCharacter();
    setupBarEvents();
}

function applyBarTheme() {
    const settings = getSettings();
    const bar = kibitzer.bar;
    if (!bar) return;
    
    let colors = (settings.uiTheme === 'custom') ? settings.uiCustomColors : (UI_THEMES[settings.uiTheme] || UI_THEMES.pink);
    
    bar.style.setProperty('--kb-primary', colors.primary);
    bar.style.setProperty('--kb-secondary', colors.secondary);
    bar.style.setProperty('--kb-accent', colors.accent);
    bar.style.setProperty('--kb-text', colors.text);
    bar.style.setProperty('--kb-opacity', settings.uiOpacity / 100);
}

function updateBarCharacter() {
    const settings = getSettings();
    const bar = kibitzer.bar;
    if (!bar) return;
    
    const avatarEl = bar.querySelector('.kibitzer-bar-avatar-img');
    const placeholderEl = bar.querySelector('.kibitzer-bar-avatar-placeholder');
    const nameEl = bar.querySelector('.kibitzer-bar-name');
    
    if (settings.characterAvatar) {
        avatarEl.src = `/characters/${encodeURIComponent(settings.characterAvatar)}`;
        avatarEl.style.display = 'block';
        if (placeholderEl) placeholderEl.style.display = 'none';
        avatarEl.onerror = function() {
            this.src = `/thumbnail?type=avatar&file=${encodeURIComponent(settings.characterAvatar)}`;
        };
    } else {
        avatarEl.style.display = 'none';
        if (placeholderEl) placeholderEl.style.display = 'flex';
    }
    
    const displayName = settings.characterName || 'Kibitzer';
    if (nameEl) nameEl.textContent = displayName;
}

function setupBarEvents() {
    const bar = kibitzer.bar;
    if (!bar) return;
    
    const panelClose = bar.querySelector('.kibitzer-panel-close');
    const panelClear = bar.querySelector('.kibitzer-panel-clear');
    
    // Double-click to open panel
    bar.addEventListener('dblclick', (e) => {
        if (e.target.closest('.kibitzer-bar-panel')) return;
        e.preventDefault();
        toggleBarPanel();
    });
    
    // Panel close button
    if (panelClose) {
        panelClose.addEventListener('click', (e) => {
            e.stopPropagation();
            closeBarPanel();
        });
    }
    
    // Clear history button
    if (panelClear) {
        panelClear.addEventListener('click', (e) => {
            e.stopPropagation();
            const history = bar.querySelector('.kibitzer-history');
            if (history) {
                history.innerHTML = '';
                kibitzer.lastBarMessage = '';
            }
        });
    }
    
    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
        if (bar.classList.contains('panel-open') && !bar.contains(e.target)) {
            closeBarPanel();
        }
    });
    
    // Reposition panel on resize
    window.addEventListener('resize', () => {
        if (bar.classList.contains('panel-open')) {
            positionBarPanel();
        }
    });
}

function positionBarPanel() {
    const bar = kibitzer.bar;
    if (!bar) return;
    
    const panel = bar.querySelector('.kibitzer-bar-panel');
    if (!panel) return;
    
    const barRect = bar.getBoundingClientRect();
    // Position panel above the bar using fixed positioning
    panel.style.bottom = `${window.innerHeight - barRect.top + 8}px`;
}

function toggleBarPanel() {
    const bar = kibitzer.bar;
    if (!bar) return;
    if (bar.classList.contains('panel-open')) closeBarPanel();
    else openBarPanel();
}

function openBarPanel() {
    const bar = kibitzer.bar;
    if (!bar) return;
    positionBarPanel();
    bar.classList.add('panel-open');
}

function closeBarPanel() {
    const bar = kibitzer.bar;
    if (!bar) return;
    bar.classList.remove('panel-open');
}

function applyBarTickerAnimation() {
    const bar = kibitzer.bar;
    if (!bar) return;
    const settings = getSettings();
    const textEl = bar.querySelector('.kibitzer-bar-text');
    const container = bar.querySelector('.kibitzer-bar-text-container');
    
    if (!textEl || !container) return;
    
    bar.classList.remove('ticker-active');
    textEl.style.removeProperty('animation');
    void textEl.offsetWidth;
    
    requestAnimationFrame(() => {
        const textWidth = textEl.scrollWidth;
        const containerWidth = container.clientWidth;
        
        if (settings.uiTickerAlwaysScroll || textWidth > containerWidth) {
            const gap = 100;
            const scrollDistance = textWidth + gap;
            const duration = scrollDistance / settings.uiTickerSpeed;
            const scrollPercent = ((textWidth + gap) / textWidth) * 100;
            
            bar.style.setProperty('--scroll-duration', `${duration}s`);
            bar.style.setProperty('--scroll-offset', `-${scrollPercent}%`);
            bar.classList.add('ticker-active');
        }
    });
}

function updateBarCommentaryText(text) {
    const bar = kibitzer.bar;
    if (!bar) return;
    
    const textEl = bar.querySelector('.kibitzer-bar-text');
    if (textEl) {
        textEl.textContent = text;
        if (!bar.classList.contains('is-typing')) applyBarTickerAnimation();
    }
    
    if (text !== kibitzer.lastBarMessage) {
        kibitzer.lastBarMessage = text;
        const history = bar.querySelector('.kibitzer-history');
        if (history) {
            const item = document.createElement('div');
            item.className = 'kibitzer-history-item new';
            item.innerHTML = `<p>${text}</p>`;
            history.insertBefore(item, history.firstChild);
            if (history.children.length > 10) history.lastChild.remove();
            setTimeout(() => item.classList.remove('new'), 500);
        }
        bar.classList.add('has-new');
        setTimeout(() => bar.classList.remove('has-new'), 500);
    }
}

function showBarTypingIndicator(show) {
    const bar = kibitzer.bar;
    if (!bar) return;
    if (show) bar.classList.add('is-typing');
    else {
        bar.classList.remove('is-typing');
        requestAnimationFrame(() => applyBarTickerAnimation());
    }
}

function switchDisplayMode(mode) {
    const settings = getSettings();
    if (kibitzer.widget) kibitzer.widget.style.display = 'none';
    if (kibitzer.bar) kibitzer.bar.style.display = 'none';
    
    if (mode === 'widget') {
        if (!kibitzer.widget) createWidget();
        if (settings.enabled) kibitzer.widget.style.display = 'block';
    } else if (mode === 'bar') {
        if (!kibitzer.bar) createBar();
        if (settings.enabled) kibitzer.bar.style.display = 'flex';
        setTimeout(applyBarTickerAnimation, 100);
    }
}

function updateWidgetCharacter() {
    const settings = getSettings();
    const widget = kibitzer.widget;
    if (!widget) return;
    
    const avatarEl = widget.querySelector('.kibitzer-avatar');
    const placeholderEl = widget.querySelector('.kibitzer-avatar-placeholder');
    const nameEl = widget.querySelector('.kibitzer-name');
    
    if (settings.characterAvatar) {
        avatarEl.src = `/characters/${encodeURIComponent(settings.characterAvatar)}`;
        avatarEl.style.display = 'block';
        if (placeholderEl) placeholderEl.style.display = 'none';
        avatarEl.onerror = function() {
            this.src = `/thumbnail?type=avatar&file=${encodeURIComponent(settings.characterAvatar)}`;
        };
    } else {
        avatarEl.style.display = 'none';
        if (placeholderEl) placeholderEl.style.display = 'flex';
    }
    if (nameEl) nameEl.textContent = settings.characterName || 'Kibitzer';
}

function setupWidgetEvents() {
    const widget = kibitzer.widget;
    const avatarBubble = widget.querySelector('.kibitzer-avatar-bubble');
    
    avatarBubble.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDrag);
    
    avatarBubble.addEventListener('dblclick', (e) => {
        e.preventDefault();
        if (widget.classList.contains('panel-open')) widget.classList.remove('panel-open');
        else {
            widget.classList.add('panel-open');
            widget.classList.remove('has-speech');
        }
    });
    
    widget.querySelector('.kibitzer-bubble-close')?.addEventListener('click', (e) => {
        e.stopPropagation();
        widget.classList.remove('has-speech');
    });
    
    widget.querySelector('.kibitzer-panel-close')?.addEventListener('click', (e) => {
        e.stopPropagation();
        widget.classList.remove('panel-open');
    });
    
    widget.querySelector('.kibitzer-panel-clear')?.addEventListener('click', (e) => {
        e.stopPropagation();
        widget.querySelector('.kibitzer-history').innerHTML = '';
    });
}

function startDrag(e) {
    if (e.target.closest('.kibitzer-panel') || e.target.closest('.kibitzer-speech-bubble')) return;
    kibitzer.isDragging = true;
    kibitzer.dragStartPos = { x: e.clientX, y: e.clientY };
    const rect = kibitzer.widget.getBoundingClientRect();
    kibitzer.dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    kibitzer.widget.classList.add('dragging');
}

function drag(e) {
    if (!kibitzer.isDragging) return;
    const x = Math.max(0, Math.min(window.innerWidth - 80, e.clientX - kibitzer.dragOffset.x));
    const y = Math.max(0, Math.min(window.innerHeight - 80, e.clientY - kibitzer.dragOffset.y));
    kibitzer.widget.style.left = `${x}px`;
    kibitzer.widget.style.top = `${y}px`;
}

function stopDrag() {
    if (!kibitzer.isDragging) return;
    kibitzer.isDragging = false;
    kibitzer.widget.classList.remove('dragging');
    const settings = getSettings();
    settings.widgetPosition = {
        x: parseInt(kibitzer.widget.style.left),
        y: parseInt(kibitzer.widget.style.top)
    };
    saveSettings();
}

function updateCommentaryText(text) {
    const settings = getSettings();
    const widget = kibitzer.widget;
    
    if (widget) {
        const speechText = widget.querySelector('.kibitzer-speech-bubble .kibitzer-text');
        if (speechText) speechText.textContent = text;
        
        const history = widget.querySelector('.kibitzer-history');
        if (history) {
            const item = document.createElement('div');
            item.className = 'kibitzer-history-item new';
            item.innerHTML = `<p>${text}</p>`;
            history.insertBefore(item, history.firstChild);
            if (history.children.length > 10) history.lastChild.remove();
            setTimeout(() => item.classList.remove('new'), 500);
        }
        
        if (settings.displayMode === 'widget') {
            widget.classList.add('has-speech', 'speech-new');
            widget.querySelector('.kibitzer-notification-dot')?.classList.add('visible');
            setTimeout(() => widget.classList.remove('speech-new'), 500);
        }
    }
    
    if (kibitzer.bar) updateBarCommentaryText(text);
}

/**
 * Update which display mode options are visible in settings
 */
function updateDisplayModeOptions(mode) {
    const widgetOptions = document.getElementById('kibitzer-widget-options');
    const barOptions = document.getElementById('kibitzer-bar-options');
    
    if (widgetOptions) {
        widgetOptions.style.display = mode === 'widget' ? 'block' : 'none';
    }
    if (barOptions) {
        barOptions.style.display = mode === 'bar' ? 'block' : 'none';
    }
}

// --- SETTINGS UI ---

async function setupSettingsUI() {
    const settingsHtml = `
    <div id="kibitzer-settings" class="kibitzer-settings-panel">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>Kibitzer</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <div class="kibitzer-setting-row">
                    <label class="checkbox_label">
                        <input type="checkbox" id="kibitzer-enabled" /><span>Enable Kibitzer</span>
                    </label>
                </div>
                <div class="kibitzer-setting-row">
                    <label>Display Mode:</label>
                    <select id="kibitzer-display-mode" class="text_pole">
                        <option value="widget">🎈 Floating Widget</option>
                        <option value="bar">📜 Bar (above Quick Reply)</option>
                    </select>
                </div>
                
                <div id="kibitzer-widget-options" class="kibitzer-display-options">
                    <div class="kibitzer-setting-row">
                        <label>Avatar Size:</label>
                        <select id="kibitzer-avatar-size" class="text_pole">
                            <option value="small">Small (55px)</option>
                            <option value="medium">Medium (70px)</option>
                            <option value="large">Large (90px)</option>
                        </select>
                    </div>
                    <div class="kibitzer-setting-row">
                        <label>Bubble Position:</label>
                        <select id="kibitzer-bubble-position" class="text_pole">
                            <option value="right">Right of Avatar</option>
                            <option value="left">Left of Avatar</option>
                        </select>
                    </div>
                    <div class="kibitzer-setting-row">
                        <label>Widget Opacity:</label>
                        <div class="range-block">
                            <input type="range" id="kibitzer-opacity" min="30" max="100" />
                            <span id="kibitzer-opacity-value">100%</span>
                        </div>
                    </div>
                </div>
                
                <div id="kibitzer-bar-options" class="kibitzer-display-options" style="display:none;">
                    <div class="kibitzer-setting-row">
                        <label>Ticker Speed:</label>
                        <div class="range-block">
                            <input type="range" id="kibitzer-ticker-speed" min="20" max="150" />
                            <span id="kibitzer-ticker-speed-value">50 px/s</span>
                        </div>
                        <small>How fast the commentary text scrolls</small>
                    </div>
                    <div class="kibitzer-setting-row">
                        <label class="checkbox_label">
                            <input type="checkbox" id="kibitzer-ticker-always" />
                            <span>Always scroll ticker (even if text fits)</span>
                        </label>
                    </div>
                </div>
                <hr class="sysHR" />
                <h4 class="kibitzer-section-title">🔌 API Connection</h4>
                <div class="kibitzer-setting-row">
                    <label>API Mode:</label>
                    <select id="kibitzer-api-mode" class="text_pole">
                        <option value="profile">📋 Connection Profile</option>
                        <option value="custom">⚙️ Custom API</option>
                    </select>
                </div>
                
                <div id="kibitzer-profile-options" class="kibitzer-api-options">
                    <div class="kibitzer-setting-row">
                        <label>Connection Profile:</label>
                        <div class="kibitzer-char-select-row">
                            <select id="kibitzer-profile-select" class="text_pole"><option value="">-- Use Current Profile --</option></select>
                            <button id="kibitzer-refresh-profiles" class="menu_button"><i class="fa-solid fa-rotate"></i></button>
                        </div>
                    </div>
                </div>
                
                <div id="kibitzer-custom-api-options" class="kibitzer-api-options" style="display: none;">
                    <div class="kibitzer-setting-row">
                        <label>API Type:</label>
                        <select id="kibitzer-api-type" class="text_pole">
                            <option value="openai">OpenAI</option>
                            <option value="openrouter">OpenRouter</option>
                            <option value="claude">Claude (Anthropic)</option>
                            <option value="mistral">Mistral AI</option>
                            <option value="cohere">Cohere</option>
                            <option value="palm">Google AI (PaLM/Gemini)</option>
                            <option value="kobold">KoboldAI</option>
                            <option value="textgen">Text Generation WebUI</option>
                            <option value="custom">Custom / Other</option>
                        </select>
                    </div>
                    <div class="kibitzer-setting-row">
                        <label>API URL:</label>
                        <div class="kibitzer-char-select-row">
                            <input type="text" id="kibitzer-api-url" class="text_pole" placeholder="https://api.openai.com/v1" />
                            <button id="kibitzer-autofill-url" class="menu_button" title="Auto-fill from SillyTavern"><i class="fa-solid fa-wand-magic-sparkles"></i></button>
                        </div>
                        <small id="kibitzer-api-url-hint">Base URL for the API</small>
                    </div>
                    <div class="kibitzer-setting-row">
                        <label>API Key (optional):</label>
                        <input type="password" id="kibitzer-api-key" class="text_pole" placeholder="Leave empty to use SillyTavern's key" />
                    </div>
                    <div class="kibitzer-setting-row">
                        <label>Model:</label>
                        <div class="kibitzer-char-select-row">
                            <select id="kibitzer-model-select" class="text_pole"><option value="">-- Select Model --</option></select>
                            <button id="kibitzer-refresh-models" class="menu_button" title="Refresh model list"><i class="fa-solid fa-rotate"></i></button>
                        </div>
                        <small id="kibitzer-model-hint">Select a model from SillyTavern's list</small>
                    </div>
                    <div id="kibitzer-model-manual-container" class="kibitzer-setting-row" style="display: none;">
                        <input type="text" id="kibitzer-model-manual" class="text_pole" placeholder="Enter model name manually" />
                    </div>
                    <div class="kibitzer-setting-row">
                        <label>Prompt Preset:</label>
                        <div class="kibitzer-char-select-row">
                            <select id="kibitzer-preset-select" class="text_pole"><option value="">-- Use Default Kibitzer Prompt --</option></select>
                            <button id="kibitzer-refresh-presets" class="menu_button" title="Refresh preset list"><i class="fa-solid fa-rotate"></i></button>
                        </div>
                        <small>Use a Chat Completion Preset as the system prompt</small>
                    </div>
                </div>

                <hr class="sysHR" />
                <h4 class="kibitzer-section-title">Character & UI</h4>
                <div class="kibitzer-setting-row">
                    <label>Critic Character:</label>
                    <div class="kibitzer-char-select-row">
                        <select id="kibitzer-character-select" class="text_pole"></select>
                        <button id="kibitzer-refresh-chars" class="menu_button"><i class="fa-solid fa-rotate"></i></button>
                    </div>
                </div>
                <div class="kibitzer-setting-row">
                    <label>Commentary Style:</label>
                    <select id="kibitzer-style-select" class="text_pole">
                        <option value="none">🔇 None</option>
                        <option value="snarky">🎭 Snarky</option>
                        <option value="supportive">🎉 Supportive</option>
                        <option value="analytical">🔍 Analytical</option>
                        <option value="chaotic">🌀 Chaotic</option>
                    </select>
                </div>
                <div class="kibitzer-setting-row">
                    <label>Color Theme:</label>
                    <select id="kibitzer-theme-select" class="text_pole">
                        <option value="pink">🌸 Pink</option>
                        <option value="lavender">💜 Lavender</option>
                        <option value="mint">🌿 Mint</option>
                        <option value="peach">🍑 Peach</option>
                        <option value="sky">☁️ Sky</option>
                        <option value="berry">🫐 Berry</option>
                        <option value="custom">🎨 Custom</option>
                    </select>
                </div>
                <div class="kibitzer-setting-row">
                    <button id="kibitzer-force-comment" class="menu_button"><i class="fa-solid fa-comment"></i> Force Comment Now</button>
                </div>
            </div>
        </div>
    </div>`;

    $('#extensions_settings2').append(settingsHtml);
    const settings = getSettings();

    // Basic Toggles
    $('#kibitzer-enabled').prop('checked', settings.enabled).on('change', (e) => {
        settings.enabled = e.target.checked;
        saveSettings();
        switchDisplayMode(settings.displayMode);
    });

    $('#kibitzer-display-mode').val(settings.displayMode).on('change', (e) => {
        settings.displayMode = e.target.value;
        saveSettings();
        switchDisplayMode(settings.displayMode);
        updateDisplayModeOptions(settings.displayMode);
    });
    
    // Initialize display mode sub-options visibility
    updateDisplayModeOptions(settings.displayMode);
    
    // Widget sub-options
    $('#kibitzer-avatar-size').val(settings.uiAvatarSize).on('change', (e) => {
        settings.uiAvatarSize = e.target.value;
        applyUITheme();
        saveSettings();
    });
    
    $('#kibitzer-bubble-position').val(settings.uiBubblePosition).on('change', (e) => {
        settings.uiBubblePosition = e.target.value;
        applyUITheme();
        saveSettings();
    });
    
    $('#kibitzer-opacity').val(settings.uiOpacity);
    $('#kibitzer-opacity-value').text(`${settings.uiOpacity}%`);
    $('#kibitzer-opacity').on('input', (e) => {
        settings.uiOpacity = parseInt(e.target.value);
        $('#kibitzer-opacity-value').text(`${settings.uiOpacity}%`);
        applyUITheme();
        applyBarTheme();
        saveSettings();
    });
    
    // Bar sub-options (ticker settings)
    $('#kibitzer-ticker-speed').val(settings.uiTickerSpeed);
    $('#kibitzer-ticker-speed-value').text(`${settings.uiTickerSpeed} px/s`);
    $('#kibitzer-ticker-speed').on('input', (e) => {
        settings.uiTickerSpeed = parseInt(e.target.value);
        $('#kibitzer-ticker-speed-value').text(`${settings.uiTickerSpeed} px/s`);
        saveSettings();
        applyBarTickerAnimation();
    });
    
    $('#kibitzer-ticker-always').prop('checked', settings.uiTickerAlwaysScroll).on('change', (e) => {
        settings.uiTickerAlwaysScroll = e.target.checked;
        saveSettings();
        applyBarTickerAnimation();
    });

    // API Logic
    $('#kibitzer-api-mode').val(settings.apiMode).on('change', (e) => {
        settings.apiMode = e.target.value;
        saveSettings();
        $('#kibitzer-profile-options').toggle(settings.apiMode === 'profile');
        $('#kibitzer-custom-api-options').toggle(settings.apiMode === 'custom');
        if (settings.apiMode === 'custom') {
            autoFillApiSettings(settings.customApiType || 'openai');
            populatePresetDropdown();
        }
    });

    // Custom API Controls
    $('#kibitzer-api-type').val(settings.customApiType).on('change', (e) => {
        settings.customApiType = e.target.value;
        saveSettings();
        autoFillApiSettings(settings.customApiType);
    });

    $('#kibitzer-api-url').val(settings.customApiUrl).on('change', (e) => {
        settings.customApiUrl = e.target.value;
        saveSettings();
        populateModelDropdown();
    });

    $('#kibitzer-api-key').val(settings.customApiKey).on('change', (e) => {
        settings.customApiKey = e.target.value;
        saveSettings();
    });

    $('#kibitzer-autofill-url').on('click', () => autoFillApiSettings(settings.customApiType));
    
    $('#kibitzer-refresh-models').on('click', () => {
        if (typeof toastr !== 'undefined') toastr.info('Fetching models...', 'Kibitzer');
        populateModelDropdown();
    });

    $('#kibitzer-model-select').on('change', (e) => {
        if (e.target.value === '__manual__') {
            $('#kibitzer-model-manual-container').show();
        } else {
            $('#kibitzer-model-manual-container').hide();
            settings.customModel = e.target.value;
            saveSettings();
        }
    });

    $('#kibitzer-model-manual').val(settings.customModel).on('change', (e) => {
        settings.customModel = e.target.value;
        saveSettings();
    });

    // Presets
    $('#kibitzer-refresh-presets').on('click', async () => {
        if (typeof toastr !== 'undefined') toastr.info('Refreshing presets...', 'Kibitzer');
        await populatePresetDropdown();
        if (typeof toastr !== 'undefined') toastr.success(`Found ${kibitzer.cachedPresets.length} presets`, 'Kibitzer');
    });

    $('#kibitzer-preset-select').on('change', (e) => {
        settings.selectedPreset = e.target.value;
        saveSettings();
        console.log(DEBUG_PREFIX, 'Selected preset:', settings.selectedPreset);
    });

    // Character & Style
    populateCharacterDropdown();
    $('#kibitzer-refresh-chars').on('click', populateCharacterDropdown);
    $('#kibitzer-character-select').on('change', onCharacterSelect);
    
    $('#kibitzer-style-select').val(settings.commentaryStyle).on('change', (e) => {
        settings.commentaryStyle = e.target.value;
        saveSettings();
    });

    $('#kibitzer-theme-select').val(settings.uiTheme).on('change', (e) => {
        settings.uiTheme = e.target.value;
        saveSettings();
        applyUITheme();
        applyBarTheme();
    });

    $('#kibitzer-force-comment').on('click', () => generateCommentary(true));

    // Visibility management
    $('#kibitzer-profile-options').toggle(settings.apiMode === 'profile');
    $('#kibitzer-custom-api-options').toggle(settings.apiMode === 'custom');

    // Drawer toggle
    $('#kibitzer-settings .inline-drawer-toggle').on('click', function() {
        const content = $(this).closest('.inline-drawer').find('.inline-drawer-content');
        
        setTimeout(() => {
            if (content.is(':visible') && settings.apiMode === 'custom') {
                populateModelDropdown();
                populatePresetDropdown();
            }
        }, 200);
    });
}

// --- CORE LOGIC ---

function populateCharacterDropdown() {
    const dropdown = document.getElementById('kibitzer-character-select');
    if (!dropdown) return;
    const settings = getSettings();
    const context = getContext();
    const charactersList = context.characters || [];
    
    dropdown.innerHTML = '<option value="">-- Select a Character --</option>';
    
    charactersList.forEach((char, index) => {
        if (!char || !char.name) return;
        const option = document.createElement('option');
        option.value = char.avatar || index;
        option.textContent = char.name;
        option.dataset.index = index;
        if ((settings.characterAvatar && char.avatar === settings.characterAvatar) || 
            (settings.characterName && char.name === settings.characterName)) {
            option.selected = true;
        }
        dropdown.appendChild(option);
    });
}

function onCharacterSelect(e) {
    const settings = getSettings();
    const selectedOption = e.target.selectedOptions[0];
    if (!selectedOption || selectedOption.value === '') {
        settings.characterId = null;
        settings.characterName = '';
        settings.characterAvatar = '';
    } else {
        const context = getContext();
        const charIndex = parseInt(selectedOption.dataset.index);
        const char = context.characters[charIndex];
        if (char) {
            settings.characterId = charIndex;
            settings.characterName = char.name;
            settings.characterAvatar = char.avatar || '';
        }
    }
    updateWidgetCharacter();
    updateBarCharacter();
    saveSettings();
}

async function generateCommentary(force = false) {
    const settings = getSettings();
    if (!settings.enabled && !force) return;
    if (kibitzer.isGenerating) return;
    
    // Check frequency
    if (!force) {
        settings.messageCount++;
        if (settings.messageCount < settings.frequency) {
            saveSettings();
            return;
        }
        settings.messageCount = 0;
        saveSettings();
    }
    
    kibitzer.isGenerating = true;
    showTypingIndicator(true);
    
    try {
        const context = getContext();
        const recentMessages = context.chat.slice(-settings.maxContextMessages);
        let chatLog = recentMessages.map(msg => `Speaker (${msg.is_user ? 'User' : msg.name}): ${msg.mes}`).join('\n\n');
        
        // Build Kibitzer-specific prompt
        let characterPersonality = '';
        if (settings.characterId !== null && context.characters[settings.characterId]) {
            const char = context.characters[settings.characterId];
            characterPersonality = char.description || '';
            if (char.personality) characterPersonality += '\n' + char.personality;
        }
        
        const stylePrompt = COMMENTARY_STYLES[settings.commentaryStyle] || '';
        const kibitzerName = settings.characterName || 'the Kibitzer';
        
        const prompt = `
### IDENTITY
You are ${kibitzerName}.
${characterPersonality ? `[Your Personality]\n${characterPersonality}` : ''}
${stylePrompt ? `[Your Style]\n${stylePrompt}` : ''}
...

### TASK
You are watching the "Roleplay Log" below. Provide a single, short (1-3 sentences) in-character reaction.
Do NOT repeat the log. Do NOT continue the story. Just comment.

### LOG
${chatLog}

### RESPONSE
(As ${kibitzerName}):
`;

        let rawCommentary = '';
        if (settings.apiMode === 'custom') {
            rawCommentary = await generateWithCustomApi(prompt);
        } else {
            // Profile mode logic
            let originalProfile = '';
            const currentProfile = await getCurrentProfile();
            if (settings.connectionProfile && settings.connectionProfile !== currentProfile) {
                originalProfile = currentProfile;
                await switchProfile(settings.connectionProfile);
                await new Promise(r => setTimeout(r, 100));
            }
            rawCommentary = await generateQuietPrompt(prompt, false, false);
            if (originalProfile) await switchProfile(originalProfile);
        }
        
        // Simple Cleanup
        let cleaned = rawCommentary.trim();
        if ((cleaned.startsWith('"') && cleaned.endsWith('"'))) cleaned = cleaned.slice(1, -1);
        const prefixRegex = /^(Commentary:|Response:|As .*?:)\s*/i;
        cleaned = cleaned.replace(prefixRegex, '');
        
        if (cleaned) updateCommentaryText(cleaned);
        
    } catch (error) {
        console.error(DEBUG_PREFIX, error);
        updateCommentaryText(`*mumbles* (Error: ${error.message})`);
    } finally {
        kibitzer.isGenerating = false;
        showTypingIndicator(false);
    }
}

function showTypingIndicator(show) {
    if (kibitzer.widget) {
        if (show) kibitzer.widget.classList.add('is-typing');
        else kibitzer.widget.classList.remove('is-typing');
    }
    if (kibitzer.bar) showBarTypingIndicator(show);
}

async function getConnectionProfiles() {
    try {
        const result = await executeSlashCommand('/profile-list');
        if (result) return JSON.parse(result);
    } catch (e) { console.error(DEBUG_PREFIX, e); }
    return [];
}

async function getCurrentProfile() {
    try {
        return (await executeSlashCommand('/profile')).trim();
    } catch (e) { return ''; }
}

async function switchProfile(profileName) {
    try {
        await executeSlashCommand(`/profile ${profileName}`);
        return true;
    } catch (e) { return false; }
}

// --- INIT ---

jQuery(async () => {
    console.log(DEBUG_PREFIX, 'Initializing...');
    loadSettings();
    
    // Create UI Elements
    createWidget();
    createBar();
    switchDisplayMode(getSettings().displayMode);
    
    await setupSettingsUI();
    
    // Initial fetch if custom mode
    if (getSettings().apiMode === 'custom') {
        setTimeout(async () => {
            await populatePresetDropdown();
            await populateModelDropdown();
        }, 1500);
    }
    
    // Event Listeners
    eventSource.on(event_types.MESSAGE_RECEIVED, () => {
        if (!kibitzer.chatJustChanged) generateCommentary(false);
    });
    
    eventSource.on(event_types.CHAT_CHANGED, () => {
        kibitzer.chatJustChanged = true;
        setTimeout(() => kibitzer.chatJustChanged = false, 2000);
        updateCommentaryText('New chat! Watching...');
        if (getSettings().autoShow) switchDisplayMode(getSettings().displayMode);
    });

    eventSource.on(event_types.CHARACTER_DELETED, populateCharacterDropdown);
    eventSource.on(event_types.CHARACTER_EDITED, populateCharacterDropdown);
    
    setTimeout(() => {
        populateCharacterDropdown();
        updateWidgetCharacter();
        updateBarCharacter();
    }, 1000);
    
    // Populate Profiles for Profile Mode
    const profiles = await getConnectionProfiles();
    const profSelect = document.getElementById('kibitzer-profile-select');
    if (profSelect) {
        profiles.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = p;
            if (getSettings().connectionProfile === p) opt.selected = true;
            profSelect.appendChild(opt);
        });
        profSelect.addEventListener('change', (e) => {
            getSettings().connectionProfile = e.target.value;
            saveSettings();
        });
    }

    console.log(DEBUG_PREFIX, 'Ready!');
});
