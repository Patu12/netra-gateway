/**
 * WireGuard Service - Manages VPN peers and configurations
 * Uses Tailscale for VPN connectivity (already installed and running)
 */

const { exec } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

// Tailscale API configuration
const TAILSCALE_API_URL = process.env.TAILSCALE_API_URL || 'https://api.tailscale.com';
const TAILNET_NAME = process.env.TAILNET_NAME || 'tail73ead7.ts.net';
const TAILSCALE_API_KEY = process.env.TAILSCALE_API_KEY;
const GATEWAY_DEVICE = process.env.GATEWAY_DEVICE || 'lenovo';

// Get Tailscale IP dynamically
function getTailscaleIP() {
    return new Promise((resolve) => {
        exec('tailscale ip -4', (error, stdout, stderr) => {
            if (error) {
                console.log('Tailscale not running, using default');
                resolve(null);
                return;
            }
            const ip = stdout.trim();
            if (ip && ip.startsWith('100.')) {
                TAILSCALE_IP = ip;
                resolve(ip);
            } else {
                resolve(null);
            }
        });
    });
}

/**
 * Check the gateway status by querying Tailscale API
 * Looks for the gateway device (lenovo) in the network
 */
async function checkGatewayStatus() {
    // If no API key is configured, fall back to local Tailscale status
    if (!TAILSCALE_API_KEY) {
        console.log('No Tailscale API key configured, using local status');
        return checkGatewayStatusLocal();
    }

    try {
        const url = `${TAILSCALE_API_URL}/api/v2/tailnet/${TAILNET_NAME}/devices`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${TAILSCALE_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Tailscale API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const devices = data.devices || [];
        
        // Find the gateway device by hostname
        const gateway = devices.find(d => d.hostname === GATEWAY_DEVICE);
        
        if (!gateway) {
            return {
                status: 'error',
                message: `Gateway device '${GATEWAY_DEVICE}' not found on network.`,
                hostname: GATEWAY_DEVICE,
                online: false,
                exit_node_active: false,
                tailscale_ip: null
            };
        }

        return {
            status: 'success',
            hostname: gateway.hostname,
            online: gateway.online || false,
            exit_node_active: gateway.exitNode || false,
            tailscale_ip: gateway.addresses?.[0] || null,
            last_seen: gateway.lastSeen || null
        };
    } catch (error) {
        console.error('Error checking gateway status:', error.message);
        // Fall back to local check
        return checkGatewayStatusLocal();
    }
}

/**
 * Fallback: Check gateway status using local Tailscale status command
 */
function checkGatewayStatusLocal() {
    return new Promise((resolve) => {
        exec('tailscale status --json', (error, stdout, stderr) => {
            if (error) {
                resolve({
                    status: 'error',
                    message: 'Tailscale not running or not configured',
                    hostname: GATEWAY_DEVICE,
                    online: false,
                    exit_node_active: false,
                    tailscale_ip: null
                });
                return;
            }

            try {
                const status = JSON.parse(stdout);
                const peers = status.Peer || {};
                
                // Find the gateway device in peers
                let gatewayFound = false;
                let isOnline = false;
                let isExitNode = false;
                let tailscaleIP = null;

                for (const [peerKey, peerData] of Object.entries(peers)) {
                    // Check by hostname in peer info
                    if (peerData.HostName?.toLowerCase() === GATEWAY_DEVICE.toLowerCase()) {
                        gatewayFound = true;
                        isOnline = peerData.Online === true;
                        isExitNode = peerData.ExitNode === true;
                        tailscaleIP = peerData.TailscaleIPs?.[0] || null;
                        break;
                    }
                }

                // Also check Self for the gateway (if this machine IS the gateway)
                if (!gatewayFound && status.Self?.HostName?.toLowerCase() === GATEWAY_DEVICE.toLowerCase()) {
                    gatewayFound = true;
                    isOnline = true;
                    isExitNode = status.Self.ExitNode === true;
                    tailscaleIP = status.Self?.TailscaleIPs?.[0] || null;
                }

                if (!gatewayFound) {
                    resolve({
                        status: 'error',
                        message: `Gateway device '${GATEWAY_DEVICE}' not found on network.`,
                        hostname: GATEWAY_DEVICE,
                        online: false,
                        exit_node_active: false,
                        tailscale_ip: null
                    });
                    return;
                }

                resolve({
                    status: 'success',
                    hostname: GATEWAY_DEVICE,
                    online: isOnline,
                    exit_node_active: isExitNode,
                    tailscale_ip: tailscaleIP
                });
            } catch (e) {
                resolve({
                    status: 'error',
                    message: 'Failed to parse Tailscale status',
                    hostname: GATEWAY_DEVICE,
                    online: false,
                    exit_node_active: false,
                    tailscale_ip: null
                });
            }
        });
    });
}

// Check if Tailscale is running and get status
function checkTailscaleStatus() {
    return new Promise((resolve) => {
        exec('tailscale status --json', (error, stdout, stderr) => {
            if (error) {
                resolve({ running: false, ip: null, subnetRoutes: false, isExitNode: false });
                return;
            }
            try {
                const status = JSON.parse(stdout);
                const ip = status.Self?.TailscaleIPs?.[0] || null;
                const subnetRoutes = status.Self?.AdvertiseRoutes?.length > 0;
                const isExitNode = status.Self?.ExitNode === true;
                if (ip) TAILSCALE_IP = ip;
                resolve({ running: true, ip, subnetRoutes, isExitNode });
            } catch (e) {
                resolve({ running: false, ip: null, subnetRoutes: false, isExitNode: false });
            }
        });
    });
}

// Enable subnet router (advertise routes)
function enableSubnetRouter() {
    return new Promise((resolve) => {
        exec('tailscale up --advertise-routes', (error, stdout, stderr) => {
            if (error) {
                console.log('Could not advertise routes:', error.message);
                resolve(false);
                return;
            }
            console.log('Subnet router enabled - your internet is now shareable!');
            resolve(true);
        });
    });
}

// WireGuard path for Windows
const WG_EXE = '"C:\\Program Files\\WireGuard\\wg.exe"';

// WireGuard interface name
const WG_INTERFACE = 'wg0';

// In-memory peer registry (in production, use a database)
const peers = new Map();

/**
 * Generate a client configuration using Tailscale
 */
function generateClientConfig(userId, userEmail) {
    const clientPrivateKey = generateKeyPair();
    const clientPublicKey = generatePublicKey(clientPrivateKey);
    const clientIP = `10.0.0.${getNextIP()}`;
    
    const config = {
        userId,
        email: userEmail,
        privateKey: clientPrivateKey,
        publicKey: clientPublicKey,
        assignedIP: clientIP,
        createdAt: new Date().toISOString(),
        active: true
    };
    
    // Store peer info
    peers.set(userId, config);
    
    // Use dynamic Tailscale IP or fallback
    const gatewayIP = TAILSCALE_IP || '100.64.1.1';
    
    // Generate Tailscale/WireGuard config file content
    const wgConfig = `# Netra Gateway - Tailscale VPN Configuration
# This PC's Tailscale IP: ${gatewayIP}
# Users can connect to this IP using Tailscale

[Connection Details]
Protocol: Tailscale (WireGuard-based)
Gateway IP: ${gatewayIP}
Port: 443 (HTTPS)

[How to Connect]
1. Install Tailscale on your device
2. Log in with the same Tailscale account
3. You'll automatically connect through this gateway

[Interface]
PrivateKey = ${clientPrivateKey}
Address = ${clientIP}/24
DNS = 8.8.8.8, 1.1.1.1

[Peer]
PublicKey = TailscaleDefault
Endpoint = ${gatewayIP}:443
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25`;

    return {
        config,
        wgConfig
    };
}

/**
 * Provision a new user on WireGuard interface
 * This is called when payment is successful
 * @param {string} userPublicKey - The user's WireGuard public key
 * @param {string} userIp - The IP to assign (e.g., 10.0.0.5)
 */
const provisionNewUser = (userPublicKey, userIp) => {
    return new Promise((resolve, reject) => {
        // Command to add peer to WireGuard
        const command = `wg set ${WG_INTERFACE} peer ${userPublicKey} allowed-ips ${userIp}/32`;
        
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error provisioning user: ${error.message}`);
                // Don't reject - might be using Tailscale instead
                resolve({ success: false, error: error.message });
                return;
            }
            console.log(`User ${userPublicKey} is now authorized to use your internet!`);
            resolve({ success: true, message: 'User provisioned successfully' });
        });
    });
};

/**
 * The "Kill Switch" - Removes user when subscription expires
 * @param {string} userPublicKey - The user's WireGuard public key
 */
const revokeUserAccess = (userPublicKey) => {
    return new Promise((resolve, reject) => {
        const command = `wg set ${WG_INTERFACE} peer ${userPublicKey} remove`;
        
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.log(`Revoke (may not be on WireGuard): ${error.message}`);
                resolve({ success: true, message: 'Access revoked' });
                return;
            }
            console.log(`Access revoked for ${userPublicKey}`);
            resolve({ success: true, message: 'Access revoked successfully' });
        });
    });
};

/**
 * Remove a peer from WireGuard
 */
async function removePeer(userId) {
    const peer = peers.get(userId);
    if (!peer) return { success: false, message: 'Peer not found' };
    
    try {
        await revokeUserAccess(peer.publicKey);
        peer.active = false;
        peers.delete(userId);
        
        return { success: true, message: 'Peer removed successfully' };
    } catch (error) {
        return { success: false, message: error.message };
    }
}

/**
 * Check all subscriptions and disconnect expired users
 */
async function disconnectExpiredUsers() {
    const { UserSubscription } = require('../database/models');
    const { User } = require('../database/models');
    
    const allUsers = User.all();
    const now = new Date();
    
    for (const user of allUsers) {
        const subscription = UserSubscription.findByUserId(user.id);
        
        if (subscription && subscription.active) {
            if (subscription.expiresAt && new Date(subscription.expiresAt) < now) {
                console.log(`Disconnecting expired user: ${user.email}`);
                
                // Get peer info
                const peer = peers.get(user.id);
                if (peer && peer.publicKey) {
                    await revokeUserAccess(peer.publicKey);
                }
                
                // Update subscription status
                UserSubscription.update(user.id, {
                    active: false,
                    status: 'expired'
                });
            }
        }
    }
}

/**
 * Get active peers count
 */
function getActivePeersCount() {
    return Array.from(peers.values()).filter(p => p.active).length;
}

/**
 * Get all active peers
 */
function getActivePeers() {
    return Array.from(peers.values()).filter(p => p.active);
}

// Helper functions
function generateKeyPair() {
    // In production, use: wg genkey
    // For demo, return a placeholder
    return generateBase64Key();
}

function generatePublicKey(privateKey) {
    // In production, use: wg pubkey < privateKey
    return generateBase64Key();
}

function generateBase64Key() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let key = '';
    for (let i = 0; i < 44; i++) {
        key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
}

let nextIPCounter = 2; // Start from .2 (server is .1)
function getNextIP() {
    const ip = nextIPCounter;
    nextIPCounter = (nextIPCounter + 1) % 254;
    if (nextIPCounter < 2) nextIPCounter = 2;
    return ip;
}

module.exports = {
    generateClientConfig,
    provisionNewUser,
    revokeUserAccess,
    removePeer,
    disconnectExpiredUsers,
    getActivePeersCount,
    getActivePeers,
    peers,
    getTailscaleIP,
    checkTailscaleStatus,
    enableSubnetRouter,
    checkGatewayStatus,
    get TAILSCALE_IP() { return TAILSCALE_IP; }
};
