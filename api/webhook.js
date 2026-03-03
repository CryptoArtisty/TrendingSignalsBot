// api/webhook.js
// Updated to use secure stats API

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
                
                // Get app URL
                const appUrl = process.env.VERCEL_URL 
                    ? `https://${process.env.VERCEL_URL}`
                    : 'https://your-app.vercel.app';
                
                // Generate connection token
                const tokenData = `${chatId}:${Date.now()}`;
                const token = Buffer.from(tokenData).toString('base64')
                    .replace(/\+/g, '-')
                    .replace(/\//g, '_')
                    .replace(/=/g, '');
                
                const connectionLink = `${appUrl}/?connect=${token}`;
                
                // Increment user count (secure, anonymous)
                const crypto = require('crypto');
                const hash = crypto.createHash('sha256')
                    .update(chatId.toString() + (process.env.SALT || 'trending-signals-salt'))
                    .digest('hex');
                
                const isNew = await kv.setnx(`user:${hash}`, Date.now());
                if (isNew === 1) {
                    await kv.incr('trending_signals_users');
                }
                
                // Get current user count
                const userCount = await kv.get('trending_signals_users') || 0;
                
                const welcomeMessage = `📈 <b>Welcome to Trending Signals Bot, ${firstName}!</b>

👥 <b>Community:</b> You are trader #${userCount.toLocaleString()}!

🔐 <b>Privacy First:</b> Your Chat ID is stored ONLY on your device.

📊 <b>What This Bot Does:</b>
• Monitors Bollinger Band crossovers with Moving Averages
• Tracks 8 major trading pairs
• Sends real-time alerts when MA crosses any Bollinger Band

⚙️ <b>Customizable Settings:</b>
• BB Window, Multiplier, MA Type/Period, Source Price
• Timeframe: 1m, 5m, 15m, 1h, 4h, 1d

📈 <b>Signal Types:</b>
• 🟣 UPPER_BREAK: MA above Upper Band
• 🟠 LOWER_BREAK: MA below Lower Band
• 🟢 BULLISH: MA above Middle Band
• 🔴 BEARISH: MA below Middle Band

🚀 <b>Get Started:</b>
1️⃣ Click the button below to connect your browser
2️⃣ Customize settings in the web app
3️⃣ Wait for alerts!

<a href='${appUrl}'>Open Dashboard</a>`;

                // Send message via Telegram
                await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: welcomeMessage,
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔗 CONNECT BROWSER', url: connectionLink }],
                                [{ text: '📊 Open Dashboard', url: appUrl }]
                            ]
                        }
                    })
                });
            }
            
            return res.status(200).json({ ok: true });
            
        } catch (error) {
            console.error('❌ Webhook error:', error);
            return res.status(200).json({ ok: true });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
