// Netra Gateway - Renderer Process
console.log('Netra Gateway Renderer Starting...');

// State
const state = {
    user: null,
    token: null,
    isConnected: false,
    isConnecting: false,
    subscription: null,
    usage: null,
    plans: [],
    vpnConfig: null
};

// DOM Elements
const elements = {
    // Sections
    authSection: document.getElementById('authSection'),
    dashboardSection: document.getElementById('dashboardSection'),
    
    // Auth Forms
    loginForm: document.getElementById('loginForm'),
    registerForm: document.getElementById('registerForm'),
    loginFormElement: document.getElementById('loginFormElement'),
    registerFormElement: document.getElementById('registerFormElement'),
    
    // Switch forms
    showRegister: document.getElementById('showRegister'),
    showLogin: document.getElementById('showLogin'),
    
    // Connection
    connectionStatus: document.getElementById('connectionStatus'),
    vpnIcon: document.getElementById('vpnIcon'),
    connectBtn: document.getElementById('connectBtn'),
    
    // Stats
    planBadge: document.getElementById('planBadge'),
    dataUsed: document.getElementById('dataUsed'),
    dataLimit: document.getElementById('dataLimit'),
    timeRemaining: document.getElementById('timeRemaining'),
    usagePercent: document.getElementById('usagePercent'),
    usageFill: document.getElementById('usageFill'),
    
    // Plans
    plansGrid: document.getElementById('plansGrid'),
    
    // User
    userName: document.getElementById('userName'),
    userEmail: document.getElementById('userEmail'),
    logoutBtn: document.getElementById('logoutBtn'),
    
    // Loading & Toast
    loadingOverlay: document.getElementById('loadingOverlay'),
    toastContainer: document.getElementById('toastContainer')
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM Loaded');
    await init();
});

async function init() {
    loadStoredAuth();
    setupEventListeners();
    setupIPCListeners();
    
    if (state.token) {
        await loadDashboard();
    }
}

// Auth Storage
function loadStoredAuth() {
    const stored = localStorage.getItem('netra_auth');
    if (stored) {
        try {
            const auth = JSON.parse(stored);
            state.token = auth.token;
            state.user = auth.user;
        } catch (e) {
            localStorage.removeItem('netra_auth');
        }
    }
}

function saveAuth(token, user) {
    state.token = token;
    state.user = user;
    localStorage.setItem('netra_auth', JSON.stringify({ token, user }));
}

function clearAuth() {
    state.token = null;
    state.user = null;
    state.subscription = null;
    localStorage.removeItem('netra_auth');
}

// Event Listeners
function setupEventListeners() {
    // Login
    elements.loginFormElement.addEventListener('submit', handleLogin);
    
    // Register
    elements.registerFormElement.addEventListener('submit', handleRegister);
    
    // Switch forms
    elements.showRegister.addEventListener('click', (e) => {
        e.preventDefault();
        elements.loginForm.classList.add('hidden');
        elements.registerForm.classList.remove('hidden');
    });
    
    elements.showLogin.addEventListener('click', (e) => {
        e.preventDefault();
        elements.registerForm.classList.add('hidden');
        elements.loginForm.classList.remove('hidden');
    });
    
    // Connect button
    elements.connectBtn.addEventListener('click', handleConnect);
    
    // Logout
    elements.logoutBtn.addEventListener('click', handleLogout);
}

function setupIPCListeners() {
    if (!window.netraAPI) return;
    
    // Tray events
    window.netraAPI.onTrayConnect(() => handleConnect());
    window.netraAPI.onTrayDisconnect(() => handleDisconnect());
    window.netraAPI.onMenuConnect(() => handleConnect());
    window.netraAPI.onMenuDisconnect(() => handleDisconnect());
    window.netraAPI.onOpenSettings(() => console.log('Open settings'));
}

// Auth Handlers
async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    showLoading('Signing in...');
    
    try {
        const result = await window.netraAPI.login({ email, password });
        
        if (result.success) {
            saveAuth(result.data.token, result.data.user);
            showToast('Welcome back!', 'success');
            await loadDashboard();
        } else {
            showToast(result.error || 'Login failed', 'error');
        }
    } catch (error) {
        showToast('Connection error. Please try again.', 'error');
    } finally {
        hideLoading();
    }
}

async function handleRegister(e) {
    e.preventDefault();
    
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    
    showLoading('Creating account...');
    
    try {
        const result = await window.netraAPI.register({ name, email, password });
        
        if (result.success) {
            saveAuth(result.data.token, result.data.user);
            showToast('Account created successfully!', 'success');
            await loadDashboard();
        } else {
            showToast(result.error || 'Registration failed', 'error');
        }
    } catch (error) {
        showToast('Connection error. Please try again.', 'error');
    } finally {
        hideLoading();
    }
}

