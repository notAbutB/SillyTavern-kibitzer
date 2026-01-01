/**
 * Kibitzer - A SillyTavern Extension
 * A floating critic character that offers unsolicited commentary on your RPs
 * 
 * Now with Connection Profile support!
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
    connectionProfile: '', // Empty means use current profile
    frequency: 5, // Every N messages
    frequencyLocked: false,
    messageCount: 0,
    widgetPosition: { x: 20, y: 20 },
    widgetMinimized: false,
    customSystemPrompt: '',
    maxContextMessages: 10,
    contextLocked: false,
    autoShow: true,
    commentaryStyle: 'snarky', // snarky, supportive, analytical, chaotic
    displayMode: 'widget', // widget or bar
    // UI Customization
    uiTheme: 'pink', // pink, lavender, mint, peach, custom
    uiAvatarSize: 'medium', // small, medium, large
    uiBubblePosition: 'right', // left, right
    uiOpacity: 100, // 0-100
    uiCustomColors: {
        primary: '#ffb6c1',
        secondary: '#ffe4e9',
        accent: '#ff8fa3',
        text: '#5a4a5c',
    },
    // Ticker settings
    uiTickerSpeed: 50, // pixels per second (lower = slower)
    uiTickerAlwaysScroll: true, // always scroll even if text fits
        // Quick API settings (new)
    quickApiEnabled: false,
    quickApiProvider: '', // 'openrouter', 'google', 'deepseek', 'groq', 'openai', 'claude', 'mistralai', 'custom'
    quickApiModel: '',
    quickApiUrl: '', // only for 'custom' provider
    openRouterModelsCache: [], // cached model list
    openRouterModelsCacheTime: 0, // when we last fetched
};

// Theme color presets
const UI_THEMES = {
    pink: {
        primary: '#ffb6c1',
        secondary: '#ffe4e9',
        accent: '#ff8fa3',
        text: '#5a4a5c',
        name: '🌸 Pink (Default)',
    },
    lavender: {
        primary: '#c9b1ff',
        secondary: '#ece4ff',
        accent: '#a78bfa',
        text: '#4a4063',
        name: '💜 Lavender',
    },
    mint: {
        primary: '#a8e6cf',
        secondary: '#dffff0',
        accent: '#56c596',
        text: '#2d5a47',
        name: '🌿 Mint',
    },
    peach: {
        primary: '#ffcba4',
        secondary: '#fff0e5',
        accent: '#ff9a5c',
        text: '#5c4a3d',
        name: '🍑 Peach',
    },
    sky: {
        primary: '#87ceeb',
        secondary: '#e0f4ff',
        accent: '#5bb5e0',
        text: '#3a5a6a',
        name: '☁️ Sky',
    },
    berry: {
        primary: '#e091b8',
        secondary: '#fce4ef',
        accent: '#c45a8a',
        text: '#5a3a4a',
        name: '🫐 Berry',
    },
    custom: {
        name: '🎨 Custom',
    },
};

// Quick API provider definitions
const QUICK_API_PROVIDERS = {
    openrouter: {
        name: 'OpenRouter',
        icon: '🌐',
        apiName: 'openrouter',
        hasModelList: true,
        modelListUrl: 'https://openrouter.ai/api/v1/models',
        needsApiUrl: false,
    },
    google: {
        name: 'Google AI Studio',
        icon: '🔷',
        apiName:  'makersuite',
        hasModelList: false,
        needsApiUrl: false,
    },
    deepseek:  {
        name: 'DeepSeek',
        icon:  '🐋',
        apiName: 'deepseek',
        hasModelList: false,
        needsApiUrl: false,
    },
    groq: {
        name: 'Groq',
        icon:  '⚡',
        apiName:  'groq',
        hasModelList: false,
        needsApiUrl: false,
    },
    openai: {
        name: 'OpenAI',
        icon: '🤖',
        apiName: 'openai',
        hasModelList: false,
        needsApiUrl: false,
    },
    claude: {
        name: 'Claude',
        icon: '🧡',
        apiName: 'claude',
        hasModelList: false,
        needsApiUrl: false,
    },
    mistralai: {
        name: 'Mistral AI',
        icon: '🌀',
        apiName: 'mistralai',
        hasModelList: false,
        needsApiUrl:  false,
    },
    custom: {
        name: 'Custom (OpenAI-compatible)',
        icon: '🔧',
        apiName: 'custom',
        hasModelList:  false,
        needsApiUrl: true,
    },
};

// Avatar size presets
const AVATAR_SIZES = {
    small: 55,
    medium: 70,
    large: 90,
};

/**
 * Suppress toast notifications temporarily
 */
let originalToastr = null;
let originalToastify = null;

function suppressToasts(suppress) {
    if (suppress) {
        // Save and disable toastr (common toast library)
        if (typeof toastr !== 'undefined' && ! originalToastr) {
            originalToastr = {
                success: toastr.success,
                info: toastr.info,
                warning: toastr.warning,
                error: toastr.error,
            };
            toastr.success = () => {};
            toastr. info = () => {};
            toastr.warning = () => {};
            toastr.error = () => {};
        }
        
        // Save and disable Toastify (another common library)
        if (typeof Toastify !== 'undefined' && !originalToastify) {
            originalToastify = Toastify;
            window.Toastify = function() {
                return { showToast: () => {} };
            };
        }
    } else {
        // Restore toastr
        if (originalToastr) {
            toastr. success = originalToastr.success;
            toastr.info = originalToastr.info;
            toastr.warning = originalToastr.warning;
            toastr.error = originalToastr.error;
            originalToastr = null;
        }
        
        // Restore Toastify
        if (originalToastify) {
            window.Toastify = originalToastify;
            originalToastify = null;
        }
    }
}


// Commentary style presets
const COMMENTARY_STYLES = {
    snarky: 'Tone: Witty, slightly sardonic, entertaining but not mean-spirited.',
    supportive: 'Tone: Enthusiastic, encouraging, cheering on the participants.',
    analytical: 'Tone: Insightful, observant, focusing on choices and narrative.',
    chaotic: 'Tone: Unpredictable, humorous, absurd, breaking the fourth wall.',
};

let kibitzer = {
    widget: null,
    bar: null, // New bar display mode
    isDragging: false,
    wasDragging: false,
    dragOffset: { x: 0, y: 0 },
    dragStartPos: { x: 0, y: 0 },
    lastCommentary: '',
    lastBarMessage: '', // Track last bar message to prevent duplicates
    isGenerating: false,
    recentChatNames: [],
    availableProfiles: [],
    lastTriggerTime: 0, // Debounce protection
    chatJustChanged: false, // Flag to ignore messages during chat load
};

/**
 * Initialize extension settings
 */
function loadSettings() {
    extension_settings[MODULE_NAME] = extension_settings[MODULE_NAME] || {};
    
    // Apply defaults for any missing settings
    for (const [key, value] of Object.entries(defaultSettings)) {
        if (extension_settings[MODULE_NAME][key] === undefined) {
            extension_settings[MODULE_NAME][key] = value;
        }
    }
}

/**
 * Get current settings
 */
function getSettings() {
    return extension_settings[MODULE_NAME];
}

/**
 * Save settings
 */
function saveSettings() {
    saveSettingsDebounced();
}

/**
 * Execute a slash command and get the result
 * @param {string} command - The slash command to execute
 * @returns {Promise<string>} - The result of the command
 */
async function executeSlashCommand(command) {
    try {
        const context = SillyTavern.getContext();
        if (context. executeSlashCommandsWithOptions) {
            const result = await context.executeSlashCommandsWithOptions(command, {
                handleExecutionErrors: false,
                handleParserErrors: false,
            });
            return result?. pipe || '';
        }
    } catch (error) {
        console.error(DEBUG_PREFIX, 'Error executing slash command:', command, error);
    }
    return '';
}

/**
 * Get the list of available connection profiles
 * @returns {Promise<string[]>} - Array of profile names
 */
async function getConnectionProfiles() {
    try {
        const result = await executeSlashCommand('/profile-list');
        if (result) {
            const profiles = JSON.parse(result);
            if (Array.isArray(profiles)) {
                return profiles;
            }
        }
    } catch (error) {
        console.error(DEBUG_PREFIX, 'Error getting connection profiles:', error);
    }
    return [];
}

/**
 * Get the current connection profile name
 * @returns {Promise<string>} - Current profile name
 */
async function getCurrentProfile() {
    try {
        const result = await executeSlashCommand('/profile');
        return result. trim();
    } catch (error) {
        console.error(DEBUG_PREFIX, 'Error getting current profile:', error);
    }
    return '';
}

/**
 * Switch to a specific connection profile
 * @param {string} profileName - The profile name to switch to
 * @returns {Promise<boolean>} - Whether the switch was successful
 */
async function switchProfile(profileName) {
    if (!profileName) return false;
    try {
        await executeSlashCommand(`/profile ${profileName}`);
        console.log(DEBUG_PREFIX, 'Switched to profile:', profileName);
        return true;
    } catch (error) {
        console.error(DEBUG_PREFIX, 'Error switching profile:', error);
        return false;
    }
}

/**
 * Populate the connection profile dropdown
 */
async function populateProfileDropdown() {
    const dropdown = document.getElementById('kibitzer-profile-select');
    if (!dropdown) return;
    
    const settings = getSettings();
    
    // Get available profiles
    kibitzer.availableProfiles = await getConnectionProfiles();
    
    // Clear and rebuild dropdown
    dropdown.innerHTML = '<option value="">-- Use Current Profile --</option>';
    
    if (kibitzer.availableProfiles.length > 0) {
        kibitzer.availableProfiles.forEach((profileName) => {
            const option = document.createElement('option');
            option.value = profileName;
            option.textContent = profileName;
            
            if (settings.connectionProfile === profileName) {
                option.selected = true;
            }
            
            dropdown.appendChild(option);
        });
        
        console.log(DEBUG_PREFIX, 'Loaded connection profiles:', kibitzer.availableProfiles);
    } else {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = '(No profiles found)';
        option.disabled = true;
        dropdown.appendChild(option);
        console.log(DEBUG_PREFIX, 'No connection profiles found');
    }
}

/**
 * Fetch OpenRouter models (public API, no key needed)
 * @returns {Promise<Array>} Array of model objects
 */
async function fetchOpenRouterModels() {
    const settings = getSettings();
    
    // Check cache (valid for 1 hour)
    const cacheAge = Date.now() - settings.openRouterModelsCacheTime;
    if (settings.openRouterModelsCache. length > 0 && cacheAge < 3600000) {
        console.log(DEBUG_PREFIX, 'Using cached OpenRouter models');
        return settings.openRouterModelsCache;
    }
    
    try {
        console.log(DEBUG_PREFIX, 'Fetching OpenRouter models.. .');
        const response = await fetch('https://openrouter.ai/api/v1/models');
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.data && Array.isArray(data. data)) {
            // Sort by name for easier browsing
            const models = data.data.sort((a, b) => a.id.localeCompare(b. id));
            
            // Cache the results
            settings.openRouterModelsCache = models;
            settings.openRouterModelsCacheTime = Date.now();
            saveSettings();
            
            console. log(DEBUG_PREFIX, `Fetched ${models.length} OpenRouter models`);
            return models;
        }
        
        return [];
    } catch (error) {
        console.error(DEBUG_PREFIX, 'Error fetching OpenRouter models:', error);
        return settings.openRouterModelsCache || [];
    }
}

