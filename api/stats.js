// api/stats.js
// This stores ONLY anonymous counts, NEVER Chat IDs

// In-memory storage (resets on deployment)
// For production, you might want to use Vercel KV or similar
let stats = {
    uniqueUsers: 0,
    firstSeen: {},
    startTime: Date.now(),
    totalSignals: 0,
    lastUpdated: Date.now()
};

// Simple in-memory store with basic persistence
// Note: This resets on every Vercel deployment
// For production, replace with Vercel KV or database

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
        return res.status(200).json({
            uniqueUsers: stats.uniqueUsers,
            startTime: stats.startTime,
            totalSignals: stats.totalSignals,
            lastUpdated: stats.lastUpdated,
            bot: '@TrendingSignalsBot'
        });
    }

    // POST request - increment stats (anonymous)
    if (req.method === 'POST') {
        try {
            const { action, chatId } = req.body;
            
            // IMPORTANT: We NEVER store the actual chatId
            // We only use it to check if we've seen this user before
            // Then immediately discard it
            
            if (action === 'increment' && chatId) {
                // Create a hash of the chatId for checking uniqueness
                // This is one-way - we cannot recover the original chatId
                const crypto = require('crypto');
                const hash = crypto.createHash('sha256').update(chatId + process.env.SALT || 'trending-signals-salt').digest('hex');
                
                // Check if we've seen this hash before
                if (!stats.firstSeen[hash]) {
                    stats.firstSeen[hash] = Date.now();
                    stats.uniqueUsers++;
                    
                    // Clean up old entries (optional, keep last 1000)
                    const hashes = Object.keys(stats.firstSeen);
                    if (hashes.length > 1000) {
                        const oldest = hashes.sort((a, b) => stats.firstSeen[a] - stats.firstSeen[b])[0];
                        delete stats.firstSeen[oldest];
                    }
                }
                
                stats.lastUpdated = Date.now();
                
                return res.status(200).json({ 
                    success: true, 
                    uniqueUsers: stats.uniqueUsers 
                });
            }
            
            if (action === 'signal') {
                stats.totalSignals++;
                stats.lastUpdated = Date.now();
                return res.status(200).json({ success: true });
            }
            
            return res.status(400).json({ error: 'Invalid action' });
            
        } catch (error) {
            console.error('Stats error:', error);
            return res.status(500).json({ error: 'Internal error' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
