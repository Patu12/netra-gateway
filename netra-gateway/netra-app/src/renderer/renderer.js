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
    vpnConfig: null,
    logs: [],
    currentPage: 'dashboard',
    connectionStartTime: null
};

// DOM Elements
const elements = {
    // Sidebar
    sidebar: document.getElementById('sidebar'),
    menuToggle: document.getElementById('menuToggle'),
    navItems: document.querySelectorAll('.nav-item'),
    
    // User info mini
    userAvatar: document.getElementById('userAvatar'),
    userNameMini: document.getElementById('userNameMini'),
    userPlanMini: document.getElementById('userPlanMini'),
    logoutBtnMini: document.getElementById('logoutBtnMini'),
    
    // Pages
    pageTitle: document.getElementById('pageTitle'),
    authSection: document.getElementById('authSection'),
    dashboardPage: document.getElementById('dashboardPage'),
    plansPage: document.getElementById('plansPage'),
    subscriptionPage: document.getElementById('subscriptionPage'),
    logsPage: document.getElementById('logsPage'),
    
    // Auth Forms
    loginFormElement: document.getElementById('loginFormElement'),
    registerFormElement: document.getElementById('registerFormElement'),
    showRegister: document.getElementById('showRegister'),
    showLogin: document.getElementById('showLogin'),
    
    // Connection
    connectionStatus: document.getElementById('connectionStatus'),
    vpnIcon: document.getElementById('vpnIcon'),
    connectBtn: document.getElementById('connectBtn'),
    connectionInfo: document.getElementById('connectionInfo'),
    
    // Quick Stats
    quickPlan: document.getElementById('quickPlan'),
    quickData: document.getElementById('quickData'),
    quickTime: document.getElementById('quickTime'),
    
    // Usage
    usagePercent: document.getElementById('usagePercent'),
    usageFill: document.getElementById('usageFill'),
    dataUsed: document.getElementById('dataUsed'),
    dataLimit: document.getElementById('dataLimit'),
    
    // Plans
    plansGrid: document.getElementById('plansGrid'),
    
    // Subscription Details
    planBadge: document.getElementById('planBadge'),
    planName: document.getElementById('planName'),
    planPrice: document.getElementById('planPrice'),
    detailPlanType: document.getElementById('detailPlanType'),
    detailDataLimit: document.getElementById('detailDataLimit'),
    detailDuration: document.getElementById('detailDuration'),
    detailStatus: document.getElementById('detailStatus'),
    detailStarted: document.getElementById('detailStarted'),
    detailExpires: document.getElementById('detailExpires'),
    timeUsed: document.getElementById('timeUsed'),
    timeRemaining: document.getElementById('timeRemaining'),
    
    // Logs
    logsContainer: document.getElementById('logsContainer'),
    logFilter: document.getElementById('logFilter'),
    clearLogsBtn: document.getElementById('clearLogsBtn'),
    
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
    addLog('info', 'Application started');
    
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
    // Menu toggle
    elements.menuToggle.addEventListener('click', () => {
        elements.sidebar.classList.toggle('open');
    });
    
    // Navigation
    elements.navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            navigateTo(page);
        });
    });
    
    // Logout buttons
    elements.logoutBtnMini.addEventListener('click', handleLogout);
    
    // Login
    elements.loginFormElement.addEventListener('submit', handleLogin);
    
    // Register
    elements.registerFormElement.addEventListener('submit', handleRegister);
    
    // Switch forms
    elements.showRegister.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('loginForm').classList.add('hidden');
        document.getElementById('registerForm').classList.remove('hidden');
    });
    
    elements.showLogin.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('registerForm').classList.add('hidden');
        document.getElementById('loginForm').classList.remove('hidden');
    });
    
    // Connect button
    elements.connectBtn.addEventListener('click', handleConnect);
    
    // Log filter
    elements.logFilter.addEventListener('change', filterLogs);
    
    // Clear logs
    elements.clearLogsBtn.addEventListener('click', clearLogs);
}

function setupIPCListeners() {
    if (!window.netraAPI) return;
    
    window.netraAPI.onTrayConnect(() => handleConnect());
    window.netraAPI.onTrayDisconnect(() => handleDisconnect());
    window.netraAPI.onMenuConnect(() => handleConnect());
    window.netraAPI.onMenuDisconnect(() => handleDisconnect());
}

