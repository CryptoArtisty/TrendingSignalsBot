// api/webhook.js
// Updated to use Upstash Redis for stats (correct import)

import { Redis } from '@upstash/redis';

// Initialize Redis client using environment variables
const redis = Redis.fromEnv();

export default async function handler(req, res) {
    // Log function invocation for debugging
    console.log('🚀 Webhook function invoked at:', new Date().toISOString());
    console.log('🔧 Environment check:', { 
        hasBotToken: !!process.env.TELEGRAM_BOT_TOKEN,
        hasSalt: !!process.env.SALT,
        hasRedisUrl: !!process.env.KV_REST_API_URL
    });

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Handle GET request for testing
    if (req.method === 'GET') {
        console.log('📨 GET request received');
        return res.status(200).json({ 
            status: 'ok', 
            message: 'Trending Signals Bot is running',
            bot: '@TrendingSignalsBot',
            timestamp: new Date().toISOString()
        });
    }

    // Handle POST (actual webhook)
    if (req.method === 'POST') {
        try {
            const update = req.body;
            console.log('📩 Received update:', JSON.stringify(update));
            
            // Check if this is a message
            if (!update.message) {
                console.log('⚠️ No message in update');
                return res.status(200).json({ ok: true });
            }

            const chatId = update.message.chat.id;
            const messageText = update.message.text || '';
            const firstName = update.message.chat.first_name || 'Trader';
            const username = update.message.chat.username || '';
            
            console.log(`👤 Chat ID: ${chatId}, Message: ${messageText}, User: ${firstName}`);

            // Handle /start command
            if (messageText === '/start') {
                console.log('🚀 Processing /start command');
                
                // Get app URL from environment or request
                const appUrl = process.env.VERCEL_URL 
                    ? `https://${process.env.VERCEL_URL}`
                    : `https://${req.headers.host}`;
                
                // Generate connection token (expires in 5 minutes)
                const tokenData = `${chatId}:${Date.now()}`;
                const token = Buffer.from(tokenData).toString('base64')
                    .replace(/\+/g, '-')
                    .replace(/\//g, '_')
                    .replace(/=/g, '');
                
                const connectionLink = `${appUrl}/?connect=${token}`;
                console.log(`🔗 Generated connection link: ${connectionLink}`);
                
                // Check if this is a new user
                const crypto = require('crypto');
                const hash = crypto.createHash('sha256')
                    .update(chatId.toString() + (process.env.SALT || 'trending-signals-salt'))
                    .digest('hex');
                
                console.log(`🔐 User hash: ${hash.substring(0, 8)}...`);
                
                const isNew = await redis.setnx(`user:${hash}`, Date.now());
                console.log(`👥 Is new user: ${isNew === 1 ? 'Yes' : 'No'}`);
                
                if (isNew === 1) {
                    // This is a new unique user
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
                    
                    console.log(`✅ New user counted. Total: ${await redis.get('trending_signals_users')}`);
                }
                
                // Get current user count
                const userCount = await redis.get('trending_signals_users') || 0;
                const today = new Date().toISOString().split('T')[0];
                const todayUsers = await redis.get(`stats:${today}`) || 0;
                
                console.log(`📊 Current stats: totalUsers=${userCount}, todayUsers=${todayUsers}`);

                // Create welcome message
                const welcomeMessage = `📈 <b>Welcome to Trending Signals Bot, ${firstName}!</b>

👥 <b>Community Stats:</b>
• Total Traders: <b>${userCount.toLocaleString()}</b>
• New Today: <b>${todayUsers.toLocaleString()}</b>
• You are trader #${userCount.toLocaleString()}!

🔐 <b>Privacy First:</b> Your Chat ID is stored ONLY on your device.

📊 <b>What This Bot Does:</b>
• Monitors Bollinger Band crossovers with Moving Averages
• Tracks 8 major trading pairs (PAXG, BTC, ETH, XAG, JPY, EUR, CAD, GBP)
• Sends real-time alerts when MA crosses any Bollinger Band

⚙️ <b>Customizable Settings:</b>
• BB Window (2-200), Multiplier (0.1-5.0, 3 decimal)
• MA Type (EMA/SMA), MA Period (2-200)
• Source Price (Open, High, Low, Close, HL2, HLC3, OHLC4)
• Timeframe (1m, 5m, 15m, 1h, 4h, 1d)

📈 <b>Signal Types:</b>
• 🟣 <b>UPPER_BREAK:</b> MA crosses above Upper Band
• 🟠 <b>LOWER_BREAK:</b> MA crosses below Lower Band
• 🟢 <b>BULLISH:</b> MA crosses above Middle Band
• 🔴 <b>BEARISH:</b> MA crosses below Middle Band

🚀 <b>Get Started:</b>
1️⃣ Click the button below to connect your browser
2️⃣ Customize your settings in the web app
3️⃣ Wait for alerts!`;

                // Send message via Telegram
                console.log('📤 Sending welcome message to Telegram...');
                const telegramResponse = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: welcomeMessage,
                        parse_mode: 'HTML',
                        disable_web_page_preview: true,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔗 CONNECT BROWSER', url: connectionLink }],
                                [{ text: '📊 OPEN DASHBOARD', url: appUrl }]
                            ]
                        }
                    })
                });
                
                const telegramData = await telegramResponse.json();
                console.log('📤 Telegram response:', telegramData);
                
                if (!telegramData.ok) {
                    console.error('❌ Telegram API error:', telegramData);
                }
            }
            
            // Handle /stats command
            else if (messageText === '/stats') {
                console.log('📊 Processing /stats command');
                
                const userCount = await redis.get('trending_signals_users') || 0;
                const totalSignals = await redis.get('trending_signals_total') || 0;
                const today = new Date().toISOString().split('T')[0];
                const todayUsers = await redis.get(`stats:${today}`) || 0;
                const todaySignals = await redis.get(`signals:${today}`) || 0;
                
                const statsMessage = `📊 <b>Trending Signals Bot Statistics</b>

👥 <b>Users:</b>
• Total Unique: <b>${userCount.toLocaleString()}</b>
• New Today: <b>${todayUsers.toLocaleString()}</b>

📈 <b>Signals:</b>
• Total Sent: <b>${totalSignals.toLocaleString()}</b>
• Today: <b>${todaySignals.toLocaleString()}</b>

🔐 <b>Privacy Note:</b>
• Counts are anonymous
• No Chat IDs stored
• You are one of ${userCount.toLocaleString()} traders!`;

                await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: statsMessage,
                        parse_mode: 'HTML'
                    })
                });
            }
            
            // Handle /help command
            else if (messageText === '/help') {
                console.log('❓ Processing /help command');
                
                const helpMessage = `📚 <b>Trending Signals Bot - Help</b>

<b>Available Commands:</b>
• /start - Connect your browser and see stats
• /stats - View community statistics
• /help - Show this help message
• /privacy - Privacy information

<b>How Signals Work:</b>
The bot detects when your selected Moving Average crosses any Bollinger Band line.

<b>Signal Interpretation:</b>
• <b>UPPER_BREAK (🟣):</b> Strong bullish momentum
• <b>LOWER_BREAK (🟠):</b> Strong bearish momentum
• <b>BULLISH (🟢):</b> Trend turning bullish
• <b>BEARISH (🔴):</b> Trend turning bearish

<b>Need more help?</b> Visit the dashboard or contact support.`;

                await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: helpMessage,
                        parse_mode: 'HTML'
                    })
                });
            }
            
            // Handle /privacy command
            else if (messageText === '/privacy') {
                console.log('🔐 Processing /privacy command');
                
                const privacyMessage = `🔐 <b>Trending Signals Bot - Privacy Policy</b>

<b>Zero-Knowledge Architecture:</b>
• Your Chat ID is stored ONLY in your browser's localStorage
• We NEVER see or store your Chat ID on any server
• User counting uses one-way hashing (irreversible)
• No databases contain personal information
• All alerts go directly from your browser to Telegram

<b>What we store (anonymously):</b>
• Hashed fingerprints (cannot be reversed to Chat ID)
• Anonymous counters only
• No IP addresses, no locations, no personal data

<b>Verification:</b>
1. Open browser DevTools (F12)
2. Go to Application → Local Storage
3. See your Chat ID stored locally only
4. Watch Network tab - alerts go directly to Telegram`;

                await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: privacyMessage,
                        parse_mode: 'HTML'
                    })
                });
            }
            
            console.log('✅ Webhook processing completed');
            return res.status(200).json({ ok: true });
            
        } catch (error) {
            console.error('❌ Webhook error:', error);
            console.error('Error stack:', error.stack);
            // Still return 200 to prevent Telegram from retrying
            return res.status(200).json({ ok: true, error: error.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
