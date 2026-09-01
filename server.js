import express from 'express';
import pino from 'pino';
import QRCode from 'qrcode';
import {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason
} from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(express.json());

// Bind strictly to Railway's assigned port and host
const PORT = process.env.PORT || 8080;
const AUTH_FOLDER = path.resolve('./auth_info_baileys');

let sock = null;
let currentQr = null;
let isConnected = false;

// ----------------------------------------------------
// 1. EXPRESS HTTP ROUTES
// ----------------------------------------------------

// Healthcheck endpoint for Railway probes
app.get('/', (req, res) => {
    res.status(200).json({
        status: 'online',
        whatsappConnected: isConnected,
        qrAvailable: !!currentQr
    });
});

// View QR Code in browser
app.get('/qr', async(req, res) => {
    if (isConnected) {
        return res.type('html').send('<h3>WhatsApp is already connected and active.</h3>');
    }
    if (!currentQr) {
        return res.type('html').send('<h3>QR Code is generating, please refresh in a few seconds...</h3>');
    }


    try {
        const qrImage = await QRCode.toDataURL(currentQr);
        res.type('html').send(`
      <html>
        <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;">
          <h2>Scan WhatsApp QR Code</h2>
          <img src="${qrImage}" alt="QR Code" style="width:300px;height:300px;"/>
          <p>Refresh the page if the code expires.</p>
        </body>
      </html>
    `);
    } catch (err) {
        res.status(500).send('Error rendering QR Code');
    }
});

// Main Webhook called by Google Apps Script
app.post('/send-alert', async(req, res) => {
    const { target, number, message } = req.body;

    if (!isConnected || !sock) {
        return res.status(503).json({ error: 'WhatsApp socket is not connected yet.' });
    }

    if ((!target && !number) || !message) {
        return res.status(400).json({ error: 'Missing required parameters: target/number or message.' });
    }

    try {
        // Handle both WhatsApp Group JIDs (@g.us) and direct phone numbers
        let recipientJid = target || number;

        if (!recipientJid.includes('@g.us') && !recipientJid.includes('@s.whatsapp.net')) {
            recipientJid = `${recipientJid.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
        }

        await sock.sendMessage(recipientJid, { text: message });
        return res.status(200).json({ success: true, message: 'Notification sent successfully.' });
    } catch (error) {
        console.error('Failed to send WhatsApp message:', error);
        return res.status(500).json({ error: 'Failed to deliver message.' });
    }
});

// ----------------------------------------------------
// 2. LISTEN FIRST (Fixes 502 Bad Gateway)
// ----------------------------------------------------
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[HTTP Server] Running on port ${PORT}`);
    connectToWhatsApp();
});

// ----------------------------------------------------
// 3. BAILEYS INITIALIZATION
// ----------------------------------------------------
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);

    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            currentQr = qr;
            console.log('[WhatsApp] New QR code generated. Access /qr in browser to scan.');
        }

        if (connection === 'open') {
            isConnected = true;
            currentQr = null;
            console.log('[WhatsApp] Connected successfully!');
        }

        if (connection === 'close') {
            isConnected = false;

            const statusCode = lastDisconnect ? .error ? .output ? .statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            console.log(`[WhatsApp] Closed. Status Code: ${statusCode}. Reconnecting: ${shouldReconnect}`);

            if (shouldReconnect) {
                setTimeout(connectToWhatsApp, 5000);
            } else {
                console.log('[WhatsApp] Session logged out. Cleaning up auth folder...');
                if (fs.existsSync(AUTH_FOLDER)) {
                    fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
                }
                setTimeout(connectToWhatsApp, 5000);
            }
        }
    });

}