/**
 * Get the current API and model from SillyTavern
 * @returns {Promise<{api: string, model: string}>}
 */
async function getCurrentApiSettings() {
    try {
        const api = await executeSlashCommand('/api');
        const model = await executeSlashCommand('/model');
        return {
            api: api. trim(),
            model: model. trim(),
        };
    } catch (error) {
        console.error(DEBUG_PREFIX, 'Error getting current API settings:', error);
        return { api: '', model: '' };
    }
}

/**
 * Apply Quick API settings (switch to Kibitzer's chosen provider/model)
 * @returns {Promise<{api: string, model: string}>} Original settings to restore later
 */
async function applyQuickApiSettings() {
    const settings = getSettings();
    
    if (!settings.quickApiEnabled || !settings.quickApiProvider) {
        return null;
    }
    
    const provider = QUICK_API_PROVIDERS[settings.quickApiProvider];
    if (!provider) {
        console.error(DEBUG_PREFIX, 'Unknown provider:', settings.quickApiProvider);
        return null;
    }
    
    // Save original settings
    const original = await getCurrentApiSettings();
    console.log(DEBUG_PREFIX, 'Saving original API settings:', original);
    
    try {
        // Hide toast notifications
        suppressToasts(true);
        
        // Switch API provider
        console.log(DEBUG_PREFIX, `Switching to API: ${provider.apiName}`);
        await executeSlashCommand(`/api ${provider.apiName}`);
        
        // Set API URL if needed (for custom provider)
        if (provider.needsApiUrl && settings.quickApiUrl) {
            console.log(DEBUG_PREFIX, `Setting API URL: ${settings.quickApiUrl}`);
            await executeSlashCommand(`/api-url ${settings.quickApiUrl}`);
        }
        
        // Set model
        if (settings.quickApiModel) {
            console.log(DEBUG_PREFIX, `Setting model: ${settings.quickApiModel}`);
            await executeSlashCommand(`/model ${settings.quickApiModel}`);
        }
        
        // Small delay to ensure settings take effect
        await new Promise(resolve => setTimeout(resolve, 100));
        
        return original;
    } catch (error) {
        console.error(DEBUG_PREFIX, 'Error applying Quick API settings:', error);
        return original;
    } finally {
        // Show toast notifications again
        suppressToasts(false);
    }
}

/**
 * Restore original API settings after generation
 * @param {{api: string, model: string}} original - The original settings to restore
 */
async function restoreApiSettings(original) {
    if (!original || (! original.api && !original.model)) {
        return;
    }
    
    try {
        // Hide toast notifications
        suppressToasts(true);
        
        if (original.api) {
            console.log(DEBUG_PREFIX, `Restoring API: ${original.api}`);
            await executeSlashCommand(`/api ${original.api}`);
        }
        
        if (original.model) {
            console. log(DEBUG_PREFIX, `Restoring model: ${original.model}`);
            await executeSlashCommand(`/model ${original.model}`);
        }
        
        console.log(DEBUG_PREFIX, 'Original API settings restored');
    } catch (error) {
        console.error(DEBUG_PREFIX, 'Error restoring API settings:', error);
    } finally {
        // Show toast notifications again
        suppressToasts(false);
    }
}

/**
 * Populate the Quick API model dropdown/input
 */
async function populateQuickApiModels() {
    const settings = getSettings();
    const modelSelect = document.getElementById('kibitzer-quickapi-model-select');
    const modelInput = document.getElementById('kibitzer-quickapi-model-input');
    const modelSelectContainer = document. getElementById('kibitzer-quickapi-model-select-container');
    const modelInputContainer = document.getElementById('kibitzer-quickapi-model-input-container');
    const refreshBtn = document.getElementById('kibitzer-quickapi-refresh-models');
    const loadingIndicator = document.getElementById('kibitzer-quickapi-loading');
    
    if (!settings.quickApiProvider) {
        // No provider selected - hide both
        if (modelSelectContainer) modelSelectContainer.style.display = 'none';
        if (modelInputContainer) modelInputContainer.style.display = 'none';
        return;
    }
    
    const provider = QUICK_API_PROVIDERS[settings.quickApiProvider];
    if (!provider) return;
    
    if (provider.hasModelList) {
        // OpenRouter - use dropdown with fetched models
        if (modelSelectContainer) modelSelectContainer.style. display = 'block';
        if (modelInputContainer) modelInputContainer.style.display = 'none';
        if (refreshBtn) refreshBtn.style.display = 'inline-block';
        
        // Show loading
        if (loadingIndicator) loadingIndicator.style.display = 'inline';
        if (modelSelect) modelSelect.disabled = true;
        
        const models = await fetchOpenRouterModels();
        
        // Hide loading
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        if (modelSelect) modelSelect.disabled = false;
        
        if (modelSelect) {
            modelSelect.innerHTML = '<option value="">-- Select a model --</option>';
            
            models.forEach(model => {
                const option = document.createElement('option');
                option.value = model. id;
                option.textContent = `${model.id} ${model.pricing ? `($${(model.pricing.prompt * 1000000).toFixed(2)}/M)` : ''}`;
                
                if (settings. quickApiModel === model.id) {
                    option.selected = true;
                }
                
                modelSelect.appendChild(option);
            });
        }
    } else {
        // All other providers - just show text input
        if (modelSelectContainer) modelSelectContainer.style.display = 'none';
        if (modelInputContainer) modelInputContainer.style. display = 'block';
        if (refreshBtn) refreshBtn.style.display = 'none';
        if (loadingIndicator) loadingIndicator.style. display = 'none';
        
        if (modelInput) {
            modelInput.value = settings.quickApiModel || '';
            modelInput.placeholder = `Enter ${provider.name} model name... `;
        }
    }
    
    // Update status display
    updateQuickApiStatus();
}

/**
 * Update the Quick API status display
 */
function updateQuickApiStatus() {
    const settings = getSettings();
    const statusEl = document.getElementById('kibitzer-quickapi-status');
    
    if (!statusEl) return;
    
    if (! settings.quickApiEnabled) {
        statusEl.innerHTML = '<span class="kibitzer-status-inactive">Quick API disabled</span>';
        return;
    }
    
    if (!settings.quickApiProvider) {
        statusEl.innerHTML = '<span class="kibitzer-status-warning">⚠️ Select a provider</span>';
        return;
    }
    
    const provider = QUICK_API_PROVIDERS[settings.quickApiProvider];
    if (!provider) {
        statusEl.innerHTML = '<span class="kibitzer-status-warning">⚠️ Unknown provider</span>';
        return;
    }
    
    if (! settings.quickApiModel) {
        statusEl.innerHTML = `<span class="kibitzer-status-warning">⚠️ ${provider.icon} ${provider.name} — select a model</span>`;
        return;
    }
    
    if (provider.needsApiUrl && ! settings.quickApiUrl) {
        statusEl.innerHTML = `<span class="kibitzer-status-warning">⚠️ ${provider.icon} ${provider.name} — enter API URL</span>`;
        return;
    }
    
    statusEl.innerHTML = `<span class="kibitzer-status-active">✓ Kibitzer will use:  ${provider.icon} ${provider. name} → <strong>${settings.quickApiModel}</strong></span>`;
}

/**
 * Connect to Quick API settings (apply without generating)
 * This validates and shows the user that Quick API is ready
 */
async function connectQuickApi() {
    const settings = getSettings();
    
    if (!settings. quickApiEnabled) {
        alert('Please enable Quick API first!');
        return;
    }
    
    if (!settings.quickApiProvider) {
        alert('Please select a provider first!');
        return;
    }
    
    if (!settings.quickApiModel) {
        alert('Please enter a model name first!');
        return;
    }
    
    const provider = QUICK_API_PROVIDERS[settings.quickApiProvider];
    if (!provider) {
        alert('Unknown provider selected!');
        return;
    }
    
    if (provider.needsApiUrl && ! settings.quickApiUrl) {
        alert('Please enter an API URL for the custom provider!');
        return;
    }
    
    const connectBtn = document.getElementById('kibitzer-quickapi-connect');
    const originalText = connectBtn?. innerHTML;
    
    try {
        // Show connecting state
        if (connectBtn) {
            connectBtn.disabled = true;
            connectBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Connecting...';
        }
        
        // Apply the Quick API settings temporarily to verify they work
        const originalApiSettings = await applyQuickApiSettings();
        
        if (originalApiSettings) {
            // Small delay to let it "feel" like it's doing something
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Restore original settings
            await restoreApiSettings(originalApiSettings);
            
            // Show success
            if (connectBtn) {
                connectBtn.innerHTML = '<i class="fa-solid fa-check"></i> Connected!';
                connectBtn.classList.add('success');
            }
            
            // Update status
            const statusEl = document.getElementById('kibitzer-quickapi-status');
            if (statusEl) {
                statusEl.innerHTML = `<span class="kibitzer-status-active">✓ Ready!  ${provider.icon} ${provider. name} → <strong>${settings. quickApiModel}</strong></span>`;
            }
            
            console.log(DEBUG_PREFIX, `Quick API connected: ${provider.name} / ${settings.quickApiModel}`);
            
            // Reset button after delay
            setTimeout(() => {
                if (connectBtn) {
                    connectBtn.innerHTML = originalText;
                    connectBtn.disabled = false;
                    connectBtn. classList.remove('success');
                }
            }, 2000);
        } else {
            throw new Error('Failed to apply API settings');
        }
        
    } catch (error) {
        console.error(DEBUG_PREFIX, 'Quick API connect error:', error);
        
        if (connectBtn) {
            connectBtn. innerHTML = '<i class="fa-solid fa-xmark"></i> Failed';
            connectBtn.classList.add('error');
            
            setTimeout(() => {
                connectBtn. innerHTML = originalText;
                connectBtn.disabled = false;
                connectBtn.classList.remove('error');
            }, 2000);
        }
        
        alert(`Connection failed: ${error.message || 'Unknown error'}`);
    }
}

/**
 * Handle provider button click
 */
function onQuickApiProviderClick(providerKey) {
    const settings = getSettings();
    
    // Update button states
    document.querySelectorAll('.kibitzer-provider-btn').forEach(btn => {
        btn.classList.remove('selected');
    });
    
    const clickedBtn = document.querySelector(`.kibitzer-provider-btn[data-provider="${providerKey}"]`);
    if (clickedBtn) {
        clickedBtn.classList.add('selected');
    }
    
    // Save provider selection
    settings.quickApiProvider = providerKey;
    settings.quickApiModel = ''; // Reset model when provider changes
    saveSettings();
    
    // Show/hide API URL field
    const apiUrlContainer = document.getElementById('kibitzer-quickapi-url-container');
    const provider = QUICK_API_PROVIDERS[providerKey];
    if (apiUrlContainer) {
        apiUrlContainer.style. display = provider && provider.needsApiUrl ? 'block' : 'none';
    }
    
    // Populate models
    populateQuickApiModels();
}

/**
 * Apply UI theme and customization to widget
 */

