// PostgreSQL database connection
const { Pool } = require('pg');

// Get database URL from environment or use default
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://netra:8z19dpR4XCPHSIikqSEDxWPGEP0irA9M@dpg-d6jk5kjh46gs73bfjq00-a.oregon-postgres.render.com/netra_peqm';

// Create connection pool
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Test connection
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('PostgreSQL error:', err);
});

// Initialize tables
async function initializeDatabase() {
  const client = await pool.connect();
  try {
    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create subscription plans table
    await client.query(`
      CREATE TABLE IF NOT EXISTS subscription_plans (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        type VARCHAR(50) NOT NULL,
        price DECIMAL(10, 2) NOT NULL,
        interval VARCHAR(20) NOT NULL,
        data_limit BIGINT NOT NULL,
        duration BIGINT NOT NULL,
        features TEXT[]
      )
    `);

    // Create user subscriptions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id),
        plan_id VARCHAR(50) NOT NULL,
        status VARCHAR(20) DEFAULT 'active',
        active BOOLEAN DEFAULT true,
        starts_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        payment_id VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create transactions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        plan_id VARCHAR(50) NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'USD',
        type VARCHAR(20) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        payment_id VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create usage logs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS usage_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        bytes_used BIGINT DEFAULT 0,
        session_count INTEGER DEFAULT 0,
        last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create VPN sessions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS vpn_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        public_key VARCHAR(255),
        ip_address VARCHAR(50),
        connected BOOLEAN DEFAULT false,
        connected_at TIMESTAMP,
        disconnected_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default plans
    const plans = [
      { id: 'free', name: 'Free Trial', type: 'free', price: 0, interval: 'once', data_limit: 104857600, duration: 86400000, features: ['Basic VPN', '1 Device', 'Standard Speed'] },
      { id: 'daily', name: 'Daily', type: 'standard', price: 0.99, interval: 'day', data_limit: 524288000, duration: 86400000, features: ['Full VPN', '1 Device', 'High Speed', 'No Ads'] },
      { id: 'weekly', name: 'Weekly', type: 'standard', price: 4.99, interval: 'week', data_limit: 2147483648, duration: 604800000, features: ['Full VPN', '3 Devices', 'High Speed', 'No Ads', 'Priority Support'] },
      { id: 'monthly', name: 'Monthly', type: 'premium', price: 14.99, interval: 'month', data_limit: 53687091200, duration: 2592000000, features: ['Full VPN', '5 Devices', 'Ultra Speed', 'No Ads', 'Priority Support', 'Tunneling'] },
      { id: 'yearly', name: 'Yearly', type: 'premium', price: 99.99, interval: 'year', data_limit: 536870912000, duration: 31536000000, features: ['Full VPN', 'Unlimited Devices', 'Ultra Speed', 'No Ads', '24/7 Support', 'Tunneling', 'Static IP'] }
    ];

    for (const plan of plans) {
      await client.query(
        `INSERT INTO subscription_plans (id, name, type, price, interval, data_limit, duration, features) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING`,
        [plan.id, plan.name, plan.type, plan.price, plan.interval, plan.data_limit, plan.duration, plan.features]
      );
    }

    // Create admin user if not exists
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await client.query(
      `INSERT INTO users (id, email, password, name) 
       VALUES ('00000000-0000-0000-0000-000000000001', 'admin@netra.io', $1, 'Admin')
       ON CONFLICT (email) DO NOTHING`,
      [hashedPassword]
    );

    // Create admin subscription
    await client.query(
      `INSERT INTO user_subscriptions (id, user_id, plan_id, status, active, expires_at)
       VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'yearly', 'active', true, NULL)
       ON CONFLICT (id) DO NOTHING`
    );

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
  } finally {
    client.release();
  }
}

// User operations
const User = {
  findByEmail(email) {
    return pool.query('SELECT * FROM users WHERE email = $1', [email])
      .then(result => result.rows[0]);
  },

  findById(id) {
    return pool.query('SELECT * FROM users WHERE id = $1', [id])
      .then(result => result.rows[0]);
  },

  create(email, password, name) {
    const bcrypt = require('bcryptjs');
    return bcrypt.hash(password, 10)
      .then(hashedPassword => {
        return pool.query(
          'INSERT INTO users (email, password, name) VALUES ($1, $2, $3) RETURNING *',
          [email, hashedPassword, name]
        );
      })
      .then(result => result.rows[0]);
  }
};

// Subscription plan operations
const SubscriptionPlan = {
  findAll() {
    return pool.query('SELECT * FROM subscription_plans ORDER BY price')
      .then(result => result.rows);
  },

  findById(id) {
    return pool.query('SELECT * FROM subscription_plans WHERE id = $1', [id])
      .then(result => result.rows[0]);
  }
};

