// In-memory database with file persistence
// Can be replaced with PostgreSQL/Firebase in production

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_FILE = path.join(__dirname, 'database.json');

// Load or initialize database
function loadDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.log('Could not load database file, starting fresh');
    }
    return {
        users: {},
        subscriptions: {},
        transactions: {},
        usageLogs: {},
        vpnSessions: {}
    };
}

function saveDatabase(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error saving database:', e.message);
    }
}

// Initialize database with persistence
const db = loadDatabase();

// Database collections
const users = new Map(Object.entries(db.users));
const subscriptions = new Map(Object.entries(db.subscriptions));
const transactions = new Map(Object.entries(db.transactions));
const usageLogs = new Map(Object.entries(db.usageLogs));
const vpnSessions = new Map(Object.entries(db.vpnSessions));

// Default subscription plans
const defaultPlans = [
    {
        id: 'free',
        name: 'Free Trial',
        type: 'free',
        price: 0,
        interval: 'once',
        dataLimit: 100 * 1024 * 1024, // 100MB
        duration: 24 * 60 * 60 * 1000, // 24 hours in ms
        features: ['Basic VPN', '1 Device', 'Standard Speed']
    },
    {
        id: 'daily',
        name: 'Daily',
        type: 'standard',
        price: 0.99,
        interval: 'day',
        dataLimit: 500 * 1024 * 1024, // 500MB
        duration: 24 * 60 * 60 * 1000, // 24 hours
        features: ['Full VPN', '1 Device', 'High Speed', 'No Ads']
    },
    {
        id: 'weekly',
        name: 'Weekly',
        type: 'standard',
        price: 4.99,
        interval: 'week',
        dataLimit: 2 * 1024 * 1024 * 1024, // 2GB
        duration: 7 * 24 * 60 * 60 * 1000, // 7 days
        features: ['Full VPN', '3 Devices', 'High Speed', 'No Ads', 'Priority Support']
    },
    {
        id: 'monthly',
        name: 'Monthly',
        type: 'premium',
        price: 14.99,
        interval: 'month',
        dataLimit: 50 * 1024 * 1024 * 1024, // 50GB
        duration: 30 * 24 * 60 * 60 * 1000, // 30 days
        features: ['Full VPN', '5 Devices', 'Ultra Speed', 'No Ads', 'Priority Support', 'Tunneling']
    },
    {
        id: 'yearly',
        name: 'Yearly',
        type: 'premium',
        price: 99.99,
        interval: 'year',
        dataLimit: 500 * 1024 * 1024 * 1024, // 500GB
        duration: 365 * 24 * 60 * 60 * 1000, // 365 days
        features: ['Full VPN', 'Unlimited Devices', 'Ultra Speed', 'No Ads', '24/7 Support', 'Tunneling', 'Static IP']
    }
];

// VPN Server configurations (simulated)
const vpnServers = [
    { id: 'us-east-1', name: 'US East', host: 'us-east.vpn.netra.io', port: 51820, country: 'US', load: 45 },
    { id: 'us-west-1', name: 'US West', host: 'us-west.vpn.netra.io', port: 51820, country: 'US', load: 32 },
    { id: 'eu-west-1', name: 'EU West', host: 'eu-west.vpn.netra.io', port: 51820, country: 'DE', load: 28 },
    { id: 'asia-east-1', name: 'Asia East', host: 'asia-east.vpn.netra.io', port: 51820, country: 'SG', load: 61 },
    { id: 'africa-east-1', name: 'Africa East', host: 'africa-east.vpn.netra.io', port: 51820, country: 'KE', load: 15 }
];

// Initialize default data
function initializeDatabase() {
    // Create default plans
    defaultPlans.forEach(plan => {
        subscriptions.set(plan.id, plan);
    });
    
    // Create demo user
    const demoUser = {
        id: 'demo-user-1',
        email: 'demo@netra.io',
        password: '$2a$10$rQEY9zXKqWQvNJX5YxYxYO5YxYxYxYxYxYxYxYxYxYxYxYxYxYx', // demo123
        name: 'Demo User',
        createdAt: new Date().toISOString()
    };
    users.set(demoUser.id, demoUser);
    users.set(demoUser.email, demoUser);
    
    console.log('Database initialized with default data');
}

