// api/stats.js
// Using Upstash Redis for persistent storage (correct import)

import { Redis } from '@upstash/redis';

// Initialize Redis client using environment variables from connected database
const redis = Redis.fromEnv();

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
            console.log('📊 Stats GET request received');
            
            // Get stats from Redis
            const uniqueUsers = await redis.get('trending_signals_users') || 0;
            const totalSignals = await redis.get('trending_signals_total') || 0;
            const startTime = await redis.get('trending_signals_start') || Date.now();
            
            // Get recent users count (last 24h)
            const recentUsers = await redis.get('trending_signals_recent') || 0;
            
            // Get today's new users
            const today = new Date().toISOString().split('T')[0];
            const todayUsers = await redis.get(`stats:${today}`) || 0;
            
            console.log(`📊 Stats: uniqueUsers=${uniqueUsers}, totalSignals=${totalSignals}`);
            
            return res.status(200).json({
                uniqueUsers,
                totalSignals,
                startTime,
                recentUsers,
                todayUsers,
                lastUpdated: Date.now(),
                bot: '@TrendingSignalsBot'
            });
        } catch (error) {
            console.error('❌ Redis fetch error:', error);
            // Fallback if Redis fails
            return res.status(200).json({
                uniqueUsers: 0,
                totalSignals: 0,
                startTime: Date.now(),
                recentUsers: 0,
                todayUsers: 0,
                bot: '@TrendingSignalsBot'
            });
        }
    }

    // POST request - update stats
    if (req.method === 'POST') {
        try {
            const { action, chatId } = req.body;
            console.log(`📊 Stats POST request: action=${action}, chatId provided=${!!chatId}`);
            
            if (action === 'increment' && chatId) {
                // Create a hash of the chatId for checking uniqueness
                // This is one-way - we cannot recover the original chatId
                const crypto = require('crypto');
                const hash = crypto.createHash('sha256')
                    .update(chatId.toString() + (process.env.SALT || 'trending-signals-salt'))
                    .digest('hex');
                
                console.log(`🔐 Generated hash for user: ${hash.substring(0, 8)}...`);
                
                // Check if this user has been seen before using Redis SETNX (set if not exists)
                const userKey = `user:${hash}`;
                const isNew = await redis.setnx(userKey, Date.now());
                
                if (isNew === 1) { // 1 means key was set (new user)
                    console.log('✨ New unique user detected!');
                    
                    // Increment total users
                    await redis.incr('trending_signals_users');
                    
                    // Add to recent users set with 24h expiry
                    await redis.sadd('recent_users_set', hash);
                    await redis.expire('recent_users_set', 86400); // 24 hours
                    
                    // Update recent count
                    const recentCount = await redis.scard('recent_users_set');
                    await redis.set('trending_signals_recent', recentCount);
                    
                    // Track daily new users
                    const today = new Date().toISOString().split('T')[0];
                    await redis.incr(`stats:${today}`);
                    await redis.expire(`stats:${today}`, 2592000); // 30 days
                    
                    console.log(`✅ User count incremented. New recent count: ${recentCount}`);
                } else {
                    console.log('👋 Returning user detected');
                }
                
                // Get updated counts
                const uniqueUsers = await redis.get('trending_signals_users') || 0;
                const recentUsers = await redis.get('trending_signals_recent') || 0;
                const today = new Date().toISOString().split('T')[0];
                const todayUsers = await redis.get(`stats:${today}`) || 0;
                
                return res.status(200).json({ 
                    success: true, 
                    uniqueUsers,
                    recentUsers,
                    todayUsers,
                    isNew: isNew === 1
                });
            }
            
            if (action === 'signal') {
                console.log('📈 Signal count increment requested');
                
                // Increment total signals counter
                await redis.incr('trending_signals_total');
                
                // Also track daily signals
                const today = new Date().toISOString().split('T')[0];
                await redis.incr(`signals:${today}`);
                await redis.expire(`signals:${today}`, 2592000); // 30 days
                
                return res.status(200).json({ success: true });
            }
            
            return res.status(400).json({ error: 'Invalid action' });
            
        } catch (error) {
            console.error('❌ Stats update error:', error);
            return res.status(500).json({ error: 'Internal error' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
