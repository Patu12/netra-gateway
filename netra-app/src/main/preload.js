const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('netraAPI', {
    // Auth
    login: (credentials) => ipcRenderer.invoke('auth:login', credentials),
    register: (userData) => ipcRenderer.invoke('auth:register', userData),
    logout: () => ipcRenderer.invoke('auth:logout'),

    // Subscription
    getSubscriptionStatus: () => ipcRenderer.invoke('subscription:status'),
    getPlans: () => ipcRenderer.invoke('subscription:plans-public'),
    purchasePlan: (planId) => ipcRenderer.invoke('subscription:purchase', planId),

    // VPN
    connectVPN: () => ipcRenderer.invoke('vpn:connect'),
    disconnectVPN: () => ipcRenderer.invoke('vpn:disconnect'),
    getVPNStatus: () => ipcRenderer.invoke('vpn:status'),
    getTailscaleStatus: () => ipcRenderer.invoke('vpn:tailscale-status'),
    installTailscale: () => ipcRenderer.invoke('vpn:install-tailscale'),
    getProxyInfo: () => ipcRenderer.invoke('vpn:proxy-info'),

    // Usage
    getUsageStats: () => ipcRenderer.invoke('usage:stats'),
    reportUsage: (data) => ipcRenderer.invoke('usage:report', data),

    // App
    getAppInfo: () => ipcRenderer.invoke('app:info'),

    // Window controls
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),

    // Event listeners
    onTrayConnect: (callback) => ipcRenderer.on('tray-connect', callback),
    onTrayDisconnect: (callback) => ipcRenderer.on('tray-disconnect', callback),
    onMenuConnect: (callback) => ipcRenderer.on('menu-connect', callback),
    onMenuDisconnect: (callback) => ipcRenderer.on('menu-disconnect', callback),
    onOpenSettings: (callback) => ipcRenderer.on('open-settings', callback),

    // Remove listeners
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});

console.log('Preload script loaded successfully');