async function handleLogout() {
    try {
        await window.netraAPI.logout();
    } catch (e) {}
    
    clearAuth();
    showAuthSection();
    showToast('Signed out successfully', 'success');
}

// Dashboard
async function loadDashboard() {
    showDashboardSection();
    updateUserInfo();
    
    // Load data in parallel
    await Promise.all([
        loadSubscription(),
        loadPlans(),
        loadUsage(),
        loadVPNStatus()
    ]);
}

function showAuthSection() {
    elements.authSection.classList.remove('hidden');
    elements.dashboardSection.classList.add('hidden');
}

function showDashboardSection() {
    elements.authSection.classList.add('hidden');
    elements.dashboardSection.classList.remove('hidden');
}

function updateUserInfo() {
    if (state.user) {
        elements.userName.textContent = state.user.name || 'User';
        elements.userEmail.textContent = state.user.email || '';
    }
}

// Subscription
async function loadSubscription() {
    try {
        console.log('Loading subscription...');
        const result = await window.netraAPI.getSubscriptionStatus();
        console.log('Subscription result:', result);
        if (result.success) {
            state.subscription = result.data;
            console.log('Subscription loaded:', state.subscription);
            updateSubscriptionUI();
        } else {
            console.error('Failed to load subscription:', result.error);
        }
    } catch (error) {
        console.error('Failed to load subscription:', error);
    }
}

function updateSubscriptionUI() {
    const sub = state.subscription;
    if (!sub) return;
    
    const planName = sub.isAdmin ? 'VIP Unlimited' : (sub.plan?.name || 'Free Trial');
    const badge = elements.planBadge;
    badge.textContent = planName;
    
    if (sub.plan?.type === 'premium' || sub.isAdmin) {
        badge.classList.add('premium');
    } else {
        badge.classList.remove('premium');
    }
    
    // Update data limits
    const used = sub.usage?.bytesUsed || 0;
    const limit = sub.isAdmin ? 999999999999999 : (sub.plan?.dataLimit || 100 * 1024 * 1024); // 100MB default
    
    elements.dataUsed.textContent = formatBytes(used);
    elements.dataLimit.textContent = sub.isAdmin ? '∞' : formatBytes(limit);
    
    // Update time remaining
    if (sub.isAdmin) {
        elements.timeRemaining.textContent = '∞ Lifetime';
    } else if (sub.expiresAt) {
        const remaining = new Date(sub.expiresAt) - new Date();
        elements.timeRemaining.textContent = remaining > 0 ? formatTime(remaining) : 'Expired';
    } else {
        elements.timeRemaining.textContent = 'Unlimited';
    }
    
    // Update usage progress
    const percent = sub.isAdmin ? 0 : Math.min((used / limit) * 100, 100);
    elements.usagePercent.textContent = `${percent.toFixed(1)}%`;
    elements.usageFill.style.width = `${percent}%`;
    
    if (percent > 90) {
        elements.usageFill.classList.add('danger');
        elements.usageFill.classList.remove('warning');
    } else if (percent > 70) {
        elements.usageFill.classList.add('warning');
        elements.usageFill.classList.remove('danger');
    } else {
        elements.usageFill.classList.remove('warning', 'danger');
    }
}

// Plans
async function loadPlans() {
    try {
        console.log('Loading plans...');
        const result = await window.netraAPI.getPlans();
        console.log('Plans result:', result);
        if (result.success) {
            state.plans = result.data;
            console.log('Plans loaded:', state.plans.length);
            renderPlans();
        } else {
            console.error('Failed to load plans:', result.error);
        }
    } catch (error) {
        console.error('Failed to load plans:', error);
    }
}

function renderPlans() {
    const plans = state.plans || [];
    
    elements.plansGrid.innerHTML = plans.map(plan => `
        <div class="plan-card" data-id="${plan.id}" onclick="selectPlan('${plan.id}')">
            <div class="plan-name">${plan.name}</div>
            <div class="plan-price">$${plan.price}<span>/${plan.interval}</span></div>
            <div class="plan-data">${formatBytes(plan.dataLimit)}</div>
        </div>
    `).join('');
}

window.selectPlan = async function(planId) {
    // Highlight selected
    document.querySelectorAll('.plan-card').forEach(card => {
        card.classList.toggle('selected', card.dataset.id === planId);
    });
    
    // Purchase
    showLoading('Processing payment...');
    
    try {
        const result = await window.netraAPI.purchasePlan(planId);
        
        if (result.success) {
            showToast('Plan purchased successfully!', 'success');
            await loadSubscription();
        } else {
            showToast(result.error || 'Purchase failed', 'error');
        }
    } catch (error) {
        showToast('Payment error. Please try again.', 'error');
    } finally {
        hideLoading();
    }
};

