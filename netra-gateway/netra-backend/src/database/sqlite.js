// SQLite database for local storage
const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, '../../data/netra.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS subscription_plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    price REAL NOT NULL,
    interval TEXT NOT NULL,
    data_limit INTEGER NOT NULL,
    duration INTEGER NOT NULL,
    features TEXT
  );

  CREATE TABLE IF NOT EXISTS user_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    plan_id TEXT NOT NULL REFERENCES subscription_plans(id),
    status TEXT DEFAULT 'active',
    active INTEGER DEFAULT 1,
    starts_at TEXT DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT,
    payment_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    plan_id TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    type TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    payment_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS usage_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    bytes_used INTEGER DEFAULT 0,
    session_count INTEGER DEFAULT 0,
    last_activity TEXT DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS vpn_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    public_key TEXT,
    ip_address TEXT,
    connected INTEGER DEFAULT 0,
    connected_at TEXT,
    disconnected_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// Generate UUID
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Initialize default data
function initializeData() {
  // Check if plans exist
  const plans = db.prepare('SELECT COUNT(*) as count FROM subscription_plans').get();
  
  if (plans.count === 0) {
    // Insert default plans
    const insertPlan = db.prepare(`
      INSERT INTO subscription_plans (id, name, type, price, interval, data_limit, duration, features)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const defaultPlans = [
      { id: 'free', name: 'Free Trial', type: 'free', price: 0, interval: 'once', data_limit: 104857600, duration: 86400000, features: JSON.stringify(['Basic VPN', '1 Device', 'Standard Speed']) },
      { id: 'daily', name: 'Daily', type: 'standard', price: 0.99, interval: 'day', data_limit: 524288000, duration: 86400000, features: JSON.stringify(['Full VPN', '1 Device', 'High Speed', 'No Ads']) },
      { id: 'weekly', name: 'Weekly', type: 'standard', price: 4.99, interval: 'week', data_limit: 2147483648, duration: 604800000, features: JSON.stringify(['Full VPN', '3 Devices', 'High Speed', 'No Ads', 'Priority Support']) },
      { id: 'monthly', name: 'Monthly', type: 'premium', price: 14.99, interval: 'month', data_limit: 53687091200, duration: 2592000000, features: JSON.stringify(['Full VPN', '5 Devices', 'Ultra Speed', 'No Ads', 'Priority Support', 'Tunneling']) },
      { id: 'yearly', name: 'Yearly', type: 'premium', price: 99.99, interval: 'year', data_limit: 536870912000, duration: 31536000000, features: JSON.stringify(['Full VPN', 'Unlimited Devices', 'Ultra Speed', 'No Ads', '24/7 Support', 'Tunneling', 'Static IP']) }
    ];

    for (const plan of defaultPlans) {
      insertPlan.run(plan.id, plan.name, plan.type, plan.price, plan.interval, plan.data_limit, plan.duration, plan.features);
    }
  }

  // Create admin user if not exists
  const admin = db.prepare('SELECT * FROM users WHERE email = ?').get('admin@netra.io');
  if (!admin) {
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.prepare(`INSERT INTO users (id, email, password, name) VALUES (?, ?, ?, ?)`)
      .run('00000000-0000-0000-0000-000000000001', 'admin@netra.io', hashedPassword, 'Admin');
    
    // Create admin subscription (never expires)
    db.prepare(`INSERT INTO user_subscriptions (id, user_id, plan_id, status, active, expires_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'yearly', 'active', 1, null);
  }
}

// Initialize data on module load
initializeData();

// VPN servers list
const vpnServers = [
  { id: 'us-east', name: 'US East', country: 'US', load: 45, region: 'americas', host: 'us-east.netra.io', port: 51820 },
  { id: 'us-west', name: 'US West', country: 'US', load: 30, region: 'americas', host: 'us-west.netra.io', port: 51820 },
  { id: 'eu-west', name: 'Europe West', country: 'DE', load: 25, region: 'europe', host: 'eu-west.netra.io', port: 51820 },
  { id: 'asia-east', name: 'Asia East', country: 'JP', load: 60, region: 'asia', host: 'asia-east.netra.io', port: 51820 },
  { id: 'uk-london', name: 'UK London', country: 'GB', load: 40, region: 'europe', host: 'uk-london.netra.io', port: 51820 }
];

// User operations
const User = {
  findByEmail(email) {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  },

  findById(id) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  },

  create(email, password, name) {
    const hashedPassword = bcrypt.hashSync(password, 10);
    const id = generateUUID();
    db.prepare('INSERT INTO users (id, email, password, name) VALUES (?, ?, ?, ?)')
      .run(id, email, hashedPassword, name);
    return this.findById(id);
  }
};

// Subscription plan operations
const SubscriptionPlan = {
  findAll() {
    return db.prepare('SELECT * FROM subscription_plans ORDER BY price').all();
  },

  findById(id) {
    return db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(id);
  }
};

