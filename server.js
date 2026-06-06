import express from 'express';
import multer from 'multer';
import AdmZip from 'adm-zip';
import { exec, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const app = express();
const port = 3000;

// Konfigurasi penyimpanan file upload
const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
        cb(null, 'bot-script.zip');
    }
});
const upload = multer({ storage: storage });

// Variabel status proses bot
let botProcess = null;
let lastLog = "Menunggu file script bot diunggah...";

// Pastikan folder yang dibutuhkan sudah ada
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
if (!fs.existsSync('bot-runner')) fs.mkdirSync('bot-runner');

// 1. TAMPILAN WEBSITE PANEL YANG KEREN & MODERN
app.get('/', (req, res) => {
    const statusText = botProcess ? "AKTIF" : "OFFLINE";
    const statusClass = botProcess ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-rose-500/20 text-rose-400 border-rose-500/30";
    const indicatorClass = botProcess ? "bg-emerald-400 animate-pulse" : "bg-rose-400";

    res.send(`
        <!DOCTYPE html>
        <html lang="id">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Premium Bot Control Panel</title>
            <!-- Tailwind CSS v4 -->
            <script src="https://jsdelivr.net"></script>
            <link rel="preconnect" href="https://googleapis.com">
            <link rel="preconnect" href="https://gstatic.com" crossorigin>
            <link href="https://googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
            <style>
                body { font-family: 'Plus Jakarta Sans', sans-serif; }
                .mono { font-family: 'JetBrains Mono', monospace; }
                .glass { background: rgba(30, 41, 59, 0.7); backdrop-filter: blur(12px); }
            </style>
        </head>
        <body class="bg-slate-950 text-slate-100 min-h-screen flex items-center justify-center p-4 md:p-8 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black">

            <div class="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-6">
                
                <!-- KIRI: INFORMASI & STATUS -->
                <div class="md:col-span-1 flex flex-col gap-6">
                    <!-- Status Card -->
                    <div class="glass border border-slate-800 p-6 rounded-2xl shadow-xl flex flex-col justify-between items-center text-center">
                        <div class="w-16 h-16 rounded-full bg-slate-800/80 flex items-center justify-center border border-slate-700/50 shadow-inner mb-4">
                            <span class="text-2xl">🤖</span>
                        </div>
                        <h1 class="text-xl font-bold tracking-tight bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent">WA Server Node v20</h1>
                        <p class="text-xs text-slate-400 mt-1 mb-6">Panel Buatan Sendiri 24 Jam</p>
                        
                        <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold border ${statusClass}">
                            <span class="w-2 h-2 rounded-full ${indicatorClass}"></span>
                            ${statusText}
                        </div>
                    </div>

                    <!-- Kontrol Cepat -->
                    <div class="glass border border-slate-800 p-6 rounded-2xl shadow-xl">
                        <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Kontrol Server</h3>
                        <div class="flex flex-col gap-2">
                            <a href="/start" class="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2.5 px-4 rounded-xl shadow-lg shadow-emerald-900/20 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0">
                                <span class="text-sm">▶</span> Start Bot
                            </a>
                            <a href="/stop" class="flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 text-white font-medium py-2.5 px-4 rounded-xl shadow-lg shadow-rose-900/20 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0">
                                <span class="text-sm">■</span> Stop Bot
                            </a>
                            <a href="/restart" class="flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 text-white font-medium py-2.5 px-4 rounded-xl shadow-lg shadow-amber-900/20 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0">
                                <span class="text-sm">🔄</span> Restart
                            </a>
                        </div>
                    </div>
                </div>

                <!-- KANAN: MANAGEMENT & CONSOLE LOG -->
                <div class="md:col-span-2 flex flex-col gap-6">
                    <!-- Upload Card -->
                    <div class="glass border border-slate-800 p-6 rounded-2xl shadow-xl">
                        <h2 class="text-lg font-bold text-slate-200 mb-2">Deploy Script Bot Baru</h2>
                        <p class="text-xs text-slate-400 mb-4">Unggah file zip Anda. Sistem akan otomatis mengekstrak, menginstal modul, dan menjalankan bot.</p>
                        
                        <form action="/upload" method="POST" enctype="multipart/form-data" class="space-y-4">
                            <div class="border-2 border-dashed border-slate-700 hover:border-slate-500 rounded-xl p-4 transition-all flex flex-col items-center justify-center bg-slate-900/40 group relative">
                                <span class="text-2xl group-hover:scale-110 transition-transform mb-1">📦</span>
                                <span class="text-xs text-slate-400 font-medium group-hover:text-slate-300">Pilih file <span class="text-blue-400">.zip</span> script bot WA Anda</span>
                                <input type="file" name="botFile" accept=".zip" required class="absolute inset-0 opacity-0 cursor-pointer w-full h-full">
                            </div>
                            <button type="submit" class="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 shadow-xl shadow-blue-900/20 hover:-translate-y-0.5 active:translate-y-0">
                                🚀 Upload & Deploy Otomatis
                            </button>
                        </form>
                    </div>

                    <!-- Console Card -->
                    <div class="glass border border-slate-800 p-6 rounded-2xl shadow-xl flex-1 flex flex-col min-h-[220px]">
                        <div class="flex justify-between items-center mb-3">
                            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400">Live Server Logs</h3>
                            <a href="/" class="text-xs text-blue-400 hover:text-blue-300 transition flex items-center gap-1 font-medium">
                                🔄 Refresh Log
                            </a>
                        </div>
                        <div class="bg-black/60 border border-slate-800/80 rounded-xl p-4 mono text-xs text-slate-300 flex-1 overflow-y-auto max-h-[200px] shadow-inner leading-relaxed">
                            ${lastLog.replace(/\n/g, '<br>')}
                        </div>
                    </div>

                </div>

            </div>

        </body>
        </html>
    `);
});

