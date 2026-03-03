const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const winston = require('winston');
const cron = require('node-cron');

// Import database
const { initializeDatabase } = require('./database/models');

// Import routes
const authRoutes = require('./routes/auth');
const subscriptionRoutes = require('./routes/subscription');
const vpnRoutes = require('./routes/vpn');
const usageRoutes = require('./routes/usage');
const webhookRoutes = require('./routes/webhooks');

// Import middleware
const { authMiddleware } = require('./middleware/auth');
const { subscriptionMiddleware } = require('./middleware/subscription');

// Import services
const { cleanupExpiredSubscriptions } = require('./services/subscription');
const { logUsageStats } = require('./services/usage');

// Configure logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/netra.log' })
    ]
});

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('user-agent')
    });
    next();
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Public routes - no authentication required
app.get('/api/public/plans', (req, res) => {
    try {
        const { SubscriptionPlan } = require('./database/models');
        const plans = SubscriptionPlan.findAll();
        res.json({ success: true, data: plans });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching plans' });
    }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/subscription', authMiddleware, subscriptionRoutes);
app.use('/api/vpn', authMiddleware, subscriptionMiddleware, vpnRoutes);
app.use('/api/usage', authMiddleware, usageRoutes);
app.use('/api/webhooks', webhookRoutes);

// Error handling
app.use((err, req, res, next) => {
    logger.error('Error:', err);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found'
    });
});

// Scheduled tasks
// Clean up expired subscriptions every minute
cron.schedule('* * * * *', async () => {
    try {
        await cleanupExpiredSubscriptions();
    } catch (error) {
        logger.error('Cleanup error:', error);
    }
});

// Log usage stats every 5 minutes
cron.schedule('*/5 * * * *', async () => {
    try {
        await logUsageStats();
    } catch (error) {
        logger.error('Usage logging error:', error);
    }
});

// Start server
async function startServer() {
    try {
        // Initialize database
        await initializeDatabase();
        console.log('Database initialized');
        
        app.listen(PORT, () => {
            logger.info(`Netra Gateway API running on port ${PORT}`);
            logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

module.exports = app;
