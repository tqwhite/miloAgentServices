#!/usr/bin/env node
'use strict';

/**
 * Conway Entry Point
 *
 * On Conway there's no nginx. This script:
 * 1. Starts the API server on an internal port (7792)
 * 2. Serves the Nuxt static frontend on port 3000
 * 3. Proxies /api/* requests to the API server
 */

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const { spawn } = require('child_process');
const { paymentMiddleware } = require('x402-express');

const PUBLIC_PORT = 3000;
const API_PORT = 7792;
const STATIC_DIR = path.join(__dirname, 'html/.output/public');

// Start the API server as a child process
const apiServer = spawn('node', ['startApiServer.js'], {
    cwd: path.join(__dirname, 'server'),
    stdio: 'inherit',
    env: { ...process.env }
});

apiServer.on('error', (err) => {
    console.error('Failed to start API server:', err);
    process.exit(1);
});

// Give API server a moment to start
setTimeout(() => {
    const app = express();

    // Private bypass — unlisted endpoint for internal use
    // Flags the request to skip x402, then rewrites URL for the backend proxy
    app.post('/api/private/askTheChorus', (req, res, next) => {
        req._skipPaywall = true;
        req.url = '/api/askTheChorus';
        req.originalUrl = '/api/askTheChorus';
        next();
    });

    // x402 paywall — $1.00 USDC on Base for public askTheChorus
    // Private bypass requests (flagged above) skip the paywall
    const x402 = paymentMiddleware(
        '0xDE0629429672D395A93F9a22840fd43cCb01F219',
        {
            '/api/askTheChorus': {
                price: '$1.00',
                network: 'eip155:8453',
                config: {
                    description: 'AI Chorus of Experts analysis'
                }
            }
        }
    );
    app.use((req, res, next) => {
        if (req._skipPaywall) return next();
        x402(req, res, next);
    });

    // Proxy /api/* to the backend — keep the /api prefix intact
    app.use('/api', createProxyMiddleware({
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: true,
        pathRewrite: (path) => `/api${path}`,
    }));

    // Nuxt hashed assets - cache forever
    app.use('/_nuxt', express.static(path.join(STATIC_DIR, '_nuxt'), {
        maxAge: '1y',
        immutable: true,
    }));

    // Static files
    app.use(express.static(STATIC_DIR));

    // SPA fallback - Express 5 requires named param for wildcard
    app.get('{*path}', (req, res) => {
        res.sendFile(path.join(STATIC_DIR, 'index.html'));
    });

    app.listen(PUBLIC_PORT, () => {
        console.log(`Conway frontend serving on port ${PUBLIC_PORT}`);
        console.log(`API proxied to 127.0.0.1:${API_PORT}`);
        console.log(`Static files from ${STATIC_DIR}`);
    });
}, 3000);

// Clean shutdown
process.on('SIGTERM', () => {
    apiServer.kill();
    process.exit(0);
});
process.on('SIGINT', () => {
    apiServer.kill();
    process.exit(0);
});
