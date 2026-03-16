const { db, UsageLog, VPNSession, UserSubscription } = require('../database/models');

/**
 * Log usage stats periodically
 * Called by cron job every 5 minutes
 */
async function logUsageStats() {
    console.log('Logging usage stats...');
    
    // Get all active VPN sessions from database
    try {
        const sessionsResult = db.prepare(
            'SELECT * FROM vpn_sessions WHERE connected = 1'
        ).all();
        
        for (const session of sessionsResult) {
            // Simulate some usage (in production, this would come from actual VPN metrics)
            const simulatedBytes = Math.floor(Math.random() * 1024 * 1024); // 0-1MB
            
            await UsageLog.upsert(session.user_id, simulatedBytes);
            
            console.log(`Logged ${simulatedBytes} bytes for user ${session.user_id}`);
        }
        
        console.log('Usage stats logging complete');
    } catch (error) {
        console.error('Error logging usage stats:', error);
    }
}

/**
 * Get current usage data for a user
 */
async function getCurrentUsage(userId) {
    const usageLog = await UsageLog.findByUserId(userId);
    const subscription = await UserSubscription.findByUserId(userId);
    const session = await VPNSession.findByUserId(userId);
    
    const bytesUsed = usageLog?.bytes_used || 0;
    const dataLimit = subscription?.data_limit || 0;
    
    return {
        bytesUsed,
        dataLimit,
        remaining: Math.max(0, dataLimit - bytesUsed),
        percentUsed: dataLimit > 0 ? (bytesUsed / dataLimit) * 100 : 0,
        sessionActive: session?.connected || false
    };
}

/**
 * Check if user has exceeded data limit
 */
async function checkDataLimit(userId) {
    const usageLog = await UsageLog.findByUserId(userId);
    const subscription = await UserSubscription.findByUserId(userId);
    
    const bytesUsed = usageLog?.bytes_used || 0;
    const dataLimit = subscription?.data_limit || 0;
    
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
    
    const result = await pool.query(
        `SELECT * FROM usage_logs WHERE user_id = $1 AND last_activity >= $2`,
        [userId, startTime]
    );
    
    const logs = result.rows;
    
    const totalBytes = logs.reduce((sum, log) => sum + (log.bytes_used || 0), 0);
    const totalDuration = logs.reduce((sum, log) => sum + (log.session_count || 0), 0) * 300; // Assuming 5 min sessions
    
    return {
        period,
        startTime: startTime.toISOString(),
        endTime: now.toISOString(),
        bytesUsed: totalBytes,
        duration: totalDuration,
        sessionCount: logs.length
    };
}

module.exports = {
    logUsageStats,
    getCurrentUsage,
    checkDataLimit,
    getUsageByPeriod
};
