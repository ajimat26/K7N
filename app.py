#!/usr/bin/env python3
"""
K7N KILLER VOSW - Terminal Online
Backend Flask untuk eksekusi script Python & HTML secara nyata
"""

from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_socketio import SocketIO, emit
import subprocess
import os
import uuid
import shutil
from datetime import datetime
import threading
import queue
import time
import signal
import psutil

app = Flask(__name__)
app.config['SECRET_KEY'] = 'k7n-killer-vosw-secret-key-2024-super-secure'
app.config['UPLOAD_FOLDER'] = 'static/uploads'
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max
app.config['TIMEOUT'] = 300  # 5 menit timeout

socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Buat folder uploads jika belum ada
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Store untuk proses yang berjalan
running_processes = {}

class ScriptExecutor:
    """Kelas untuk mengeksekusi script dengan aman"""
    
    def __init__(self):
        self.processes = {}
    
    def execute_python(self, script_path, sid, params=None):
        """
        Eksekusi script Python dengan real-time output
        """
        try:
            # Build command
            cmd = ['python3', script_path]
            if params:
                cmd.extend(params)
            
            # Set environment
            env = os.environ.copy()
            env['PYTHONUNBUFFERED'] = '1'
            env['TERM'] = 'xterm-256color'
            
            # Jalankan proses
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                stdin=subprocess.PIPE,
                text=True,
                bufsize=1,
                universal_newlines=True,
                env=env,
                cwd=os.path.dirname(script_path)
            )
            
            # Simpan proses
            self.processes[sid] = {
                'process': process,
                'start_time': time.time(),
                'script': script_path
            }
            
            # Kirim info ke client
            socketio.emit('execution_started', {
                'script': os.path.basename(script_path),
                'pid': process.pid
            }, room=sid)
            
            # Baca output real-time dalam thread terpisah
            def read_output(pipe, output_type):
                try:
                    for line in iter(pipe.readline, ''):
                        if line:
                            socketio.emit('terminal_output', {
                                'type': output_type,
                                'data': line.rstrip()
                            }, room=sid)
                except Exception as e:
                    socketio.emit('terminal_output', {
                        'type': 'error',
                        'data': f'Error reading output: {str(e)}'
                    }, room=sid)
                finally:
                    pipe.close()
            
            # Thread untuk stdout
            stdout_thread = threading.Thread(
                target=read_output, 
                args=(process.stdout, 'stdout'),
                daemon=True
            )
            stdout_thread.start()
            
            # Thread untuk stderr
            stderr_thread = threading.Thread(
                target=read_output, 
                args=(process.stderr, 'stderr'),
                daemon=True
            )
            stderr_thread.start()
            
            # Monitor timeout
            def monitor_timeout():
                start_time = time.time()
                while process.poll() is None:
                    if time.time() - start_time > app.config['TIMEOUT']:
                        process.kill()
                        socketio.emit('terminal_output', {
                            'type': 'error',
                            'data': f'⏰ Script timeout setelah {app.config["TIMEOUT"]} detik'
                        }, room=sid)
                        break
                    time.sleep(1)
            
            timeout_thread = threading.Thread(
                target=monitor_timeout,
                daemon=True
            )
            timeout_thread.start()
            
            # Tunggu proses selesai
            process.wait()
            
            # Bersihkan
            if sid in self.processes:
                del self.processes[sid]
            
            # Kirim status selesai
            socketio.emit('execution_complete', {
                'message': '✅ Script selesai dieksekusi',
                'return_code': process.returncode,
                'execution_time': time.time() - self.processes.get(sid, {}).get('start_time', 0)
            }, room=sid)
            
        except Exception as e:
            socketio.emit('terminal_output', {
                'type': 'error',
                'data': f'❌ Error: {str(e)}'
            }, room=sid)
            if sid in self.processes:
                del self.processes[sid]
    
    def stop_execution(self, sid):
        """Hentikan eksekusi script"""
        if sid in self.processes:
            process_info = self.processes[sid]
            process = process_info['process']
            
            # Kirim sinyal terminate
            process.terminate()
            
            # Tunggu 3 detik
            time.sleep(3)
            
            # Jika masih berjalan, kill
            if process.poll() is None:
                process.kill()
            
            del self.processes[sid]
            return True
        return False
    
    def get_running_processes(self):
        """Dapatkan daftar proses yang berjalan"""
        processes = []
        for sid, info in self.processes.items():
            processes.append({
                'sid': sid,
                'script': os.path.basename(info['script']),
                'pid': info['process'].pid,
                'running_time': time.time() - info['start_time']
            })
        return processes

# Inisialisasi executor
executor = ScriptExecutor()

@app.route('/')
def index():
    """Halaman utama"""
    return render_template('index.html')

