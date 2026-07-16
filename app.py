# pyrefly: ignore [missing-import]
from flask import Flask, render_template, request, jsonify
import sqlite3
import re
import os
import tempfile
import bleach
import subprocess
import platform
import json
from datetime import datetime

def sanitize_data(val):
    """Secara rekursif men-sanitize (membersihkan) input string dari potensi XSS."""
    if isinstance(val, str):
        return bleach.clean(val).strip()
    elif isinstance(val, dict):
        return {k: sanitize_data(v) for k, v in val.items()}
    elif isinstance(val, list):
        return [sanitize_data(v) for v in val]
    return val

def format_ip_address(ip_str):
    """Mengubah format penamaan IP dari penulisan angka murni/tanpa titik (missal 19216811 -> 192.168.1.1)."""
    if not ip_str:
        return ''
    s = str(ip_str).strip().replace(' ', '')
    if '.' in s:
        # Hapus titik ganda/triple dan format ulang
        parts = [p for p in s.split('.') if p]
        return '.'.join(parts)
        
    if s.isdigit():
        # 10255241151 -> 10.255.241.151
        if s.startswith('10') and len(s) == 11:
            return f"10.{s[2:5]}.{s[5:8]}.{s[8:]}"
        # 19216811 -> 192.168.1.1
        if s.startswith('192168'):
            rem = s[6:]
            if len(rem) == 2:
                return f"192.168.{rem[0]}.{rem[1]}"
            elif len(rem) == 3:
                return f"192.168.{rem[:-1]}.{rem[-1]}"
            elif len(rem) == 4:
                return f"192.168.{rem[:3]}.{rem[3:]}"
        # 12 digit (misal 192168001001)
        if len(s) == 12:
            try:
                o1, o2, o3, o4 = int(s[0:3]), int(s[3:6]), int(s[6:9]), int(s[9:12])
                if o1 <= 255 and o2 <= 255 and o3 <= 255 and o4 <= 255:
                    return f"{o1}.{o2}.{o3}.{o4}"
            except ValueError:
                pass
        # 10.x.x.x dengan 8 digit (misal 10101010)
        if s.startswith('10') and len(s) == 8:
            return f"10.{int(s[2:4])}.{int(s[4:6])}.{int(s[6:8])}"
            
    return s

