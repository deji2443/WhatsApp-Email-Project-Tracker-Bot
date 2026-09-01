import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import pino from 'pino';
import express from 'express';
import bodyParser from 'body-parser';
import qrcodeTerminal from 'qrcode-terminal';
import qrcode from 'qrcode';

const app = express();
app.use(bodyParser.json());

let sock = null;
let latestQr = '';
let isConnected = false;

// ----------------------------------------------------
// 1. EXPRESS ROUTES
// ----------------------------------------------------

app.get('/', (req, res) => {
    res.status(200).send('WhatsApp Local Bridge is Running!');
});

app.get('/qr', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');

    if (isConnected) {
        return res.type('html').send(`
            <div style="font-family:sans-serif; text-align:center; padding:50px;">
                <h3 style="color: #2e7d32;">WhatsApp is connected and active!</h3>
            </div>
        `);
    }

    if (!latestQr) {
        return res.type('html').send(`
            <div style="font-family:sans-serif; text-align:center; padding:50px;">
                <h3>QR Code is generating, please refresh in 5 seconds...</h3>
            </div>
        `);
    }

    qrcode.toDataURL(latestQr, (err, url) => {
        if (err) {
            return res.status(500).send('Failed to render QR image');
        }
        res.type('html').send(`
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:90vh; font-family:sans-serif;">
                <h2 style="margin-bottom:20px;">Scan WhatsApp QR Code</h2>
                <img src="${url}" style="width:300px; height:300px; border:2px solid #ccc; padding:15px; border-radius:12px; background:#fff;">
                <p style="margin-top:15px; color:#666;">Refresh the page if the QR code expires or fails to pair.</p>
            </div>
        `);
    });
});

// Dedicated route to fetch group JIDs on demand without spamming startup
app.get('/groups', async(req, res) => {
    if (!isConnected || !sock) {
        return res.status(503).json({ success: false, error: 'WhatsApp is disconnected.' });
    }
    try {
        const groups = await sock.groupFetchAllParticipating();
        const groupList = Object.entries(groups).map(([jid, group]) => ({
            name: group.subject,
            jid: jid
        }));
        res.status(200).json({ success: true, groups: groupList });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/send-alert', async(req, res) => {
    const { target, message } = req.body;

    if (!isConnected || !sock) {
        return res.status(503).json({
            success: false,
            error: 'WhatsApp bot is offline. Please scan the QR code at /qr first.'
        });
    }

    if (!target || !message) {
        return res.status(400).json({ success: false, error: 'Missing target or message payload.' });
    }

    try {
        let recipientJid = target.toString().trim();
        if (!recipientJid.includes('@')) {
            recipientJid = `${recipientJid}@s.whatsapp.net`;
        }

        await sock.sendMessage(recipientJid, { text: message });
        res.status(200).json({ success: true, status: 'Message sent!' });
    } catch (error) {
        console.error('[WhatsApp Send Error]:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ----------------------------------------------------
// 2. START SERVER
// ----------------------------------------------------
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[HTTP] Server active on port ${PORT}`);
    connectToWhatsApp().catch(err => console.error('[WhatsApp Startup Error]:', err));
});

// ----------------------------------------------------
// 3. BAILEYS CONNECTION MANAGER
// ----------------------------------------------------
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    if (sock) {
        sock.ev.removeAllListeners();
    }

    sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: ['Railway Bot', 'Chrome', '1.0.0'],
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 10000
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async(update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            latestQr = qr;
            console.log('[WhatsApp] New QR generated. Access /qr to scan.');
            qrcodeTerminal.generate(qr, { small: true });
        }

        if (connection === 'open') {
            latestQr = '';
            isConnected = true;
            console.log('[WhatsApp] Connection opened successfully!');
        }

        if (connection === 'close') {
            isConnected = false;
            const statusCode = (lastDisconnect && lastDisconnect.error && lastDisconnect.error.output) ?
                lastDisconnect.error.output.statusCode :
                0;

            console.log(`[WhatsApp] Connection closed (Reason: ${statusCode}). Reconnecting...`);

            // Reason 440 means session replaced by another client instance
            if (statusCode === DisconnectReason.connectionReplaced) {
                console.log('[WhatsApp] Session replaced! Another process is running with this account.');
                return;
            }

            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                setTimeout(connectToWhatsApp, 5000);
            }
        }
    });
}