@app.route('/api/upload', methods=['POST'])
def upload_script():
    """Upload script Python atau HTML"""
    if 'file' not in request.files:
        return jsonify({'error': 'Tidak ada file yang diupload'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Nama file kosong'}), 400
    
    # Validasi ekstensi
    allowed_extensions = ['.py', '.html', '.txt', '.sh', '.json', '.xml', '.csv']
    file_ext = os.path.splitext(file.filename)[1].lower()
    
    if file_ext not in allowed_extensions:
        return jsonify({'error': f'Format file tidak didukung. Gunakan: {", ".join(allowed_extensions)}'}), 400
    
    # Generate unique filename untuk keamanan
    unique_id = str(uuid.uuid4())[:8]
    safe_filename = f"{unique_id}_{file.filename}"
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], safe_filename)
    
    # Simpan file
    file.save(filepath)
    
    # Deteksi tipe
    script_type = 'python' if file_ext == '.py' else 'html' if file_ext == '.html' else 'text'
    
    return jsonify({
        'success': True,
        'filename': safe_filename,
        'original_name': file.filename,
        'path': filepath,
        'type': script_type,
        'size': os.path.getsize(filepath),
        'uploaded_at': datetime.now().isoformat()
    })

@app.route('/api/scripts', methods=['GET'])
def list_scripts():
    """List semua script yang tersedia"""
    scripts = []
    upload_dir = app.config['UPLOAD_FOLDER']
    
    if os.path.exists(upload_dir):
        for file in os.listdir(upload_dir):
            filepath = os.path.join(upload_dir, file)
            if os.path.isfile(filepath):
                file_ext = os.path.splitext(file)[1].lower()
                scripts.append({
                    'name': file,
                    'original_name': file.split('_', 1)[1] if '_' in file else file,
                    'type': 'python' if file_ext == '.py' else 'html' if file_ext == '.html' else 'text',
                    'size': os.path.getsize(filepath),
                    'uploaded': datetime.fromtimestamp(os.path.getctime(filepath)).isoformat(),
                    'path': filepath
                })
    
    # Urutkan berdasarkan waktu upload (terbaru dulu)
    scripts.sort(key=lambda x: x['uploaded'], reverse=True)
    
    return jsonify({'scripts': scripts, 'total': len(scripts)})

@app.route('/api/execute', methods=['POST'])
def execute_script():
    """API untuk mengeksekusi script"""
    data = request.json
    script_path = data.get('path')
    script_type = data.get('type', 'python')
    params = data.get('params', [])
    
    if not script_path:
        return jsonify({'error': 'Path script diperlukan'}), 400
    
    if not os.path.exists(script_path):
        return jsonify({'error': 'File script tidak ditemukan'}), 404
    
    # Untuk HTML, return kontennya
    if script_type == 'html':
        with open(script_path, 'r', encoding='utf-8') as f:
            content = f.read()
        return jsonify({
            'type': 'html',
            'content': content,
            'filename': os.path.basename(script_path)
        })
    
    # Untuk Python, return info untuk eksekusi via WebSocket
    return jsonify({
        'type': 'python',
        'message': f'Script {os.path.basename(script_path)} siap dieksekusi',
        'path': script_path,
        'filename': os.path.basename(script_path)
    })

@app.route('/api/delete/<filename>', methods=['DELETE'])
def delete_script(filename):
    """Hapus script"""
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    
    # Cegah directory traversal
    if '..' in filename or not os.path.exists(filepath):
        return jsonify({'error': 'File tidak ditemukan'}), 404
    
    try:
        os.remove(filepath)
        return jsonify({'success': True, 'message': f'{filename} berhasil dihapus'})
    except Exception as e:
        return jsonify({'error': f'Gagal menghapus: {str(e)}'}), 500

@app.route('/api/script/<filename>', methods=['GET'])
def get_script_content(filename):
    """Dapatkan konten script"""
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    
    if not os.path.exists(filepath):
        return jsonify({'error': 'File tidak ditemukan'}), 404
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    return jsonify({
        'filename': filename,
        'content': content,
        'size': os.path.getsize(filepath)
    })

@app.route('/api/system/info', methods=['GET'])
def system_info():
    """Informasi sistem"""
    import platform
    return jsonify({
        'system': platform.system(),
        'python_version': platform.python_version(),
        'hostname': platform.node(),
        'cpu_count': os.cpu_count(),
        'memory': psutil.virtual_memory()._asdict() if 'psutil' in dir() else {}
    })

# ============================================
# WebSocket Events
# ============================================

@socketio.on('connect')
def handle_connect():
    """Client terhubung"""
    emit('connected', {
        'message': 'Terhubung ke K7N KILLER VOSW Terminal',
        'timestamp': datetime.now().isoformat()
    })
    
    # Kirim daftar proses yang berjalan
    running = executor.get_running_processes()
    if running:
        emit('terminal_output', {
            'type': 'info',
            'data': f'📊 {len(running)} proses sedang berjalan'
        })

@socketio.on('disconnect')
def handle_disconnect():
    """Client terputus"""
    print(f'Client disconnected: {request.sid}')

