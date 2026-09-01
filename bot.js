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
    // Prevent browser caching so you always get the newest QR code
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');

    if (isConnected) {
        return res.type('html').send(`
            <div style="font-family:sans-serif; text-align:center; padding:50px;">
                <h3 style="color: #2e7d32;">WhatsApp is already connected!</h3>
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
// 2. START SERVER
// ----------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[HTTP] Server active on port ${PORT}`);
    connectToWhatsApp().catch(err => console.error('[WhatsApp Startup Error]:', err));
});

// ----------------------------------------------------
// 3. BAILEYS CONNECTION
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
            const statusCode = (lastDisconnect && lastDisconnect.error && lastDisconnect.error.output) ?
                lastDisconnect.error.output.statusCode :
                0;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(`[WhatsApp] Closed (Status ${statusCode}). Reconnecting: ${shouldReconnect}`);

            if (shouldReconnect) {
                setTimeout(connectToWhatsApp, 5000);
            }
        }
    });
}