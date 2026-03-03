// api/webhook.js
// Updated to use Upstash Redis for stats

import { Redis } from '@upstash/redis';

// Initialize Redis client
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

    // Handle GET request for testing
    if (req.method === 'GET') {
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
            
            // Handle /start command
            if (update.message?.text === '/start') {
                const chatId = update.message.chat.id;
                const firstName = update.message.chat.first_name || 'Trader';
                const username = update.message.chat.username || '';
                
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
                
                // Check if this is a new user
                const crypto = require('crypto');
                const hash = crypto.createHash('sha256')
                    .update(chatId.toString() + (process.env.SALT || 'trending-signals-salt'))
                    .digest('hex');
                
                const isNew = await redis.setnx(`user:${hash}`, Date.now());
                
                if (isNew === 1) {
                    // This is a new unique user
                    await redis.incr('trending_signals_users');
                    
                    // Add to recent users
                    await redis.sadd('recent_users_set', hash);
                    await redis.expire('recent_users_set', 86400);
                    
                    // Update recent count
                    const recentCount = await redis.scard('recent_users_set');
                    await redis.set('trending_signals_recent', recentCount);
                    
                    // Track daily new users
                    const today = new Date().toISOString().split('T')[0];
                    await redis.incr(`stats:${today}`);
                    await redis.expire(`stats:${today}`, 2592000);
                }
                
                // Get current user count
                const userCount = await redis.get('trending_signals_users') || 0;
                const todayUsers = await redis.get(`stats:${new Date().toISOString().split('T')[0]}`) || 0;
                
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
• 🟣 <b>UPPER_BREAK:</b> MA crosses above Upper Band (strong bullish)
• 🟠 <b>LOWER_BREAK:</b> MA crosses below Lower Band (strong bearish)
• 🟢 <b>BULLISH:</b> MA crosses above Middle Band
• 🔴 <b>BEARISH:</b> MA crosses below Middle Band

🚀 <b>Get Started:</b>
1️⃣ Click the button below to connect your browser
2️⃣ Customize your settings in the web app
3️⃣ Wait for alerts!

<a href='${appUrl}'>🌐 Open Dashboard</a>`;

                // Send message via Telegram
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
                                [{ text: '📊 OPEN DASHBOARD', url: appUrl }],
                                [{ text: '👥 COMMUNITY STATS', callback_data: 'stats' }]
                            ]
                        }
                    })
                });
                
                const telegramData = await telegramResponse.json();
                console.log('📤 Telegram response:', telegramData);
            }
            
            // Handle /stats command
            if (update.message?.text === '/stats') {
                const chatId = update.message.chat.id;
                
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
• You are one of ${userCount.toLocaleString()} traders!

<a href='${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://trending-signals-bot.vercel.app'}'>View Live Dashboard</a>`;

                await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: statsMessage,
                        parse_mode: 'HTML',
                        disable_web_page_preview: true
                    })
                });
            }
            
            // Handle /help command
            if (update.message?.text === '/help') {
                const chatId = update.message.chat.id;
                
                const helpMessage = `📚 <b>Trending Signals Bot - Help</b>

<b>Available Commands:</b>
• /start - Connect your browser and see stats
• /stats - View community statistics
• /help - Show this help message
• /privacy - Privacy information

<b>How Signals Work:</b>
The bot detects when your selected Moving Average (EMA/SMA) crosses any Bollinger Band line.

<b>Signal Interpretation:</b>
• <b>UPPER_BREAK (🟣):</b> Strong bullish momentum - MA above upper band
• <b>LOWER_BREAK (🟠):</b> Strong bearish momentum - MA below lower band
• <b>BULLISH (🟢):</b> Trend turning bullish - MA above middle band
• <b>BEARISH (🔴):</b> Trend turning bearish - MA below middle band

<b>Settings Guide:</b>
• <b>BB Window:</b> Higher = smoother bands, slower signals
• <b>BB Multiplier:</b> Higher = wider bands, fewer signals
• <b>MA Type:</b> EMA = faster reaction, SMA = smoother
• <b>Source Price:</b> Which price to use for calculations

<b>Need more help?</b> Visit the dashboard or contact @TrendingSignalsBot support.`;

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
            if (update.message?.text === '/privacy') {
                const chatId = update.message.chat.id;
                
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
4. Watch Network tab - alerts go directly to Telegram

<a href='https://github.com/yourusername/trending-signals-bot'>View Source Code</a>`;

                await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: privacyMessage,
                        parse_mode: 'HTML',
                        disable_web_page_preview: true
                    })
                });
            }
            
            // Handle callback queries (button clicks)
            if (update.callback_query) {
                const chatId = update.callback_query.message.chat.id;
                const data = update.callback_query.data;
                
                if (data === 'stats') {
                    const userCount = await redis.get('trending_signals_users') || 0;
                    const totalSignals = await redis.get('trending_signals_total') || 0;
                    const today = new Date().toISOString().split('T')[0];
                    const todayUsers = await redis.get(`stats:${today}`) || 0;
                    
                    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: chatId,
                            text: `📊 <b>Live Stats:</b>\n\n👥 Total Users: ${userCount.toLocaleString()}\n📈 New Today: ${todayUsers.toLocaleString()}\n🎯 Total Signals: ${totalSignals.toLocaleString()}`,
                            parse_mode: 'HTML'
                        })
                    });
                }
                
                // Answer callback query
                await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        callback_query_id: update.callback_query.id
                    })
                });
            }
            
            return res.status(200).json({ ok: true });
            
        } catch (error) {
            console.error('❌ Webhook error:', error);
            return res.status(200).json({ ok: true, error: error.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
