# pyrefly: ignore [missing-import]
from flask import Flask, render_template, request, jsonify
import sqlite3

app = Flask(__name__)

# Inisialisasi Database SQLite
def init_db():
    conn = sqlite3.connect('sdwan.db')
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS inventory
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  site_id TEXT,
                  hostname TEXT,
                  ip_address TEXT,
                  customer TEXT)''')
    conn.commit()
    conn.close()

@app.route('/')
def index():
    return render_template('index.html')

# Endpoint API untuk Baca dan Tulis Data
@app.route('/api/devices', methods=['GET', 'POST'])
def manage_devices():
    conn = sqlite3.connect('sdwan.db')
    c = conn.cursor()
    
    if request.method == 'POST':
        data = request.json
        
        # --- LOGIKA AUTO-GENERATE HOSTNAME ---
        # Format: [Platform][Pabrikan]-[Regional]-[STO]-[Customer]-[Lokasi]
        hostname = f"{data['platform']}{data['pabrikan']}-{data['regional']}-{data['sto']}-{data['customer']}-{data['lokasi']}".upper()
        
        # --- LOGIKA AUTO-GENERATE SITE ID ---
        # Format: [Tipe Edge][Customer 3 Digit][Regional 1 Digit][Branch 4 Digit]
        site_id = f"{data['tipe_edge']}{data['kode_cust']}{data['kode_reg']}{data['kode_branch']}"
        
        ip_address = data['ip_address']
        customer = data['customer'].upper()
        
        c.execute("INSERT INTO inventory (site_id, hostname, ip_address, customer) VALUES (?, ?, ?, ?)",
                  (site_id, hostname, ip_address, customer))
        conn.commit()
        conn.close()
        return jsonify({"status": "success"})
        
    else: # GET request
        c.execute("SELECT site_id, hostname, ip_address, customer FROM inventory ORDER BY id DESC")
        devices = [{"site_id": row[0], "hostname": row[1], "ip_address": row[2], "customer": row[3]} for row in c.fetchall()]
        conn.close()
        return jsonify(devices)

if __name__ == '__main__':
    init_db()
    app.run(debug=True, port=5000)
