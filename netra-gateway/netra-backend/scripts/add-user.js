const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Get database URL from environment or use default
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://netra:8z19dpR4XCPHSIikqSEDxWPGEP0irA9M@dpg-d6jk5kjh46gs73bfjq00-a.oregon-postgres.render.com/netra_peqm';

// Create connection pool
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function addPaidUser() {
  const client = await pool.connect();
  
  try {
    // User details
    const email = 'testuser@example.com';
    const password = 'password123';
    const name = 'Test User';
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Insert user
    const userResult = await client.query(
      'INSERT INTO users (email, password, name) VALUES ($1, $2, $3) RETURNING id',
      [email, hashedPassword, name]
    );
    
    const userId = userResult.rows[0].id;
    console.log('User created with ID:', userId);
    
    // Calculate expiry date (7 days from now for weekly plan)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    
    // Insert weekly subscription
    await client.query(
      `INSERT INTO user_subscriptions (user_id, plan_id, status, active, payment_id, expires_at) 
       VALUES ($1, 'weekly', 'active', true, 'paid_weekly_001', $2)`,
      [userId, expiresAt]
    );
    
    console.log('Weekly subscription created for user');
    console.log('Expires at:', expiresAt.toISOString());
    
    // Also create a transaction record
    await client.query(
      `INSERT INTO transactions (user_id, plan_id, amount, currency, type, status, payment_id)
       VALUES ($1, 'weekly', 4.99, 'USD', 'subscription', 'completed', 'paid_weekly_001')`,
      [userId]
    );
    
    console.log('Transaction recorded');
    console.log('\n=== New User Details ===');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('Plan: Weekly ($4.99)');
    console.log('Expires:', expiresAt.toDateString());
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

addPaidUser();
