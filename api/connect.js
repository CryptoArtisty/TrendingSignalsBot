// api/connect.js
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const { token } = req.query;
        
        if (!token) {
            return res.status(400).json({ valid: false, error: 'Token required' });
        }
        
        try {
            const base64 = token.replace(/-/g, '+').replace(/_/g, '/');
            const paddedBase64 = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
            const decoded = Buffer.from(paddedBase64, 'base64').toString();
            
            if (!decoded.includes(':')) {
                return res.status(400).json({ valid: false });
            }
            
            const [chatId, timestamp] = decoded.split(':');
            const tokenAge = Date.now() - parseInt(timestamp);
            const isValid = tokenAge < 300000; // 5 minutes
            
            return res.status(200).json({ 
                valid: isValid,
                expiresIn: isValid ? Math.floor((300000 - tokenAge) / 1000) : 0,
                bot: '@TrendingSignalsBot'
            });
            
        } catch (e) {
            return res.status(400).json({ valid: false });
        }
        
    } catch (error) {
        return res.status(500).json({ error: 'Internal error' });
    }
}