app = Flask(__name__)
DB_PATH = 'sdwan.db'


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Buat tabel inventory jika belum ada."""
    with get_db() as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS inventory (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                order_sdwan      TEXT,
                nama_pelanggan   TEXT,
                alias            TEXT,
                lokasi           TEXT,
                alamat           TEXT,
                sto              TEXT,
                reg              TEXT,
                status_link      TEXT,
                sid_sdwan        TEXT,
                sid_connectivity TEXT,
                taskname         TEXT,
                status           TEXT,
                status_ncx       TEXT,
                hostname         TEXT,
                sistem_ip        TEXT,
                site_id          TEXT,
                type_edge        TEXT,
                serial_number    TEXT,
                created_at       TEXT,
                is_deleted       INTEGER DEFAULT 0
            )
        ''')
        
        # Migrasi: Tambahkan kolom is_deleted jika belum ada
        try:
            conn.execute('ALTER TABLE inventory ADD COLUMN is_deleted INTEGER DEFAULT 0')
        except sqlite3.OperationalError:
            pass
            
        conn.commit()


def generate_hostname(platform, pabrikan, reg, sto, customer, lokasi):
    """
    Format Hostname (Standar Baku Telkom Indibiz):
      [Kode Platform 2digit][Kode Pabrikan 2digit]-[Kode Regional]-[Kode STO]-[Nama Pelanggan]-[Lokasi]
    Contoh: 0201-D2-KMY-HERMINA-KEMAYORAN
    """
    return f"{platform}{pabrikan}-{reg}-{sto}-{customer}-{lokasi}".upper()


def generate_site_id(type_edge, kode_cust, kode_reg, kode_branch):
    """
    Format Site ID (Standar Baku Telkom Indibiz):
      Digit 1   : Type Edge (1=Store, 2=Reg Branch, 3=HO/DC)
      Digit 2-4 : Nomor Customer (001, 002, ...)
      Digit 5   : Kode Regional (1-7)
      Digit 6-9 : Nomor Site/Branch (0001, 0002, ...)
    Contoh: 300120002
    """
    cust   = str(kode_cust).zfill(3)
    branch = str(kode_branch).zfill(4)
    return f"{type_edge}{cust}{kode_reg}{branch}"


def row_to_dict(row):
    return dict(row)


# ---------------------------------------------------------------------------
# Routes — Pages
# ---------------------------------------------------------------------------

@app.route('/')
def index():
    return render_template('index.html')


# ---------------------------------------------------------------------------
# Routes — CRUD Devices
# ---------------------------------------------------------------------------

@app.route('/api/devices', methods=['GET'])
def get_devices():
    """GET /api/devices?q=keyword → semua atau filter."""
    q = request.args.get('q', '').strip()
    with get_db() as conn:
        if q:
            like = f"%{q}%"
            rows = conn.execute(
                '''SELECT * FROM inventory
                   WHERE is_deleted = 0 AND (nama_pelanggan LIKE ?
                      OR hostname       LIKE ?
                      OR order_sdwan    LIKE ?
                      OR sto            LIKE ?
                      OR reg            LIKE ?
                      OR alias          LIKE ?
                      OR site_id        LIKE ?
                      OR taskname       LIKE ?
                      OR sistem_ip      LIKE ?
                      OR serial_number  LIKE ?
                      OR alamat         LIKE ?
                      OR sid_sdwan      LIKE ?
                      OR sid_connectivity LIKE ?)
                   ORDER BY id DESC''',
                (like,)*13
            ).fetchall()
        else:
            rows = conn.execute(
                'SELECT * FROM inventory WHERE is_deleted = 0 ORDER BY id DESC'
            ).fetchall()
    return jsonify([row_to_dict(r) for r in rows])


@app.route('/api/devices', methods=['POST'])
def create_device():
    """POST /api/devices → tambah record baru + auto-generate hostname & site_id."""
    data = sanitize_data(request.get_json(force=True))

    required = ['platform', 'pabrikan', 'reg', 'sto', 'customer', 'lokasi',
                'type_edge', 'kode_cust', 'kode_reg', 'kode_branch', 'sistem_ip']
    missing = [f for f in required if not str(data.get(f, '')).strip()]
    if missing:
        return jsonify({'status': 'error', 'message': f'Field wajib kosong: {missing}'}), 400

    if 'sistem_ip' in data:
        data['sistem_ip'] = format_ip_address(data['sistem_ip'])

    errors = []
    if data.get('platform') not in ('01', '02', '03'):
        errors.append('Platform tidak valid')
    if data.get('pabrikan') not in ('01','02','03','04','05','06','07','08'):
        errors.append('Pabrikan tidak valid')
    if data.get('type_edge') not in ('1', '2', '3'):
        errors.append('Type Edge tidak valid')
    if not re.fullmatch(r'[1-7]', data.get('kode_reg', '')):
        errors.append('Kode REG Site ID harus 1 digit (1-7)')
    if not re.fullmatch(r'[0-9]{1,3}', data.get('kode_cust', '')):
        errors.append('Kode Customer harus angka 1-999')
    if not re.fullmatch(r'[0-9]{1,4}', data.get('kode_branch', '')):
        errors.append('Kode Branch harus angka 1-9999')
    if errors:
        return jsonify({'status': 'error', 'message': '. '.join(errors)}), 400

    hostname = generate_hostname(
        data['platform'], data['pabrikan'],
        data['reg'], data['sto'],
        data['customer'], data['lokasi']
    )
    site_id = generate_site_id(
        data['type_edge'], data['kode_cust'],
        data['kode_reg'], data['kode_branch']
    )

    # ── Validasi Duplikasi Data (Sistem IP & Site ID) ────────────────────────
    with get_db() as conn:
        existing_ip = conn.execute(
            'SELECT id, nama_pelanggan FROM inventory WHERE sistem_ip = ? AND is_deleted = 0',
            (data['sistem_ip'].strip(),)
        ).fetchone()
        if existing_ip:
            return jsonify({
                'status': 'error',
                'message': f'Gagal: Sistem IP {data["sistem_ip"]} sudah terpakai oleh {existing_ip["nama_pelanggan"]}'
            }), 400

        existing_site = conn.execute(
            'SELECT id, nama_pelanggan FROM inventory WHERE site_id = ? AND is_deleted = 0',
            (site_id,)
        ).fetchone()
        if existing_site:
            return jsonify({
                'status': 'error',
                'message': f'Gagal: Site ID {site_id} sudah terpakai oleh {existing_site["nama_pelanggan"]}'
            }), 400


    record = {
        'order_sdwan':      data.get('order_sdwan', '').upper(),
        'nama_pelanggan':   data['customer'].upper(),
        'alias':            data.get('alias', '').upper(),
        'lokasi':           data['lokasi'].upper(),
        'alamat':           data.get('alamat', ''),
        'sto':              data['sto'].upper(),
        'reg':              data['reg'].upper(),
        'status_link':      data.get('status_link', ''),
        'sid_sdwan':        data.get('sid_sdwan', ''),
        'sid_connectivity': data.get('sid_connectivity', ''),
        'taskname':         data.get('taskname', ''),
        'status':           data.get('status', ''),
        'status_ncx':       data.get('status_ncx', ''),
        'hostname':         hostname,
        'sistem_ip':        data['sistem_ip'],
        'site_id':          site_id,
        'type_edge':        data['type_edge'],
        'serial_number':    data.get('serial_number', ''),
        'created_at':       datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
    }

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            '''INSERT INTO inventory
               (order_sdwan, nama_pelanggan, alias, lokasi, alamat, sto, reg,
                status_link, sid_sdwan, sid_connectivity, taskname, status, status_ncx,
                hostname, sistem_ip, site_id, type_edge, serial_number, created_at)
               VALUES
               (:order_sdwan, :nama_pelanggan, :alias, :lokasi, :alamat, :sto, :reg,
                :status_link, :sid_sdwan, :sid_connectivity, :taskname, :status, :status_ncx,
                :hostname, :sistem_ip, :site_id, :type_edge, :serial_number, :created_at)''',
            record
        )
        conn.commit()
        new_id = cursor.lastrowid

    try:
        import sheets_sync
        sync_record = {**record, 'id': new_id}
        sheets_sync.add_row_async(sync_record)
    except Exception as e:
        app.logger.error(f"Gagal memicu sinkronisasi Google Sheets: {e}")

    return jsonify({'status': 'success', 'id': new_id, 'hostname': hostname, 'site_id': site_id}), 201


@app.route('/api/devices/<int:device_id>', methods=['GET'])
def get_device(device_id):
    """GET /api/devices/<id> → detail satu record."""
    with get_db() as conn:
        row = conn.execute('SELECT * FROM inventory WHERE id = ?', (device_id,)).fetchone()
    if not row:
        return jsonify({'status': 'error', 'message': 'Not found'}), 404
    return jsonify(row_to_dict(row))


@app.route('/api/devices/ping/<ip>', methods=['POST'])
def ping_device(ip):
    """POST /api/devices/ping/<ip> → Membuka terminal lokal OS dan menjalankan ping."""
    if not re.match(r'^[0-9\.]+$', ip):
        return jsonify({'status': 'error', 'message': 'Format IP tidak valid untuk ping'}), 400

    os_type = platform.system().lower()
    try:
        if 'windows' in os_type:
            # cmd.exe /c start cmd.exe /k ping <ip>
            subprocess.Popen(['cmd.exe', '/c', 'start', 'cmd.exe', '/k', f'ping {ip}'])
        elif 'darwin' in os_type:
            script = f'tell application "Terminal" to do script "ping {ip}"'
            subprocess.Popen(['osascript', '-e', script])
        else: # Linux
            terminals = ['gnome-terminal', 'konsole', 'xterm', 'kitty', 'alacritty']
            launched = False
            for term in terminals:
                try:
                    if term == 'gnome-terminal':
                        subprocess.Popen(['gnome-terminal', '--', 'ping', ip])
                    else:
                        subprocess.Popen([term, '-e', f'ping {ip}'])
                    launched = True
                    break
                except FileNotFoundError:
                    continue
            if not launched:
                return jsonify({'status': 'error', 'message': 'Terminal emulator tidak ditemukan pada sistem Linux ini.'}), 500
                
        return jsonify({'status': 'success', 'message': f'Terminal ping berhasil diluncurkan untuk IP {ip}'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'Gagal meluncurkan terminal: {str(e)}'}), 500


@app.route('/api/devices/<int:device_id>', methods=['PUT'])
def update_device(device_id):
    """
    PUT /api/devices/<id> → update field record (inline edit).
    Jika field yang memengaruhi Hostname atau Site ID berubah,
    keduanya akan digenerate ulang secara otomatis.
    """
    data = sanitize_data(request.get_json(force=True))

    allowed = ['order_sdwan', 'nama_pelanggan', 'alias', 'lokasi', 'alamat',
               'sto', 'reg', 'status_link', 'sid_sdwan', 'sid_connectivity',
               'taskname', 'status', 'status_ncx', 'hostname', 'sistem_ip',
               'site_id', 'type_edge', 'serial_number',
               'platform', 'pabrikan', 'kode_cust', 'kode_reg', 'kode_branch']

    updates = {k: v for k, v in data.items() if k in allowed}
    if not updates:
        return jsonify({'status': 'error', 'message': 'Tidak ada field valid'}), 400

    if 'sistem_ip' in updates:
        updates['sistem_ip'] = format_ip_address(updates['sistem_ip'])

    # ── Ambil record saat ini ─────────────────────────────────────────────────
    with get_db() as conn:
        row = conn.execute('SELECT * FROM inventory WHERE id = ?', (device_id,)).fetchone()
    if not row:
        return jsonify({'status': 'error', 'message': 'Not found'}), 404

    current = dict(row)

    # ── Regenerate Hostname jika field terkait berubah ────────────────────────
    # Hostname format: {platform2}{pabrikan2}-{reg}-{sto}-{nama}-{lokasi}
    HOSTNAME_DEPS = {'nama_pelanggan', 'lokasi', 'sto', 'reg', 'platform', 'pabrikan'}
    if any(f in updates for f in HOSTNAME_DEPS):
        merged   = {**current, **updates}
        curr_hn  = current.get('hostname', '')
        # Ekstrak platform/pabrikan lama jika tidak di-update
        prefix   = curr_hn[:4] if len(curr_hn) >= 4 else '0201'
        platform = updates.get('platform', prefix[:2])
        pabrikan = updates.get('pabrikan', prefix[2:4])
        
        updates['hostname'] = generate_hostname(
            platform, pabrikan,
            merged.get('reg', ''), merged.get('sto', ''),
            merged.get('nama_pelanggan', ''), merged.get('lokasi', '')
        )

    # ── Regenerate Site ID jika parameter terkait berubah ─────────────────────
    # Site ID format: {edge 1d}{cust 3d}{reg 1d}{branch 4d}  = 9 karakter
    if 'reg' in updates:
        import re
        match = re.search(r'\d+', updates['reg'])
        if match:
            updates['kode_reg'] = match.group()[0]

    SITEID_DEPS = {'type_edge', 'kode_cust', 'kode_reg', 'kode_branch'}
    if any(f in updates for f in SITEID_DEPS):
        curr_sid = current.get('site_id', '')
        # Ekstrak default lama jika tidak di-update
        old_edge   = curr_sid[0] if len(curr_sid) >= 9 else '2'
        old_cust   = curr_sid[1:4] if len(curr_sid) >= 9 else '001'
        old_reg    = curr_sid[4] if len(curr_sid) >= 9 else '1'
        old_branch = curr_sid[5:9] if len(curr_sid) >= 9 else '0001'
        
        edge   = updates.get('type_edge', old_edge)
        cust   = updates.get('kode_cust', old_cust)
        reg    = updates.get('kode_reg', old_reg)
        branch = updates.get('kode_branch', old_branch)
        
        updates['site_id'] = generate_site_id(edge, cust, reg, branch)

    # ── Validasi Duplikasi Data saat Update ──────────────────────────────────
    if 'sistem_ip' in updates:
        new_ip = updates['sistem_ip'].strip()
        with get_db() as conn:
            existing = conn.execute(
                'SELECT id, nama_pelanggan FROM inventory WHERE sistem_ip = ? AND id != ? AND is_deleted = 0',
                (new_ip, device_id)
            ).fetchone()
            if existing:
                return jsonify({
                    'status': 'error',
                    'message': f'Gagal: Sistem IP {new_ip} sudah terpakai oleh {existing["nama_pelanggan"]}'
                }), 400

    new_site_id = updates.get('site_id')
    if new_site_id:
        with get_db() as conn:
            existing = conn.execute(
                'SELECT id, nama_pelanggan FROM inventory WHERE site_id = ? AND id != ? AND is_deleted = 0',
                (new_site_id, device_id)
            ).fetchone()
            if existing:
                return jsonify({
                    'status': 'error',
                    'message': f'Gagal: Site ID {new_site_id} sudah terpakai oleh {existing["nama_pelanggan"]}'
                }), 400

    # ── Hapus virtual fields (non-DB columns) sebelum commit ke DB ────────────
    updates.pop('platform', None)
    updates.pop('pabrikan', None)
    updates.pop('kode_cust', None)
    updates.pop('kode_reg', None)
    updates.pop('kode_branch', None)

    # ── Simpan ke DB ──────────────────────────────────────────────────────────
    set_clause = ', '.join(f"{k} = ?" for k in updates)
    values     = list(updates.values()) + [device_id]

    with get_db() as conn:
        result = conn.execute(
            f'UPDATE inventory SET {set_clause} WHERE id = ?', values
        )
        conn.commit()

    if result.rowcount == 0:
        return jsonify({'status': 'error', 'message': 'Not found'}), 404

    try:
        import sheets_sync
        sheets_sync.update_row_async(device_id, updates)
    except Exception as e:
        app.logger.error(f"Gagal memicu sinkronisasi Google Sheets: {e}")

    return jsonify({
        'status':   'success',
        'hostname': updates.get('hostname'),
        'site_id':  updates.get('site_id'),
    })


@app.route('/api/devices/<int:device_id>', methods=['DELETE'])
def delete_device(device_id):
    """DELETE /api/devices/<id> → hapus satu record."""
    with get_db() as conn:
        result = conn.execute('UPDATE inventory SET is_deleted = 1 WHERE id = ?', (device_id,))
        conn.commit()
    if result.rowcount == 0:
        return jsonify({'status': 'error', 'message': 'Not found'}), 404

    try:
        import sheets_sync
        sheets_sync.soft_delete_row_async(device_id)
    except Exception as e:
        app.logger.error(f"Gagal memicu sinkronisasi Google Sheets: {e}")

    return jsonify({'status': 'success'})


# ── Recycle Bin Endpoints ────────────────────────────────────────────────────

@app.route('/api/inventory/trash', methods=['GET'])
def get_trash():
    """GET /api/inventory/trash → ambil data yang ada di Recycle Bin."""
    with get_db() as conn:
        rows = conn.execute(
            'SELECT id, hostname, sistem_ip, type_edge, nama_pelanggan FROM inventory WHERE is_deleted = 1 ORDER BY id DESC'
        ).fetchall()
    return jsonify([row_to_dict(r) for r in rows])


@app.route('/api/inventory/restore/<int:device_id>', methods=['POST'])
def restore_device(device_id):
    """POST /api/inventory/restore/<id> → kembalikan data dari Recycle Bin."""
    with get_db() as conn:
        # Cek apakah data ada di trash
        row = conn.execute('SELECT * FROM inventory WHERE id = ? AND is_deleted = 1', (device_id,)).fetchone()
        if not row:
            return jsonify({'status': 'error', 'message': 'Data tidak ditemukan di Recycle Bin'}), 404
        
        # Validasi duplikasi IP & Site ID sebelum restore
        existing_ip = conn.execute(
            'SELECT id, nama_pelanggan FROM inventory WHERE sistem_ip = ? AND is_deleted = 0',
            (row['sistem_ip'],)
        ).fetchone()
        if existing_ip:
            return jsonify({
                'status': 'error',
                'message': f'Gagal Restore: IP {row["sistem_ip"]} sudah dipakai oleh {existing_ip["nama_pelanggan"]} (Aktif)'
            }), 400
            
        existing_site = conn.execute(
            'SELECT id, nama_pelanggan FROM inventory WHERE site_id = ? AND is_deleted = 0',
            (row['site_id'],)
        ).fetchone()
        if existing_site:
            return jsonify({
                'status': 'error',
                'message': f'Gagal Restore: Site ID {row["site_id"]} sudah dipakai oleh {existing_site["nama_pelanggan"]} (Aktif)'
            }), 400

        # Lakukan restore
        conn.execute('UPDATE inventory SET is_deleted = 0 WHERE id = ?', (device_id,))
        conn.commit()
        
    try:
        import sheets_sync
        sheets_sync.restore_row_async(device_id)
    except Exception as e:
        app.logger.error(f"Gagal memicu sinkronisasi Google Sheets: {e}")

    return jsonify({'status': 'success', 'message': 'Data berhasil dikembalikan'})


@app.route('/api/inventory/hard/<int:device_id>', methods=['DELETE'])
def hard_delete_device(device_id):
    """DELETE /api/inventory/hard/<id> → hapus data secara permanen."""
    with get_db() as conn:
        result = conn.execute('DELETE FROM inventory WHERE id = ? AND is_deleted = 1', (device_id,))
        conn.commit()
    if result.rowcount == 0:
        return jsonify({'status': 'error', 'message': 'Not found or not in trash'}), 404

    try:
        import sheets_sync
        sheets_sync.hard_delete_row_async(device_id)
    except Exception as e:
        app.logger.error(f"Gagal memicu sinkronisasi Google Sheets: {e}")

    return jsonify({'status': 'success'})


@app.route('/api/inventory/empty_trash', methods=['DELETE'])
def empty_trash():
    """DELETE /api/inventory/empty_trash → kosongkan semua isi Recycle Bin."""
    with get_db() as conn:
        conn.execute('DELETE FROM inventory WHERE is_deleted = 1')
        conn.commit()
        
    try:
        import sheets_sync
        sheets_sync.empty_trash_async()
    except Exception as e:
        app.logger.error(f"Gagal memicu sinkronisasi Google Sheets: {e}")

    return jsonify({'status': 'success'})


@app.route('/api/stats', methods=['GET'])
def get_stats():
    """GET /api/stats → ringkasan statistik database perangkat."""
    with get_db() as conn:
        rows = conn.execute('SELECT hostname, type_edge FROM inventory WHERE is_deleted = 0').fetchall()
    
    total = len(rows)
    pabrikan_counts = {
        'Cisco': 0,
        'VMware': 0,
        'ZTE': 0,
        'Fiberhome': 0,
        'Hughes': 0,
        'Raisecom': 0,
        'Newtec': 0,
        'Fortinet': 0,
        'Lainnya': 0
    }
    platform_counts = {
        'L2SWITCH': 0,
        'SD-WAN': 0,
        'VSAT IP': 0,
        'Lainnya': 0
    }
    edge_counts = {
        'Store / Little Branch': 0,
        'Regional Branch / Aggregate': 0,
        'HO / Data Center': 0,
        'Lainnya': 0
    }
    
    pabrikan_map = {
        '01': 'Cisco',
        '02': 'VMware',
        '03': 'ZTE',
        '04': 'Fiberhome',
        '05': 'Hughes',
        '06': 'Raisecom',
        '07': 'Newtec',
        '08': 'Fortinet'
    }
    platform_map = {
        '01': 'L2SWITCH',
        '02': 'SD-WAN',
        '03': 'VSAT IP'
    }
    edge_map = {
        '1': 'Store / Little Branch',
        '2': 'Regional Branch / Aggregate',
        '3': 'HO / Data Center'
    }

    for r in rows:
        hn = r['hostname'] or ''
        edge = r['type_edge'] or ''
        
        # Ekstrak platform & pabrikan dari prefix hostname (4 digit pertama)
        if len(hn) >= 4:
            plat_code = hn[0:2]
            pabr_code = hn[2:4]
        else:
            plat_code = ''
            pabr_code = ''
            
        plat_name = platform_map.get(plat_code, 'Lainnya')
        platform_counts[plat_name] += 1
        
        pabr_name = pabrikan_map.get(pabr_code, 'Lainnya')
        pabrikan_counts[pabr_name] += 1
        
        edge_name = edge_map.get(edge, 'Lainnya')
        edge_counts[edge_name] += 1
        
    return jsonify({
        'total': total,
        'pabrikan': pabrikan_counts,
        'platform': platform_counts,
        'edge': edge_counts
    })



# ---------------------------------------------------------------------------
# Routes — Import
# ---------------------------------------------------------------------------

@app.route('/api/import', methods=['POST'])
def import_records():
    """
    POST /api/import → import dari JSON (xlsx di-parse client-side dengan SheetJS).
    Body: {"records": [{...}, ...]}
    """
    data = sanitize_data(request.get_json(force=True))
    records = data.get('records', [])
    if not records:
        return jsonify({'status': 'error', 'message': 'Tidak ada data untuk diimport'}), 400

    # Mapping nama kolom Excel → nama kolom DB
    # Mencakup semua variasi penamaan dari berbagai file Excel
    col_map = {
        # Order SD-WAN
        'Order SD-WAN':      'order_sdwan',
        'Order SDWAN':       'order_sdwan',
        'ORDER SDWAN':       'order_sdwan',
        'order_sdwan':       'order_sdwan',
        # Nama Pelanggan
        'Nama Pelanggan':    'nama_pelanggan',
        'NAMA PELANGGAN':    'nama_pelanggan',
        'nama_pelanggan':    'nama_pelanggan',
        # Alias
        'Alias':             'alias',
        'ALIAS':             'alias',
        'alias':             'alias',
        # Lokasi
        'Lokasi':            'lokasi',
        'LOKASI':            'lokasi',
        'lokasi':            'lokasi',
        # Alamat
        'Alamat':            'alamat',
        'ALAMAT':            'alamat',
        'alamat':            'alamat',
        # STO
        'STO':               'sto',
        'sto':               'sto',
        # REG
        'REG':               'reg',
        'reg':               'reg',
        # Status Link
        'Status Link':       'status_link',
        'STATUS LINK':       'status_link',
        'status_link':       'status_link',
        # SID SD-WAN
        'SID SD-WAN':        'sid_sdwan',
        'SID SDWAN':         'sid_sdwan',
        'sid_sdwan':         'sid_sdwan',
        # SID Connectivity
        'SID Connectivity':  'sid_connectivity',
        'SID CONNECTIVITY':  'sid_connectivity',
        'sid_connectivity':  'sid_connectivity',
        # Taskname
        'Taskname':          'taskname',
        'TASKNAME':          'taskname',
        'taskname':          'taskname',
        # Status Pengerjaan
        'Status Pengerjaan': 'status',
        'STATUS PENGERJAAN': 'status',
        'Status Taskname':   'status',
        'STATUS TASKNAME':   'status',
        'Status':            'status',
        'status':            'status',
        # Status NCX
        'Status NCX':        'status_ncx',
        'STATUS NCX':        'status_ncx',
        'status_ncx':        'status_ncx',
        # Hostname
        'Hostname':          'hostname',
        'HOSTNAME':          'hostname',
        'hostname':          'hostname',
        # Sistem IP
        'Sistem IP':         'sistem_ip',
        'System IP':         'sistem_ip',
        'SISTEM IP':         'sistem_ip',
        'sistem_ip':         'sistem_ip',
        # Site ID
        'Site ID':           'site_id',
        'SITE ID':           'site_id',
        'site_id':           'site_id',
        # Type Edge
        'Type Edge':         'type_edge',
        'TYPE EDGE':         'type_edge',
        'type_edge':         'type_edge',
        # Serial Number
        'Serial Number':     'serial_number',
        'SERIAL NUMBER':     'serial_number',
        'serial_number':     'serial_number',
        # Created At
        'Created At':        'created_at',
        'created_at':        'created_at',
    }


    inserted = 0
    skipped  = 0
    errors   = []
    inserted_records = []

    with get_db() as conn:
        for i, row in enumerate(records):
            mapped = {}
            for excel_col, db_col in col_map.items():
                val = row.get(excel_col)
                if val is not None and str(val).strip():
                    mapped[db_col] = str(val).strip()

            if 'sistem_ip' in mapped:
                mapped['sistem_ip'] = format_ip_address(mapped['sistem_ip'])

            if not mapped.get('nama_pelanggan') and not mapped.get('hostname'):
                skipped += 1
                continue

            mapped.setdefault('created_at', datetime.now().strftime('%Y-%m-%d %H:%M:%S'))

            cols         = ', '.join(mapped.keys())
            placeholders = ', '.join('?' for _ in mapped)
            try:
                cursor = conn.execute(
                    f'INSERT INTO inventory ({cols}) VALUES ({placeholders})',
                    list(mapped.values())
                )
                inserted += 1
                new_id = cursor.lastrowid
                mapped['id'] = new_id
                inserted_records.append(mapped)
            except Exception as e:
                errors.append(f'Baris {i+2}: {str(e)}')

        conn.commit()

    if inserted_records:
        try:
            import sheets_sync
            sheets_sync.add_rows_async(inserted_records)
        except Exception as e:
            app.logger.error(f"Gagal memicu sinkronisasi Google Sheets untuk import: {e}")

    return jsonify({'status': 'success', 'inserted': inserted, 'skipped': skipped, 'errors': errors})


@app.route('/api/import-db', methods=['POST'])
def import_db_file():
    """POST /api/import-db → import dari file SQLite (.db)."""
    if 'file' not in request.files:
        return jsonify({'status': 'error', 'message': 'Tidak ada file yang diunggah'}), 400

    f = request.files['file']
    if not f.filename.lower().endswith('.db'):
        return jsonify({'status': 'error', 'message': 'Format file harus .db'}), 400

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.db')
    try:
        f.save(tmp.name)
        tmp.close()

        src = sqlite3.connect(tmp.name)
        src.row_factory = sqlite3.Row

        tables = [r[0] for r in src.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()]

        if 'inventory' not in tables:
            src.close()
            return jsonify({
                'status': 'error',
                'message': 'Tabel "inventory" tidak ditemukan di file .db yang diunggah'
            }), 400

        rows = src.execute('SELECT * FROM inventory').fetchall()
        src.close()

        allowed_cols = ['order_sdwan', 'nama_pelanggan', 'alias', 'lokasi', 'alamat',
                        'sto', 'reg', 'status_link', 'sid_sdwan', 'sid_connectivity',
                        'taskname', 'status', 'status_ncx', 'hostname', 'sistem_ip',
                        'site_id', 'type_edge', 'serial_number', 'created_at']
        inserted = 0
        inserted_records = []

        with get_db() as conn:
            for row in rows:
                d        = {k: v for k, v in dict(row).items() if k in allowed_cols and v}
                d.setdefault('created_at', datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
                if not d.get('nama_pelanggan') and not d.get('hostname'):
                    continue
                cols         = ', '.join(d.keys())
                placeholders = ', '.join('?' for _ in d)
                cursor = conn.execute(
                    f'INSERT INTO inventory ({cols}) VALUES ({placeholders})',
                    list(d.values())
                )
                inserted += 1
                new_id = cursor.lastrowid
                d['id'] = new_id
                inserted_records.append(d)
            conn.commit()

        if inserted_records:
            try:
                import sheets_sync
                sheets_sync.add_rows_async(inserted_records)
            except Exception as e:
                app.logger.error(f"Gagal memicu sinkronisasi Google Sheets untuk import DB: {e}")

        return jsonify({'status': 'success', 'inserted': inserted})

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        try:
            os.unlink(tmp.name)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Routes — Sync FROM Google Sheets → sdwan.db
# ---------------------------------------------------------------------------

@app.route('/api/sync-from-sheets/preview', methods=['GET'])
def sync_from_sheets_preview():
    """
    GET /api/sync-from-sheets/preview
    Membaca Google Sheets tanpa mengubah database, mengembalikan:
    - count: jumlah baris data aktif di Sheets
    - local_count: jumlah baris data aktif di sdwan.db
    - status: 'ok', 'not_configured', atau 'error'
    """
    try:
        import sheets_sync
        result = sheets_sync.read_all_rows()
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e), 'count': 0}), 500

    with get_db() as conn:
        local_count = conn.execute(
            'SELECT COUNT(*) FROM inventory WHERE is_deleted = 0'
        ).fetchone()[0]

    return jsonify({
        'status':      result['status'],
        'count':       result['count'],
        'local_count': local_count,
        'message':     result.get('message', '')
    })


@app.route('/api/sync-from-sheets', methods=['POST'])
def sync_from_sheets_execute():
    """
    POST /api/sync-from-sheets
    Eksekusi sinkronisasi: membaca semua data dari Google Sheets,
    menghapus seluruh data aktif di sdwan.db, lalu memasukkan ulang
    data yang terbaca dari Sheets.
    Body JSON: { "force": true }  ← diperlukan jika Sheets kosong
    """
    body  = request.get_json(force=True) or {}
    force = bool(body.get('force', False))

    try:
        import sheets_sync
        result = sheets_sync.read_all_rows()
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'Gagal membaca Google Sheets: {e}'}), 500

    if result['status'] == 'not_configured':
        return jsonify({
            'status':  'error',
            'message': 'Google Sheets belum dikonfigurasi. Pastikan credentials.json dan config_sheets.txt sudah ada.'
        }), 400

    if result['status'] == 'error':
        return jsonify({'status': 'error', 'message': result.get('message', 'Gagal membaca Sheets')}), 500

    sheets_rows = result['rows']

    # Perlindungan: Sheets kosong tapi tidak ada flag force
    if len(sheets_rows) == 0 and not force:
        return jsonify({
            'status':  'empty_warning',
            'message': 'Data di Google Sheets kosong. Sinkronisasi akan menghapus semua data lokal!',
            'count':   0
        }), 200

    # ── Eksekusi Sinkronisasi ────────────────────────────────────────
    allowed_cols = {
        'id', 'order_sdwan', 'nama_pelanggan', 'alias', 'lokasi', 'alamat',
        'sto', 'reg', 'status_link', 'sid_sdwan', 'sid_connectivity',
        'taskname', 'status', 'status_ncx', 'hostname', 'sistem_ip',
        'site_id', 'type_edge', 'serial_number', 'created_at'
    }

    inserted = 0
    with get_db() as conn:
        # Hapus semua data aktif (is_deleted=0) lalu timpa dengan data Sheets
        conn.execute('DELETE FROM inventory WHERE is_deleted = 0')

        for row in sheets_rows:
            d = {k: v for k, v in row.items() if k in allowed_cols and v}
            if not d.get('nama_pelanggan') and not d.get('hostname'):
                continue
            d.setdefault('created_at', datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
            cols         = ', '.join(d.keys())
            placeholders = ', '.join('?' for _ in d)
            conn.execute(
                f'INSERT INTO inventory ({cols}) VALUES ({placeholders})',
                list(d.values())
            )
            inserted += 1

        conn.commit()

    app.logger.info(f"Sync from Sheets: {inserted} baris berhasil dimasukkan ke sdwan.db")
    return jsonify({
        'status':   'success',
        'inserted': inserted,
        'message':  f'{inserted} data berhasil disinkronkan dari Google Sheets ke database lokal.'
    })


# ---------------------------------------------------------------------------
# Routes — Localization
# ---------------------------------------------------------------------------

@app.route('/lang/<lang_code>', methods=['GET'])
def get_lang(lang_code):
    """GET /lang/<lang_code> → Mengembalikan berkas terjemahan JSON dari folder /lang."""
    if lang_code not in ('id', 'en'):
        return jsonify({'status': 'error', 'message': 'Bahasa tidak didukung'}), 400
    try:
        lang_path = os.path.join(app.root_path, 'lang', f'{lang_code}.json')
        if not os.path.exists(lang_path):
            lang_path = os.path.join('lang', f'{lang_code}.json')
        with open(lang_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return jsonify(data)
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'Gagal memuat bahasa: {str(e)}'}), 500


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    init_db()
    app.run(debug=True, port=5000)