// 2. PROSES UPLOAD, EKSTRAK, DAN NPM INSTALL DI LATAR BELAKANG
app.post('/upload', upload.single('botFile'), (req, res) => {
    if (!req.file) return res.status(400).send('Gagal mengunggah file.');

    lastLog = "[System] File berhasil diterima. Memulai proses ekstraksi zip...\n";

    try {
        const zip = new AdmZip('uploads/bot-script.zip');
        zip.extractAllTo('bot-runner', true);
        lastLog += "[System] Ekstraksi sukses! Menjalankan 'npm install' di folder bot...\n";

        exec('npm install', { cwd: 'bot-runner' }, (error, stdout, stderr) => {
            if (error) {
                lastLog += `[Error npm install]: ${error.message}\n`;
                return res.redirect('/');
            }
            lastLog += "[System] 'npm install' berhasil diproses tanpa hambatan.\n[System] Menyalakan bot otomatis dengan 'npm start'...\n";
            jalankanBot();
            res.redirect('/');
        });
    } catch (err) {
        lastLog += `[Fatal Error]: ${err.message}\n`;
        res.redirect('/');
    }
});

// 3. FUNGSI UNTUK MENJALANKAN BOT (NPM START)
function jalankanBot() {
    if (botProcess) {
        botProcess.kill();
    }

    botProcess = spawn('npm', ['start'], { cwd: 'bot-runner', shell: true });

    botProcess.stdout.on('data', (data) => {
        lastLog += `[Bot Output]: ${data.toString()}`;
    });

    botProcess.stderr.on('data', (data) => {
        lastLog += `[Bot Error]: ${data.toString()}`;
    });

    botProcess.on('close', (code) => {
        lastLog += `[System] Bot terhenti otomatis dengan kode keluar: ${code}\n`;
        botProcess = null;
    });
}

// 4. ROUTER KONTROL RESPONS KILAT
app.get('/start', (req, res) => {
    if (!botProcess) {
        lastLog += "[System] Memicu perintah START secara manual...\n";
        jalankanBot();
    }
    res.redirect('/');
});

app.get('/stop', (req, res) => {
    if (botProcess) {
        lastLog += "[System] Memicu perintah STOP secara manual...\n";
        botProcess.kill();
