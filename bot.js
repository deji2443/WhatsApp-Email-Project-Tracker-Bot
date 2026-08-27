const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const express = require('express');
const bodyParser = require('body-parser');
const qrcode = require('qrcode-terminal');

const app = express();
app.use(bodyParser.json());

let sock;

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
            console.log('--- SCAN THIS QR CODE ---');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const statusCode = (lastDisconnect && lastDisconnect.error && lastDisconnect.error.output) ? lastDisconnect.error.output.statusCode : 0;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed. Reconnecting...', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
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

// Express endpoint to send messages (with safety guard for sock.user)
app.post('/send-alert', async(req, res) => {
    const { target, message } = req.body;

    // Ensure the socket and user authentication are fully ready
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

app.listen(3000, () => {
    console.log('Local bridge running on http://localhost:3000');
});