// Usage
async function loadUsage() {
    try {
        const result = await window.netraAPI.getUsageStats();
        if (result.success) {
            state.usage = result.data;
            updateUsageUI();
        }
    } catch (error) {
        console.error('Failed to load usage:', error);
    }
}

function updateUsageUI() {
    // Update real-time if connected
    if (state.isConnected && state.usage) {
        const used = state.usage.bytesUsed || 0;
        const limit = state.subscription?.plan?.dataLimit || 100 * 1024 * 1024;
        
        elements.dataUsed.textContent = formatBytes(used);
        
        const percent = Math.min((used / limit) * 100, 100);
        elements.usagePercent.textContent = `${percent.toFixed(1)}%`;
        elements.usageFill.style.width = `${percent}%`;
    }
}

// VPN
async function loadVPNStatus() {
    try {
        const result = await window.netraAPI.getVPNStatus();
        if (result.success) {
            updateVPNUI(result.data);
        }
    } catch (error) {
        console.error('Failed to load VPN status:', error);
    }
}

function updateVPNUI(status) {
    state.isConnected = status.connected || false;
    
    const statusDot = elements.connectionStatus.querySelector('.status-dot');
    const statusText = elements.connectionStatus.querySelector('.status-text');
    const btnText = elements.connectBtn.querySelector('.btn-text');
    
    if (state.isConnected) {
        statusDot.className = 'status-dot connected';
        statusText.textContent = 'Connected';
        elements.vpnIcon.classList.add('connected');
        elements.connectBtn.classList.add('connected');
        btnText.innerHTML = '<span>◉</span> Disconnect';
    } else if (state.isConnecting) {
        statusDot.className = 'status-dot connecting';
        statusText.textContent = 'Connecting...';
        elements.vpnIcon.classList.add('connecting');
        btnText.textContent = 'Connecting...';
    } else {
        statusDot.className = 'status-dot disconnected';
        statusText.textContent = 'Disconnected';
        elements.vpnIcon.classList.remove('connected', 'connecting');
        elements.connectBtn.classList.remove('connected');
        btnText.innerHTML = '<span>◇</span> Connect';
    }
}

async function handleConnect() {
    console.log('Subscription state:', state.subscription);
    
    if (state.isConnected) {
        await handleDisconnect();
        return;
    }
    
    // Robust connection check
    const sub = state.subscription;
    const canConnect = sub && (sub.active === true || sub.isAdmin === true || sub.plan?.id === 'vip' || sub.plan?.name === 'VIP Unlimited');
    
    console.log('Can connect:', canConnect, 'sub:', sub);
    
    if (!canConnect) {
        showToast('Please activate a subscription first', 'warning');
        return;
    }
    
    state.isConnecting = true;
    updateVPNUI({ connected: false });
    showLoading('Connecting to VPN...');
    
    try {
        const result = await window.netraAPI.connectVPN();
        
        if (result.success) {
            state.vpnConfig = result.data.config;
            state.isConnected = true;
            showToast('Connected to VPN!', 'success');
            startUsageTracking();
        } else {
            showToast(result.error || 'Connection failed', 'error');
        }
    } catch (error) {
        showToast('Connection error. Please try again.', 'error');
    } finally {
        state.isConnecting = false;
        hideLoading();
        updateVPNUI({ connected: state.isConnected });
    }
}

async function handleDisconnect() {
    showLoading('Disconnecting...');
    
    try {
        await window.netraAPI.disconnectVPN();
        state.isConnected = false;
        showToast('Disconnected from VPN', 'success');
        stopUsageTracking();
    } catch (error) {
        console.error('Disconnect error:', error);
    } finally {
        hideLoading();
        updateVPNUI({ connected: false });
    }
}

// Usage Tracking
let usageInterval = null;

function startUsageTracking() {
    if (usageInterval) return;
    
    usageInterval = setInterval(async () => {
        await loadUsage();
        
        // Check if subscription expired during connection
        if (state.subscription && !state.subscription.active && !state.subscription.isAdmin) {
            showToast('Subscription expired! Disconnecting...', 'warning');
            await handleDisconnect();
        }
    }, 30000); // Every 30 seconds
}

function stopUsageTracking() {
    if (usageInterval) {
        clearInterval(usageInterval);
        usageInterval = null;
    }
}

// UI Helpers
function showLoading(message = 'Loading...') {
    const overlay = elements.loadingOverlay;
    overlay.querySelector('p').textContent = message;
    overlay.classList.remove('hidden');
}

function hideLoading() {
    elements.loadingOverlay.classList.add('hidden');
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    elements.toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Formatters
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
}

console.log('Renderer initialized');