// User subscription operations
const UserSubscription = {
  findByUserId(userId) {
    return db.prepare(`
      SELECT us.*, sp.name as plan_name, sp.type, sp.price as plan_price, sp.interval, sp.data_limit, sp.duration, sp.features 
      FROM user_subscriptions us 
      JOIN subscription_plans sp ON us.plan_id = sp.id 
      WHERE us.user_id = ? AND us.active = 1 AND (us.expires_at IS NULL OR us.expires_at > datetime('now'))
    `).get(userId);
  },

  create(userId, planId, paymentId = 'free') {
    const id = generateUUID();
    let expiresAt = null;
    
    // Free plans never expire
    if (planId && planId !== 'free') {
      const plan = SubscriptionPlan.findById(planId);
      if (plan && plan.duration) {
        expiresAt = new Date(Date.now() + plan.duration).toISOString();
      }
    }
    
    db.prepare(
      'INSERT INTO user_subscriptions (id, user_id, plan_id, status, active, payment_id, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, userId, planId, 'active', 1, paymentId, expiresAt);
    
    return { id, user_id: userId, plan_id: planId, status: 'active', active: 1, payment_id: paymentId, expires_at: expiresAt };
  },

  update(userId, data) {
    const updates = [];
    const values = [];

    if (data.active !== undefined) {
      updates.push('active = ?');
      values.push(data.active ? 1 : 0);
    }
    if (data.status) {
      updates.push('status = ?');
      values.push(data.status);
    }
    if (data.expires_at) {
      updates.push('expires_at = ?');
      values.push(data.expires_at);
    }

    if (updates.length === 0) return null;

    values.push(userId);
    return db.prepare(
      `UPDATE user_subscriptions SET ${updates.join(', ')} WHERE user_id = ?`
    ).run(...values);
  }
};

// Transaction operations
const Transaction = {
  create(data) {
    const id = generateUUID();
    db.prepare(
      'INSERT INTO transactions (id, user_id, plan_id, amount, currency, type, status, payment_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, data.userId, data.planId, data.amount, data.currency || 'USD', data.type, data.status || 'pending', data.paymentId || null);
    return { id, ...data };
  },
  
  update(id, data) {
    const updates = [];
    const values = [];
    
    if (data.status) {
      updates.push('status = ?');
      values.push(data.status);
    }
    if (data.paymentId) {
      updates.push('payment_id = ?');
      values.push(data.paymentId);
    }
    
    if (updates.length === 0) return null;
    
    values.push(id);
    return db.prepare(
      `UPDATE transactions SET ${updates.join(', ')} WHERE id = ?`
    ).run(...values);
  }
};

// Usage log operations
const UsageLog = {
  findByUserId(userId, limit = 10) {
    return db.prepare('SELECT * FROM usage_logs WHERE user_id = ? ORDER BY last_activity DESC LIMIT ?').all(userId, limit);
  },

  getTotalUsage(userId) {
    const result = db.prepare('SELECT COALESCE(SUM(bytes_used), 0) as total FROM usage_logs WHERE user_id = ?').get(userId);
    return result.total;
  },

  upsert(userId, bytesUsed) {
    const existing = db.prepare('SELECT * FROM usage_logs WHERE user_id = ?').get(userId);
    if (existing) {
      db.prepare(
        `UPDATE usage_logs SET bytes_used = bytes_used + ?, session_count = session_count + 1, last_activity = datetime('now') WHERE user_id = ?`
      ).run(bytesUsed, userId);
      return { ...existing, bytes_used: existing.bytes_used + bytesUsed };
    } else {
      const id = generateUUID();
      db.prepare(
        'INSERT INTO usage_logs (id, user_id, bytes_used, session_count, last_activity) VALUES (?, ?, ?, 1, datetime(\'now\'))'
      ).run(id, userId, bytesUsed);
      return { id, user_id: userId, bytes_used: bytesUsed, session_count: 1 };
    }
  }
};

// VPN session operations
const VpnSession = {
  findByUserId(userId) {
    return db.prepare('SELECT * FROM vpn_sessions WHERE user_id = ?').get(userId);
  },

  findByPublicKey(publicKey) {
    return db.prepare('SELECT * FROM vpn_sessions WHERE public_key = ?').get(publicKey);
  },

  create(userId, publicKey) {
    const id = generateUUID();
    db.prepare('INSERT INTO vpn_sessions (id, user_id, public_key, connected) VALUES (?, ?, ?, 1)')
      .run(id, userId, publicKey);
    return { id, user_id: userId, public_key: publicKey, connected: 1 };
  },

  end(userId) {
    const session = this.findByUserId(userId);
    if (session) {
      db.prepare(
        `UPDATE vpn_sessions SET connected = 0, disconnected_at = datetime('now') WHERE user_id = ?`
      ).run(userId);
    }
    return session;
  }
};

module.exports = {
  db,
  User,
  SubscriptionPlan,
  UserSubscription,
  Transaction,
  UsageLog,
  VpnSession,
  vpnServers
};
