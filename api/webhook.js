// api/webhook.js
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
                
                // Your Vercel URL
                const appUrl = process.env.VERCEL_URL 
                    ? `https://${process.env.VERCEL_URL}`
                    : 'https://your-app.vercel.app'; // Replace with your actual URL
                
                // Generate connection token (expires in 5 minutes)
                const tokenData = `${chatId}:${Date.now()}`;
                const token = Buffer.from(tokenData).toString('base64')
                    .replace(/\+/g, '-')
                    .replace(/\//g, '_')
                    .replace(/=/g, '');
                
                const connectionLink = `${appUrl}/?connect=${token}`;
                
                console.log('🔗 Generated link:', connectionLink);
                
                // Welcome message for @TrendingSignalsBot
                const welcomeMessage = `📈 <b>Welcome to Trending Signals Bot, ${firstName}!</b>

🔐 <b>Privacy First:</b> Your Chat ID is stored ONLY on your device.

📊 <b>What This Bot Does:</b>
• Monitors Bollinger Band crossovers with Moving Averages
• Tracks 8 major trading pairs (PAXG, BTC, ETH, XAG, JPY, EUR, CAD, GBP)
• Sends real-time alerts when MA crosses any Bollinger Band

⚙️ <b>Customizable Settings:</b>
• <b>BB Window:</b> Period for Bollinger Bands (2-200)
• <b>BB Multiplier:</b> Standard deviation multiplier (0.1-5.0, 3 decimal precision)
• <b>MA Type:</b> EMA (Exponential) or SMA (Simple)
• <b>MA Period:</b> Moving Average period (2-200)
• <b>Source Price:</b> Open, High, Low, Close, HL2, HLC3, OHLC4
• <b>Timeframe:</b> 1m, 5m, 15m, 1h, 4h, 1d

📈 <b>Signal Types:</b>
• 🟣 <b>UPPER_BREAK:</b> MA crosses above Upper Band (strong bullish)
• 🟠 <b>LOWER_BREAK:</b> MA crosses below Lower Band (strong bearish)
• 🟢 <b>BULLISH:</b> MA crosses above Middle Band
• 🔴 <b>BEARISH:</b> MA crosses below Middle Band

🚀 <b>Get Started:</b>
1️⃣ Click the button below to connect your browser
2️⃣ Customize your settings in the web app
3️⃣ Wait for alerts!

👥 <b>Community:</b> Join ${await getUserCount()} other traders using Trending Signals!

❓ <b>Commands:</b>
/start - Connect your browser
/help - Show help
/settings - Settings guide
/stats - Bot statistics
/privacy - Privacy information`;

                const telegramResponse = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: welcomeMessage,
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: '🔗 CONNECT BROWSER', url: connectionLink }
                                ],
                                [
                                    { text: '📊 Dashboard', url: appUrl },
                                    { text: '⚙️ Settings', url: `${appUrl}#settings` }
                                ],
                                [
                                    { text: '👥 User Stats', callback_data: 'stats' },
                                    { text: '❓ Help', callback_data: 'help' }
                                ]
                            ]
                        }
                    })
                });
                
                const telegramData = await telegramResponse.json();
                console.log('📤 Telegram response:', telegramData);
            }
            
            // Handle /help command
            if (update.message?.text === '/help') {
                const chatId = update.message.chat.id;
                
                const helpMessage = `📚 <b>Trending Signals Bot - Help</b>

<b>Available Commands:</b>
• /start - Connect your browser
• /help - Show this help
• /settings - Settings guide
• /stats - Bot statistics
• /privacy - Privacy info

<b>How Signals Work:</b>
The bot detects when your selected Moving Average (EMA/SMA) crosses any Bollinger Band line.

<b>Signal Interpretation:</b>
• <b>UPPER_BREAK (🟣):</b> Strong bullish momentum
• <b>LOWER_BREAK (🟠):</b> Strong bearish momentum
• <b>BULLISH (🟢):</b> Trend turning bullish
• <b>BEARISH (🔴):</b> Trend turning bearish

<b>Settings Guide:</b>
• <b>BB Window:</b> Higher = smoother bands
• <b>BB Multiplier:</b> Higher = wider bands
• <b>MA Type:</b> EMA = faster, SMA = smoother
• <b>Source Price:</b> Which price to use for calculations

<b>Troubleshooting:</b>
• No alerts? Check cooldown settings
• Wrong prices? Refresh dashboard
• Not connecting? Click button again`;

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
            
            // Handle /settings command
            if (update.message?.text === '/settings') {
                const chatId = update.message.chat.id;
                
                const settingsMessage = `⚙️ <b>Trending Signals Bot - Settings Guide</b>

<b>In the web app, you can customize:</b>

📊 <b>Bollinger Bands:</b>
• <b>Window Size:</b> 2-200 periods (default: 20)
  Higher = smoother bands, slower signals
• <b>Multiplier:</b> 0.1-5.0 (3 decimal places, default: 2.000)
  Higher = wider bands, fewer signals

📈 <b>Moving Average:</b>
• <b>MA Type:</b> EMA (Exponential) or SMA (Simple)
  EMA reacts faster to price changes
• <b>MA Period:</b> 2-200 (default: 20)
• <b>Source Price:</b> Open, High, Low, Close, HL2, HLC3, OHLC4

⏱️ <b>Other Settings:</b>
• <b>Timeframe:</b> 1m, 5m, 15m, 1h, 4h, 1d
• <b>Alert Cooldown:</b> 5-3600 seconds

<b>Pro Tips:</b>
• Start with default settings (20, 2.000)
• Lower multiplier (1.500) for more signals
• Higher multiplier (2.500) for stronger signals
• Use HL2 or OHLC4 for smoother price source`;

                await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: settingsMessage,
                        parse_mode: 'HTML'
                    })
                });
            }
            
            // Handle /stats command
            if (update.message?.text === '/stats') {
                const chatId = update.message.chat.id;
                
                // Fetch user count from stats API
                const statsResponse = await fetch(`${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://your-app.vercel.app'}/api/stats`);
                const stats = await statsResponse.json();
                
                const statsMessage = `📊 <b>Trending Signals Bot Statistics</b>

👥 <b>Community:</b>
• Unique Users: ${stats.uniqueUsers || 0}
• You are one of ${stats.uniqueUsers || 0} traders!

📈 <b>Bot Activity:</b>
• Started: ${new Date(stats.startTime || Date.now()).toLocaleDateString()}
• Signals sent: ${stats.totalSignals || 0}

🔐 <b>Privacy Note:</b>
• User count tracks unique first-time /start commands only
• No Chat IDs are stored on the server
• Your privacy is fully protected

Thank you for being part of our trading community! 🚀`;

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
            
            // Handle /privacy command
            if (update.message?.text === '/privacy') {
                const chatId = update.message.chat.id;
                
                const privacyMessage = `🔐 <b>Trending Signals Bot - Privacy Policy</b>

<b>Zero-Knowledge Architecture:</b>
• Your Chat ID is stored ONLY in your browser's localStorage
• We NEVER see or store your Chat ID on any server
• No databases, no logging of personal data
• All alerts go directly from your browser to Telegram
• User count tracks ONLY first-time /start commands

<b>What we see:</b>
• Anonymous usage statistics (counts only)
• Error logs (no personal data)

<b>What we NEVER see:</b>
❌ Your Chat ID
❌ Your trading activity
❌ Your IP address
❌ Any personal information

<b>Verification:</b>
1. Open browser DevTools (F12)
2. Go to Application → Local Storage
3. See your Chat ID stored locally only
4. Watch Network tab - alerts go directly to Telegram

<a href='https://github.com/yourusername/TrendingSignalsBot'>View Source Code</a>`;

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
                    const statsResponse = await fetch(`${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://your-app.vercel.app'}/api/stats`);
                    const stats = await statsResponse.json();
                    
                    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: chatId,
                            text: `📊 <b>Current Statistics:</b>\n\n👥 Unique Users: ${stats.uniqueUsers || 0}`,
                            parse_mode: 'HTML'
                        })
                    });
                }
                
                if (data === 'help') {
                    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: chatId,
                            text: '📚 Use /help for detailed instructions.',
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

// Helper function to get user count (simplified)
async function getUserCount() {
    try {
        const response = await fetch(`${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://your-app.vercel.app'}/api/stats`);
        const data = await response.json();
        return data.uniqueUsers || 0;
    } catch {
        return 0;
    }
}
