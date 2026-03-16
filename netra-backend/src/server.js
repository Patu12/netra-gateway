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
const { startProxyServer, getProxyStatus } = require('./services/proxy');

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
app.get('/api/public/plans', async (req, res) => {
    try {
        const { SubscriptionPlan } = require('./database/models');
        const plans = await SubscriptionPlan.findAll();
        res.json({ success: true, data: plans });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching plans' });
    }
});

// Public VPN routes (no auth required for status check)
const { getTailscaleIP, checkTailscaleStatus, enableSubnetRouter, checkGatewayStatus } = require('./services/wireguard');

app.get('/api/public/tailscale-status', async (req, res) => {
    try {
        const status = await checkTailscaleStatus();
        const ip = await getTailscaleIP();
        
        res.json({
            success: true,
            data: {
                running: status.running,
                ip: ip || status.ip,
                subnetRoutes: status.subnetRoutes,
                isExitNode: status.isExitNode,
                canShareInternet: status.running && (status.subnetRoutes || status.isExitNode)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error checking Tailscale status' });
    }
});

app.post('/api/public/enable-subnet', async (req, res) => {
    try {
        const success = await enableSubnetRouter();
        res.json({ success, message: success ? 'Subnet router enabled' : 'Failed to enable subnet router' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error enabling subnet router' });
    }
});

// Gateway status endpoint - checks if the gateway device is online
app.get('/api/status/gateway', async (req, res) => {
    try {
        const gatewayStatus = await checkGatewayStatus();
        res.json(gatewayStatus);
    } catch (error) {
        res.status(500).json({ 
            status: 'error', 
            message: 'Error checking gateway status: ' + error.message 
        });
    }
});

// Get direct connection info (for built-in VPN)
app.get('/api/public/proxy-info', async (req, res) => {
    try {
        const { PROXY_PORT } = require('./services/proxy');
        const { getTailscaleIP } = require('./services/wireguard');
        const { exec } = require('child_process');
        
        // Get local IP address - try multiple patterns
        const localIP = await new Promise((resolve) => {
            exec('ipconfig', (err, stdout) => {
                // Try 192.168.x.x first
                let match = stdout.match(/IPv4.*?192\.168\.(\d+)\.(\d+)/);
                if (match) {
                    resolve(`192.168.${match[1]}.${match[2]}`);
                    return;
                }
                // Try 10.x.x.x
                match = stdout.match(/IPv4.*?10\.(\d+)\.(\d+)\.(\d+)/);
                if (match) {
                    resolve(`10.${match[1]}.${match[2]}.${match[3]}`);
                    return;
                }
                // Default
                resolve('192.168.1.100');
            });
        });
        
        // Get Tailscale IP for remote access
        let tailscaleIP = null;
        try {
            tailscaleIP = await getTailscaleIP();
        } catch (e) {
            // Tailscale not available
        }
        
        res.json({
            success: true,
            data: {
                type: 'http',
                localHost: localIP,
                remoteHost: tailscaleIP,
                port: PROXY_PORT,
                username: '',
                password: '',
                instructions: 'Configure HTTP proxy on your device. For local: ' + localIP + '. For remote: ' + (tailscaleIP || 'Tailscale IP') + '. Port: ' + PROXY_PORT
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error getting proxy info: ' + error.message });
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
        
        // Start proxy server for direct VPN connections
        startProxyServer();
        console.log('Proxy server started - users can connect directly!');
        
        // Start Express server
        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`Netra Gateway API running on port ${PORT}`);
            console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`Server ready! Access at http://localhost:${PORT}`);
        });
        
        server.on('error', (err) => {
            console.error('Server error:', err);
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

module.exports = app;
