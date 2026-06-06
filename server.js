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

// Variabel untuk menyimpan proses bot yang sedang berjalan
let botProcess = null;

// Pastikan folder yang dibutuhkan sudah ada
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
if (!fs.existsSync('bot-runner')) fs.mkdirSync('bot-runner');

// 1. TAMPILAN WEBSITE PANEL (HTML LANGSUNG)
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="id">
        <head>
            <meta charset="UTF-8">
            <title>Panel Bot WA Buatan Sendiri</title>
            <script src="https://jsdelivr.net"></script>
        </head>
        <body class="bg-gray-900 text-gray-100 p-8">
            <div class="max-w-xl mx-auto bg-gray-800 p-6 rounded-xl shadow-lg">
                <h1 class="text-2xl font-bold text-green-400 mb-6 text-center">My Bot Web Panel</h1>
                
                <!-- Form Upload File -->
                <div class="mb-6 p-4 border border-gray-700 rounded-lg">
                    <h2 class="text-lg font-semibold mb-2">1. Upload Script Bot (.zip)</h2>
                    <form action="/upload" method="POST" enctype="multipart/form-data" class="space-y-3">
                        <input type="file" name="botFile" accept=".zip" class="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-green-600 file:text-white hover:file:bg-green-500 cursor-pointer">
                        <button type="submit" class="w-full bg-blue-600 hover:bg-blue-500 py-2 rounded-md font-medium transition">Upload & Install Otomatis</button>
                    </form>
                </div>

                <!-- Tombol Kontrol -->
                <div class="p-4 border border-gray-700 rounded-lg">
                    <h2 class="text-lg font-semibold mb-3">2. Kontrol Bot WA</h2>
                    <div class="grid grid-cols-3 gap-3">
                        <a href="/start" class="bg-green-600 hover:bg-green-500 text-center py-2 rounded-md font-medium transition">START</a>
                        <a href="/stop" class="bg-red-600 hover:bg-red-500 text-center py-2 rounded-md font-medium transition">STOP</a>
                        <a href="/restart" class="bg-yellow-600 hover:bg-yellow-500 text-center py-2 rounded-md font-medium transition">RESTART</a>
                    </div>
                </div>
                
                <div class="mt-4 text-center">
                    <a href="/" class="text-sm text-gray-400 hover:underline">🔄 Segarkan Halaman</a>
                </div>
            </div>
        </body>
        </html>
    `);
});

// 2. PROSES UPLOAD, EKSTRAK, DAN NPM INSTALL
app.post('/upload', upload.single('botFile'), (req, res) => {
    if (!req.file) return res.status(400).send('Gagal mengunggah file.');

    try {
        // Ekstrak file zip ke folder bot-runner
        const zip = new AdmZip('uploads/bot-script.zip');
        zip.extractAllTo('bot-runner', true);

        // Otomatis Jalankan 'npm install' di folder bot-runner
        exec('npm install', { cwd: 'bot-runner' }, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error npm install: ${error}`);
                return res.send('File berhasil di-upload, tetapi gagal menjalankan npm install.');
            }
            console.log(`npm install sukses: ${stdout}`);
            
            // Setelah install sukses, otomatis jalankan bot (npm start)
            jalankanBot();
            res.send('<h1>Sukses! Script berhasil diekstrak, modul di-install, dan bot otomatis dijalankan!</h1><br><a href="/">Kembali ke Panel</a>');
        });
    } catch (err) {
        res.status(500).send('Terjadi kesalahan saat mengekstrak file: ' + err.message);
    }
});

// 3. FUNGSI UNTUK MENJALANKAN NPM START
function jalankanBot() {
    if (botProcess) {
        botProcess.kill(); // Matikan proses lama jika ada
    }

    // Menjalankan 'npm start' di dalam folder bot-runner
    botProcess = spawn('npm', ['start'], { cwd: 'bot-runner', shell: true });

    botProcess.stdout.on('data', (data) => {
        console.log(`[Bot Output]: ${data}`);
    });

    botProcess.stderr.on('data', (data) => {
        console.error(`[Bot Error]: ${data}`);
    });

    botProcess.on('close', (code) => {
        console.log(`Bot berhenti dengan kode: ${code}`);
        botProcess = null;
    });
}

// 4. ROUTER KONTROL (START, STOP, RESTART)
app.get('/start', (req, res) => {
    if (botProcess) {
        return res.send('<h1>Bot sudah dalam posisi menyala!</h1><br><a href="/">Kembali</a>');
    }
    jalankanBot();
    res.send('<h1>Perintah START berhasil dikirim! Bot sedang menyala di latar belakang.</h1><br><a href="/">Kembali</a>');
});

app.get('/stop', (req, res) => {
    if (botProcess) {
        botProcess.kill();
        botProcess = null;
        res.send('<h1>Bot berhasil dimatikan!</h1><br><a href="/">Kembali</a>');
    } else {
        res.send('<h1>Bot memang sudah mati.</h1><br><a href="/">Kembali</a>');
    }
});

app.get('/restart', (req, res) => {
    if (botProcess) botProcess.kill();
    setTimeout(() => {
        jalankanBot();
        res.send('<h1>Bot berhasil di-restart!</h1><br><a href="/">Kembali</a>');
    }, 2000);
});

// Jalankan server panel
app.listen(port, () => {
    console.log(`Panel buatan sendiri berjalan di http://localhost:${port}`);
});
