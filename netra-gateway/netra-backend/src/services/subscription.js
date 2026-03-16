const { db, UserSubscription, VPNSession } = require('../database/models');
const { disconnectExpiredUsers, provisionNewUser } = require('./wireguard');

/**
 * Cleanup expired subscriptions
 * Called by cron job every minute
 */
async function cleanupExpiredSubscriptions() {
    console.log('Running subscription cleanup...');
    
    // Disconnect expired users from WireGuard
    try {
        await disconnectExpiredUsers();
    } catch (e) {
        console.log('WireGuard cleanup not available');
    }
    
    // Find all expired subscriptions
    const expiredSubscriptions = db.prepare(
        `SELECT us.*, u.email FROM user_subscriptions us 
         JOIN users u ON us.user_id = u.id 
         WHERE us.active = 1 AND us.expires_at IS NOT NULL AND us.expires_at < datetime('now')`
    ).all();
    
    for (const subscription of expiredSubscriptions) {
        console.log(`Expiring subscription for user ${subscription.user_id}`);
        
        // Update subscription status
        await UserSubscription.update(subscription.user_id, {
            active: false,
            status: 'expired'
        });
        
        // Disconnect any active VPN sessions (local)
        const session = await VPNSession.findByUserId(subscription.user_id);
        if (session && session.connected) {
            await VPNSession.update(subscription.user_id, {
                connected: false,
                disconnected_at: new Date()
            });
            console.log(`Disconnected local VPN for user ${subscription.user_id}`);
        }
    }
    
    console.log('Subscription cleanup complete');
}

/**
 * Check subscription validity before connection
 */
async function validateSubscription(userId) {
    const subscription = await UserSubscription.findByUserId(userId);
    
    if (!subscription) {
        return {
            valid: false,
            reason: 'NO_SUBSCRIPTION'
        };
    }
    
    if (!subscription.active) {
        return {
            valid: false,
            reason: 'INACTIVE'
        };
    }
    
    if (subscription.expires_at && new Date(subscription.expires_at) < new Date()) {
        return {
            valid: false,
            reason: 'EXPIRED',
            expiresAt: subscription.expires_at
        };
    }
    
    return {
        valid: true,
        subscription
    };
}

/**
 * Extend subscription duration
 */
async function extendSubscription(userId, planId) {
    const subscription = await UserSubscription.findByUserId(userId);
    const plan = await require('../database/models').SubscriptionPlan.findById(planId);
    
    if (!plan) {
        throw new Error('Plan not found');
    }
    
    const now = new Date();
    let expiresAt;
    
    if (subscription && subscription.expires_at && new Date(subscription.expires_at) > now) {
        // Extend from current expiration
        expiresAt = new Date(new Date(subscription.expires_at).getTime() + plan.duration);
    } else {
        // Start fresh
        expiresAt = new Date(now.getTime() + plan.duration);
    }
    
    return UserSubscription.update(userId, {
        planId,
        plan,
        active: true,
        status: 'active',
        expires_at: expiresAt.toISOString()
    });
}

/**
 * Activate subscription and provision user on WireGuard
 */
async function activateSubscription(userId, planId, userPublicKey = null) {
    // Extend or create subscription
    const subscription = await extendSubscription(userId, planId);
    
    // If user has a WireGuard key, provision them
    if (userPublicKey) {
        const { generateClientConfig } = require('./wireguard');
        const { User } = require('../database/models');
        
        const user = User.findById(userId);
        const { config, wgConfig } = generateClientConfig(userId, user?.email);
        
        // Provision on WireGuard
        try {
            await provisionNewUser(userPublicKey, config.assignedIP);
        } catch (e) {
            console.log('WireGuard provisioning skipped:', e.message);
        }
        
        return {
            subscription,
            wireguardConfig: wgConfig,
            assignedIP: config.assignedIP
        };
    }
    
    return { subscription };
}

module.exports = {
    cleanupExpiredSubscriptions,
    validateSubscription,
    extendSubscription,
    activateSubscription
};