/**
 * Apply UI theme and customization to widget
 */
function applyUITheme() {
    const settings = getSettings();
    const widget = kibitzer.widget;
    
    if (!widget) return;
    
    // Get theme colors
    let colors;
    if (settings.uiTheme === 'custom') {
        colors = settings.uiCustomColors;
    } else {
        colors = UI_THEMES[settings.uiTheme] || UI_THEMES.pink;
    }
    
    // Apply CSS custom properties to widget
    widget.style.setProperty('--kb-primary', colors.primary);
    widget.style.setProperty('--kb-secondary', colors.secondary);
    widget.style.setProperty('--kb-accent', colors.accent);
    widget.style.setProperty('--kb-text', colors.text);
    
    // Apply avatar size
    const avatarSize = AVATAR_SIZES[settings.uiAvatarSize] || AVATAR_SIZES.medium;
    widget.style.setProperty('--kb-avatar-size', `${avatarSize}px`);
    widget.style.setProperty('--kb-bubble-offset', `${avatarSize + 10}px`);
    
    // Apply bubble position
    widget.classList.remove('bubble-left', 'bubble-right');
    widget.classList.add(`bubble-${settings.uiBubblePosition}`);
    
    // Apply opacity
    widget.style.setProperty('--kb-opacity', settings.uiOpacity / 100);
}

/**
 * Create the floating widget
 */
function createWidget() {
    if (kibitzer.widget) {
        kibitzer.widget.remove();
    }

    const settings = getSettings();
    
    const widget = document.createElement('div');
    widget.id = 'kibitzer-widget';
    widget.className = settings.widgetMinimized ? 'minimized' : '';
    
    widget.innerHTML = `
        <div class="kibitzer-avatar-bubble">
            <img class="kibitzer-avatar" src="" alt="Kibitzer" draggable="false" />
            <div class="kibitzer-avatar-placeholder">
                <i class="fa-solid fa-cat"></i>
            </div>
            <div class="kibitzer-notification-dot"></div>
        </div>
        
        <div class="kibitzer-speech-bubble">
            <div class="kibitzer-speech-content">
                <p class="kibitzer-text">Click me to get started~!</p>
            </div>
            <div class="kibitzer-speech-tail"></div>
            <button class="kibitzer-bubble-close" title="Dismiss">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>
        
        <div class="kibitzer-typing-bubble">
            <div class="kibitzer-typing">
                <span class="dot"></span>
                <span class="dot"></span>
                <span class="dot"></span>
            </div>
            <div class="kibitzer-speech-tail"></div>
        </div>
        
        <div class="kibitzer-panel">
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
    `;
    
    document.body.appendChild(widget);
    kibitzer.widget = widget;
    
    // Set position
    widget.style.left = `${settings.widgetPosition.x}px`;
    widget.style.top = `${settings.widgetPosition.y}px`;
    
    // Apply UI theme
    applyUITheme();
    
    // Update avatar and name
    updateWidgetCharacter();
    
    // Setup event listeners
    setupWidgetEvents();
}

/**
 * Create the bar display mode
 */
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
    
    // Find the Quick Reply bar to match its container/alignment
    const qrBar = document.getElementById('qr--bar');
    const sendForm = document.getElementById('send_form');
    const inputArea = document.getElementById('form_sheld');
    
    if (qrBar && qrBar.parentNode) {
        // Insert before Quick Reply, inherit its margin/padding context
        qrBar.parentNode.insertBefore(bar, qrBar);
    } else if (sendForm && sendForm.parentNode) {
        sendForm.parentNode.insertBefore(bar, sendForm);
    } else if (inputArea) {
        inputArea.insertBefore(bar, inputArea.firstChild);
    } else {
        // Fallback: append to body
        document.body.appendChild(bar);
        bar.style.position = 'fixed';
        bar.style.bottom = '120px';
        bar.style.left = '0';
        bar.style.right = '0';
        bar.style.padding = '6px 15px';
    }
    
    kibitzer.bar = bar;
    
    // Apply UI theme
    applyBarTheme();
    
    // Update avatar and name
    updateBarCharacter();
    
    // Setup event listeners
    setupBarEvents();
}

/**
 * Apply theme colors to bar
 */
function applyBarTheme() {
    const settings = getSettings();
    const bar = kibitzer.bar;
    
    if (!bar) return;
    
    let colors;
    if (settings.uiTheme === 'custom') {
        colors = settings.uiCustomColors;
    } else {
        colors = UI_THEMES[settings.uiTheme] || UI_THEMES.pink;
    }
    
    bar.style.setProperty('--kb-primary', colors.primary);
    bar.style.setProperty('--kb-secondary', colors.secondary);
    bar.style.setProperty('--kb-accent', colors.accent);
    bar.style.setProperty('--kb-text', colors.text);
    bar.style.setProperty('--kb-opacity', settings.uiOpacity / 100);
}

/**
 * Update bar with selected character info
 */
function updateBarCharacter() {
    const settings = getSettings();
    const bar = kibitzer.bar;
    
    if (!bar) return;
    
    const avatarEl = bar.querySelector('.kibitzer-bar-avatar-img');
    const placeholderEl = bar.querySelector('.kibitzer-bar-avatar-placeholder');
    const nameEl = bar.querySelector('.kibitzer-bar-name');
    const panelNameEl = bar.querySelector('.kibitzer-bar-panel .kibitzer-name');
    
    if (settings.characterAvatar) {
        const avatarUrl = `/characters/${encodeURIComponent(settings.characterAvatar)}`;
        avatarEl.src = avatarUrl;
        avatarEl.style.display = 'block';
        if (placeholderEl) placeholderEl.style.display = 'none';
        
        avatarEl.onerror = function() {
            this.src = `/thumbnail?type=avatar&file=${encodeURIComponent(settings.characterAvatar)}`;
            this.onerror = function() {
                this.style.display = 'none';
                if (placeholderEl) placeholderEl.style.display = 'flex';
            };
        };
    } else {
        avatarEl.src = '';
        avatarEl.style.display = 'none';
        if (placeholderEl) placeholderEl.style.display = 'flex';
    }
    
    const displayName = settings.characterName || 'Kibitzer';
    if (nameEl) nameEl.textContent = displayName;
    if (panelNameEl) panelNameEl.textContent = displayName;
}

/**
 * Setup bar event listeners
 */
function setupBarEvents() {
    const bar = kibitzer.bar;
    if (!bar) return;
    
    const panelClose = bar.querySelector('.kibitzer-panel-close');
    const panelClear = bar.querySelector('.kibitzer-panel-clear');
    
    let lastTapTime = 0;
    
    // Double-click to open panel
    bar.addEventListener('dblclick', (e) => {
        if (e.target.closest('.kibitzer-bar-panel')) return;
        e.preventDefault();
        toggleBarPanel();
    });
    
    // Touch double-tap support
    bar.addEventListener('touchend', (e) => {
        if (e.target.closest('.kibitzer-bar-panel')) return;
        
        const currentTime = new Date().getTime();
        const tapInterval = currentTime - lastTapTime;
        
        if (tapInterval < 300 && tapInterval > 0) {
            e.preventDefault();
            toggleBarPanel();
            if (navigator.vibrate) navigator.vibrate(50);
            lastTapTime = 0;
        } else {
            lastTapTime = currentTime;
        }
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
                kibitzer.lastBarMessage = ''; // Reset last message tracker
            }
        });
    }
    
    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
        if (bar.classList.contains('panel-open') && !bar.contains(e.target)) {
            closeBarPanel();
        }
    });
}

/**
 * Position bar panel smartly to stay on screen
 */
function positionBarPanel() {
    const bar = kibitzer.bar;
    if (!bar) return;
    
    const panel = bar.querySelector('.kibitzer-bar-panel');
    if (!panel) return;
    
    const barRect = bar.getBoundingClientRect();
    const panelHeight = 350; // Approximate panel height
    const panelWidth = 300;
    const padding = 10;
    
    // Reset positioning
    panel.style.removeProperty('bottom');
    panel.style.removeProperty('top');
    panel.style.removeProperty('left');
    panel.style.removeProperty('right');
    panel.style.removeProperty('transform');
    
    // Vertical positioning: check space above vs below
    const spaceAbove = barRect.top;
    const spaceBelow = window.innerHeight - barRect.bottom;
    
    if (spaceAbove >= panelHeight + padding || spaceAbove > spaceBelow) {
        // Open upward (default)
        panel.style.bottom = 'calc(100% + 8px)';
        panel.style.top = 'auto';
        panel.classList.remove('panel-below');
        panel.classList.add('panel-above');
    } else {
        // Open downward
        panel.style.top = 'calc(100% + 8px)';
        panel.style.bottom = 'auto';
        panel.classList.remove('panel-above');
        panel.classList.add('panel-below');
    }
    
    // Horizontal positioning: keep panel on screen
    const barCenterX = barRect.left + barRect.width / 2;
    const halfPanelWidth = panelWidth / 2;
    
    if (barCenterX - halfPanelWidth < padding) {
        // Too close to left edge
        panel.style.left = `${padding - barRect.left}px`;
        panel.style.right = 'auto';
        panel.style.transform = 'translateY(0) scale(1)';
    } else if (barCenterX + halfPanelWidth > window.innerWidth - padding) {
        // Too close to right edge
        panel.style.right = `${barRect.right - window.innerWidth + padding}px`;
        panel.style.left = 'auto';
        panel.style.transform = 'translateY(0) scale(1)';
    } else {
        // Center it
        panel.style.left = '50%';
        panel.style.transform = 'translateX(-50%) translateY(0) scale(1)';
    }
}

function toggleBarPanel() {
    const bar = kibitzer.bar;
    if (!bar) return;
    
    if (bar.classList.contains('panel-open')) {
        closeBarPanel();
    } else {
        openBarPanel();
    }
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

/**
 * Apply ticker animation to bar text (without adding to history)
 * Use this when just refreshing the animation (e.g., speed change)
 */
function applyBarTickerAnimation() {
    const bar = kibitzer.bar;
    if (!bar) return;
    
    const settings = getSettings();
    const textEl = bar.querySelector('.kibitzer-bar-text');
    const container = bar.querySelector('.kibitzer-bar-text-container');
    
    if (!textEl || !container) return;
    
    // Reset animation classes and inline styles
    bar.classList.remove('ticker-active');
    textEl.style.removeProperty('animation');
    
    // Force reflow to restart animation
    void textEl.offsetWidth;
    
    // Wait for DOM to update, then apply ticker
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const textWidth = textEl.scrollWidth;
            const containerWidth = container.clientWidth;
            
            // Only scroll if text overflows OR always scroll is enabled
            if (settings.uiTickerAlwaysScroll || textWidth > containerWidth) {
                // Calculate how far to scroll:
                // We need to scroll the text completely off-screen to the left
                // Plus add a gap before it loops back
                const gap = 100; // Gap in pixels before text loops
                const scrollDistance = textWidth + gap;
                
                // Duration = distance / speed (speed is in pixels per second)
                const duration = scrollDistance / settings.uiTickerSpeed;
                
                // Set CSS custom properties
                bar.style.setProperty('--scroll-duration', `${duration}s`);
                // The offset needs to move the text left by its full width plus gap
                // As a percentage of the text element's width
                const scrollPercent = ((textWidth + gap) / textWidth) * 100;
                bar.style.setProperty('--scroll-offset', `-${scrollPercent}%`);
                
                bar.classList.add('ticker-active');
                
                console.log(DEBUG_PREFIX, `Ticker: text=${textWidth}px, container=${containerWidth}px, scrollDist=${scrollDistance}px, duration=${duration.toFixed(2)}s, offset=-${scrollPercent.toFixed(1)}%`);
            }
        });
    });
}

