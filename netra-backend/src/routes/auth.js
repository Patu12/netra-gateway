const express = require('express');
const bcrypt = require('bcryptjs');
const { User, UserSubscription } = require('../database/models');
const { generateToken } = require('../middleware/auth');

const router = express.Router();

// Admin credentials (hardcoded for demo - use env vars in production)
const ADMIN_EMAIL = 'admin@netra.io';
const ADMIN_PASSWORD = 'admin123';

// POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        // Validate input
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Name, email, and password are required'
            });
        }
        
        // Check if email already exists
        const existingUser = User.findByEmail(email);
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Email already registered'
            });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create user
        const user = User.create({
            name,
            email,
            password: hashedPassword
        });
        
        // Create free trial subscription
        const subscription = UserSubscription.create(user.id, 'free', 'free-trial');
        
        // Generate token
        const token = generateToken(user);
        
        res.status(201).json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email
                },
                token,
                subscription
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating account'
        });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Validate input
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }
        
        // Find user
        const user = User.findByEmail(email);
        
        // Check if admin login
        if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
            // Create or get admin user
            let adminUser = user;
            
            if (!adminUser) {
                const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
                adminUser = User.create({
                    name: 'Admin',
                    email: ADMIN_EMAIL,
                    password: hashedPassword
                });
            }
            
            // Create unlimited premium subscription
            const subscription = UserSubscription.create(adminUser.id, 'yearly', 'admin-free');
            
            // Extend to unlimited (never expires)
            UserSubscription.update(adminUser.id, {
                active: true,
                status: 'active',
                planId: 'yearly',
                expiresAt: null
            });
            
            const token = generateToken(adminUser);
            
            return res.json({
                success: true,
                data: {
                    user: {
                        id: adminUser.id,
                        name: adminUser.name,
                        email: adminUser.email
                    },
                    token,
                    subscription: {
                        active: true,
                        expiresAt: null,
                        plan: { name: 'VIP Unlimited', type: 'premium', dataLimit: 999999999999999 }
                    },
                    isAdmin: true
                }
            });
        }
        
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }
        
        // Check password
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }
        
        // Get subscription
        let subscription = UserSubscription.findByUserId(user.id);
        
        // Auto-provision free trial if none exists
        if (!subscription) {
            subscription = UserSubscription.create(user.id, 'free', 'free-trial');
        }
        
        // Generate token
        const token = generateToken(user);
        
        res.json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email
                },
                token,
                subscription
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Error signing in'
        });
    }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
    // In a JWT-based system, logout is handled client-side
    // We could implement a token blacklist if needed
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

// GET /api/auth/me
router.get('/me', require('../middleware/auth').authMiddleware, (req, res) => {
    const subscription = UserSubscription.findByUserId(req.userId);
    
    res.json({
        success: true,
        data: {
            user: {
                id: req.user.id,
                name: req.user.name,
                email: req.user.email,
                createdAt: req.user.createdAt
            },
            subscription
        }
    });
});

module.exports = router;
