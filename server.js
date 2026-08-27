const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    },
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
    }
});

client.on('qr', (qr) => {
    console.log('--- SCAN THIS QR CODE ---');
    qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
    console.log('WhatsApp authenticated successfully!');
});

client.on('ready', () => {
    console.log('WhatsApp Client is ready!');
});

client.on('auth_failure', (msg) => {
    console.error('Authentication failed:', msg);
});

// --- ADD THIS POST ROUTE HERE ---
app.post('/send-alert', async(req, res) => {
    try {
        const { target, message } = req.body;

        if (!target || !message) {
            return res.status(400).json({ success: false, error: 'Missing target or message' });
        }

        console.log(`Sending message to target: ${target}`);

        // Send message using whatsapp-web.js client
        await client.sendMessage(target, message);

        console.log('WhatsApp message sent successfully!');
        res.status(200).json({ success: true, message: 'WhatsApp alert sent successfully' });
    } catch (error) {
        console.error('Error sending WhatsApp message:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

client.initialize();

app.listen(3000, () => {
    console.log('Local bridge running on http://localhost:3000');
});