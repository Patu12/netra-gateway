const { UsageLog, VPNSession, vpnServers } = require('../database/models');

/**
 * Log usage stats periodically
 * Called by cron job every 5 minutes
 */
async function logUsageStats() {
    console.log('Logging usage stats...');
    
    // Get all active VPN sessions
    const sessions = Array.from(VPNSession._userSubs?.values() || []);
    
    for (const userId of sessions) {
        const session = VPNSession.findByUserId(userId);
        
        if (!session || !session.active) continue;
        
        // Simulate some usage (in production, this would come from actual VPN metrics)
        const simulatedBytes = Math.floor(Math.random() * 1024 * 1024); // 0-1MB
        
        UsageLog.create({
            userId,
            bytesUsed: simulatedBytes,
            duration: 300, // 5 minutes in seconds
            serverId: session.serverId,
            source: 'heartbeat'
        });
        
        console.log(`Logged ${simulatedBytes} bytes for user ${userId}`);
    }
    
    console.log('Usage stats logging complete');
}

/**
 * Get current usage data for a user
 */
async function getCurrentUsage(userId) {
    const bytesUsed = UsageLog.getTotalUsage(userId);
    const session = VPNSession.findByUserId(userId);
    
    const subscription = require('../database/models').UserSubscription.findByUserId(userId);
    const dataLimit = subscription?.plan?.dataLimit || 0;
    
    return {
        bytesUsed,
        dataLimit,
        remaining: Math.max(0, dataLimit - bytesUsed),
        percentUsed: dataLimit > 0 ? (bytesUsed / dataLimit) * 100 : 0,
        sessionActive: session?.active || false
    };
}

/**
 * Check if user has exceeded data limit
 */
async function checkDataLimit(userId) {
    const bytesUsed = UsageLog.getTotalUsage(userId);
    const subscription = require('../database/models').UserSubscription.findByUserId(userId);
    const dataLimit = subscription?.plan?.dataLimit || 0;
    
    return {
        exceeded: bytesUsed >= dataLimit,
        bytesUsed,
        dataLimit,
        remaining: Math.max(0, dataLimit - bytesUsed)
    };
}

/**
 * Get aggregated usage by time period
 */
async function getUsageByPeriod(userId, period = 'day') {
    const logs = UsageLog.findByUserId(userId, 1000);
    
    const now = new Date();
    let startTime;
    
    switch (period) {
        case 'hour':
            startTime = new Date(now.getTime() - 60 * 60 * 1000);
            break;
        case 'day':
            startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            break;
        case 'week':
            startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
        case 'month':
            startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
        default:
            startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
    
    const filteredLogs = logs.filter(log => new Date(log.timestamp) >= startTime);
    
    const totalBytes = filteredLogs.reduce((sum, log) => sum + (log.bytesUsed || 0), 0);
    const totalDuration = filteredLogs.reduce((sum, log) => sum + (log.duration || 0), 0);
    
    return {
        period,
        startTime: startTime.toISOString(),
        endTime: now.toISOString(),
        bytesUsed: totalBytes,
        duration: totalDuration,
        sessionCount: filteredLogs.length
    };
}

module.exports = {
    logUsageStats,
    getCurrentUsage,
    checkDataLimit,
    getUsageByPeriod
};
