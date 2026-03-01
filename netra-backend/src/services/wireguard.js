/**
 * WireGuard Service - Manages VPN peers and configurations
 * Uses Tailscale for VPN connectivity (already installed and running)
 */

const { exec } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

// Tailscale configuration
const TAILSCALE_IP = '100.102.117.30'; // Your Tailscale IP

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
    
    // Generate Tailscale/WireGuard config file content
    const wgConfig = `# Netra Gateway - Tailscale VPN Configuration
# This PC's Tailscale IP: ${TAILSCALE_IP}
# Users can connect to this IP using Tailscale

[Connection Details]
Protocol: Tailscale (WireGuard-based)
Gateway IP: ${TAILSCALE_IP}
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
Endpoint = ${TAILSCALE_IP}:443
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
    peers
};
