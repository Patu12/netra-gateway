const { UserSubscription, UsageLog } = require('../database/models');

const subscriptionMiddleware = (req, res, next) => {
    // Allow ALL users to access services for FREE
    // No subscription required - unlimited access for everyone
    req.hasActiveSubscription = true;
    req.subscription = {
        active: true,
        plan: {
            id: 'free',
            name: 'Free Access',
            type: 'free',
            dataLimit: 999999999999999, // Unlimited
            features: ['Full VPN', 'Unlimited Devices', 'High Speed', 'No Ads']
        },
        isAdmin: req.user && req.user.email === 'admin@netra.io'
    };
    req.usage = {
        bytesUsed: 0,
        dataLimit: 999999999999999,
        remaining: 999999999999999
    };
    next();
};

module.exports = {
    subscriptionMiddleware
};
