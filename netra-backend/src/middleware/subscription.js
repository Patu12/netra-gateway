const { UserSubscription, UsageLog } = require('../database/models');

const subscriptionMiddleware = (req, res, next) => {
    try {
        // Check if user is admin (based on email)
        if (req.user && req.user.email === 'admin@netra.io') {
            req.subscription = {
                active: true,
                plan: { name: 'VIP Unlimited', dataLimit: 999999999999999 }
            };
            req.usage = { bytesUsed: 0, dataLimit: 999999999999999, remaining: 999999999999999 };
            return next();
        }
        
        const subscription = UserSubscription.findByUserId(req.userId);
        
        if (!subscription) {
            return res.status(403).json({
                success: false,
                message: 'No subscription found',
                code: 'NO_SUBSCRIPTION'
            });
        }
        
        // Check if subscription is active
        if (!subscription.active) {
            return res.status(403).json({
                success: false,
                message: 'Subscription is not active',
                code: 'SUBSCRIPTION_INACTIVE',
                expiresAt: subscription.expiresAt
            });
        }
        
        // Check if subscription has expired
        if (subscription.expiresAt && new Date(subscription.expiresAt) < new Date()) {
            UserSubscription.update(req.userId, {
                active: false,
                status: 'expired'
            });
            
            return res.status(403).json({
                success: false,
                message: 'Subscription has expired',
                code: 'SUBSCRIPTION_EXPIRED',
                expiresAt: subscription.expiresAt
            });
        }
        
        // Get current usage
        const currentUsage = UsageLog.getTotalUsage(req.userId);
        const dataLimit = subscription.plan?.dataLimit || 0;
        
        // Check if data limit exceeded
        if (currentUsage >= dataLimit) {
            return res.status(403).json({
                success: false,
                message: 'Data limit exceeded',
                code: 'DATA_LIMIT_EXCEEDED',
                usage: currentUsage,
                limit: dataLimit
            });
        }
        
        req.subscription = subscription;
        req.usage = {
            bytesUsed: currentUsage,
            dataLimit: dataLimit,
            remaining: Math.max(0, dataLimit - currentUsage)
        };
        
        next();
    } catch (error) {
        console.error('Subscription middleware error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error checking subscription'
        });
    }
};

module.exports = {
    subscriptionMiddleware
};
