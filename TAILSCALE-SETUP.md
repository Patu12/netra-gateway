# 🦔 Tailscale Setup Guide for Netra Gateway

Since you're behind CGNAT (like most mobile ISPs), Tailscale will give you a real public IP to bypass it.

## Step 1: Install Tailscale on Your PC

1. **Download Tailscale**: https://tailscale.com/download
2. Run the installer
3. Sign in with your Google/Apple/Microsoft account
4. Accept the connection

✅ After install, you'll get a Tailscale IP like `100.x.x.x`

---

## Step 2: Enable Subnet Router

This makes your internet available to others:

1. Open Tailscale app
2. Click the **three dots** (top right) → Settings
3. Enable **Subnet Router**
4. Click **Advertise Route** for your internet adapter
   - Look for your active adapter (usually "Ethernet" or "Wi-Fi")
   - Note its IP (e.g., `192.168.1.x`)

---

## Step 3: Get Your Tailscale IP

After installing and logging in:
```bash
tailscale ip -4
```
This returns something like: `100.64.x.x`

---

## Step 4: Share with Users

Tell your users to:
1. Install Tailscale on their phone
2. Log in (same network or allow access)
3. Connect to your subnet

They'll be able to use your internet via the Tailscale network!

---

## Alternative: Use Tailscale as VPN Backend

For a more integrated solution:

1. Install WireGuard AND Tailscale on your PC
2. Use Tailscale's **DERP** servers for connectivity
3. Your users connect via your Tailscale node

---

## Quick Commands

```bash
# Check status
tailscale status

# Get your Tailscale IP  
tailscale ip -4

# Enable subnet routing
tailscale up --advertise-routes

# Allow subnet access from other users
tailscale accept-routes
```

---

## With Tailscale, You Can:

✅ Serve internet to users anywhere  
✅ No port forwarding needed  
✅ Works behind CGNAT  
✅ End-to-end encrypted  
✅ Free for personal use  