// Navigation
function navigateTo(page) {
    state.currentPage = page;
    
    // Update nav
    elements.navItems.forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
    });
    
    // Update page title
    const titles = {
        dashboard: 'Dashboard',
        plans: 'Plans',
        subscription: 'Subscription',
        logs: 'Logs'
    };
    elements.pageTitle.textContent = titles[page] || 'Dashboard';
    
    // Show page
    elements.dashboardPage.classList.add('hidden');
    elements.plansPage.classList.add('hidden');
    elements.subscriptionPage.classList.add('hidden');
    elements.logsPage.classList.add('hidden');
    
    switch(page) {
        case 'dashboard':
            elements.dashboardPage.classList.remove('hidden');
            break;
        case 'plans':
            elements.plansPage.classList.remove('hidden');
            loadPlans();
            break;
        case 'subscription':
            elements.subscriptionPage.classList.remove('hidden');
            loadSubscriptionDetails();
            break;
        case 'logs':
            elements.logsPage.classList.remove('hidden');
            renderLogs();
            break;
    }
    
    // Close sidebar on mobile
    elements.sidebar.classList.remove('open');
}

// Auth Handlers
async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    showLoading('Signing in...');
    addLog('info', `Attempting login for ${email}`);
    
    try {
        const result = await window.netraAPI.login({ email, password });
        
        if (result.success) {
            saveAuth(result.data.token, result.data.user);
            showToast('Welcome back!', 'success');
            addLog('info', `Login successful for ${email}`);
            await loadDashboard();
        } else {
            showToast(result.error || 'Login failed', 'error');
            addLog('error', `Login failed for ${email}: ${result.error}`);
        }
    } catch (error) {
        showToast('Connection error. Please try again.', 'error');
        addLog('error', `Login error: ${error.message}`);
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
    addLog('info', `Creating account for ${email}`);
    
    try {
        const result = await window.netraAPI.register({ name, email, password });
        
        if (result.success) {
            saveAuth(result.data.token, result.data.user);
            showToast('Account created successfully!', 'success');
            addLog('info', `Account created for ${email}`);
            await loadDashboard();
        } else {
            showToast(result.error || 'Registration failed', 'error');
            addLog('error', `Registration failed: ${result.error}`);
        }
    } catch (error) {
        showToast('Connection error. Please try again.', 'error');
        addLog('error', `Registration error: ${error.message}`);
    } finally {
        hideLoading();
    }
}

async function handleLogout() {
    addLog('info', 'User logged out');
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
    elements.dashboardPage.classList.add('hidden');
    elements.plansPage.classList.add('hidden');
    elements.subscriptionPage.classList.add('hidden');
    elements.logsPage.classList.add('hidden');
    elements.sidebar.classList.add('hidden');
}

function showDashboardSection() {
    elements.authSection.classList.add('hidden');
    elements.sidebar.classList.remove('hidden');
    elements.dashboardPage.classList.remove('hidden');
    navigateTo('dashboard');
}

function updateUserInfo() {
    if (state.user) {
        const initials = state.user.name ? state.user.name.split(' ').map(n => n[0]).join('').toUpperCase() : 'U';
        elements.userAvatar.textContent = initials;
        elements.userNameMini.textContent = state.user.name || 'User';
    }
}

// Subscription
async function loadSubscription() {
    try {
        addLog('info', 'Loading subscription...');
        const result = await window.netraAPI.getSubscriptionStatus();
        
        if (result.success) {
            state.subscription = result.data;
            updateSubscriptionUI();
            addLog('info', 'Subscription loaded successfully');
        } else {
            addLog('error', `Failed to load subscription: ${result.error}`);
        }
    } catch (error) {
        addLog('error', `Failed to load subscription: ${error.message}`);
    }
}

