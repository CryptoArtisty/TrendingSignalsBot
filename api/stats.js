// api/stats.js
// Uses Vercel KV for persistent storage (recommended)
// First, install: npm i @vercel/kv

import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // GET request - return current stats
    if (req.method === 'GET') {
        try {
            // Get stats from KV store
            const uniqueUsers = await kv.get('trending_signals_users') || 0;
            const totalSignals = await kv.get('trending_signals_total') || 0;
            const startTime = await kv.get('trending_signals_start') || Date.now();
            
            // Also get recent users count (last 24h) if needed
            const recentUsers = await kv.get('trending_signals_recent') || 0;
            
            return res.status(200).json({
                uniqueUsers,
                totalSignals,
                startTime,
                recentUsers,
                lastUpdated: Date.now(),
                bot: '@TrendingSignalsBot'
            });
        } catch (error) {
            console.error('KV fetch error:', error);
            // Fallback to in-memory if KV fails
            return res.status(200).json({
                uniqueUsers: 0,
                totalSignals: 0,
                startTime: Date.now(),
                bot: '@TrendingSignalsBot'
            });
        }
    }

    // POST request - update stats
    if (req.method === 'POST') {
        try {
            const { action, chatId } = req.body;
            
            if (action === 'increment' && chatId) {
                // Create a hash of the chatId for checking uniqueness
                // This is one-way - we cannot recover the original chatId
                const crypto = require('crypto');
                const hash = crypto.createHash('sha256')
                    .update(chatId + (process.env.SALT || 'trending-signals-salt'))
                    .digest('hex');
                
                // Check if this user has been seen before using KV set with nx (not exists)
                const isNew = await kv.setnx(`user:${hash}`, Date.now());
                
                if (isNew === 1) { // 1 means key was set (new user)
                    await kv.incr('trending_signals_users');
                    
                    // Also track recent users (24h expiry)
                    await kv.sadd('recent_users', hash);
                    await kv.expire('recent_users', 86400); // 24 hours
                    
                    const recentCount = await kv.scard('recent_users');
                    await kv.set('trending_signals_recent', recentCount);
                }
                
                // Get updated counts
                const uniqueUsers = await kv.get('trending_signals_users') || 0;
                const recentUsers = await kv.get('trending_signals_recent') || 0;
                
                return res.status(200).json({ 
                    success: true, 
                    uniqueUsers,
                    recentUsers,
                    isNew: isNew === 1
                });
            }
            
            if (action === 'signal') {
                await kv.incr('trending_signals_total');
                return res.status(200).json({ success: true });
            }
            
            return res.status(400).json({ error: 'Invalid action' });
            
        } catch (error) {
            console.error('Stats update error:', error);
            return res.status(500).json({ error: 'Internal error' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