/**
 * Update bar commentary text with ticker effect
 * Only adds to history if it's a new message
 */
function updateBarCommentaryText(text) {
    const bar = kibitzer.bar;
    if (!bar) return;
    
    const settings = getSettings();
    const textEl = bar.querySelector('.kibitzer-bar-text');
    const container = bar.querySelector('.kibitzer-bar-text-container');
    
    if (textEl && container) {
        // Update the text content
        textEl.textContent = text;
        
        // Apply ticker animation (only if content is visible)
        // If typing indicator is showing, animation will be applied when it hides
        if (!bar.classList.contains('is-typing')) {
            applyBarTickerAnimation();
        }
    }
    
    // Only add to history if this is a NEW message (not a duplicate)
    if (text !== kibitzer.lastBarMessage) {
        kibitzer.lastBarMessage = text;
        
        const history = bar.querySelector('.kibitzer-history');
        if (history) {
            const historyItem = document.createElement('div');
            historyItem.className = 'kibitzer-history-item new';
            historyItem.innerHTML = `<p>${text}</p>`;
            
            history.insertBefore(historyItem, history.firstChild);
            
            const items = history.querySelectorAll('.kibitzer-history-item');
            if (items.length > 10) {
                items[items.length - 1].remove();
            }
            
            setTimeout(() => historyItem.classList.remove('new'), 500);
        }
        
        // Show the bar has new content
        bar.classList.add('has-new');
        setTimeout(() => bar.classList.remove('has-new'), 500);
    }
}

/**
 * Show or hide bar typing indicator
 * FIXED: Re-applies ticker animation after hiding typing indicator
 * so that dimensions can be measured correctly when content is visible
 */
function showBarTypingIndicator(show) {
    const bar = kibitzer.bar;
    if (!bar) return;
    
    if (show) {
        bar.classList.add('is-typing');
    } else {
        bar.classList.remove('is-typing');
        // Re-apply ticker animation AFTER content is visible again
        // so dimensions can be measured correctly
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                applyBarTickerAnimation();
            });
        });
    }
}

function updateBarStatus(status) {
    const statusEl = kibitzer.bar?.querySelector('.kibitzer-status');
    if (statusEl) {
        statusEl.textContent = status;
    }
}

/**
 * Switch between display modes
 */
function switchDisplayMode(mode) {
    const settings = getSettings();
    
    // Hide both first
    if (kibitzer.widget) {
        kibitzer.widget.style.display = 'none';
    }
    if (kibitzer.bar) {
        kibitzer.bar.style.display = 'none';
    }
    
    // Show the appropriate one
    if (mode === 'widget') {
        if (!kibitzer.widget) {
            createWidget();
        }
        if (settings.enabled) {
            kibitzer.widget.style.display = 'block';
        }
    } else if (mode === 'bar') {
        if (!kibitzer.bar) {
            createBar();
        }
        if (settings.enabled) {
            kibitzer.bar.style.display = 'flex';
        }
        // Re-apply ticker animation after display change
        setTimeout(() => {
            applyBarTickerAnimation();
        }, 100);
    }
}

/**
 * Update widget with selected character info
 */
function updateWidgetCharacter() {
    const settings = getSettings();
    const widget = kibitzer.widget;
    
    if (!widget) return;
    
    const avatarEl = widget.querySelector('.kibitzer-avatar');
    const placeholderEl = widget.querySelector('.kibitzer-avatar-placeholder');
    const nameEl = widget.querySelector('.kibitzer-name');
    
    if (settings.characterAvatar) {
        const avatarUrl = `/characters/${encodeURIComponent(settings.characterAvatar)}`;
        avatarEl.src = avatarUrl;
        avatarEl.style.display = 'block';
        if (placeholderEl) placeholderEl.style.display = 'none';
        
        avatarEl.onerror = function() {
            this.src = `/thumbnail?type=avatar&file=${encodeURIComponent(settings.characterAvatar)}`;
            this.onerror = function() {
                this.style.display = 'none';
                if (placeholderEl) placeholderEl.style.display = 'flex';
            };
        };
    } else {
        avatarEl.src = '';
        avatarEl.style.display = 'none';
        if (placeholderEl) placeholderEl.style.display = 'flex';
    }
    
    if (nameEl) {
        nameEl.textContent = settings.characterName || 'Kibitzer';
    }
}

/**
 * Setup widget event listeners
 */
function setupWidgetEvents() {
    const widget = kibitzer.widget;
    const avatarBubble = widget.querySelector('.kibitzer-avatar-bubble');
    const speechBubble = widget.querySelector('.kibitzer-speech-bubble');
    const bubbleClose = widget.querySelector('.kibitzer-bubble-close');
    const panel = widget.querySelector('.kibitzer-panel');
    const panelClose = widget.querySelector('.kibitzer-panel-close');
    const panelClear = widget.querySelector('.kibitzer-panel-clear');
    
    let lastTapTime = 0;
    
    avatarBubble.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDrag);
    
    avatarBubble.addEventListener('touchstart', startDragTouch, { passive: false });
    document.addEventListener('touchmove', dragTouch, { passive: false });
    document.addEventListener('touchend', stopDrag);
    
    avatarBubble.addEventListener('mouseup', (e) => {
        if (!kibitzer.wasDragging) {
            hideSpeechBubble();
        }
        kibitzer.wasDragging = false;
    });
    
    avatarBubble.addEventListener('touchend', (e) => {
        if (kibitzer.wasDragging) {
            kibitzer.wasDragging = false;
            return;
        }
        
        const currentTime = new Date().getTime();
        const tapInterval = currentTime - lastTapTime;
        
        if (tapInterval < 300 && tapInterval > 0) {
            e.preventDefault();
            if (widget.classList.contains('panel-open')) {
                closePanel();
            } else {
                openPanel();
            }
            if (navigator.vibrate) navigator.vibrate(50);
            lastTapTime = 0;
        } else {
            hideSpeechBubble();
            lastTapTime = currentTime;
        }
        
        kibitzer.wasDragging = false;
    });
    
    avatarBubble.addEventListener('dblclick', (e) => {
        e.preventDefault();
        if (widget.classList.contains('panel-open')) {
            closePanel();
        } else {
            openPanel();
        }
    });
    
    speechBubble.addEventListener('click', (e) => {
        if (!e.target.closest('.kibitzer-bubble-close')) {
            openPanel();
        }
    });
    
    bubbleClose.addEventListener('click', (e) => {
        e.stopPropagation();
        hideSpeechBubble();
    });
    
    panelClose.addEventListener('click', (e) => {
        e.stopPropagation();
        closePanel();
    });
    
    // Clear history button handler
    if (panelClear) {
        panelClear.addEventListener('click', (e) => {
            e.stopPropagation();
            const history = widget.querySelector('.kibitzer-history');
            if (history) {
                history.innerHTML = '';
            }
        });
    }
}

function openPanel() {
    const widget = kibitzer.widget;
    widget.classList.add('panel-open');
    hideSpeechBubble();
}

function closePanel() {
    const widget = kibitzer.widget;
    widget.classList.remove('panel-open');
}

function showSpeechBubble() {
    const widget = kibitzer.widget;
    if (!widget) return;
    
    widget.classList.add('has-speech');
    widget.classList.add('speech-new');
    
    const dot = widget.querySelector('.kibitzer-notification-dot');
    if (dot) dot.classList.add('visible');
    
    setTimeout(() => {
        widget.classList.remove('speech-new');
    }, 500);
}

function hideSpeechBubble() {
    const widget = kibitzer.widget;
    if (!widget) return;
    
    widget.classList.remove('has-speech');
    
    const dot = widget.querySelector('.kibitzer-notification-dot');
    if (dot) dot.classList.remove('visible');
}

function startDrag(e) {
    if (e.target.closest('.kibitzer-panel') || e.target.closest('.kibitzer-speech-bubble')) return;
    
    e.preventDefault();  //
    
    kibitzer.isDragging = true;
    kibitzer.wasDragging = false;
    kibitzer.dragStartPos = { x: e.clientX, y: e.clientY };
    
    const rect = kibitzer.widget.getBoundingClientRect();
    kibitzer.dragOffset = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
    kibitzer.widget.classList.add('dragging');
}

function startDragTouch(e) {
    if (e.target.closest('.kibitzer-panel') || e.target.closest('.kibitzer-speech-bubble')) return;
    
    e.preventDefault();
    const touch = e.touches[0];
    kibitzer.isDragging = true;
    kibitzer.wasDragging = false;
    kibitzer.dragStartPos = { x: touch.clientX, y: touch.clientY };
    
    const rect = kibitzer.widget.getBoundingClientRect();
    kibitzer.dragOffset = {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top
    };
    kibitzer.widget.classList.add('dragging');
}

function drag(e) {
    if (!kibitzer.isDragging) return;
    
    const dx = Math.abs(e.clientX - kibitzer.dragStartPos.x);
    const dy = Math.abs(e.clientY - kibitzer.dragStartPos.y);
    if (dx > 5 || dy > 5) {
        kibitzer.wasDragging = true;
    }
    
    const x = Math.max(0, Math.min(window.innerWidth - 80, e.clientX - kibitzer.dragOffset.x));
    const y = Math.max(0, Math.min(window.innerHeight - 80, e.clientY - kibitzer.dragOffset.y));
    
    kibitzer.widget.style.left = `${x}px`;
    kibitzer.widget.style.top = `${y}px`;
}

function dragTouch(e) {
    if (!kibitzer.isDragging) return;
    
    e.preventDefault();
    const touch = e.touches[0];
    
    const dx = Math.abs(touch.clientX - kibitzer.dragStartPos.x);
    const dy = Math.abs(touch.clientY - kibitzer.dragStartPos.y);
    if (dx > 5 || dy > 5) {
        kibitzer.wasDragging = true;
    }
    
    const x = Math.max(0, Math.min(window.innerWidth - 80, touch.clientX - kibitzer.dragOffset.x));
    const y = Math.max(0, Math.min(window.innerHeight - 80, touch.clientY - kibitzer.dragOffset.y));
    
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
    
    // Update widget
    const widget = kibitzer.widget;
    if (widget) {
        const speechText = widget.querySelector('.kibitzer-speech-bubble .kibitzer-text');
        if (speechText) {
            speechText.textContent = text;
        }
        
        const history = widget.querySelector('.kibitzer-history');
        if (history) {
            const historyItem = document.createElement('div');
            historyItem.className = 'kibitzer-history-item new';
            historyItem.innerHTML = `<p>${text}</p>`;
            
            history.insertBefore(historyItem, history.firstChild);
            
            const items = history.querySelectorAll('.kibitzer-history-item');
            if (items.length > 10) {
                items[items.length - 1].remove();
            }
            
            setTimeout(() => historyItem.classList.remove('new'), 500);
        }
        
        if (settings.displayMode === 'widget') {
            showSpeechBubble();
        }
    }
    
    // Update bar
    if (kibitzer.bar) {
        updateBarCommentaryText(text);
    }
}

