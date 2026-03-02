const { UserSubscription, VPNSession } = require('../database/models');
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
    
    const allUsers = require('../database/models').User.all();
    
    for (const user of allUsers) {
        const subscription = UserSubscription.findByUserId(user.id);
        
        if (!subscription) continue;
        
        // Check if subscription has expired
        if (subscription.expiresAt && new Date(subscription.expiresAt) < new Date()) {
            console.log(`Expiring subscription for user ${user.id}`);
            
            // Update subscription status
            UserSubscription.update(user.id, {
                active: false,
                status: 'expired'
            });
            
            // Disconnect any active VPN sessions (local)
            const session = VPNSession.findByUserId(user.id);
            if (session && session.active) {
                VPNSession.end(user.id);
                console.log(`Disconnected local VPN for user ${user.id}`);
            }
        }
    }
    
    console.log('Subscription cleanup complete');
}

/**
 * Check subscription validity before connection
 */
async function validateSubscription(userId) {
    const subscription = UserSubscription.findByUserId(userId);
    
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
    
    if (subscription.expiresAt && new Date(subscription.expiresAt) < new Date()) {
        return {
            valid: false,
            reason: 'EXPIRED',
            expiresAt: subscription.expiresAt
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
    const subscription = UserSubscription.findByUserId(userId);
    const plan = require('../database/models').SubscriptionPlan.findById(planId);
    
    if (!plan) {
        throw new Error('Plan not found');
    }
    
    const now = new Date();
    let expiresAt;
    
    if (subscription && subscription.expiresAt && new Date(subscription.expiresAt) > now) {
        // Extend from current expiration
        expiresAt = new Date(new Date(subscription.expiresAt).getTime() + plan.duration);
    } else {
        // Start fresh
        expiresAt = new Date(now.getTime() + plan.duration);
    }
    
    return UserSubscription.update(userId, {
        planId,
        plan,
        active: true,
        status: 'active',
        expiresAt: expiresAt.toISOString()
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