function updateSubscriptionUI() {
    const sub = state.subscription;
    if (!sub) return;
    
    const planName = sub.isAdmin ? 'VIP Unlimited' : (sub.plan?.name || 'Free Trial');
    const isPremium = sub.plan?.type === 'premium' || sub.isAdmin;
    
    // Quick stats
    elements.quickPlan.textContent = planName;
    elements.userPlanMini.textContent = planName;
    
    // Data
    const used = sub.usage?.bytesUsed || 0;
    const limit = sub.isAdmin ? 999999999999999 : (sub.plan?.dataLimit || 100 * 1024 * 1024);
    
    elements.quickData.textContent = formatBytes(used);
    
    // Time
    if (sub.isAdmin) {
        elements.quickTime.textContent = '∞';
    } else if (sub.expires_at) {
        const remaining = new Date(sub.expires_at) - new Date();
        elements.quickTime.textContent = remaining > 0 ? formatTime(remaining) : 'Expired';
    } else {
        elements.quickTime.textContent = 'Unlimited';
    }
    
    // Usage progress
    const percent = sub.isAdmin ? 0 : Math.min((used / limit) * 100, 100);
    elements.usagePercent.textContent = `${percent.toFixed(1)}%`;
    elements.usageFill.style.width = `${percent}%`;
    elements.dataUsed.textContent = `${formatBytes(used)} used`;
    elements.dataLimit.textContent = `of ${formatBytes(limit)}`;
    
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

function loadSubscriptionDetails() {
    const sub = state.subscription;
    if (!sub) return;
    
    const planName = sub.isAdmin ? 'VIP Unlimited' : (sub.plan?.name || 'Free Trial');
    const isPremium = sub.plan?.type === 'premium' || sub.isAdmin;
    
    elements.planBadge.textContent = planName;
    elements.planBadge.classList.toggle('premium', isPremium);
    elements.planName.textContent = planName;
    elements.planPrice.innerHTML = sub.isAdmin ? 'Free<span>/lifetime</span>' : `$${sub.plan?.price || 0}<span>/${sub.plan?.interval || 'once'}</span>`;
    
    elements.detailPlanType.textContent = isPremium ? 'Premium' : (sub.plan?.type || 'Free');
    elements.detailDataLimit.textContent = sub.isAdmin ? 'Unlimited' : formatBytes(sub.plan?.dataLimit || 100 * 1024 * 1024);
    elements.detailDuration.textContent = sub.isAdmin ? 'Lifetime' : (sub.plan?.interval || 'Once');
    elements.detailStatus.textContent = sub.active ? 'Active' : 'Inactive';
    elements.detailStarted.textContent = sub.starts_at ? formatDate(sub.starts_at) : '--';
    elements.detailExpires.textContent = sub.isAdmin ? 'Never' : (sub.expires_at ? formatDate(sub.expires_at) : 'Never');
    
    // Time used/remaining
    if (state.connectionStartTime) {
        const used = Date.now() - state.connectionStartTime;
        elements.timeUsed.textContent = formatTime(used);
    } else {
        elements.timeUsed.textContent = '0h 0m';
    }
    
    if (sub.isAdmin) {
        elements.timeRemaining.textContent = '∞';
    } else if (sub.expires_at) {
        const remaining = new Date(sub.expires_at) - new Date();
        elements.timeRemaining.textContent = remaining > 0 ? formatTime(remaining) : 'Expired';
    } else {
        elements.timeRemaining.textContent = 'Unlimited';
    }
}

// Plans
async function loadPlans() {
    try {
        addLog('info', 'Loading plans...');
        const result = await window.netraAPI.getPlans();
        
        if (result.success) {
            state.plans = result.data;
            renderPlans();
            addLog('info', `Loaded ${state.plans.length} plans`);
        }
    } catch (error) {
        addLog('error', `Failed to load plans: ${error.message}`);
    }
}

function renderPlans() {
    const plans = state.plans || [];
    
    elements.plansGrid.innerHTML = plans.map(plan => `
        <div class="plan-card" data-id="${plan.id}" onclick="selectPlan('${plan.id}')">
            <div class="plan-name">${plan.name}</div>
            <div class="plan-price">$${plan.price}<span>/${plan.interval}</span></div>
            <div class="plan-data">${formatBytes(plan.data_limit)}</div>
            <div class="plan-features">
                ${(plan.features || []).map(f => `<div class="plan-feature">${f}</div>`).join('')}
            </div>
        </div>
    `).join('');
}

window.selectPlan = async function(planId) {
    // Highlight selected
    document.querySelectorAll('.plan-card').forEach(card => {
        card.classList.toggle('selected', card.dataset.id === planId);
    });
    
    addLog('info', `Selected plan: ${planId}`);
    showLoading('Processing payment...');
    
    try {
        const result = await window.netraAPI.purchasePlan(planId);
        
        if (result.success) {
            showToast('Plan purchased successfully!', 'success');
            addLog('info', `Plan ${planId} purchased successfully`);
            await loadSubscription();
        } else {
            showToast(result.error || 'Purchase failed', 'error');
            addLog('error', `Purchase failed: ${result.error}`);
        }
    } catch (error) {
        showToast('Payment error. Please try again.', 'error');
        addLog('error', `Payment error: ${error.message}`);
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
        
        elements.quickData.textContent = formatBytes(used);
        
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
        elements.connectionInfo.textContent = 'Secure connection active';
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
        elements.connectionInfo.textContent = 'Not connected';
    }
}

async function handleConnect() {
    if (state.isConnected) {
        await handleDisconnect();
        return;
    }
    
    const sub = state.subscription;
    const canConnect = sub && (sub.active === true || sub.isAdmin === true || sub.plan?.id === 'vip');
    
    if (!canConnect) {
        showToast('Please activate a subscription first', 'warning');
        addLog('warning', 'Connection denied: No active subscription');
        return;
    }
    
    state.isConnecting = true;
    updateVPNUI({ connected: false });
    showLoading('Connecting to VPN...');
    addLog('info', 'Connecting to VPN...');
    
    try {
        const result = await window.netraAPI.connectVPN();
        
        if (result.success) {
            state.vpnConfig = result.data.config;
            state.isConnected = true;
            state.connectionStartTime = Date.now();
            showToast('Connected to VPN!', 'success');
            addLog('info', 'VPN connected successfully');
            startUsageTracking();
        } else {
            showToast(result.error || 'Connection failed', 'error');
            addLog('error', `VPN connection failed: ${result.error}`);
        }
    } catch (error) {
        showToast('Connection error. Please try again.', 'error');
        addLog('error', `VPN connection error: ${error.message}`);
    } finally {
        state.isConnecting = false;
        hideLoading();
        updateVPNUI({ connected: state.isConnected });
    }
}

async function handleDisconnect() {
    showLoading('Disconnecting...');
    addLog('info', 'Disconnecting from VPN...');
    
    try {
        await window.netraAPI.disconnectVPN();
        state.isConnected = false;
        state.connectionStartTime = null;
        showToast('Disconnected from VPN', 'success');
        addLog('info', 'VPN disconnected');
        stopUsageTracking();
    } catch (error) {
        addLog('error', `Disconnect error: ${error.message}`);
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
        loadSubscriptionDetails();
        
        if (state.subscription && !state.subscription.active && !state.subscription.isAdmin) {
            showToast('Subscription expired! Disconnecting...', 'warning');
            addLog('warning', 'Subscription expired, disconnecting...');
            await handleDisconnect();
        }
    }, 30000);
}