initializeDatabase();

// User Model
const User = {
    findById: (id) => users.get(id),
    findByEmail: (email) => users.get(email),
    
    create: (userData) => {
        const user = {
            id: uuidv4(),
            email: userData.email,
            password: userData.password,
            name: userData.name,
            createdAt: new Date().toISOString()
        };
        users.set(user.id, user);
        users.set(user.email, user);
        saveDatabase({ users: Object.fromEntries(users), subscriptions: Object.fromEntries(subscriptions), transactions: Object.fromEntries(transactions), usageLogs: Object.fromEntries(usageLogs), vpnSessions: Object.fromEntries(vpnSessions) });
        return user;
    },
    
    update: (id, data) => {
        const user = users.get(id);
        if (!user) return null;
        const updated = { ...user, ...data };
        users.set(id, updated);
        users.set(updated.email, updated);
        saveDatabase({ users: Object.fromEntries(users), subscriptions: Object.fromEntries(subscriptions), transactions: Object.fromEntries(transactions), usageLogs: Object.fromEntries(usageLogs), vpnSessions: Object.fromEntries(vpnSessions) });
        return updated;
    },
    
    delete: (id) => {
        const user = users.get(id);
        if (user) {
            users.delete(id);
            users.delete(user.email);
            saveDatabase({ users: Object.fromEntries(users), subscriptions: Object.fromEntries(subscriptions), transactions: Object.fromEntries(transactions), usageLogs: Object.fromEntries(usageLogs), vpnSessions: Object.fromEntries(vpnSessions) });
        }
        return user;
    },
    
    all: () => Array.from(users.values()).filter(u => u.id !== 'demo-user-1')
};

// Subscription Plan Model
const SubscriptionPlan = {
    findById: (id) => subscriptions.get(id),
    findAll: () => Array.from(subscriptions.values()),
    
    create: (planData) => {
        const plan = { id: uuidv4(), ...planData };
        subscriptions.set(plan.id, plan);
        return plan;
    }
};

// User Subscription Model
const UserSubscription = {
    // In-memory store for user subscriptions
    _userSubs: new Map(),
    
    findByUserId: (userId) => {
        const sub = UserSubscription._userSubs.get(userId);
        if (!sub) {
            // Try loading from persisted store
            const persisted = subscriptions.get(userId);
            if (persisted) {
                UserSubscription._userSubs.set(userId, persisted);
                return persisted;
            }
            return null;
        }
        
        // Check if expired
        if (sub.expiresAt && new Date(sub.expiresAt) < new Date()) {
            sub.active = false;
            sub.status = 'expired';
        }
        
        return sub;
    },
    
    create: (userId, planId, paymentId = null) => {
        const plan = SubscriptionPlan.findById(planId);
        if (!plan) return null;
        
        const now = new Date();
        const expiresAt = new Date(now.getTime() + plan.duration);
        
        const subscription = {
            id: uuidv4(),
            userId,
            planId,
            plan,
            status: 'active',
            active: true,
            startsAt: now.toISOString(),
            expiresAt: expiresAt.toISOString(),
            paymentId,
            createdAt: now.toISOString()
        };
        
        UserSubscription._userSubs.set(userId, subscription);
        subscriptions.set(userId, subscription);
        saveDatabase({ users: Object.fromEntries(users), subscriptions: Object.fromEntries(subscriptions), transactions: Object.fromEntries(transactions), usageLogs: Object.fromEntries(usageLogs), vpnSessions: Object.fromEntries(vpnSessions) });
        return subscription;
    },
    
    update: (userId, data) => {
        let sub = UserSubscription._userSubs.get(userId);
        if (!sub) {
            sub = subscriptions.get(userId);
        }
        if (!sub) return null;
        
        const updated = { ...sub, ...data };
        UserSubscription._userSubs.set(userId, updated);
        subscriptions.set(userId, updated);
        saveDatabase({ users: Object.fromEntries(users), subscriptions: Object.fromEntries(subscriptions), transactions: Object.fromEntries(transactions), usageLogs: Object.fromEntries(usageLogs), vpnSessions: Object.fromEntries(vpnSessions) });
        return updated;
    },
    
    cancel: (userId) => {
        return UserSubscription.update(userId, { status: 'cancelled', active: false });
    },
    
    renew: (userId, planId) => {
        const plan = SubscriptionPlan.findById(planId);
        if (!plan) return null;
        
        const now = new Date();
        const expiresAt = new Date(now.getTime() + plan.duration);
        
        return UserSubscription.update(userId, {
            planId,
            plan,
            status: 'active',
            active: true,
            startsAt: now.toISOString(),
            expiresAt: expiresAt.toISOString()
        });
    }
};

