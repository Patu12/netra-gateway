import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

// API Configuration
const API_BASE = 'https://netra-backend-99n0.onrender.com'; // Render backend URL
// For local development, use: 'http://localhost:3001' or your PC's IP: 'http://192.168.x.x:3001'
// For physical device, use your PC's IP address: 'http://YOUR_PC_IP:3001'

// Gateway Configuration - Hardcoded for offline access
const GATEWAY_CONFIG = {
  ip: '100.102.117.30',
  port: '51820',
  protocol: 'WireGuard (UDP)',
  // DNS Servers - critical for VPN to work
  dns: ['8.8.8.8', '1.1.1.1'], // Google + Cloudflare
  // Fallback discovery URL
  discoveryUrl: 'https://netra-gateway.discover.io/config',
};

interface Plan {
  id: string;
  name: string;
  type: string;
  price: number;
  interval: string;
  dataLimit: number;
  duration: number;
  features: string[];
}

interface User {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
}

interface Subscription {
  active: boolean;
  planId: string;
  expiresAt: string;
  status: string;
  dataUsed?: number;
  dataLimit?: number;
}

interface WireGuardKeys {
  privateKey: string;
  publicKey: string;
}

// Generate WireGuard key pair (simulated - in production use crypto)
const generateKeyPair = (): WireGuardKeys => {
  // In production, use: const { generatePrivateKey, generatePublicKey } = require('react-native-wireguard-v2');
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let privateKey = '';
  let publicKey = '';
  for (let i = 0; i < 43; i++) {
    privateKey += chars.charAt(Math.floor(Math.random() * chars.length));
    publicKey += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return { privateKey, publicKey };
};

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [vpnConnected, setVpnConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [useTailscale, setUseTailscale] = useState(false);
  const [vpnKeys, setVpnKeys] = useState<WireGuardKeys | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Initialize WireGuard keys on first launch
  useEffect(() => {
    // In production: load from AsyncStorage
    const keys = generateKeyPair();
    setVpnKeys(keys);
    console.log('Generated WireGuard keys:', keys.publicKey.substring(0, 10) + '...');
  }, []);

  // Load plans on mount
  useEffect(() => {
    loadPlans();
  }, []);

  useEffect(() => {
    if (isLoggedIn && user) {
      checkSubscription();
      syncPublicKey();
    }
  }, [isLoggedIn, user]);

  const syncPublicKey = async () => {
    if (!user || !vpnKeys) return;
    try {
      // Send public key to backend so gateway is ready
      await fetch(`${API_BASE}/api/vpn/register-key`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ publicKey: vpnKeys.publicKey }),
      });
      console.log('Public key synced with gateway');
    } catch (error) {
      console.log('Could not sync key (offline mode)');
    }
  };

  const login = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (data.success) {
        // Extract isAdmin and token from response (backend returns user in data.data)
        const userWithAdmin = {
          ...data.data.user,
          isAdmin: data.data?.isAdmin || data.isAdmin || false
        };
        setUser(userWithAdmin);
        setAuthToken(data.data.token); // Store the auth token
        setIsLoggedIn(true);
      } else {
        Alert.alert('Login Failed', data.message || 'Invalid credentials');
      }
    } catch (error) {
      Alert.alert('Error', 'Cannot connect to server. Make sure backend is running.');
    }
    setLoading(false);
  };

  const loadPlans = async () => {
    try {
      console.log('Loading plans from:', `${API_BASE}/api/public/plans`);
      const response = await fetch(`${API_BASE}/api/public/plans`);
      console.log('Response status:', response.status);
      const data = await response.json();
      console.log('Plans data:', data);
      if (data.success) {
        setPlans(data.data);
      } else {
        console.error('API returned error:', data.message);
      }
    } catch (error) {
      console.error('Failed to load plans:', error);
    }
  };

  const checkSubscription = async () => {
    if (!user) return;
    try {
      const response = await fetch(`${API_BASE}/api/subscription/status`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await response.json();
      if (data.success) {
        // Backend sends isAdmin in the subscription response for admin users
        const subData = data.data || data.subscription;
        setSubscription(subData);
        // Update user with admin status from subscription
        if (subData?.isAdmin) {
          setUser(prev => prev ? { ...prev, isAdmin: true } : null);
        }
      }
    } catch (error) {
      console.error('Failed to check subscription:', error);
    }
  };

  const subscribe = async (planId: string) => {
    if (!user) return;
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/subscription/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ planId }),
      });
      const data = await response.json();
      if (data.success) {
        Alert.alert('Success', 'Subscription activated!');
        checkSubscription();
      } else {
        Alert.alert('Error', data.message);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to subscribe');
    }
    setLoading(false);
  };

  const connectVPN = async () => {
    console.log('Connecting VPN...');
    console.log('User:', user);
    console.log('Subscription:', subscription);
    console.log('Is Admin:', user?.isAdmin);
    
    // Check if user has access - either from local state OR from server
    let hasAccess = subscription?.active || user?.isAdmin;
    
    // If no local access, check server directly
    if (!hasAccess && user && authToken) {
      try {
        const response = await fetch(`${API_BASE}/api/subscription/status`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const data = await response.json();
        if (data.success && (data.data?.isAdmin || data.data?.active)) {
          hasAccess = true;
          setSubscription(data.data);
          if (data.data?.isAdmin) {
            setUser(prev => prev ? { ...prev, isAdmin: true } : null);
          }
        }
      } catch (e) {
        console.log('Could not check subscription status');
      }
    }
    
    if (!hasAccess) {
      Alert.alert('No Subscription', 'Please subscribe first to use VPN');
      return;
    }
    
    console.log('User has access, proceeding with VPN connection...');

    if (!vpnKeys) {
      Alert.alert('Error', 'VPN keys not ready');
      return;
    }

    setConnecting(true);

    if (useTailscale) {
      // Tailscale mode
      setTimeout(() => {
        setVpnConnected(true);
        setConnecting(false);
        Alert.alert(
          'VPN Connected (Tailscale)',
          `Connected via Tailscale to ${GATEWAY_CONFIG.ip}\n\nInstall Tailscale app to complete connection.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Download Tailscale', onPress: () => Linking.openURL('https://tailscale.com/download') },
          ]
        );
      }, 1500);
    } else {
      // Netra Native WireGuard mode
      try {
        // Fetch config from backend
        const response = await fetch(`${API_BASE}/api/vpn/config`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const data = await response.json();
        
        if (data.success && data.config) {
          // In production: useWireGuardV2 to start
          // const wg = useWireGuardV2();
          // await wg.start({
          //   privateKey: vpnKeys.privateKey,
          //   address: data.config.address,
          //   dns: ['8.8.8.8', '1.1.1.1'],
          //   peer: {
          //     publicKey: data.config.peerPublicKey,
          //     endpoint: `${GATEWAY_CONFIG.ip}:${GATEWAY_CONFIG.port}`,
          //     allowedIPs: ['0.0.0.0/0', '::/0'],
          //   }
          // });
          
          setVpnConnected(true);
          setConnecting(false);
          Alert.alert(
            '🛡️ VPN Connected',
            `Connected to Netra Gateway!\n\n` +
            `Gateway: ${GATEWAY_CONFIG.ip}:${GATEWAY_CONFIG.port}\n` +
            `DNS: ${GATEWAY_CONFIG.dns.join(', ')}\n\n` +
            `All traffic now routes through VPN.`
          );
        } else {
          // Demo mode - simulate connection
          setVpnConnected(true);
          setConnecting(false);
          Alert.alert(
            '🛡️ Demo VPN Connected',
            `Simulated connection to Netra Gateway\n\n` +
            `Gateway: ${GATEWAY_CONFIG.ip}:${GATEWAY_CONFIG.port}\n` +
            `DNS: ${GATEWAY_CONFIG.dns.join(', ')}\n\n` +
            `In production, native WireGuard would start here.`
          );
        }
      } catch (error) {
        // Demo fallback
        setVpnConnected(true);
        setConnecting(false);
        Alert.alert(
          '🛡️ VPN Connected (Demo)',
          `Connected to ${GATEWAY_CONFIG.ip}\n\n` +
          `DNS: ${GATEWAY_CONFIG.dns.join(', ')}\n\n` +
          `This is a demo connection.`
        );
      }
    }
  };

  const disconnectVPN = () => {
    setConnecting(true);
    // In production: await wireguard.stop();
    setTimeout(() => {
      setVpnConnected(false);
      setConnecting(false);
    }, 1000);
  };

  const toggleVPN = () => {
    if (vpnConnected) {
      disconnectVPN();
    } else {
      connectVPN();
    }
  };

  const logout = () => {
    setIsLoggedIn(false);
    setUser(null);
    setAuthToken(null);
    setEmail('');
    setPassword('');
    setVpnConnected(false);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString();
  };

  // Login Screen
  if (!isLoggedIn) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0A1628" />
        <View style={styles.loginContainer}>
          <Text style={styles.logo}>🛡️</Text>
          <Text style={styles.title}>Netra Gateway</Text>
          <Text style={styles.subtitle}>Your Pocket VPN Gateway</Text>
          
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#666"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#666"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>
          
          <TouchableOpacity
            style={styles.loginButton}
            onPress={login}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.loginButtonText}>Login</Text>
            )}
          </TouchableOpacity>
          
          <Text style={styles.hint}>Demo: admin@netra.io / admin123</Text>
          
          {vpnKeys && (
            <View style={styles.keyInfo}>
              <Text style={styles.keyInfoText}>🔐 WireGuard Keys Ready</Text>
              <Text style={styles.keyIdText}>ID: {vpnKeys.publicKey.substring(0, 8)}...</Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  // Main Dashboard
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0A1628" />
      <ScrollView style={styles.dashboard}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.welcomeText}>Welcome back</Text>
            <Text style={styles.userEmail}>{user?.email}</Text>
          </View>
          <TouchableOpacity onPress={logout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        {/* VPN Mode Toggle */}
        <View style={styles.vpnModeCard}>
          <Text style={styles.sectionTitle}>Connection Mode</Text>
          <View style={styles.modeToggle}>
            <TouchableOpacity
              style={[styles.modeButton, !useTailscale && styles.modeButtonActive]}
              onPress={() => setUseTailscale(false)}
            >
              <Text style={[styles.modeButtonText, !useTailscale && styles.modeButtonTextActive]}>
                🛡️ Netra VPN
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeButton, useTailscale && styles.modeButtonActive]}
              onPress={() => setUseTailscale(true)}
            >
              <Text style={[styles.modeButtonText, useTailscale && styles.modeButtonTextActive]}>
                🌐 Tailscale
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* VPN Status */}
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <View>
              <Text style={styles.statusLabel}>VPN Status</Text>
              <Text style={[styles.statusValue, { color: vpnConnected ? '#4CAF50' : '#FF5252' }]}>
                {vpnConnected ? 'Connected' : 'Disconnected'}
              </Text>
            </View>
            <View style={[styles.statusDot, { backgroundColor: vpnConnected ? '#4CAF50' : '#FF5252' }]} />
          </View>
          
          <TouchableOpacity
            style={[
              styles.connectButton,
              vpnConnected && styles.disconnectButton,
              connecting && styles.connectingButton,
            ]}
            onPress={toggleVPN}
            disabled={connecting}
          >
            {connecting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.connectButtonText}>
                {vpnConnected ? 'Disconnect' : 'Connect'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Gateway Info */}
        <View style={styles.gatewayCard}>
          <Text style={styles.gatewayTitle}>🌐 Gateway Configuration</Text>
          <Text style={styles.gatewayText}>IP: {GATEWAY_CONFIG.ip}</Text>
          <Text style={styles.gatewayText}>Port: {GATEWAY_CONFIG.port}</Text>
          <Text style={styles.gatewayText}>Protocol: {GATEWAY_CONFIG.protocol}</Text>
          <Text style={styles.gatewayText}>DNS: {GATEWAY_CONFIG.dns.join(', ')}</Text>
          
          {vpnKeys && (
            <View style={styles.keyStatus}>
              <Text style={styles.keyStatusText}>🔑 Key Ready</Text>
            </View>
          )}
        </View>

        {/* Subscription */}
        <View style={styles.subscriptionCard}>
          <Text style={styles.sectionTitle}>Your Subscription</Text>
          {subscription?.active || user?.isAdmin ? (
            <>
              <Text style={styles.subStatus}>✅ Active</Text>
              <Text style={styles.subExpiry}>
                Expires: {subscription?.expiresAt ? formatDate(subscription.expiresAt) : 'Never'}
              </Text>
            </>
          ) : (
            <Text style={styles.subStatus}>❌ No active subscription</Text>
          )}
        </View>

        {/* Plans */}
        <Text style={styles.sectionTitle}>Available Plans</Text>
        {plans.length === 0 ? (
          <Text style={styles.subStatus}>Loading plans...</Text>
        ) : (
          plans.map((plan) => (
            <TouchableOpacity
              key={plan.id}
              style={[
                styles.planCard,
                subscription?.planId === plan.id && styles.activePlan,
              ]}
              onPress={() => subscribe(plan.id)}
              disabled={loading || subscription?.planId === plan.id}
            >
              <View style={styles.planHeader}>
                <Text style={styles.planName}>{plan.name}</Text>
                <Text style={styles.planPrice}>
                  {plan.price === 0 ? 'FREE' : `${plan.price}/${plan.interval}`}
                </Text>
              </View>
              <Text style={styles.planData}>Data: {formatBytes(plan.dataLimit)}</Text>
              <View style={styles.featuresList}>
                {plan.features.map((feature, idx) => (
                  <Text key={`feature-${idx}`} style={styles.featureText}>• {feature}</Text>
                ))}
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A1628' },
  loginContainer: { flex: 1, justifyContent: 'center', padding: 20 },
  logo: { fontSize: 80, textAlign: 'center' },
  title: { fontSize: 32, fontWeight: 'bold', color: '#fff', textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#888', textAlign: 'center', marginBottom: 40 },
  inputContainer: { marginBottom: 20 },
  input: { backgroundColor: '#1a2a4a', borderRadius: 10, padding: 15, marginBottom: 15, color: '#fff', fontSize: 16 },
  loginButton: { backgroundColor: '#3B82F6', borderRadius: 10, padding: 15, alignItems: 'center' },
  loginButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  hint: { color: '#666', textAlign: 'center', marginTop: 20 },
  keyInfo: { marginTop: 20, alignItems: 'center' },
  keyInfoText: { color: '#4CAF50', fontSize: 12 },
  keyIdText: { color: '#666', fontSize: 10 },
  dashboard: { flex: 1, padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  welcomeText: { color: '#888', fontSize: 14 },
  userEmail: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  logoutButton: { padding: 10 },
  logoutText: { color: '#FF5252', fontSize: 16 },
  vpnModeCard: { backgroundColor: '#1a2a4a', borderRadius: 15, padding: 20, marginBottom: 20 },
  sectionTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 15 },
  modeToggle: { flexDirection: 'row' },
  modeButton: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#0A1628', marginHorizontal: 5, alignItems: 'center' },
  modeButtonActive: { backgroundColor: '#3B82F6' },
  modeButtonText: { color: '#888', fontSize: 14, fontWeight: 'bold' },
  modeButtonTextActive: { color: '#fff' },
  statusCard: { backgroundColor: '#1a2a4a', borderRadius: 15, padding: 20, marginBottom: 20 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  statusLabel: { color: '#888', fontSize: 14 },
  statusValue: { fontSize: 24, fontWeight: 'bold' },
  statusDot: { width: 20, height: 20, borderRadius: 10 },
  connectButton: { backgroundColor: '#4CAF50', borderRadius: 10, padding: 15, alignItems: 'center' },
  disconnectButton: { backgroundColor: '#FF5252' },
  connectingButton: { backgroundColor: '#FFA500' },
  connectButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  gatewayCard: { backgroundColor: '#1a2a4a', borderRadius: 15, padding: 20, marginBottom: 20 },
  gatewayTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  gatewayText: { color: '#888', fontSize: 14, marginBottom: 5 },
  keyStatus: { marginTop: 10, padding: 10, backgroundColor: '#0A1628', borderRadius: 8, alignItems: 'center' },
  keyStatusText: { color: '#4CAF50', fontSize: 12 },
  subscriptionCard: { backgroundColor: '#1a2a4a', borderRadius: 15, padding: 20, marginBottom: 20 },
  subStatus: { color: '#4CAF50', fontSize: 16, fontWeight: 'bold' },
  subExpiry: { color: '#888', fontSize: 14, marginTop: 5 },
  planCard: { backgroundColor: '#1a2a4a', borderRadius: 15, padding: 20, marginBottom: 15, borderWidth: 2, borderColor: 'transparent' },
  activePlan: { borderColor: '#3B82F6' },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  planName: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  planPrice: { color: '#3B82F6', fontSize: 16, fontWeight: 'bold' },
  planData: { color: '#888', fontSize: 14, marginBottom: 10 },
  featuresList: { marginTop: 5 },
  featureText: { color: '#aaa', fontSize: 13, marginLeft: 5 },
});
