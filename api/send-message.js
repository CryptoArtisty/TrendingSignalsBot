// api/send-message.js
// Secure endpoint for sending Telegram messages (token never in browser)

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { chatId, message } = req.body;

        if (!chatId || !message) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Get bot token from environment (safe on server)
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        
        if (!botToken) {
            console.error('TELEGRAM_BOT_TOKEN not configured');
            return res.status(500).json({ error: 'Bot not configured' });
        }

        // Send message to Telegram
        const telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'HTML',
                disable_web_page_preview: true
            })
        });

        const telegramData = await telegramResponse.json();

        if (telegramData.ok) {
            return res.status(200).json({ ok: true });
        } else {
            console.error('Telegram API error:', telegramData);
            return res.status(500).json({ 
                ok: false, 
                error: 'Failed to send message' 
            });
        }

    } catch (error) {
        console.error('Server error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
