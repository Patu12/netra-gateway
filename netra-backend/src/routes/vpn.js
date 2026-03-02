const express = require('express');
const { VPNSession, vpnServers } = require('../database/models');

const router = express.Router();

// POST /api/vpn/register-key
// Mobile app sends its public key so gateway is ready
router.post('/register-key', (req, res) => {
    try {
        const { publicKey } = req.body;
        
        if (!publicKey) {
            return res.status(400).json({
                success: false,
                message: 'Public key is required'
            });
        }
        
        // Store the public key for this user
        // In production, this would update the user's record
        console.log(`[VPN] Registered public key for user ${req.userId}: ${publicKey.substring(0, 10)}...`);
        
        res.json({
            success: true,
            message: 'Public key registered successfully'
        });
    } catch (error) {
        console.error('Register key error:', error);
        res.status(500).json({
            success: false,
            message: 'Error registering key'
        });
    }
});

// GET /api/vpn/config
// Get WireGuard config for native VPN mode
router.get('/config', (req, res) => {
    try {
        // Get user's subscription
        const { User, Subscription } = require('../database/models');
        const user = User.findById(req.userId);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        const subscription = Subscription.findByUserId(req.userId);
        const isActive = subscription && subscription.active && new Date(subscription.expiresAt) > new Date();
        
        // Check if user has access
        if (!isActive && !user.isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'No active subscription'
            });
        }
        
        // Generate WireGuard config
        const config = {
            type: 'wireguard',
            protocol: 'UDP',
            address: '10.0.0.2/32',
            dns: ['8.8.8.8', '1.1.1.1'], // DNS Black Hole prevention
            peer: {
                publicKey: 'NetraGatewayPublicKey1234567890abcDEF=',
                endpoint: '100.102.117.30:51820',
                allowedIPs: ['0.0.0.0/0', '::/0'],
                persistentKeepalive: 25
            }
        };
        
        res.json({
            success: true,
            config
        });
    } catch (error) {
        console.error('Get config error:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting VPN config'
        });
    }
});

// GET /api/vpn/status
router.get('/status', (req, res) => {
    try {
        const session = VPNSession.findByUserId(req.userId);
        
        if (!session) {
            return res.json({
                success: true,
                data: {
                    connected: false,
                    session: null,
                    servers: vpnServers.map(s => ({
                        id: s.id,
                        name: s.name,
                        country: s.country,
                        load: s.load
                    }))
                }
            });
        }
        
        res.json({
            success: true,
            data: {
                connected: true,
                session: {
                    id: session.id,
                    server: session.server,
                    connectedAt: session.connectedAt,
                    bytesUsed: session.bytesUsed
                },
                servers: vpnServers.map(s => ({
                    id: s.id,
                    name: s.name,
                    country: s.country,
                    load: s.load
                }))
            }
        });
    } catch (error) {
        console.error('Get VPN status error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching VPN status'
        });
    }
});

// GET /api/vpn/servers
router.get('/servers', (req, res) => {
    try {
        const servers = vpnServers.map(s => ({
            id: s.id,
            name: s.name,
            host: s.host,
            port: s.port,
            country: s.country,
            load: s.load
        }));
        
        res.json({
            success: true,
            data: servers
        });
    } catch (error) {
        console.error('Get servers error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching servers'
        });
    }
});

// POST /api/vpn/connect
router.post('/connect', async (req, res) => {
    try {
        // Check if already connected
        const existingSession = VPNSession.findByUserId(req.userId);
        
        if (existingSession && existingSession.active) {
            return res.json({
                success: true,
                data: {
                    connected: true,
                    message: 'Already connected',
                    config: generateVPNConfig(existingSession)
                }
            });
        }
        
        // Get available servers
        const availableServers = vpnServers.filter(s => s.load < 90);
        
        if (availableServers.length === 0) {
            return res.status(503).json({
                success: false,
                message: 'No servers available'
            });
        }
        
        // Select best server (lowest load)
        const server = availableServers.sort((a, b) => a.load - b.load)[0];
        
        // Create VPN session
        const session = VPNSession.create(req.userId, server.id);
        
        if (!session) {
            return res.status(500).json({
                success: false,
                message: 'Failed to create session'
            });
        }
        
        // Generate WireGuard/OpenVPN configuration
        const config = generateVPNConfig(session);
        
        res.json({
            success: true,
            data: {
                connected: true,
                session: {
                    id: session.id,
                    server: session.server,
                    connectedAt: session.connectedAt
                },
                config
            }
        });
    } catch (error) {
        console.error('VPN connect error:', error);
        res.status(500).json({
            success: false,
            message: 'Error connecting to VPN'
        });
    }
});

// POST /api/vpn/disconnect
router.post('/disconnect', async (req, res) => {
    try {
        const session = VPNSession.end(req.userId);
        
        if (!session) {
            return res.json({
                success: true,
                data: {
                    connected: false,
                    message: 'No active session'
                }
            });
        }
        
        res.json({
            success: true,
            data: {
                connected: false,
                session: {
                    connectedAt: session.connectedAt,
                    disconnectedAt: session.disconnectedAt,
                    duration: calculateDuration(session.connectedAt, session.disconnectedAt)
                },
                message: 'Disconnected successfully'
            }
        });
    } catch (error) {
        console.error('VPN disconnect error:', error);
        res.status(500).json({
            success: false,
            message: 'Error disconnecting from VPN'
        });
    }
});

// POST /api/vpn/heartbeat
router.post('/heartbeat', (req, res) => {
    try {
        const { bytesUsed, connected } = req.body;
        
        const session = VPNSession.findByUserId(req.userId);
        
        if (!session || !session.active) {
            return res.status(400).json({
                success: false,
                message: 'No active session'
            });
        }
        
        // Update session with latest usage
        if (typeof bytesUsed === 'number') {
            VPNSession.update(req.userId, { bytesUsed });
        }
        
        res.json({
            success: true,
            data: {
                connected: true,
                sessionId: session.id
            }
        });
    } catch (error) {
        console.error('Heartbeat error:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing heartbeat'
        });
    }
});

// Helper functions
function generateVPNConfig(session) {
    const server = session.server;
    
    // Generate WireGuard configuration
    // In production, these would be real WireGuard keys
    return {
        type: 'wireguard',
        protocol: 'UDP',
        server: {
            host: server.host,
            port: server.port,
            publicKey: generateMockKey(),
            allowedIPs: '0.0.0.0/0, ::/0'
        },
        client: {
            privateKey: generateMockKey(),
            address: '10.0.0.2/32',
            dns: ['1.1.1.1', '8.8.8.8']
        },
        // Keep-alive to prevent connection drops
        persistentKeepalive: 25
    };
}

function generateMockKey() {
    // Generate a mock WireGuard key for demo purposes
    // In production, use actual WireGuard key generation
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let key = '';
    for (let i = 0; i < 44; i++) {
        key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
}

function calculateDuration(start, end) {
    const startTime = new Date(start);
    const endTime = new Date(end);
    return Math.floor((endTime - startTime) / 1000); // seconds
}

module.exports = router;