// Transaction Model
const Transaction = {
    findById: (id) => transactions.get(id),
    
    create: (data) => {
        const transaction = {
            id: uuidv4(),
            ...data,
            status: 'pending',
            createdAt: new Date().toISOString()
        };
        transactions.set(transaction.id, transaction);
        saveDatabase({ users: Object.fromEntries(users), subscriptions: Object.fromEntries(subscriptions), transactions: Object.fromEntries(transactions), usageLogs: Object.fromEntries(usageLogs), vpnSessions: Object.fromEntries(vpnSessions) });
        return transaction;
    },
    
    update: (id, data) => {
        const transaction = transactions.get(id);
        if (!transaction) return null;
        
        const updated = { ...transaction, ...data };
        transactions.set(id, updated);
        saveDatabase({ users: Object.fromEntries(users), subscriptions: Object.fromEntries(subscriptions), transactions: Object.fromEntries(transactions), usageLogs: Object.fromEntries(usageLogs), vpnSessions: Object.fromEntries(vpnSessions) });
        return updated;
    },
    
    findByUserId: (userId) => {
        return Array.from(transactions.values()).filter(t => t.userId === userId);
    }
};

// Usage Log Model
const UsageLog = {
    create: (data) => {
        const log = {
            id: uuidv4(),
            ...data,
            timestamp: new Date().toISOString()
        };
        const key = `${data.userId}-${Date.now()}`;
        usageLogs.set(key, log);
        saveDatabase({ users: Object.fromEntries(users), subscriptions: Object.fromEntries(subscriptions), transactions: Object.fromEntries(transactions), usageLogs: Object.fromEntries(usageLogs), vpnSessions: Object.fromEntries(vpnSessions) });
        return log;
    },
    
    findByUserId: (userId, limit = 100) => {
        return Array.from(usageLogs.values())
            .filter(l => l.userId === userId)
            .slice(-limit);
    },
    
    getTotalUsage: (userId) => {
        const logs = UsageLog.findByUserId(userId);
        return logs.reduce((total, log) => total + (log.bytesUsed || 0), 0);
    }
};

// VPN Session Model
const VPNSession = {
    findByUserId: (userId) => {
        return Array.from(vpnSessions.values()).find(s => s.userId === userId && s.active);
    },
    
    create: (userId, serverId) => {
        const server = vpnServers.find(s => s.id === serverId);
        if (!server) return null;
        
        // End any existing session
        const existing = VPNSession.findByUserId(userId);
        if (existing) {
            VPNSession.end(userId);
        }
        
        const session = {
            id: uuidv4(),
            userId,
            serverId,
            server,
            active: true,
            connectedAt: new Date().toISOString(),
            disconnectedAt: null,
            bytesUsed: 0
        };
        
        vpnSessions.set(session.id, session);
        return session;
    },
    
    update: (userId, data) => {
        const session = VPNSession.findByUserId(userId);
        if (!session) return null;
        
        const updated = { ...session, ...data };
        vpnSessions.set(session.id, updated);
        return updated;
    },
    
    end: (userId) => {
        const session = VPNSession.findByUserId(userId);
        if (!session) return null;
        
        session.active = false;
        session.disconnectedAt = new Date().toISOString();
        vpnSessions.set(session.id, session);
        return session;
    },
    
    getServers: () => vpnServers
};

module.exports = {
    users,
    User,
    SubscriptionPlan,
    UserSubscription,
    Transaction,
    UsageLog,
    VPNSession,
    vpnServers
};
