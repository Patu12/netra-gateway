# 🔗 Global Nexus - Remote Gateway Setup Guide

This guide explains how to transform your Netra Gateway PC into a **Global Remote Gateway** that can serve internet to users anywhere in the world.

---

## 🏗️ Architecture Overview

```
User (Phone) 
    ↓ (Internet)
Your Public IP/DDNS 
    ↓ (Port Forwarding)
Netra Gateway PC
    ↓ (Your Internet)
The World
```

---

## 📋 Prerequisites

1. **Netra Gateway App** - Already installed
2. **WireGuard** - Download from https://www.wireguard.com/install/
3. **Public IP or DDNS** - Either a static IP or free DDNS service
4. **Port Forwarding** - Access your router to forward UDP 51820

---

## 🚀 Step 1: Enable IP Forwarding (Windows)

Your PC needs to act as a router:

1. Press `Win + R`, type `regedit`, press Enter
2. Navigate to:
   ```
   HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters
   ```
3. Right-click → New → **DWORD (32-bit) Value**
4. Name: `IPEnableRouter`
5. Set Value to `1`
6. Restart your PC

---

## 🚀 Step 2: Install & Configure WireGuard

### Install WireGuard
1. Download from https://www.wireguard.com/install/
2. Install with default options

### Create the Server Interface
1. Open WireGuard → "Add Tunnel" → "Add Empty Tunnel"
2. Name it `NetraGateway`

### Generate Server Keys
Open Command Prompt and run:
```bash
cd "C:\Program Files\WireGuard"
wg genkey > server_private.key
type server_private.key | wg pubkey > server_public.key
```

### Configure Server
Edit the tunnel configuration:
```
[Interface]
PrivateKey = <paste server_private.key contents>
Address = 10.0.0.1/24
ListenPort = 51820
PostUp = iptables -A FORWARD -i %i -j ACCEPT
PostUp = iptables -A FORWARD -o %i -j ACCEPT
PostUp = iptables -t nat -A POSTROUTING -o Ethernet -j MASQUERADE

[Peer]
# Clients will be added dynamically
```

3. Save and click "Activate"

---

## 🚀 Step 3: Set Up DDNS (Dynamic DNS)

Since home IPs change, use a free DDNS service:

1. Go to **DuckDNS** (https://duckdns.org) or **No-IP** (https://noip.com)
2. Create free account
3. Create a subdomain (e.g., `my-nexus-hub.duckdns.org`)
4. Note your DDNS hostname

---

## 🚀 Step 4: Port Forwarding

Configure your router to forward incoming VPN connections to your PC:

1. Access your router (usually 192.168.1.1 or 192.168.0.1)
2. Look for "Port Forwarding" or "Virtual Server"
3. Add rule:
   - **External Port**: 51820
   - **Protocol**: UDP
   - **Internal IP**: Your PC's local IP (run `ipconfig` to find)
   - **Internal Port**: 51820

---

## 🚀 Step 5: Configure Netra Backend

Set environment variables for your gateway:

```bash
# In netra-backend folder, create .env file:
WG_SERVER_PUBLIC_KEY=<paste server_public.key contents>
WG_SERVER_ENDPOINT=my-nexus-hub.duckdns.org:51820
```

Restart the backend:
```bash
cd netra-backend
node src/server.js
```

---

## 🔐 How It Works

### 1. User Purchases a Plan
- User opens Netra Gateway app
- Selects Daily/Weekly/Monthly plan
- Pays via Stripe/Paystack

### 2. Backend Generates Client Config
- Server creates unique WireGuard keys
- Generates config file with user's IP (10.0.0.x)
- Stores peer information

### 3. User Connects Remotely
- User imports config to their WireGuard app
- Connects using DDNS hostname
- Traffic routes through your PC

### 4. Kill Switch (Auto-Disconnect)
- Backend cron job checks every minute
- If subscription expires → executes `wg set wg0 peer <key> remove`
- User's internet cuts off instantly

---

## 📊 Usage Tracking

The backend tracks:
- **Data Used** - Total bytes transferred
- **Session Time** - Connection duration  
- **Active Peers** - Currently connected users

This data is visible in the app dashboard.

---

## ⚠️ Important Notes

| Challenge | Solution |
|-----------|----------|
| CGNAT (100.x.x.x IP) | Use Tailscale or Cloudflare Tunnel |
| Upload Speed Limit | Your upload = user's download |
| Security | Always use strong JWT tokens |
| Data Caps | Monitor your ISP limits |

---

## 🔧 Troubleshooting

**Can't connect?**
- Check WireGuard is running
- Verify port forwarding is correct
- Test with: `wg show`

**Users can't reach you?**
- Check DDNS is updating
- Ensure firewall allows UDP 51820
- Try disabling Windows Firewall temporarily

**Speed too slow?**
- Your upload speed is the bottleneck
- Connect via wired Ethernet, not WiFi

---

## 💡 Future: Nexus-Common Integration

Imagine earning "Common-Credits" by sharing your bandwidth!

- Student nearby can't afford data? Share your connection
- Earn credits for every GB shared
- Redeem credits for premium features

This transforms your app into a **decentralized ISP**.
