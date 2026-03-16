/**
 * Built-in Proxy Server
 * Allows users to connect to internet through this PC without needing Tailscale
 * Uses SOCKS5 protocol - supported natively by Android and iOS
 */

const net = require('net');
const http = require('http');
const { exec } = require('child_process');

// Configuration
const PROXY_PORT = process.env.PROXY_PORT || 1080;
const PROXY_HOST = '0.0.0.0';

// Active connections
const connections = new Map();
let server = null;

// Get local IP address
function getLocalIP() {
    return new Promise((resolve) => {
        exec('ipconfig', (error, stdout) => {
            const lines = stdout.split('\n');
            for (const line of lines) {
                const match = line.match(/IPv4.*?:\s*(\d+\.\d+\.\d+\.\d+)/);
                if (match) {
                    const ip = match[1];
                    // Skip local and virtual IPs
                    if (ip.startsWith('192.168.') || ip.startsWith('10.')) {
                        resolve(ip);
                        return;
                    }
                }
            }
            resolve('192.168.1.100');
        });
    });
}

// Simple HTTP proxy handler
function handleProxyRequest(clientSocket, request) {
    // Parse the HTTP CONNECT request
    const [method, url] = request.split(' ');
    
    if (method === 'CONNECT') {
        // HTTPS proxy - connect to the target host:port
        const [targetHost, targetPort] = url.split(':');
        const port = parseInt(targetPort) || 443;
        
        console.log(`[Proxy] CONNECT to ${targetHost}:${port}`);
        
        // Create connection to target
        const targetSocket = net.createConnection(port, targetHost, () => {
            // Send 200 Connection Established
            clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
            
            // Pipe data both ways
            targetSocket.pipe(clientSocket);
            clientSocket.pipe(targetSocket);
        });
        
        targetSocket.on('error', (err) => {
            console.error(`[Proxy] Target error: ${err.message}`);
            clientSocket.end();
        });
        
    } else {
        // HTTP proxy - extract host from request
        const hostMatch = request.match(/Host:\s*([^\r\n]+)/);
        if (hostMatch) {
            const [targetHost, targetPort] = hostMatch[1].split(':');
            const port = parseInt(targetPort) || 80;
            
            const targetSocket = net.createConnection(port, targetHost, () => {
                targetSocket.write(request);
                targetSocket.pipe(clientSocket);
                clientSocket.pipe(targetSocket);
            });
            
            targetSocket.on('error', (err) => {
                console.error(`[Proxy] HTTP target error: ${err.message}`);
                clientSocket.end();
            });
        } else {
            clientSocket.end();
        }
    }
}

// Start the HTTP/SOCKS proxy server
function startProxyServer() {
    server = net.createServer((clientSocket) => {
        const clientId = Date.now();
        connections.set(clientId, { 
            connected: Date.now(),
            remoteAddress: clientSocket.remoteAddress 
        });
        
        console.log(`[Proxy] New connection from ${clientSocket.remoteAddress}`);
        
        let buffer = '';
        
        clientSocket.on('data', (data) => {
            buffer += data.toString();
            
            // Check if we have enough data to determine request type
            if (buffer.includes('\r\n\r\n')) {
                // Process the request
                handleProxyRequest(clientSocket, buffer);
                buffer = '';
            }
        });
        
        clientSocket.on('error', (err) => {
            console.error('[Proxy] Client error:', err.message);
            connections.delete(clientId);
        });
        
        clientSocket.on('close', () => {
            connections.delete(clientId);
            // console.log(`[Proxy] Connection closed: ${clientId}`);
        });
    });
    
    server.listen(PROXY_PORT, PROXY_HOST, async () => {
        const localIP = await getLocalIP();
        console.log(`[Proxy] HTTP Proxy server running on ${PROXY_HOST}:${PROXY_PORT}`);
        console.log(`[Proxy] Local IP: ${localIP}`);
        console.log('[Proxy] Users can connect directly through this proxy!');
    });
    
    server.on('error', (err) => {
        console.error('[Proxy] Server error:', err.message);
    });
    
    return server;
}

// Get proxy status
async function getProxyStatus() {
    const localIP = await getLocalIP();
    return {
        running: true,
        type: 'http',
        host: localIP,
        port: PROXY_PORT,
        connections: connections.size,
        // Get public IP for external access
        publicIP: await getPublicIP()
    };
}

// Get public IP (for remote access)
function getPublicIP() {
    return new Promise((resolve) => {
        const https = require('https');
        https.get('https://api.ipify.org?format=json', (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json.ip);
                } catch {
                    resolve('Unable to get public IP');
                }
            });
        }).on('error', () => resolve('Unable to get public IP'));
    });
}

// Stop proxy server
function stopProxyServer() {
    if (server) {
        server.close();
        server = null;
        connections.clear();
        console.log('[Proxy] Proxy server stopped');
    }
}

module.exports = {
    startProxyServer,
    stopProxyServer,
    getProxyStatus,
    getLocalIP,
    PROXY_PORT
};
