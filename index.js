import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import admin from 'firebase-admin';
import qrcode from 'qrcode-terminal';

// 1. INISIALISASI FIREBASE ADMIN
// Menggunakan URL database milik Anda
const databaseURL = "https://firebasedatabase.app";

admin.initializeApp({
    credential: admin.credential.applicationDefault(), // Otomatis membaca token saat di-deploy di cloud
    databaseURL: databaseURL
});

const db = admin.database();
const botStatusRef = db.ref('bot/status');
const botCommandRef = db.ref('bot/command');
const botLogRef = db.ref('bot/log');

let sock = null;
let isBotRunning = false;

// Fungsi untuk mengirim log ke panel GitHub via Firebase
async function sendLogToPanel(message) {
    console.log(message);
    await botLogRef.set(`[Bot Server] ${message}`);
}

// 2. FUNGSI UTAMA MENYALAKAN BOT WHATSAPP
async function startWhatsApp() {
    if (isBotRunning) return;
    
    await sendLogToPanel("Sedang menghubungkan ke WhatsApp...");
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false // Kita matikan bawaan agar bisa dicetak manual via log
    });

    sock.ev.on('creds.update', saveCreds);

    // Memantau Koneksi WA
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Jika QR Code muncul, tampilkan di terminal server hosting Anda
        if (qr) {
            await sendLogToPanel("QR Code baru dibuat! Silakan cek log terminal server untuk scan.");
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            await sendLogToPanel(`Koneksi terputus karena: ${lastDisconnect?.error?.message}. Menghubungkan ulang? ${shouldReconnect}`);
            
            isBotRunning = false;
            await botStatusRef.set("Mati");

            if (shouldReconnect) {
                startWhatsApp();
            }
        } else if (connection === 'open') {
            isBotRunning = true;
            await botStatusRef.set("Aktif");
            await sendLogToPanel("Bot WhatsApp BERHASIL Terhubung dan AKTIF!");
        }
    });

    // Menangani Pesan Masuk (Auto-Response)
    sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (text && text.toLowerCase() === 'p') {
            await sock.sendMessage(from, { text: 'Halo! Bot ini aktif 24 jam melalui kontrol panel GitHub.' });
            await sendLogToPanel(`Membalas pesan 'p' dari ${from.split('@')[0]}`);
        }
    });
}

// Fungsi untuk mematikan bot lewat perintah panel
async function stopWhatsApp() {
    if (!isBotRunning) return;
    await sendLogToPanel("Mematikan koneksi WhatsApp...");
    if (sock) {
        sock.logout();
        sock = null;
    }
    isBotRunning = false;
    await botStatusRef.set("Mati");
}

// 3. MENDENGARKAN PERINTAH DARI PANEL GITHUB (VIA FIREBASE)
botCommandRef.on('value', async (snapshot) => {
    if (!snapshot.exists()) return;
    
    const command = snapshot.val();
    const { action, to, text, timestamp } = command;

    // Hindari menjalankan perintah lama (toleransi 10 detik)
    if (Date.now() - timestamp > 10000) return;

    switch (action) {
        case 'START':
            if (!isBotRunning) {
                startWhatsApp();
            } else {
                await sendLogToPanel("Perintah diabaikan: Bot sudah menyala.");
            }
            break;

        case 'STOP':
            if (isBotRunning) {
                stopWhatsApp();
            } else {
                await sendLogToPanel("Perintah diabaikan: Bot memang sudah mati.");
            }
            break;

        case 'SEND_MESSAGE':
            if (isBotRunning && sock) {
                // Memastikan format nomor menggunakan @s.whatsapp.net
                const formattedNumber = to.includes('@') ? to : `${to}@s.whatsapp.net`;
                await sock.sendMessage(formattedNumber, { text: text });
                await sendLogToPanel(`Berhasil mengirim pesan panel ke ${to}`);
            } else {
                await sendLogToPanel("Gagal kirim pesan: Bot sedang offline.");
            }
            break;
    }
});

// Set status awal saat server backend dinyalakan
await botStatusRef.set("Mati");
await sendLogToPanel("Backend Server aktif. Menunggu perintah dari Panel GitHub...");
