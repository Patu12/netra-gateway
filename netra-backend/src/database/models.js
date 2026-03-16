// SQLite database for local storage
// This file re-exports from sqlite.js for backward compatibility

const sqlite = require('./sqlite');

module.exports = {
  db: sqlite.db,
  initializeDatabase: () => {
    console.log('SQLite database initialized locally');
  },
  User: sqlite.User,
  SubscriptionPlan: sqlite.SubscriptionPlan,
  UserSubscription: sqlite.UserSubscription,
  Transaction: sqlite.Transaction,
  UsageLog: sqlite.UsageLog,
  VpnSession: sqlite.VpnSession,
  VPNSession: sqlite.VpnSession,  // Alias for backwards compatibility
  vpnServers: sqlite.vpnServers
};
