const express = require('express');
const { UsageLog, VPNSession } = require('../database/models');

const router = express.Router();

// GET /api/usage/stats
router.get('/stats', (req, res) => {
    try {
        // Get current session
        const session = VPNSession.findByUserId(req.userId);
        
        // Get total usage
        const bytesUsed = UsageLog.getTotalUsage(req.userId);
        
        // Get recent logs
        const recentLogs = UsageLog.findByUserId(req.userId, 10);
        
        res.json({
            success: true,
            data: {
                bytesUsed,
                sessionActive: session?.active || false,
                currentSpeed: session?.currentSpeed || 0,
                connectedAt: session?.connectedAt || null,
                recentLogs
            }
        });
    } catch (error) {
        console.error('Get usage stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching usage stats'
        });
    }
});

// POST /api/usage/report
router.post('/report', (req, res) => {
    try {
        const { bytesUsed, duration, serverId } = req.body;
        
        // Validate input
        if (typeof bytesUsed !== 'number' || bytesUsed < 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid bytesUsed value'
            });
        }
        
        // Create usage log
        const log = UsageLog.create({
            userId: req.userId,
            bytesUsed,
            duration: duration || 0,
            serverId,
            reportedAt: new Date().toISOString()
        });
        
        // Update session if active
        const session = VPNSession.findByUserId(req.userId);
        if (session) {
            VPNSession.update(req.userId, {
                bytesUsed: (session.bytesUsed || 0) + bytesUsed,
                lastReportedAt: new Date().toISOString()
            });
        }
        
        res.json({
            success: true,
            data: {
                logged: true,
                bytesUsed: log.bytesUsed,
                totalUsed: UsageLog.getTotalUsage(req.userId)
            }
        });
    } catch (error) {
        console.error('Report usage error:', error);
        res.status(500).json({
            success: false,
            message: 'Error reporting usage'
        });
    }
});

// GET /api/usage/history
router.get('/history', (req, res) => {
    try {
        const { limit = 50, offset = 0 } = req.query;
        
        const allLogs = UsageLog.findByUserId(req.userId, 1000);
        const total = allLogs.length;
        
        const logs = allLogs
            .slice(parseInt(offset), parseInt(offset) + parseInt(limit));
        
        res.json({
            success: true,
            data: {
                logs,
                total,
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });
    } catch (error) {
        console.error('Get usage history error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching usage history'
        });
    }
});

// POST /api/usage/reset
router.post('/reset', (req, res) => {
    // This endpoint would be admin-only in production
    // For demo, allow users to reset their own usage
    
    try {
        // Only allow reset for users with expired subscriptions or admin
        // For demo, just return success
        
        res.json({
            success: true,
            message: 'Usage reset successful'
        });
    } catch (error) {
        console.error('Reset usage error:', error);
        res.status(500).json({
            success: false,
            message: 'Error resetting usage'
        });
    }
});

module.exports = router;