@socketio.on('execute_python')
def handle_execute_python(data):
    """Eksekusi Python script via WebSocket"""
    script_path = data.get('path')
    params = data.get('params', [])
    sid = request.sid
    
    if not script_path or not os.path.exists(script_path):
        emit('terminal_output', {
            'type': 'error',
            'data': '❌ Script tidak ditemukan'
        })
        return
    
    emit('terminal_output', {
        'type': 'info',
        'data': f'🚀 Menjalankan: {os.path.basename(script_path)}'
    })
    
    emit('terminal_output', {
        'type': 'info',
        'data': '─' * 60
    })
    
    # Jalankan di thread terpisah
    thread = threading.Thread(
        target=executor.execute_python, 
        args=(script_path, sid, params),
        daemon=True
    )
    thread.start()

@socketio.on('stop_execution')
def handle_stop_execution():
    """Hentikan eksekusi script"""
    sid = request.sid
    
    if executor.stop_execution(sid):
        emit('terminal_output', {
            'type': 'warning',
            'data': '⏹️ Eksekusi dihentikan oleh user'
        })
    else:
        emit('terminal_output', {
            'type': 'warning',
            'data': 'Tidak ada proses yang berjalan'
        })

@socketio.on('run_command')
def handle_command(data):
    """Jalankan command terminal"""
    command = data.get('command', '').strip()
    sid = request.sid
    
    if not command:
        return
    
    # Command yang diizinkan (whitelist untuk keamanan)
    allowed_commands = [
        'ls', 'pwd', 'whoami', 'date', 'echo', 'cat', 'head', 'tail',
        'python3', 'python', 'pip', 'pip3', 'node', 'npm',
        'uname', 'hostname', 'uptime', 'df', 'du', 'free',
        'ps', 'wget', 'curl'
    ]
    
    # Cek apakah command diizinkan
    cmd_base = command.split()[0] if command.split() else ''
    
    if cmd_base not in allowed_commands:
        emit('terminal_output', {
            'type': 'warning',
            'data': f'⚠️ Command tidak diizinkan: {cmd_base}'
        })
        emit('terminal_output', {
            'type': 'info',
            'data': f'📋 Allowed commands: {", ".join(allowed_commands)}'
        })
        return
    
    try:
        # Jalankan command dengan timeout
        process = subprocess.Popen(
            command,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            cwd=app.config['UPLOAD_FOLDER']
        )
        
        try:
            stdout, stderr = process.communicate(timeout=30)
            
            if stdout:
                for line in stdout.split('\n'):
                    if line.strip():
                        emit('terminal_output', {
                            'type': 'stdout',
                            'data': line
                        })
            
            if stderr:
                for line in stderr.split('\n'):
                    if line.strip():
                        emit('terminal_output', {
                            'type': 'stderr',
                            'data': line
                        })
                        
        except subprocess.TimeoutExpired:
            process.kill()
            emit('terminal_output', {
                'type': 'error',
                'data': '⏰ Command timeout (30 detik)'
            })
            
    except Exception as e:
        emit('terminal_output', {
            'type': 'error',
            'data': f'Error: {str(e)}'
        })

@socketio.on('send_input')
def handle_send_input(data):
    """Kirim input ke proses yang berjalan"""
    sid = request.sid
    input_text = data.get('input', '')
    
    if sid in executor.processes:
        process = executor.processes[sid]['process']
        try:
            process.stdin.write(input_text + '\n')
            process.stdin.flush()
        except Exception as e:
            emit('terminal_output', {
                'type': 'error',
                'data': f'Error sending input: {str(e)}'
            })
    else:
        emit('terminal_output', {
            'type': 'warning',
            'data': 'Tidak ada proses yang berjalan'
        })

# ============================================
# Error Handlers
# ============================================

@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Endpoint tidak ditemukan'}), 404

@app.errorhandler(500)
def server_error(e):
    return jsonify({'error': 'Internal server error'}), 500

@app.errorhandler(413)
def too_large(e):
    return jsonify({'error': 'File terlalu besar. Maksimal 50MB'}), 413

# ============================================
# Cleanup on shutdown
# ============================================

import atexit

@atexit.register
def cleanup():
    """Bersihkan semua proses saat server shutdown"""
    for sid in list(executor.processes.keys()):
        executor.stop_execution(sid)
    print('All processes cleaned up')

# ============================================
# Main
# ============================================

if __name__ == '__main__':
    print("""
    ╔══════════════════════════════════════════╗
    ║     K7N KILLER VOSW Terminal Server      ║
    ║     Starting on http://localhost:5000     ║
    ║     Press Ctrl+C to stop                 ║
    ╚══════════════════════════════════════════╝
    """)
    
    socketio.run(
        app, 
        host='0.0.0.0', 
        port=5000, 
        debug=True,
        allow_unsafe_werkzeug=True
    )
