const express = require('express');
const { SubscriptionPlan, UserSubscription, Transaction, UsageLog } = require('../database/models');

const router = express.Router();

// GET /api/subscription/plans
router.get('/plans', (req, res) => {
    try {
        const plans = SubscriptionPlan.findAll();
        
        res.json({
            success: true,
            data: plans
        });
    } catch (error) {
        console.error('Get plans error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching plans'
        });
    }
});

// GET /api/subscription/status
router.get('/status', (req, res) => {
    try {
        // Check if user is admin
        if (req.user && req.user.email === 'admin@netra.io') {
            return res.json({
                success: true,
                data: {
                    active: true,
                    plan: { id: 'vip', name: 'VIP Unlimited', dataLimit: 999999999999999 },
                    isAdmin: true,
                    usage: {
                        bytesUsed: 0,
                        dataLimit: 999999999999999,
                        remaining: 999999999999999
                    }
                }
            });
        }
        
        const subscription = UserSubscription.findByUserId(req.userId);
        
        if (!subscription) {
            // Return default free trial
            return res.json({
                success: true,
                data: {
                    active: false,
                    plan: SubscriptionPlan.findById('free'),
                    usage: {
                        bytesUsed: 0,
                        dataLimit: 100 * 1024 * 1024,
                        remaining: 100 * 1024 * 1024
                    }
                }
            });
        }
        
        // Get current usage
        const bytesUsed = UsageLog.getTotalUsage(req.userId);
        
        res.json({
            success: true,
            data: {
                ...subscription,
                usage: {
                    bytesUsed,
                    dataLimit: subscription.plan?.dataLimit || 0,
                    remaining: Math.max(0, (subscription.plan?.dataLimit || 0) - bytesUsed)
                }
            }
        });
    } catch (error) {
        console.error('Get subscription status error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching subscription status'
        });
    }
});

// POST /api/subscription/purchase
router.post('/purchase', async (req, res) => {
    try {
        const { planId } = req.body;
        
        if (!planId) {
            return res.status(400).json({
                success: false,
                message: 'Plan ID is required'
            });
        }
        
        const plan = SubscriptionPlan.findById(planId);
        
        if (!plan) {
            return res.status(404).json({
                success: false,
                message: 'Plan not found'
            });
        }
        
        // Free plan - no payment needed
        if (plan.price === 0) {
            const subscription = UserSubscription.create(req.userId, planId, 'free');
            
            return res.json({
                success: true,
                data: {
                    subscription,
                    message: 'Free plan activated!'
                }
            });
        }
        
        // For paid plans, create a pending transaction
        // In production, this would integrate with Stripe/Paystack
        // For demo purposes, auto-approve all paid plans
        const transaction = Transaction.create({
            userId: req.userId,
            planId,
            amount: plan.price,
            currency: 'USD',
            type: 'purchase'
        });
        
        // Simulate payment processing (in production, use Stripe/Paystack)
        // For demo, auto-approve all transactions
        Transaction.update(transaction.id, {
            status: 'completed'
        });
        
        const subscription = UserSubscription.create(req.userId, planId, transaction.id);
        
        return res.json({
            success: true,
            data: {
                subscription,
                transaction,
                message: `Plan activated! ${plan.price} charged.`
            }
        });
            success: true,
            data: {
                requiresPayment: true,
                transaction,
                paymentIntent: {
                    clientSecret: `pi_demo_${transaction.id}_secret`,
                    amount: plan.price * 100, // cents
                    currency: 'usd'
                },
                message: 'Please complete payment'
            }
        });
    } catch (error) {
        console.error('Purchase error:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing purchase'
        });
    }
});

// POST /api/admin/grant-subscription (admin only)
router.post('/admin/grant', (req, res) => {
    try {
        const { userId, planId } = req.body;
        
        if (!userId || !planId) {
            return res.status(400).json({
                success: false,
                message: 'userId and planId are required'
            });
        }
        
        // Check if admin
        if (!req.user || req.user.email !== 'admin@netra.io') {
            return res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }
        
        // Grant subscription
        const subscription = UserSubscription.create(userId, planId, 'admin-grant');
        
        res.json({
            success: true,
            data: { subscription },
            message: `Subscription activated for plan ${planId}`
        });
    } catch (error) {
        console.error('Grant subscription error:', error);
        res.status(500).json({
            success: false,
            message: 'Error granting subscription'
        });
    }
});

// POST /api/subscription/cancel
router.post('/cancel', (req, res) => {
    try {
        const subscription = UserSubscription.cancel(req.userId);
        
        if (!subscription) {
            return res.status(404).json({
                success: false,
                message: 'No active subscription found'
            });
        }
        
        res.json({
            success: true,
            data: {
                subscription,
                message: 'Subscription cancelled'
            }
        });
    } catch (error) {
        console.error('Cancel subscription error:', error);
        res.status(500).json({
            success: false,
            message: 'Error cancelling subscription'
        });
    }
});

// GET /api/subscription/transactions
router.get('/transactions', (req, res) => {
    try {
        const transactions = Transaction.findByUserId(req.userId);
        
        res.json({
            success: true,
            data: transactions
        });
    } catch (error) {
        console.error('Get transactions error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching transactions'
        });
    }
});

module.exports = router;
