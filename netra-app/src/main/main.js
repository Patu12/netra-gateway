const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog, shell } = require('electron');

// Debug: check if we're in electron runtime
if (!app || typeof app.whenReady !== 'function') {
    console.error('ERROR: Not running in Electron runtime!');
    console.error('App:', app);
    console.error('App type:', typeof app);
    process.exit(1);
}

// 2. Add a 'Safety Valve' for the error handler
process.on('uncaughtException', (error) => {
    console.error('CRITICAL ERROR:', error);
    if (dialog && dialog.showErrorBox) {
        dialog.showErrorBox('Fatal Error', `An unexpected error occurred:\n${error.message}`);
    }
    if (app && app.exit) app.exit(1);
});

// 3. Debug Check
console.log('App object status:', !!app ? 'READY' : 'STILL_UNDEFINED');
const path = require('path');
const log = require('electron-log');
const axios = require('axios');

// Debug: check if electron module is loaded properly
const testElectron = require('electron');
console.log('Is Electron Loaded?', !!testElectron);
console.log('Is App defined?', !!testElectron.app);
console.log('Electron keys:', Object.keys(testElectron));

// Configure logging
log.transports.file.level = 'info';
log.transports.file.maxSize = 5 * 1024 * 1024; // 5MB
log.transports.console.level = 'debug';

// Log startup
log.info('='.repeat(50));
log.info('Netra Gateway Starting...');
log.info(`Platform: ${process.platform}`);
log.info('='.repeat(50));

// Global references
let mainWindow = null;
let tray = null;
let isQuitting = false;

// API Configuration
const API_URL = process.env.API_URL || 'http://localhost:3001';
let authToken = null;

const API = axios.create({
    baseURL: API_URL,
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' }
});

// Add auth token to requests
API.interceptors.request.use((config) => {
    if (authToken) {
        config.headers.Authorization = `Bearer ${authToken}`;
    }
    return config;
});

// Store token function
function setAuthToken(token) {
    authToken = token;
}

// Global exception handlers
process.on('uncaughtException', (error) => {
    log.error('Uncaught Exception:', error);
    dialog.showErrorBox('Fatal Error', `An unexpected error occurred:\n${error.message}`);
    app.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    log.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

function createWindow() {
    log.info('Creating main window...');

    mainWindow = new BrowserWindow({
        width: 420,
        height: 700,
        minWidth: 380,
        minHeight: 600,
        resizable: true,
        frame: true,
        transparent: false,
        backgroundColor: '#0a0a0f',
        icon: path.join(__dirname, '../../assets/icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            webSecurity: true,
            allowRunningInsecureContent: false
        },
        show: false,
        title: 'Netra Gateway'
    });

    // Load the app
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

    // Show when ready
    mainWindow.once('ready-to-show', () => {
        log.info('Main window ready to show');
        mainWindow.show();
    });

    // Handle window close
    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow.hide();
            log.info('Window minimized to tray');
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Log navigation errors
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        log.error(`Failed to load: ${errorCode} - ${errorDescription}`);
    });

    log.info('Main window created successfully');
}

function createTray() {
    log.info('Creating system tray...');

    // Create a simple 16x16 icon
    const iconPath = path.join(__dirname, '../../assets/tray-icon.png');
    let trayIcon;

    try {
        trayIcon = nativeImage.createFromPath(iconPath);
        if (trayIcon.isEmpty()) {
            // Create a simple colored icon if file doesn't exist
            trayIcon = nativeImage.createEmpty();
        }
    } catch (e) {
        trayIcon = nativeImage.createEmpty();
    }

    tray = new Tray(trayIcon);
    tray.setToolTip('Netra Gateway');

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Open Netra Gateway',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                }
            }
        },
        {
            label: 'Connect',
            click: () => {
                if (mainWindow) {
                    mainWindow.webContents.send('tray-connect');
                }
            }
        },
        {
            label: 'Disconnect',
            click: () => {
                if (mainWindow) {
                    mainWindow.webContents.send('tray-disconnect');
                }
            }
        },
        { type: 'separator' },
        {
            label: 'View Logs',
            click: () => {
                shell.openPath(log.transports.file.getFile().path);
            }
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => {
                isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });

    log.info('System tray created');
}