function stopUsageTracking() {
    if (usageInterval) {
        clearInterval(usageInterval);
        usageInterval = null;
    }
}

// Logs
function addLog(level, message) {
    const log = {
        time: new Date(),
        level,
        message
    };
    state.logs.unshift(log);
    
    // Keep only last 100 logs
    if (state.logs.length > 100) {
        state.logs.pop();
    }
    
    // Render if on logs page
    if (state.currentPage === 'logs') {
        renderLogs();
    }
}

function renderLogs() {
    const filter = elements.logFilter.value;
    const filteredLogs = filter === 'all' 
        ? state.logs 
        : state.logs.filter(l => l.level === filter);
    
    elements.logsContainer.innerHTML = filteredLogs.map(log => `
        <div class="log-entry ${log.level}">
            <span class="log-time">${formatTime(log.time.getTime())}</span>
            <span class="log-level">${log.level.toUpperCase()}</span>
            <span class="log-message">${log.message}</span>
        </div>
    `).join('');
}

function filterLogs() {
    renderLogs();
}

function clearLogs() {
    state.logs = [];
    renderLogs();
    addLog('info', 'Logs cleared');
}

// Utility Functions
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
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

function formatDate(dateStr) {
    if (!dateStr) return '--';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    });
}

function showLoading(message) {
    const loadingText = elements.loadingOverlay.querySelector('p');
    loadingText.textContent = message;
    elements.loadingOverlay.classList.remove('hidden');
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
        toast.remove();
    }, 3000);
}
