const express = require('express');
const { Transaction, UserSubscription } = require('../database/models');

const router = express.Router();

// POST /api/webhooks/stripe
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        const sig = req.headers['stripe-signature'];
        
        // In production, verify webhook signature
        // const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
        
        // For demo, just parse the body
        let event;
        try {
            event = JSON.parse(req.body);
        } catch (e) {
            event = req.body;
        }
        
        console.log('Stripe webhook received:', event.type);
        
        switch (event.type) {
            case 'payment_intent.succeeded':
                await handlePaymentSuccess(event.data.object);
                break;
                
            case 'payment_intent.payment_failed':
                await handlePaymentFailure(event.data.object);
                break;
                
            case 'customer.subscription.created':
                await handleSubscriptionCreated(event.data.object);
                break;
                
            case 'customer.subscription.updated':
                await handleSubscriptionUpdated(event.data.object);
                break;
                
            case 'customer.subscription.deleted':
                await handleSubscriptionDeleted(event.data.object);
                break;
                
            default:
                console.log('Unhandled event type:', event.type);
        }
        
        res.json({ received: true });
    } catch (error) {
        console.error('Stripe webhook error:', error);
        res.status(400).json({
            success: false,
            message: 'Webhook error'
        });
    }
});

// POST /api/webhooks/paystack
router.post('/paystack', express.json(), async (req, res) => {
    try {
        const event = req.body;
        
        console.log('Paystack webhook received:', event.event);
        
        switch (event.event) {
            case 'charge.success':
                await handlePaymentSuccess(event.data);
                break;
                
            case 'transfer.success':
                console.log('Transfer successful:', event.data);
                break;
                
            default:
                console.log('Unhandled event:', event.event);
        }
        
        res.json({ received: true });
    } catch (error) {
        console.error('Paystack webhook error:', error);
        res.status(400).json({
            success: false,
            message: 'Webhook error'
        });
    }
});

// POST /api/webhooks/flutterwave
router.post('/flutterwave', express.json(), async (req, res) => {
    try {
        const event = req.body;
        
        console.log('Flutterwave webhook received:', event.event);
        
        switch (event.event) {
            case 'charge.completed':
                await handlePaymentSuccess(event.data);
                break;
                
            default:
                console.log('Unhandled event:', event.event);
        }
        
        res.json({ received: true });
    } catch (error) {
        console.error('Flutterwave webhook error:', error);
        res.status(400).json({
            success: false,
            message: 'Webhook error'
        });
    }
});

// Helper functions
async function handlePaymentSuccess(paymentData) {
    console.log('Payment succeeded:', paymentData.id || paymentData.paymentIntent);
    
    // Find transaction by reference
    const reference = paymentData.id || paymentData.paymentIntent || paymentData.reference;
    
    if (!reference) {
        console.error('No payment reference found');
        return;
    }
    
    // Update transaction status
    const transactions = Array.from(require('../database/models').transactions.values());
    const transaction = transactions.find(t => 
        t.id === reference || 
        t.paymentIntent?.id === reference
    );
    
    if (transaction) {
        Transaction.update(transaction.id, {
            status: 'completed',
            completedAt: new Date().toISOString(),
            paymentData
        });
        
        // Activate subscription
        if (transaction.userId && transaction.planId) {
            UserSubscription.create(transaction.userId, transaction.planId, transaction.id);
        }
    }
}

async function handlePaymentFailure(paymentData) {
    console.log('Payment failed:', paymentData.id || paymentData.paymentIntent);
    
    const reference = paymentData.id || paymentData.paymentIntent;
    
    if (!reference) return;
    
    const transactions = Array.from(require('../database/models').transactions.values());
    const transaction = transactions.find(t => 
        t.id === reference || 
        t.paymentIntent?.id === reference
    );
    
    if (transaction) {
        Transaction.update(transaction.id, {
            status: 'failed',
            failureReason: paymentData.last_payment_error?.message || 'Payment failed'
        });
    }
}

async function handleSubscriptionCreated(subscriptionData) {
    console.log('Subscription created:', subscriptionData.id);
    // Handle Stripe subscription creation
}

async function handleSubscriptionUpdated(subscriptionData) {
    console.log('Subscription updated:', subscriptionData.id);
    // Handle Stripe subscription updates
}

async function handleSubscriptionDeleted(subscriptionData) {
    console.log('Subscription deleted:', subscriptionData.id);
    // Handle Stripe subscription cancellation
}

module.exports = router;