function createMenu() {
    const template = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'Settings',
                    accelerator: 'CmdOrCtrl+,',
                    click: () => {
                        if (mainWindow) {
                            mainWindow.webContents.send('open-settings');
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: 'Exit',
                    accelerator: 'CmdOrCtrl+Q',
                    click: () => {
                        isQuitting = true;
                        app.quit();
                    }
                }
            ]
        },
        {
            label: 'Connection',
            submenu: [
                {
                    label: 'Connect',
                    accelerator: 'CmdOrCtrl+Shift+C',
                    click: () => {
                        if (mainWindow) {
                            mainWindow.webContents.send('menu-connect');
                        }
                    }
                },
                {
                    label: 'Disconnect',
                    accelerator: 'CmdOrCtrl+Shift+D',
                    click: () => {
                        if (mainWindow) {
                            mainWindow.webContents.send('menu-disconnect');
                        }
                    }
                }
            ]
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' }
            ]
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'About Netra Gateway',
                    click: () => {
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'About Netra Gateway',
                            message: 'Netra Gateway v1.0.0',
                            detail: 'AAA Server in Your Pocket\n\nA secure gateway for on-demand micro-connectivity.'
                        });
                    }
                },
                {
                    label: 'Open Logs Folder',
                    click: () => {
                        shell.showItemInFolder(log.transports.file.getFile().path);
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// IPC Handlers
function setupIPC() {
    log.info('Setting up IPC handlers...');

    // Auth handlers
    ipcMain.handle('auth:login', async (event, credentials) => {
        try {
            log.info('Login attempt:', credentials.email);
            const response = await API.post('/api/auth/login', credentials);
            log.info('Login successful for:', credentials.email);
            
            // Save token globally for future API calls
            if (response.data && response.data.data && response.data.data.token) {
                authToken = response.data.data.token;
            }
            
            return { success: true, data: response.data };
        } catch (error) {
            log.error('Login failed:', error.message);
            return { success: false, error: error.response?.data?.message || error.message };
        }
    });

    ipcMain.handle('auth:register', async (event, userData) => {
        try {
            log.info('Registration attempt:', userData.email);
            const response = await API.post('/api/auth/register', userData);
            log.info('Registration successful for:', userData.email);
            return { success: true, data: response.data };
        } catch (error) {
            log.error('Registration failed:', error.message);
            return { success: false, error: error.response?.data?.message || error.message };
        }
    });

    ipcMain.handle('auth:logout', async () => {
        log.info('User logged out');
        return { success: true };
    });

    // Subscription handlers
    ipcMain.handle('subscription:status', async () => {
        try {
            const response = await API.get('/api/subscription/status');
            // Backend returns { success: true, data: {...} }
            // axios response.data = { success: true, data: {...} }
            return response.data; // Return the data directly
        } catch (error) {
            log.error('Get subscription status failed:', error.message);
            
            // Handle 502 Bad Gateway - backend sleeping
            if (error.response?.status === 502) {
                return { success: false, error: 'Server is waking up. Please try again.', message: 'Server is waking up. Please try again.' };
            }
            
            return { success: false, error: error.message, message: error.message };
        }
    });

    ipcMain.handle('subscription:plans-public', async () => {
        try {
            const response = await API.get('/api/public/plans');
            // Backend returns { success: true, data: [...] }
            // axios response.data = { success: true, data: [...] }
            return response.data; // Return the data directly
        } catch (error) {
            log.error('Get plans failed:', error.message);
            
            // Handle 502 Bad Gateway - backend sleeping
            if (error.response?.status === 502) {
                return { success: false, error: 'Server is waking up. Please try again.', message: 'Server is waking up. Please try again.' };
            }
            
            return { success: false, error: error.message, message: error.message };
        }
    });

    ipcMain.handle('subscription:plans', async () => {
        try {
            const response = await API.get('/api/subscription/plans');
            return { success: true, data: response.data };
        } catch (error) {
            log.error('Get plans failed:', error.message);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('subscription:purchase', async (event, planId) => {
        try {
            log.info('Purchase attempt for plan:', planId);
            log.info('Current auth token:', authToken ? 'present' : 'missing');
            
            const response = await API.post('/api/subscription/purchase', { planId });
            log.info('Purchase response:', JSON.stringify(response.data));
            return { success: true, data: response.data };
        } catch (error) {
            log.error('Purchase failed:', error.message);
            log.error('Error response:', error.response?.data);
            
            // Handle 502 Bad Gateway - backend sleeping
            if (error.code === 'ECONNREFUSED' || error.response?.status === 502) {
                return { success: false, error: 'Server is waking up. Please try again in 30 seconds.' };
            }
            
            return { success: false, error: error.response?.data?.message || error.message };
        }
    });

    // VPN handlers - Using Tailscale CLI
    ipcMain.handle('vpn:connect', async () => {
        try {
            log.info('VPN connect request - starting Tailscale');
            
            // Check if Tailscale is installed
            const tailscalePath = 'C:\\Program Files\\Tailscale\\tailscale.exe';
            
            // Start Tailscale
            const { execSync } = require('child_process');
            
            try {
                // Try to connect using Tailscale
                execSync(`"${tailscalePath}" up --exit-node=100.102.117.30`, { stdio: 'pipe' });
                log.info('Tailscale connected');
            } catch (e) {
                // If already connected, just continue
                log.info('Tailscale already running or error:', e.message);
            }
            
            // Get Tailscale IP
            let tailscaleIP = '';
            try {
                const statusOutput = execSync(`"${tailscalePath}" status --json`, { encoding: 'utf8' });
                const status = JSON.parse(statusOutput);
                // Find the IP
                for (const peer in status.Peer) {
                    if (status.Peer[peer].TailscaleIP) {
                        tailscaleIP = status.Peer[peer].TailscaleIP;
                        break;
                    }
                }
            } catch (e) {
                // Fallback - try to get IP from simpler command
                try {
                    const ipOutput = execSync(`"${tailscalePath}" ip`, { encoding: 'utf8' });
                    tailscaleIP = ipOutput.trim();
                } catch (e2) {
                    tailscaleIP = '100.102.117.30'; // Default from earlier
                }
            }
            
            return { 
                success: true, 
                data: {
                    connected: true,
                    type: 'tailscale',
                    ip: tailscaleIP,
                    message: 'Connected via Tailscale VPN'
                }
            };
        } catch (error) {
            log.error('VPN connect failed:', error.message);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('vpn:disconnect', async () => {
        try {
            log.info('VPN disconnect request - stopping Tailscale');
            
            const tailscalePath = 'C:\\Program Files\\Tailscale\\tailscale.exe';
            const { execSync } = require('child_process');
            
            try {
                execSync(`"${tailscalePath}" down`, { stdio: 'pipe' });
                log.info('Tailscale disconnected');
            } catch (e) {
                log.info('Tailscale disconnect error:', e.message);
            }
            
            return { success: true, data: { connected: false } };
        } catch (error) {
            log.error('VPN disconnect failed:', error.message);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('vpn:status', async () => {
        try {
            const response = await API.get('/api/vpn/status');
            return { success: true, data: response.data };
        } catch (error) {
            log.error('Get VPN status failed:', error.message);
            return { success: false, error: error.message };
        }
    });

    // Usage handlers
    ipcMain.handle('usage:stats', async () => {
        try {
            const response = await API.get('/api/usage/stats');
            return { success: true, data: response.data };
        } catch (error) {
            log.error('Get usage stats failed:', error.message);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('usage:report', async (event, usageData) => {
        try {
            await API.post('/api/usage/report', usageData);
            return { success: true };
        } catch (error) {
            log.error('Report usage failed:', error.message);
            return { success: false, error: error.message };
        }
    });

    // App info
    ipcMain.handle('app:info', () => {
        return {
            version: app.getVersion(),
            platform: process.platform,
            electron: process.versions.electron,
            node: process.versions.node,
            apiUrl: API_URL
        };
    });

    // Window controls
    ipcMain.on('window:minimize', () => {
        if (mainWindow) mainWindow.minimize();
    });

    ipcMain.on('window:maximize', () => {
        if (mainWindow) {
            if (mainWindow.isMaximized()) {
                mainWindow.unmaximize();
            } else {
                mainWindow.maximize();
            }
        }
    });

    ipcMain.on('window:close', () => {
        if (mainWindow) mainWindow.close();
    });

    log.info('IPC handlers setup complete');
}

// App lifecycle
app.whenReady().then(() => {
    log.info('App ready');
    log.info(`App Version: ${app.getVersion()}`);
    log.info(`Electron: ${process.versions.electron}`);
    log.info(`Node: ${process.versions.node}`);
    createMenu();
    createWindow();
    createTray();
    setupIPC();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        // Don't quit, stay in tray
    }
});

app.on('before-quit', () => {
    isQuitting = true;
    log.info('App quitting...');
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    log.warn('Another instance is already running, quitting...');
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

log.info('Main process initialization complete');
