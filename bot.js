const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const express = require('express');
const bodyParser = require('body-parser');
const qrcodeTerminal = require('qrcode-terminal'); // Renamed to avoid name collision
const qrcode = require('qrcode'); // For generating browser image

const app = express();
app.use(bodyParser.json());

let sock;
let latestQr = ''; // Stores the latest raw QR string

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async(update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            latestQr = qr; // Save raw QR for the /qr web endpoint
            console.log('--- SCAN THIS QR CODE ---');
            qrcodeTerminal.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const statusCode = (lastDisconnect && lastDisconnect.error && lastDisconnect.error.output) ? lastDisconnect.error.output.statusCode : 0;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed. Reconnecting...', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            latestQr = ''; // Clear QR string once authenticated
            console.log('WhatsApp connection opened successfully!');

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
    });

    sock.ev.on('messages.upsert', async({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;

        const remoteJid = msg.key.remoteJid;
        if (remoteJid && remoteJid.endsWith('@g.us')) {
            console.log(`💬 Found Group JID: ${remoteJid}`);
        }
    });
}

// Start the WhatsApp socket connection
connectToWhatsApp();

// Endpoint to view QR code in browser
app.get('/qr', (req, res) => {
    if (!latestQr) {
        return res.send('<div style="font-family:sans-serif; text-align:center; padding:50px;"><h3>No QR code available. Bot is either already authenticated or starting up.</h3></div>');
    }

    qrcode.toDataURL(latestQr, (err, url) => {
        if (err) {
            return res.status(500).send('Failed to render QR image');
        }
        res.send(`
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:90vh; font-family:sans-serif;">
                <h2>Scan WhatsApp QR Code</h2>
                <img src="${url}" style="width:300px; height:300px; border:2px solid #333; padding:10px; border-radius:8px;">
                <p>Refresh page if QR code expires.</p>
            </div>
        `);
    });
});

// Express endpoint to send messages
app.post('/send-alert', async(req, res) => {
    const { target, message } = req.body;

    if (!sock || !sock.user) {
        return res.status(503).json({
            success: false,
            error: 'WhatsApp bot is still connecting or authenticating. Please try again in a few seconds.'
        });
    }

    try {
        let recipientJid = target;
        if (!target.includes('@')) {
            recipientJid = `${target}@s.whatsapp.net`;
        }

        await sock.sendMessage(recipientJid, { text: message });
        res.status(200).send({ success: true, status: 'Message sent to group/chat!' });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).send({ success: false, error: error.message });
    }
});

app.get('/', (req, res) => {
    res.send('WhatsApp Local Bridge is Running!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Local bridge running on port ${PORT}`);
});