function openSettingsPanel() {
    const extensionMenu = document.getElementById('extensionsMenu');
    if (extensionMenu) {
        extensionMenu.click();
        setTimeout(() => {
            const ourSettings = document.getElementById('kibitzer-settings');
            if (ourSettings) {
                ourSettings.scrollIntoView({ behavior: 'smooth' });
            }
        }, 300);
    }
}

function populateCharacterDropdown() {
    const dropdown = document.getElementById('kibitzer-character-select');
    if (!dropdown) return;
    
    const settings = getSettings();
    const context = getContext();
    const charactersList = context.characters || [];
    
    dropdown.innerHTML = '<option value="">-- Select a Character --</option>';
    
    if (charactersList.length > 0) {
        charactersList.forEach((char, index) => {
            if (!char || !char.name) return;
            
            const option = document.createElement('option');
            option.value = char.avatar || index;
            option.textContent = char.name;
            option.dataset.index = index;
            option.dataset.avatar = char.avatar || '';
            
            if (settings.characterAvatar && char.avatar === settings.characterAvatar) {
                option.selected = true;
            } else if (settings.characterName && char.name === settings.characterName) {
                option.selected = true;
            }
            
            dropdown.appendChild(option);
        });
    }
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
        const charactersList = context.characters || [];
        const charIndex = parseInt(selectedOption.dataset.index);
        const char = charactersList[charIndex];
        
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

/**
 * Build the prompt for commentary generation
 * FIXED: Prioritizes Character Personality while maintaining echo prevention. 
 * Now supports custom prompts with variable substitution.
 */
function buildCommentaryPrompt() {
    const settings = getSettings();
    const context = getContext();
    const charactersList = context.characters || [];
    
    const recentMessages = context.chat.slice(-settings.maxContextMessages);
    
    kibitzer.recentChatNames = [];
    
    // Format chat log in a way that discourages auto-complete
    let chatLog = recentMessages.map(msg => {
        const name = msg.is_user ? 'User' : (msg.name || 'Character');
        if (!kibitzer.recentChatNames. includes(name)) {
            kibitzer. recentChatNames.push(name);
        }
        return `Speaker (${name}): ${msg.mes}`;
    }).join('\n\n');
    
    // Get Personality
    let characterPersonality = '';
    if (settings. characterId !== null && charactersList[settings. characterId]) {
        const char = charactersList[settings.characterId];
        characterPersonality = char. description || '';
        if (char.personality) {
            characterPersonality += '\n' + char.personality;
        }
    }
    
    const stylePrompt = COMMENTARY_STYLES[settings.commentaryStyle] || COMMENTARY_STYLES. snarky;
    const kibitzerName = settings.characterName || 'Kibitzer';
    
    // If user has a custom system prompt, use it with variable substitution
    if (settings.customSystemPrompt && settings.customSystemPrompt.trim()) {
        let customPrompt = settings.customSystemPrompt;
        
        // Variable substitution - replace all instances (case insensitive)
        customPrompt = customPrompt.replace(/\{\{kibitzer_name\}\}/gi, kibitzerName);
        customPrompt = customPrompt.replace(/\{\{chat_log\}\}/gi, chatLog);
        customPrompt = customPrompt.replace(/\{\{personality\}\}/gi, characterPersonality);
        customPrompt = customPrompt.replace(/\{\{style\}\}/gi, stylePrompt);
        
        console.log(DEBUG_PREFIX, 'Using custom prompt with variables substituted');
        return customPrompt;
    }
    
    // Default prompt logic (when no custom prompt is set)
    let personaBlock = '';
    
    if (characterPersonality) {
        // If a character is selected, their personality is King. 
        personaBlock = `
You are ${kibitzerName}. 
[Your Personality & Traits]
${characterPersonality}
`;
    } else {
        // If no character selected, use the generic style as identity
        personaBlock = `
You are ${kibitzerName}.
[Your Style]
${stylePrompt}
`;
    }

    const prompt = `
### IDENTITY
${personaBlock}

### TASK
You are watching the "Roleplay Log" below as an observer. 
Your goal is to provide a single, short, in-character reaction to the events. 

### RULES
1. React strictly according to your personality (${kibitzerName}).
2. Do NOT participate in the roleplay.  You are just watching it.
3. Do NOT repeat the dialogue from the log.
4. Keep the comment short (1-3 sentences).

### ROLEPLAY LOG
${chatLog}

### RESPONSE
(As ${kibitzerName}, I will ignore the log format and only provide my in-character reaction):
`;

    return prompt;
}

/**
 * Clean up the commentary response to remove any echoed chat content
 * FIXED: Added duplication check against original chat context
 */
function cleanCommentaryResponse(rawResponse) {
    if (!rawResponse) return null;

    const settings = getSettings();
    const context = getContext();
    
    // 1. Safety Check: Does the response contain the last message verbatim?
    const lastMsg = context.chat.length > 0 ? context.chat[context.chat.length - 1].mes : '';
    // Check if response contains a significant chunk of the last message
    if (lastMsg && lastMsg.length > 10 && rawResponse.includes(lastMsg)) {
        console.log(DEBUG_PREFIX, 'Response rejected: It echoed the last message.');
        return null;
    }

    let cleaned = rawResponse.trim();
    
    // Remove quotes
    if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
        (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
        cleaned = cleaned.slice(1, -1).trim();
    }
    
    // Remove common LLM prefixes
    const prefixPatterns = [
        /^(Here'?s?\s+(is\s+)?(my\s+)?commentary:?\s*)/i,
        /^(My\s+commentary:?\s*)/i,
        /^(Commentary:?\s*)/i,
        /^(Response:?\s*)/i,
        /^(As\s+.+?,?\s+(I\s+)?(think|say|comment|observe|note):?\s*)/i,
        /^\*?(clears\s+throat|ahem)\*?\s*/i,
        /^\(As\s+.*?\):?\s*/i,
    ];
    
    for (const pattern of prefixPatterns) {
        cleaned = cleaned.replace(pattern, '');
    }
    
    const lines = cleaned.split('\n');
    const filteredLines = [];
    
    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;
        
        // Strict Chat Pattern Detection
        const strictChatPattern = /^(\[)?(Speaker\s\()?[A-Za-z0-9_\s]{1,30}(\))?(\])?\s*:\s*.+/;
        if (strictChatPattern.test(trimmedLine)) continue;
        
        // Name-based filtering
        let isNamedLine = false;
        if (kibitzer.recentChatNames && kibitzer.recentChatNames.length > 0) {
            for (const name of kibitzer.recentChatNames) {
                if (trimmedLine.toLowerCase().startsWith(name.toLowerCase() + ':')) {
                    isNamedLine = true;
                    break;
                }
            }
        }
        if (isNamedLine) continue;
        
        // Skip decorative lines
        if (/^[-=_*]{3,}$/.test(trimmedLine)) continue;
        
        filteredLines.push(trimmedLine);
    }
    
    cleaned = filteredLines.join(' ').trim();
    
    if (!cleaned || cleaned.length < 2) {
        return null;
    }
    
    return cleaned;
}

/**
 * Generate commentary using SillyTavern's generateQuietPrompt
 * Now with Quick API and Connection Profile switching support! 
 */
async function generateCommentary(force = false) {
    const settings = getSettings();
    
    if (!settings.enabled && !force) return;
    if (kibitzer.isGenerating) return;
    if (settings.characterId === null) {
        updateCommentaryText('Please select a character in settings first! ');
        return;
    }
    
    const context = getContext();
    if (!context. chat || context.chat.length === 0) {
        updateCommentaryText('Waiting for the RP to start...');
        return;
    }
    
    // Check frequency
    if (! force) {
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
    updateStatus('Thinking.. .');
    
    let originalProfile = '';
    let profileSwitched = false;
    let originalApiSettings = null;
    let quickApiSwitched = false;
    
    try {
        // Priority 1: Quick API (if enabled)
        if (settings.quickApiEnabled && settings.quickApiProvider && settings.quickApiModel) {
            console.log(DEBUG_PREFIX, 'Using Quick API override');
            updateStatus(`Switching to ${settings.quickApiProvider}... `);
            originalApiSettings = await applyQuickApiSettings();
            if (originalApiSettings) {
                quickApiSwitched = true;
            }
        }
        // Priority 2: Connection Profile (existing feature)
        else if (settings. connectionProfile) {
            originalProfile = await getCurrentProfile();
            if (originalProfile !== settings.connectionProfile) {
                console.log(DEBUG_PREFIX, `Switching from profile "${originalProfile}" to "${settings.connectionProfile}"`);
                updateStatus(`Switching to ${settings.connectionProfile}...`);
                await switchProfile(settings.connectionProfile);
                profileSwitched = true;
                
                // Small delay to ensure profile switch takes effect
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        const prompt = buildCommentaryPrompt();
        
        console.log(DEBUG_PREFIX, 'Generating commentary...');
        updateStatus('Generating.. .');
        
        // Use SillyTavern's built-in quiet generation
        const rawCommentary = await generateQuietPrompt(prompt, false, false);
        
        if (rawCommentary) {
            // Clean up the response
            const cleanedCommentary = cleanCommentaryResponse(rawCommentary);
            
            if (cleanedCommentary) {
                updateCommentaryText(cleanedCommentary);
                kibitzer.lastCommentary = cleanedCommentary;
            } else {
                // Fallback if cleaning removed everything
                updateCommentaryText('*observes silently*');
                console.log(DEBUG_PREFIX, 'Commentary was filtered out completely.');
            }
        } else {
            updateCommentaryText('*stares silently* (No response)');
        }
        
        updateStatus('Watching.. .');
        
    } catch (error) {
        console.error(DEBUG_PREFIX, 'Error generating commentary:', error);
        updateCommentaryText(`*mumbles* (Error: ${error.message || 'API error'})`);
        updateStatus('Error! ');
    } finally {
        // Always restore original settings
        
        // Restore Quick API settings if we switched
        if (quickApiSwitched && originalApiSettings) {
            console.log(DEBUG_PREFIX, 'Restoring original API settings');
            await restoreApiSettings(originalApiSettings);
        }
        
        // Restore profile if we switched (and didn't use Quick API)
        if (profileSwitched && originalProfile && !quickApiSwitched) {
            console.log(DEBUG_PREFIX, `Switching back to original profile "${originalProfile}"`);
            await switchProfile(originalProfile);
        }
        
        kibitzer. isGenerating = false;
        showTypingIndicator(false);
    }
}

function updateStatus(status) {
    // Widget
    const statusEl = kibitzer.widget?.querySelector('.kibitzer-status');
    if (statusEl) {
        statusEl.textContent = status;
    }
    
    // Bar
    updateBarStatus(status);
}

function showTypingIndicator(show) {
    const settings = getSettings();
    
    // Widget mode
    const widget = kibitzer.widget;
    if (widget) {
        if (show) {
            widget.classList.add('is-typing');
            widget.classList.remove('has-speech');
        } else {
            widget.classList.remove('is-typing');
        }
    }
    
    // Bar mode
    if (kibitzer.bar) {
        showBarTypingIndicator(show);
    }
}

function onMessageReceived(messageId) {
    const settings = getSettings();
    
    if (!settings.enabled) return;
    if (settings.characterId === null) return;
    
    // Ignore messages that fire during chat loading
    if (kibitzer.chatJustChanged) {
        console.log(DEBUG_PREFIX, 'Ignoring message during chat load');
        return;
    }
    
    // Debounce protection - ignore triggers within 1 second of each other
    const now = Date.now();
    if (now - kibitzer.lastTriggerTime < 1000) {
        console.log(DEBUG_PREFIX, 'Debounce: Ignoring duplicate trigger');
        return;
    }
    kibitzer.lastTriggerTime = now;
    
    console.log(DEBUG_PREFIX, 'Message received, checking if commentary needed...');
    generateCommentary(false);
}

function onChatChanged() {
    const settings = getSettings();
    settings.messageCount = 0;
    saveSettings();
    
    // Set flag to ignore MESSAGE_RECEIVED events during chat load
    kibitzer.chatJustChanged = true;
    
    // Clear the flag after a delay to allow chat to fully load
    setTimeout(() => {
        kibitzer.chatJustChanged = false;
        console.log(DEBUG_PREFIX, 'Chat load complete, now listening for new messages');
    }, 2000);
    
    // Reset last bar message tracker
    kibitzer.lastBarMessage = '';
    
    if (settings.autoShow) {
        switchDisplayMode(settings.displayMode);
    }
    
    // Clear widget history
    if (kibitzer.widget) {
        const history = kibitzer.widget.querySelector('.kibitzer-history');
        if (history) history.innerHTML = '';
    }
    
    // Clear bar history
    if (kibitzer.bar) {
        const history = kibitzer.bar.querySelector('.kibitzer-history');
        if (history) history.innerHTML = '';
    }
    
    updateCommentaryText('New chat! Waiting for something interesting...');
    updateStatus('Watching...');
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
                    <label class="checkbox_label" for="kibitzer-enabled">
                        <input type="checkbox" id="kibitzer-enabled" />
                        <span>Enable Kibitzer</span>
                    </label>
                </div>
                
                <div class="kibitzer-setting-row">
                    <label for="kibitzer-display-mode">Display Mode:</label>
                    <select id="kibitzer-display-mode" class="text_pole">
                        <option value="widget">🎈 Floating Widget</option>
                        <option value="bar">📜 Bar </option>
                    </select>
                    <small>Widget floats on screen; Bar sits above the chat input area</small>
                </div>
                
                <hr class="sysHR" />
                <h4 class="kibitzer-section-title">Character & Behavior</h4>
                
                <div class="kibitzer-setting-row">
                    <label for="kibitzer-character-select">Critic Character:</label>
                    <div class="kibitzer-char-select-row">
                        <select id="kibitzer-character-select" class="text_pole"></select>
                        <button id="kibitzer-refresh-chars" class="menu_button" title="Refresh character list">
                            <i class="fa-solid fa-rotate"></i>
                        </button>
                    </div>
                    <small>Select which character will provide commentary</small>
                </div>
                
                <div class="kibitzer-setting-row">
                    <label for="kibitzer-style-select">Commentary Style:</label>
                    <select id="kibitzer-style-select" class="text_pole">
                        <option value="snarky">🎭 Snarky</option>
                        <option value="supportive">🎉 Supportive</option>
                        <option value="analytical">🔍 Analytical</option>
                        <option value="chaotic">🌀 Chaotic</option>
                    </select>
                    <small>The tone of commentary (can be overridden by character personality)</small>
                </div>
                
                <hr class="sysHR" />
                <h4 class="kibitzer-section-title">🔌 Connection Profile</h4>
                
                <div class="kibitzer-setting-row">
                    <label for="kibitzer-profile-select">API Connection Profile:</label>
                    <div class="kibitzer-char-select-row">
                        <select id="kibitzer-profile-select" class="text_pole">
                            <option value="">-- Use Current Profile --</option>
                        </select>
                        <button id="kibitzer-refresh-profiles" class="menu_button" title="Refresh profile list">
                            <i class="fa-solid fa-rotate"></i>
                        </button>
                    </div>
                    <small>Select a different API/model for Kibitzer commentary.  Leave empty to use your current connection. </small>
                </div>
                
                <hr class="sysHR" />
<div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header" id="kibitzer-quickapi-drawer-toggle">
        <b>⚡ Quick API (Kibitzer Only)</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content" id="kibitzer-quickapi-drawer-content">
        <div class="kibitzer-setting-row">
            <label class="checkbox_label" for="kibitzer-quickapi-enabled">
                <input type="checkbox" id="kibitzer-quickapi-enabled" />
                <span>Enable Quick API override</span>
            </label>
            <small>Use a specific API/model for Kibitzer, independent of your main chat connection</small>
        </div>

        <div id="kibitzer-quickapi-options" class="kibitzer-quickapi-options">
                    <div class="kibitzer-setting-row">
                        <label>Select Provider:</label>
                        <div class="kibitzer-provider-buttons">
                            <button type="button" class="kibitzer-provider-btn" data-provider="openrouter">🌐 OpenRouter</button>
                            <button type="button" class="kibitzer-provider-btn" data-provider="google">🔷 Google</button>
                            <button type="button" class="kibitzer-provider-btn" data-provider="deepseek">🐋 DeepSeek</button>
                            <button type="button" class="kibitzer-provider-btn" data-provider="groq">⚡ Groq</button>
                            <button type="button" class="kibitzer-provider-btn" data-provider="openai">🤖 OpenAI</button>
                            <button type="button" class="kibitzer-provider-btn" data-provider="claude">🧡 Claude</button>
                            <button type="button" class="kibitzer-provider-btn" data-provider="mistralai">🌀 Mistral</button>
                            <button type="button" class="kibitzer-provider-btn" data-provider="custom">🔧 Custom</button>
                        </div>
                    </div>
                    
                    <div id="kibitzer-quickapi-url-container" class="kibitzer-setting-row" style="display:  none;">
                        <label for="kibitzer-quickapi-url">API URL:</label>
                        <input type="text" id="kibitzer-quickapi-url" class="text_pole" placeholder="https://your-server.com/v1" />
                        <small>The base URL for your OpenAI-compatible API</small>
                    </div>
                    
                    <div id="kibitzer-quickapi-model-select-container" class="kibitzer-setting-row" style="display: none;">
                        <label for="kibitzer-quickapi-model-select">Select Model:</label>
                        <div class="kibitzer-model-select-row">
                            <select id="kibitzer-quickapi-model-select" class="text_pole">
                                <option value="">-- Select a model --</option>
                            </select>
                            <button type="button" id="kibitzer-quickapi-refresh-models" class="menu_button" title="Refresh model list">
                                <i class="fa-solid fa-rotate"></i>
                            </button>
                            <span id="kibitzer-quickapi-loading" class="kibitzer-loading" style="display: none;">
                                <i class="fa-solid fa-spinner fa-spin"></i>
                            </span>
                        </div>
                    </div>
                    
                    <div id="kibitzer-quickapi-model-input-container" class="kibitzer-setting-row" style="display:  none;">
                        <label for="kibitzer-quickapi-model-input">Model Name:</label>
                        <input type="text" id="kibitzer-quickapi-model-input" class="text_pole" placeholder="Enter model name..." />
                        <small>Enter the exact model identifier (e.g., gpt-4o, claude-sonnet-4-20250514, gemini-2.0-flash)</small>
                    </div>
                    
                    <div class="kibitzer-setting-row">
                        <div id="kibitzer-quickapi-status" class="kibitzer-quickapi-status">
                            <span class="kibitzer-status-inactive">Quick API disabled</span>
                        </div>
                    </div>
                    
                    <div class="kibitzer-setting-row kibitzer-quickapi-buttons">
                        <button type="button" id="kibitzer-quickapi-connect" class="menu_button">
                            <i class="fa-solid fa-plug"></i> Connect
                        </button>
                        <button type="button" id="kibitzer-quickapi-test" class="menu_button">
                            <i class="fa-solid fa-flask"></i> Test
                        </button>
                    </div>
                    <small>Connect validates settings; Test generates a comment</small>
                </div>
            </div>
        </div>
                
        <hr class="sysHR" />
        <h4 class="kibitzer-section-title">⏱️ Timing & Context</h4>
                
                <div class="kibitzer-setting-row">
                    <label for="kibitzer-frequency">Comment Frequency:</label>
                    <div class="range-block-enhanced">
                        <input type="range" id="kibitzer-frequency" min="1" max="20" />
                        <input type="number" id="kibitzer-frequency-input" min="1" max="20" class="kibitzer-num-input" />
                        <button id="kibitzer-frequency-lock" class="kibitzer-lock-btn" title="Lock value">
                            <i class="fa-solid fa-lock-open"></i>
                        </button>
                    </div>
                    <small>Comment every N messages</small>
                </div>
                
                <div class="kibitzer-setting-row">
                    <label for="kibitzer-context">Context Messages:</label>
                    <div class="range-block-enhanced">
                        <input type="range" id="kibitzer-context" min="1" max="30" />
                        <input type="number" id="kibitzer-context-input" min="1" max="30" class="kibitzer-num-input" />
                        <button id="kibitzer-context-lock" class="kibitzer-lock-btn" title="Lock value">
                            <i class="fa-solid fa-lock-open"></i>
                        </button>
                    </div>
                    <small>How many recent messages to analyze</small>
                </div>
                
                <div class="kibitzer-setting-row">
    <label for="kibitzer-custom-prompt">Custom System Prompt (optional):</label>
    <textarea id="kibitzer-custom-prompt" class="text_pole" rows="8" 
        placeholder="Leave empty to use default prompt. 

Available variables:
{{kibitzer_name}} - The critic character's name
{{chat_log}} - Recent chat messages
{{personality}} - Character's personality/description
{{style}} - Selected commentary style"></textarea>
    <small>Use variables like <code>{{kibitzer_name}}</code>, <code>{{chat_log}}</code>, <code>{{personality}}</code>, <code>{{style}}</code> to insert dynamic content</small>
</div>
                
                <hr class="sysHR" />
                <h4 class="kibitzer-section-title">✨ UI Customization</h4>
                
                <div class="kibitzer-setting-row">
                    <label for="kibitzer-theme-select">Color Theme:</label>
                    <select id="kibitzer-theme-select" class="text_pole">
                        <option value="pink">🌸 Pink (Default)</option>
                        <option value="lavender">💜 Lavender</option>
                        <option value="mint">🌿 Mint</option>
                        <option value="peach">🍑 Peach</option>
                        <option value="sky">☁️ Sky</option>
                        <option value="berry">🫐 Berry</option>
                        <option value="custom">🎨 Custom</option>
                    </select>
                </div>
                
                <div id="kibitzer-custom-colors" class="kibitzer-custom-colors" style="display: none;">
                    <div class="kibitzer-color-row">
                        <label for="kibitzer-color-primary">Primary: </label>
                        <input type="color" id="kibitzer-color-primary" value="#ffb6c1" />
                    </div>
                    <div class="kibitzer-color-row">
                        <label for="kibitzer-color-secondary">Secondary:</label>
                        <input type="color" id="kibitzer-color-secondary" value="#ffe4e9" />
                    </div>
                    <div class="kibitzer-color-row">
                        <label for="kibitzer-color-accent">Accent:</label>
                        <input type="color" id="kibitzer-color-accent" value="#ff8fa3" />
                    </div>
                    <div class="kibitzer-color-row">
                        <label for="kibitzer-color-text">Text:</label>
                        <input type="color" id="kibitzer-color-text" value="#5a4a5c" />
                    </div>
                </div>
                
                <div id="kibitzer-widget-options" class="kibitzer-display-options">
                    <div class="kibitzer-setting-row">
                        <label for="kibitzer-avatar-size">Avatar Size:</label>
                        <select id="kibitzer-avatar-size" class="text_pole">
                            <option value="small">Small (55px)</option>
                            <option value="medium">Medium (70px)</option>
                            <option value="large">Large (90px)</option>
                        </select>
                    </div>
                    
                    <div class="kibitzer-setting-row">
                        <label for="kibitzer-bubble-position">Bubble Position:</label>
                        <select id="kibitzer-bubble-position" class="text_pole">
                            <option value="right">Right of Avatar</option>
                            <option value="left">Left of Avatar</option>
                        </select>
                    </div>
                    
                    <div class="kibitzer-setting-row">
                        <label for="kibitzer-opacity">Widget Opacity:</label>
                        <div class="range-block">
                            <input type="range" id="kibitzer-opacity" min="30" max="100" />
                            <span id="kibitzer-opacity-value">100%</span>
                        </div>
                    </div>
                </div>
                
                <div id="kibitzer-bar-options" class="kibitzer-display-options">
                    <h4 class="kibitzer-section-title">📜 Bar Ticker Settings</h4>
                    
                    <div class="kibitzer-setting-row">
                        <label for="kibitzer-ticker-speed">Ticker Speed:</label>
                        <div class="range-block">
                            <input type="range" id="kibitzer-ticker-speed" min="20" max="150" />
                            <span id="kibitzer-ticker-speed-value">50 px/s</span>
                        </div>
                        <small>How fast the commentary text scrolls (lower = slower)</small>
                    </div>
                    
                    <div class="kibitzer-setting-row">
                        <label class="checkbox_label" for="kibitzer-ticker-always">
                            <input type="checkbox" id="kibitzer-ticker-always" />
                            <span>Always scroll ticker (even if text fits)</span>
                        </label>
                    </div>
                </div>
                
                <hr class="sysHR" />
                
                <div class="kibitzer-setting-row">
                    <label class="checkbox_label" for="kibitzer-autoshow">
                        <input type="checkbox" id="kibitzer-autoshow" />
                        <span>Auto-show widget on chat change</span>
                    </label>
                </div>
                
                <div class="kibitzer-setting-row kibitzer-button-row">
                    <button id="kibitzer-show-widget" class="menu_button">Show</button>
                    <button id="kibitzer-hide-widget" class="menu_button">Hide</button>
                    <button id="kibitzer-reset-position" class="menu_button">Reset Position</button>
                </div>
                
                <div class="kibitzer-setting-row kibitzer-button-row">
                    <button id="kibitzer-force-comment" class="menu_button">
                        <i class="fa-solid fa-comment"></i> Force Comment Now
                    </button>
                </div>
                
                <div class="kibitzer-setting-row">
                    <small class="kibitzer-hint">💡 Double-click the avatar to open/close the panel! </small>
                </div>
            </div>
        </div>
    </div>
    `;
    
    const extensionsSettings = document.getElementById('extensions_settings2');
    if (extensionsSettings) {
        extensionsSettings.insertAdjacentHTML('beforeend', settingsHtml);
    }
    
    const settings = getSettings();
    
    const enabledCheckbox = document.getElementById('kibitzer-enabled');
    if (enabledCheckbox) {
        enabledCheckbox.checked = settings.enabled;
        enabledCheckbox.addEventListener('change', (e) => {
            settings.enabled = e.target.checked;
            saveSettings();
            switchDisplayMode(settings.displayMode);
        });
    }
    
    // Display mode selector
    const displayModeSelect = document.getElementById('kibitzer-display-mode');
    if (displayModeSelect) {
        displayModeSelect.value = settings.displayMode;
        updateDisplayModeOptions(settings.displayMode);
        displayModeSelect.addEventListener('change', (e) => {
            settings.displayMode = e.target.value;
            saveSettings();
            switchDisplayMode(settings.displayMode);
            updateDisplayModeOptions(settings.displayMode);
        });
    }
    
    populateCharacterDropdown();
    const charSelect = document.getElementById('kibitzer-character-select');
    if (charSelect) {
        charSelect.addEventListener('change', onCharacterSelect);
    }
    
    const refreshCharsBtn = document.getElementById('kibitzer-refresh-chars');
    if (refreshCharsBtn) {
        refreshCharsBtn.addEventListener('click', () => {
            console.log(DEBUG_PREFIX, 'Manually refreshing character list...');
            populateCharacterDropdown();
        });
    }
    
    // Connection Profile dropdown
    await populateProfileDropdown();
    const profileSelect = document.getElementById('kibitzer-profile-select');
    if (profileSelect) {
        profileSelect.addEventListener('change', (e) => {
            settings.connectionProfile = e.target.value;
            saveSettings();
            console.log(DEBUG_PREFIX, 'Connection profile set to:', settings.connectionProfile || '(current)');
        });
    }
    
    const refreshProfilesBtn = document.getElementById('kibitzer-refresh-profiles');
    if (refreshProfilesBtn) {
        refreshProfilesBtn.addEventListener('click', async () => {
            console.log(DEBUG_PREFIX, 'Manually refreshing connection profiles...');
            await populateProfileDropdown();
        });
    }
    
    const drawerToggle = document.querySelector('#kibitzer-settings .inline-drawer-toggle');
    if (drawerToggle) {
        drawerToggle.addEventListener('click', () => {
            setTimeout(async () => {
                populateCharacterDropdown();
                await populateProfileDropdown();
            }, 100);
        });
    }
    
    const styleSelect = document.getElementById('kibitzer-style-select');
    if (styleSelect) {
        styleSelect.value = settings.commentaryStyle;
        styleSelect.addEventListener('change', (e) => {
            settings.commentaryStyle = e.target.value;
            saveSettings();
        });
    }
    
    const frequencySlider = document.getElementById('kibitzer-frequency');
    const frequencyInput = document.getElementById('kibitzer-frequency-input');
    const frequencyLock = document.getElementById('kibitzer-frequency-lock');
    
    if (frequencySlider && frequencyInput) {
        frequencySlider.value = settings.frequency;
        frequencyInput.value = settings.frequency;
        
        // Apply locked state
        if (settings.frequencyLocked) {
            frequencySlider.disabled = true;
            frequencyInput.disabled = true;
            frequencyLock.innerHTML = '<i class="fa-solid fa-lock"></i>';
            frequencyLock.classList.add('locked');
        }
        
        frequencySlider.addEventListener('input', (e) => {
            if (settings.frequencyLocked) return;
            settings.frequency = parseInt(e.target.value);
            frequencyInput.value = settings.frequency;
            saveSettings();
        });
        
        frequencyInput.addEventListener('change', (e) => {
            if (settings.frequencyLocked) return;
            let val = parseInt(e.target.value);
            val = Math.max(1, Math.min(20, val || 1));
            settings.frequency = val;
            frequencySlider.value = val;
            frequencyInput.value = val;
            saveSettings();
        });
        
        frequencyLock.addEventListener('click', () => {
            settings.frequencyLocked = !settings.frequencyLocked;
            frequencySlider.disabled = settings.frequencyLocked;
            frequencyInput.disabled = settings.frequencyLocked;
            frequencyLock.innerHTML = settings.frequencyLocked 
                ? '<i class="fa-solid fa-lock"></i>' 
                : '<i class="fa-solid fa-lock-open"></i>';
            frequencyLock.classList.toggle('locked', settings.frequencyLocked);
            saveSettings();
        });
    }
    
    const contextSlider = document.getElementById('kibitzer-context');
    const contextInput = document.getElementById('kibitzer-context-input');
    const contextLock = document.getElementById('kibitzer-context-lock');
    
    if (contextSlider && contextInput) {
        contextSlider.value = settings.maxContextMessages;
        contextInput.value = settings.maxContextMessages;
        
        // Apply locked state
        if (settings.contextLocked) {
            contextSlider.disabled = true;
            contextInput.disabled = true;
            contextLock.innerHTML = '<i class="fa-solid fa-lock"></i>';
            contextLock.classList.add('locked');
        }
        
        contextSlider.addEventListener('input', (e) => {
            if (settings.contextLocked) return;
            settings.maxContextMessages = parseInt(e.target.value);
            contextInput.value = settings.maxContextMessages;
            saveSettings();
        });
        
        contextInput.addEventListener('change', (e) => {
            if (settings.contextLocked) return;
            let val = parseInt(e.target.value);
            val = Math.max(1, Math.min(30, val || 1));
            settings.maxContextMessages = val;
            contextSlider.value = val;
            contextInput.value = val;
            saveSettings();
        });
        
        contextLock.addEventListener('click', () => {
            settings.contextLocked = !settings.contextLocked;
            contextSlider.disabled = settings.contextLocked;
            contextInput.disabled = settings.contextLocked;
            contextLock.innerHTML = settings.contextLocked 
                ? '<i class="fa-solid fa-lock"></i>' 
                : '<i class="fa-solid fa-lock-open"></i>';
            contextLock.classList.toggle('locked', settings.contextLocked);
            saveSettings();
        });
    }
    
    const customPrompt = document.getElementById('kibitzer-custom-prompt');
    if (customPrompt) {
        customPrompt.value = settings.customSystemPrompt;
        customPrompt.addEventListener('change', (e) => {
            settings.customSystemPrompt = e.target.value;
            saveSettings();
        });
    }
    
    const autoShowCheckbox = document.getElementById('kibitzer-autoshow');
    if (autoShowCheckbox) {
        autoShowCheckbox.checked = settings.autoShow;
        autoShowCheckbox.addEventListener('change', (e) => {
            settings.autoShow = e.target.checked;
            saveSettings();
        });
    }
    
    document.getElementById('kibitzer-show-widget')?.addEventListener('click', () => {
        const settings = getSettings();
        if (settings.displayMode === 'widget' && kibitzer.widget) {
            kibitzer.widget.style.display = 'block';
        } else if (settings.displayMode === 'bar' && kibitzer.bar) {
            kibitzer.bar.style.display = 'flex';
        }
    });
    
    document.getElementById('kibitzer-hide-widget')?.addEventListener('click', () => {
        if (kibitzer.widget) kibitzer.widget.style.display = 'none';
        if (kibitzer.bar) kibitzer.bar.style.display = 'none';
    });
    
    document.getElementById('kibitzer-reset-position')?.addEventListener('click', () => {
        settings.widgetPosition = { x: 20, y: 20 };
        if (kibitzer.widget) {
            kibitzer.widget.style.left = '20px';
            kibitzer.widget.style.top = '20px';
        }
        saveSettings();
    });
    
    // Force comment button
    document.getElementById('kibitzer-force-comment')?.addEventListener('click', () => {
        console.log(DEBUG_PREFIX, 'Force generating commentary...');
        generateCommentary(true);
    });
    
    const themeSelect = document.getElementById('kibitzer-theme-select');
    const customColorsDiv = document.getElementById('kibitzer-custom-colors');
    if (themeSelect) {
        themeSelect.value = settings.uiTheme;
        
        if (customColorsDiv) {
            customColorsDiv.style.display = settings.uiTheme === 'custom' ? 'block' : 'none';
        }
        
        themeSelect.addEventListener('change', (e) => {
            settings.uiTheme = e.target.value;
            if (customColorsDiv) {
                customColorsDiv.style.display = e.target.value === 'custom' ? 'block' : 'none';
            }
            applyUITheme();
            applyBarTheme();
            saveSettings();
        });
    }
    
    const colorPrimary = document.getElementById('kibitzer-color-primary');
    const colorSecondary = document.getElementById('kibitzer-color-secondary');
    const colorAccent = document.getElementById('kibitzer-color-accent');
    const colorText = document.getElementById('kibitzer-color-text');
    
    if (colorPrimary) {
        colorPrimary.value = settings.uiCustomColors.primary;
        colorPrimary.addEventListener('input', (e) => {
            settings.uiCustomColors.primary = e.target.value;
            if (settings.uiTheme === 'custom') {
                applyUITheme();
                applyBarTheme();
            }
            saveSettings();
        });
    }
    if (colorSecondary) {
        colorSecondary.value = settings.uiCustomColors.secondary;
        colorSecondary.addEventListener('input', (e) => {
            settings.uiCustomColors.secondary = e.target.value;
            if (settings.uiTheme === 'custom') {
                applyUITheme();
                applyBarTheme();
            }
            saveSettings();
        });
    }
    if (colorAccent) {
        colorAccent.value = settings.uiCustomColors.accent;
        colorAccent.addEventListener('input', (e) => {
            settings.uiCustomColors.accent = e.target.value;
            if (settings.uiTheme === 'custom') {
                applyUITheme();
                applyBarTheme();
            }
            saveSettings();
        });
    }
    if (colorText) {
        colorText.value = settings.uiCustomColors.text;
        colorText.addEventListener('input', (e) => {
            settings.uiCustomColors.text = e.target.value;
            if (settings.uiTheme === 'custom') {
                applyUITheme();
                applyBarTheme();
            }
            saveSettings();
        });
    }
    
    const avatarSizeSelect = document.getElementById('kibitzer-avatar-size');
    if (avatarSizeSelect) {
        avatarSizeSelect.value = settings.uiAvatarSize;
        avatarSizeSelect.addEventListener('change', (e) => {
            settings.uiAvatarSize = e.target.value;
            applyUITheme();
            saveSettings();
        });
    }
    
    const bubblePositionSelect = document.getElementById('kibitzer-bubble-position');
    if (bubblePositionSelect) {
        bubblePositionSelect.value = settings.uiBubblePosition;
        bubblePositionSelect.addEventListener('change', (e) => {
            settings.uiBubblePosition = e.target.value;
            applyUITheme();
            saveSettings();
        });
    }
    
    const opacitySlider = document.getElementById('kibitzer-opacity');
    const opacityValue = document.getElementById('kibitzer-opacity-value');
    if (opacitySlider && opacityValue) {
        opacitySlider.value = settings.uiOpacity;
        opacityValue.textContent = `${settings.uiOpacity}%`;
        opacitySlider.addEventListener('input', (e) => {
            settings.uiOpacity = parseInt(e.target.value);
            opacityValue.textContent = `${settings.uiOpacity}%`;
            applyUITheme();
            applyBarTheme();
            saveSettings();
        });
    }
    
    // Ticker speed settings
    const tickerSpeedSlider = document.getElementById('kibitzer-ticker-speed');
    const tickerSpeedValue = document.getElementById('kibitzer-ticker-speed-value');
    if (tickerSpeedSlider && tickerSpeedValue) {
        tickerSpeedSlider.value = settings.uiTickerSpeed;
        tickerSpeedValue.textContent = `${settings.uiTickerSpeed} px/s`;
        tickerSpeedSlider.addEventListener('input', (e) => {
            settings.uiTickerSpeed = parseInt(e.target.value);
            tickerSpeedValue.textContent = `${settings.uiTickerSpeed} px/s`;
            saveSettings();
            // Re-apply ticker animation only (don't add to history)
            applyBarTickerAnimation();
        });
    }
    
    // Ticker always scroll checkbox
    const tickerAlwaysCheckbox = document.getElementById('kibitzer-ticker-always');
    if (tickerAlwaysCheckbox) {
        tickerAlwaysCheckbox.checked = settings.uiTickerAlwaysScroll;
        tickerAlwaysCheckbox.addEventListener('change', (e) => {
            settings.uiTickerAlwaysScroll = e.target.checked;
            saveSettings();
            // Re-apply ticker animation only (don't add to history)
            applyBarTickerAnimation();
        });
    }
    // ========== Quick API Settings ==========
    
    const quickApiEnabled = document.getElementById('kibitzer-quickapi-enabled');

if (quickApiEnabled) {
    quickApiEnabled.checked = settings.quickApiEnabled;
    
    quickApiEnabled.addEventListener('change', (e) => {
        settings.quickApiEnabled = e.target.checked;
        updateQuickApiStatus();
        saveSettings();
    });
}

// Setup Quick API drawer toggle
const quickApiDrawerToggle = document.getElementById('kibitzer-quickapi-drawer-toggle');
const quickApiDrawerContent = document.getElementById('kibitzer-quickapi-drawer-content');

if (quickApiDrawerToggle && quickApiDrawerContent) {
    quickApiDrawerToggle.addEventListener('click', () => {
        const icon = quickApiDrawerToggle.querySelector('. inline-drawer-icon');
        const isOpen = quickApiDrawerContent.style. display !== 'none';
        
        if (isOpen) {
            quickApiDrawerContent.style.display = 'none';
            if (icon) {
                icon.classList.remove('up');
                icon.classList.add('down');
            }
        } else {
            quickApiDrawerContent.style.display = 'block';
            if (icon) {
                icon.classList. remove('down');
                icon.classList. add('up');
            }
        }
    });
}
    
    // Provider buttons
    document.querySelectorAll('.kibitzer-provider-btn').forEach(btn => {
        // Mark currently selected provider
        if (btn.dataset.provider === settings.quickApiProvider) {
            btn.classList.add('selected');
        }
        
        btn.addEventListener('click', () => {
            onQuickApiProviderClick(btn.dataset.provider);
        });
    });
    
    // API URL input (for custom provider)
    const quickApiUrl = document.getElementById('kibitzer-quickapi-url');
    if (quickApiUrl) {
        quickApiUrl.value = settings.quickApiUrl || '';
        
        // Show if custom provider is selected
        const urlContainer = document.getElementById('kibitzer-quickapi-url-container');
        if (urlContainer && settings.quickApiProvider === 'custom') {
            urlContainer. style.display = 'block';
        }
        
        quickApiUrl.addEventListener('change', (e) => {
            settings. quickApiUrl = e.target. value. trim();
            updateQuickApiStatus();
            saveSettings();
        });
    }
    
    // Model select dropdown
    const quickApiModelSelect = document.getElementById('kibitzer-quickapi-model-select');
    if (quickApiModelSelect) {
        quickApiModelSelect.addEventListener('change', (e) => {
            settings.quickApiModel = e.target.value;
            
            // Also update text input if visible
            const modelInput = document.getElementById('kibitzer-quickapi-model-input');
            if (modelInput) {
                modelInput.value = e.target.value;
            }
            
            updateQuickApiStatus();
            saveSettings();
        });
    }
    
    // Model text input
    const quickApiModelInput = document.getElementById('kibitzer-quickapi-model-input');
    if (quickApiModelInput) {
        quickApiModelInput. addEventListener('change', (e) => {
            settings.quickApiModel = e. target.value. trim();
            updateQuickApiStatus();
            saveSettings();
        });
    }
    
    // Refresh models button
    const refreshModelsBtn = document.getElementById('kibitzer-quickapi-refresh-models');
    if (refreshModelsBtn) {
        refreshModelsBtn.addEventListener('click', async () => {
            // Clear cache to force refresh
            settings.openRouterModelsCacheTime = 0;
            await populateQuickApiModels();
        });
    }
    
    // Connect button
    const connectQuickApiBtn = document.getElementById('kibitzer-quickapi-connect');
    if (connectQuickApiBtn) {
        connectQuickApiBtn.addEventListener('click', () => {
            connectQuickApi();
        });
    }
    
    // Test button
    const testQuickApiBtn = document.getElementById('kibitzer-quickapi-test');
    if (testQuickApiBtn) {
        testQuickApiBtn.addEventListener('click', () => {
            if (! settings.quickApiEnabled) {
                alert('Please enable Quick API first!');
                return;
            }
            if (!settings.quickApiProvider || !settings.quickApiModel) {
                alert('Please select a provider and model first!');
                return;
            }
            console.log(DEBUG_PREFIX, 'Testing Quick API...');
            generateCommentary(true);
        });
    }
    
    // Initialize Quick API UI state
    if (settings.quickApiProvider) {
        // Show API URL field if custom
        const urlContainer = document.getElementById('kibitzer-quickapi-url-container');
        if (urlContainer) {
            urlContainer.style.display = settings.quickApiProvider === 'custom' ? 'block' : 'none';
        }
        
        // Populate models
        populateQuickApiModels();
    }
    
    updateQuickApiStatus();
}

jQuery(async () => {
    console.log(DEBUG_PREFIX, 'Initializing Kibitzer extension...');
    
    loadSettings();
    
    // Set flag to ignore messages during initial load
    kibitzer.chatJustChanged = true;
    setTimeout(() => {
        kibitzer.chatJustChanged = false;
        console.log(DEBUG_PREFIX, 'Initial load complete, now listening for new messages');
    }, 3000);
    
    // Create both display modes
    createWidget();
    createBar();
    
    // Show the appropriate one based on settings
    const settings = getSettings();
    switchDisplayMode(settings.displayMode);
    
    await setupSettingsUI();
    
    eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
    // Note: We only listen to MESSAGE_RECEIVED (AI responses), not MESSAGE_SENT (user messages)
    // This prevents double-triggering and makes more sense - Kibitzer comments on the RP, not user input
    eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
    eventSource.on(event_types.CHARACTER_DELETED, populateCharacterDropdown);
    eventSource.on(event_types.CHARACTER_EDITED, populateCharacterDropdown);
    
    eventSource.on(event_types.SETTINGS_LOADED, () => {
        setTimeout(async () => {
            populateCharacterDropdown();
            updateWidgetCharacter();
            updateBarCharacter();
            await populateProfileDropdown();
        }, 500);
    });
    
    setTimeout(populateCharacterDropdown, 1000);
    setTimeout(populateCharacterDropdown, 3000);
    setTimeout(populateProfileDropdown, 1500);
    
    console.log(DEBUG_PREFIX, 'Kibitzer extension initialized!');
});
