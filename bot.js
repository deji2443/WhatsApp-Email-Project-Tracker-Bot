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
// 1. EXPRESS ROUTES (Available immediately)
// ----------------------------------------------------

// Root Healthcheck (Railway checks this)
app.get('/', (req, res) => {
    res.status(200).send('WhatsApp Local Bridge is Running!');
});

// Browser QR Endpoint
app.get('/qr', (req, res) => {
    if (isConnected) {
        return res.type('html').send('<div style="font-family:sans-serif; text-align:center; padding:50px;"><h3>WhatsApp is already connected!</h3></div>');
    }

    if (!latestQr) {
        return res.type('html').send('<div style="font-family:sans-serif; text-align:center; padding:50px;"><h3>QR Code is generating, please refresh in a few seconds...</h3></div>');
    }

    qrcode.toDataURL(latestQr, (err, url) => {
        if (err) {
            return res.status(500).send('Failed to render QR image');
        }
        res.type('html').send(`
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:90vh; font-family:sans-serif;">
                <h2>Scan WhatsApp QR Code</h2>
                <img src="${url}" style="width:300px; height:300px; border:2px solid #333; padding:10px; border-radius:8px;">
                <p>Refresh page if QR code expires.</p>
            </div>
        `);
    });
});

// Webhook for Apps Script
app.post('/send-alert', async(req, res) => {
    const { target, message } = req.body;

    if (!isConnected || !sock) {
        return res.status(503).json({
            success: false,
            error: 'WhatsApp bot is still connecting or authenticating. Please scan the QR code at /qr first.'
        });
    }

    if (!target || !message) {
        return res.status(400).json({ success: false, error: 'Missing target or message payload.' });
    }

    try {
        let recipientJid = target;
        if (!target.includes('@')) {
            recipientJid = `${target}@s.whatsapp.net`;
        }

        await sock.sendMessage(recipientJid, { text: message });
        res.status(200).json({ success: true, status: 'Message sent!' });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ----------------------------------------------------
// 2. START EXPRESS SERVER FIRST
// ----------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[HTTP] Server active on port ${PORT}`);
    // Boot Baileys in background
    connectToWhatsApp().catch(err => console.error('[WhatsApp Startup Error]:', err));
});

// ----------------------------------------------------
// 3. BAILEYS CONNECTION LOGIC
// ----------------------------------------------------
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: ['Railway Bot', 'Chrome', '1.0.0']
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

            try {
                const groups = await sock.groupFetchAllParticipating();
                console.log('--- 📋 YOUR WHATSAPP GROUPS ---');
                for (const [jid, group] of Object.entries(groups)) {
                    console.log(`Group Name: "${group.subject}" ==> JID: ${jid}`);
                }
                console.log('---------------------------------');
            } catch (err) {
                console.log('Could not fetch groups yet:', err.message);
            }
        }

        if (connection === 'close') {
            isConnected = false;
            const statusCode = (lastDisconnect ? .error ? .output) ? .statusCode || 0;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(`[WhatsApp] Closed (Status ${statusCode}). Reconnecting: ${shouldReconnect}`);

            if (shouldReconnect) {
                setTimeout(connectToWhatsApp, 5000);
            }
        }
    });
}