// User subscription operations
const UserSubscription = {
  findByUserId(userId) {
    return pool.query(
      `SELECT us.*, sp.name as plan_name, sp.type, sp.price as plan_price, sp.interval, sp.data_limit, sp.duration, sp.features 
       FROM user_subscriptions us 
       JOIN subscription_plans sp ON us.plan_id = sp.id 
       WHERE us.user_id = $1 AND us.active = true AND (us.expires_at IS NULL OR us.expires_at > NOW())`,
      [userId]
    ).then(result => result.rows[0]);
  },

  create(userId, planId, paymentId = 'free') {
    return SubscriptionPlan.findById(planId)
      .then(plan => {
        const expiresAt = plan.duration ? new Date(Date.now() + plan.duration) : null;
        return pool.query(
          'INSERT INTO user_subscriptions (user_id, plan_id, status, active, payment_id, expires_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
          [userId, planId, 'active', true, paymentId, expiresAt]
        );
      })
      .then(result => result.rows[0]);
  },

  update(userId, data) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (data.active !== undefined) {
      fields.push(`active = $${paramCount++}`);
      values.push(data.active);
    }
    if (data.status) {
      fields.push(`status = $${paramCount++}`);
      values.push(data.status);
    }
    if (data.expires_at) {
      fields.push(`expires_at = $${paramCount++}`);
      values.push(data.expires_at);
    }

    if (fields.length === 0) return Promise.resolve(null);

    values.push(userId);
    return pool.query(
      `UPDATE user_subscriptions SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE user_id = $${paramCount} RETURNING *`,
      values
    ).then(result => result.rows[0]);
  }
};

// Transaction operations
const Transaction = {
  create(data) {
    return pool.query(
      'INSERT INTO transactions (user_id, plan_id, amount, currency, type, status, payment_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [data.userId, data.planId, data.amount, data.currency, data.type, data.status || 'pending', data.paymentId || null]
    ).then(result => result.rows[0]);
  },
  
  update(id, data) {
    const fields = [];
    const values = [];
    let paramCount = 1;
    
    if (data.status) {
      fields.push(`status = ${paramCount++}`);
      values.push(data.status);
    }
    if (data.paymentId) {
      fields.push(`payment_id = ${paramCount++}`);
      values.push(data.paymentId);
    }
    
    if (fields.length === 0) return Promise.resolve(null);
    
    values.push(id);
    return pool.query(
      `UPDATE transactions SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ${paramCount} RETURNING *`,
      values
    ).then(result => result.rows[0]);
  }
};

// Usage log operations
const UsageLog = {
  findByUserId(userId, limit = 10) {
    return pool.query('SELECT * FROM usage_logs WHERE user_id = $1 ORDER BY last_activity DESC LIMIT $2', [userId, limit])
      .then(result => result.rows);
  },

  getTotalUsage(userId) {
    return pool.query('SELECT COALESCE(SUM(bytes_used), 0) as total FROM usage_logs WHERE user_id = $1', [userId])
      .then(result => parseInt(result.rows[0]?.total || 0));
  },

  upsert(userId, bytesUsed) {
    return pool.query(
      `INSERT INTO usage_logs (user_id, bytes_used, session_count, last_activity) 
       VALUES ($1, $2, 1, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO UPDATE SET 
         bytes_used = usage_logs.bytes_used + $2,
         session_count = usage_logs.session_count + 1,
         last_activity = CURRENT_TIMESTAMP
       RETURNING *`,
      [userId, bytesUsed]
    ).then(result => result.rows[0]);
  }
};

// VPN session operations
const VpnSession = {
  findByUserId(userId) {
    return pool.query('SELECT * FROM vpn_sessions WHERE user_id = $1', [userId])
      .then(result => result.rows[0]);
  },

  findByPublicKey(publicKey) {
    return pool.query('SELECT * FROM vpn_sessions WHERE public_key = $1', [publicKey])
      .then(result => result.rows[0]);
  },

  create(userId, publicKey) {
    return pool.query(
      'INSERT INTO vpn_sessions (user_id, public_key) VALUES ($1, $2) RETURNING *',
      [userId, publicKey]
    ).then(result => result.rows[0]);
  },

  update(userId, data) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (data.connected !== undefined) {
      fields.push(`connected = $${paramCount++}`);
      values.push(data.connected);
    }
    if (data.connected_at) {
      fields.push(`connected_at = $${paramCount++}`);
      values.push(data.connected_at);
    }
    if (data.disconnected_at) {
      fields.push(`disconnected_at = $${paramCount++}`);
      values.push(data.disconnected_at);
    }
    if (data.ip_address) {
      fields.push(`ip_address = $${paramCount++}`);
      values.push(data.ip_address);
    }

    if (fields.length === 0) return Promise.resolve(null);

    values.push(userId);
    return pool.query(
      `UPDATE vpn_sessions SET ${fields.join(', ')} WHERE user_id = $${paramCount} RETURNING *`,
      values
    ).then(result => result.rows[0]);
  }
};

module.exports = {
  pool,
  initializeDatabase,
  User,
  SubscriptionPlan,
  UserSubscription,
  Transaction,
  UsageLog,
  VpnSession,
  VPNSession: VpnSession  // Alias for backwards compatibility
};
