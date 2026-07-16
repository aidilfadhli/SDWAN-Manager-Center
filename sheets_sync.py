import os
import logging
import threading
from google.oauth2.service_account import Credentials
import gspread

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sheets_sync")

# File konfigurasi & kredensial
CREDENTIALS_FILE = "credentials.json"
CONFIG_FILE = "config_sheets.txt"

# Default Spreadsheet ID (User can change this in config_sheets.txt)
DEFAULT_SPREADSHEET_ID = "YOUR_SPREADSHEET_ID_HERE"

def get_spreadsheet_id():
    """Membaca Spreadsheet ID dari config_sheets.txt atau environment variable."""
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                sid = f.read().strip()
                if sid and sid != DEFAULT_SPREADSHEET_ID:
                    return sid
        except Exception as e:
            logger.error(f"Gagal membaca config_sheets.txt: {e}")
    
    # Buat file template jika belum ada
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            f.write(DEFAULT_SPREADSHEET_ID)
    except Exception:
        pass
    
    return os.environ.get("SPREADSHEET_ID", DEFAULT_SPREADSHEET_ID)

def get_worksheet():
    """Melakukan otentikasi gspread dan mengambil worksheet aktif."""
    spreadsheet_id = get_spreadsheet_id()
    if not spreadsheet_id or spreadsheet_id == DEFAULT_SPREADSHEET_ID:
        logger.warning("Google Spreadsheet ID belum dikonfigurasi. Hubungkan di config_sheets.txt.")
        return None

    if not os.path.exists(CREDENTIALS_FILE):
        logger.warning(f"File kredensial {CREDENTIALS_FILE} tidak ditemukan. Sinkronisasi Google Sheets dinonaktifkan.")
        return None

    try:
        scopes = [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive"
        ]
        creds = Credentials.from_service_account_file(CREDENTIALS_FILE, scopes=scopes)
        client = gspread.authorize(creds)
        sh = client.open_by_key(spreadsheet_id)
        
        # Ambil sheet pertama
        return sh.get_worksheet(0)
    except Exception as e:
        logger.error(f"Gagal inisialisasi client gspread: {e}")
        return None

def setup_dropdowns_and_formatting(worksheet):
    """
    Mengatur Dropdown (Data Validation) dan Conditional Formatting
    berdasarkan opsi & warna dari Web App untuk kolom Link Status (10),
    Work Status (11), dan NCX Status (12).
    """
    try:
        sheet_id = worksheet.id
        spreadsheet = worksheet.spreadsheet

        # Opsi dropdown untuk masing-masing kolom
        # Link Status (Col 10): index 9 ke 10
        # Work Status (Col 11): index 10 ke 11
        # NCX Status (Col 12): index 11 ke 12
        validation_rules = [
            {
                "range": {"sheetId": sheet_id, "startRowIndex": 1, "endRowIndex": 5000, "startColumnIndex": 9, "endColumnIndex": 10},
                "values": ["DONE", "CANCEL", "PENDING", "UNKNOWN"]
            },
            {
                "range": {"sheetId": sheet_id, "startRowIndex": 1, "endRowIndex": 5000, "startColumnIndex": 10, "endColumnIndex": 11},
                "values": ["DONE", "IN PROCESS", "CANCEL", "UNKNOWN"]
            },
            {
                "range": {"sheetId": sheet_id, "startRowIndex": 1, "endRowIndex": 5000, "startColumnIndex": 11, "endColumnIndex": 12},
                "values": ["DONE", "IN PROCESS", "PENDING", "UNKNOWN"]
            }
        ]

        requests = []

        # 1. Tambahkan request untuk Data Validation (Dropdown)
        for rule in validation_rules:
            requests.append({
                "setDataValidation": {
                    "range": rule["range"],
                    "rule": {
                        "condition": {
                            "type": "ONE_OF_LIST",
                            "values": [{"userEnteredValue": val} for val in rule["values"]]
                        },
                        "showCustomUi": True,
                        "strict": False
                    }
                }
            })

        # Definisikan aturan warna (RGB dalam rentang 0.0 - 1.0)
        all_status_range = {
            "sheetId": sheet_id, "startRowIndex": 1, "endRowIndex": 5000, "startColumnIndex": 9, "endColumnIndex": 12
        }
        link_status_range = {
            "sheetId": sheet_id, "startRowIndex": 1, "endRowIndex": 5000, "startColumnIndex": 9, "endColumnIndex": 10
        }
        ncx_status_range = {
            "sheetId": sheet_id, "startRowIndex": 1, "endRowIndex": 5000, "startColumnIndex": 11, "endColumnIndex": 12
        }

        color_rules = [
            # Hijau (DONE)
            {"vals": ["DONE"], "ranges": [all_status_range], "bg": (0.86, 0.99, 0.91), "fg": (0.09, 0.64, 0.29)},
            # Merah (CANCEL, PENDING in NCX)
            {"vals": ["CANCEL"], "ranges": [all_status_range], "bg": (0.99, 0.89, 0.89), "fg": (0.86, 0.15, 0.15)},
            {"vals": ["PENDING"], "ranges": [ncx_status_range], "bg": (0.99, 0.89, 0.89), "fg": (0.86, 0.15, 0.15)},
            # Orange (IN PROCESS, PENDING in Link Status)
            {"vals": ["IN PROCESS"], "ranges": [all_status_range], "bg": (1.0, 0.93, 0.84), "fg": (0.92, 0.35, 0.05)},
            {"vals": ["PENDING"], "ranges": [link_status_range], "bg": (1.0, 0.93, 0.84), "fg": (0.92, 0.35, 0.05)},
            # Biru (UNKNOWN)
            {"vals": ["UNKNOWN"], "ranges": [all_status_range], "bg": (0.86, 0.92, 0.99), "fg": (0.15, 0.39, 0.92)},
        ]

        for idx, rule in enumerate(color_rules):
            for val in rule["vals"]:
                requests.append({
                    "addConditionalFormatRule": {
                        "rule": {
                            "ranges": rule["ranges"],
                            "booleanRule": {
                                "condition": {
                                    "type": "TEXT_EQ",
                                    "values": [{"userEnteredValue": val}]
                                },
                                "format": {
                                    "backgroundColor": {
                                        "red": rule["bg"][0],
                                        "green": rule["bg"][1],
                                        "blue": rule["bg"][2]
                                    },
                                    "textFormat": {
                                        "foregroundColor": {
                                            "red": rule["fg"][0],
                                            "green": rule["fg"][1],
                                            "blue": rule["fg"][2]
                                        },
                                        "bold": True
                                    }
                                }
                            }
                        },
                        "index": 0
                    }
                })

        body = {"requests": requests}
        spreadsheet.batch_update(body)
        logger.info("Dropdown & conditional formatting berhasil diterapkan ke Google Sheets.")
    except Exception as e:
        logger.warning(f"Gagal mengatur format dropdown/warna ke Google Sheets (Diabaikan): {e}")

def init_headers_if_empty(worksheet):
    """Menulis header kolom di baris pertama jika sheet masih kosong."""
    try:
        headers = [
            "ID", "Order SD-WAN", "Customer Name", "Alias", "Site ID", "Hostname",
            "System IP", "STO", "REG", "Link Status", "Work Status", "NCX Status",
            "Location", "Full Address", "Serial Number", "SID SD-WAN", "SID Connectivity",
            "Taskname", "Created At", "Status"
        ]
        first_row = worksheet.row_values(1)
        if not first_row or not first_row[0].strip():
            worksheet.insert_row(headers, 1)
            logger.info("Header kolom berhasil diinisialisasi di Google Sheets.")
        
        # Selalu terapkan dropdown dan warna conditional formatting agar konsisten
        setup_dropdowns_and_formatting(worksheet)
    except Exception as e:
        logger.error(f"Gagal menulis header kolom: {e}")

def map_device_to_row(device):
    """Memetakan model data SQLite ke list kolom Google Sheets."""
    return [
        str(device.get("id", "")),
        str(device.get("order_sdwan", "")).upper(),
        str(device.get("nama_pelanggan", "")).upper(),
        str(device.get("alias", "")).upper(),
        str(device.get("site_id", "")),
        str(device.get("hostname", "")),
        str(device.get("sistem_ip", "")),
        str(device.get("sto", "")).upper(),
        str(device.get("reg", "")).upper(),
        str(device.get("status_link", "")),
        str(device.get("status", "")),
        str(device.get("status_ncx", "")),
        str(device.get("lokasi", "")).upper(),
        str(device.get("alamat", "")),
        str(device.get("serial_number", "")).upper(),
        str(device.get("sid_sdwan", "")),
        str(device.get("sid_connectivity", "")),
        str(device.get("taskname", "")),
        str(device.get("created_at", "")),
        "DELETED" if device.get("is_deleted") else "ACTIVE"
    ]

# ── Operasi Sinkronisasi Sinkron (Dalam Thread) ───────────────────

def _add_row_sync(device):
    worksheet = get_worksheet()
    if not worksheet:
        return
    try:
        init_headers_if_empty(worksheet)
        row_values = map_device_to_row(device)
        worksheet.append_row(row_values)
        logger.info(f"Sheets: Berhasil menambah data ID {device.get('id')}")
    except Exception as e:
        logger.error(f"Sheets: Gagal menambah data ID {device.get('id')}: {e}")

def _update_row_sync(device_id, updates):
    worksheet = get_worksheet()
    if not worksheet:
        return
    try:
        # Cari row berdasarkan ID perangkat di Kolom 1
        id_list = worksheet.col_values(1)
        try:
            row_num = id_list.index(str(device_id)) + 1
        except ValueError:
            logger.warning(f"Sheets: ID {device_id} tidak ditemukan untuk di-update.")
            return

        # Peta header kolom untuk mencocokkan index update
        headers = [
            "ID", "Order SD-WAN", "Customer Name", "Alias", "Site ID", "Hostname",
            "System IP", "STO", "REG", "Link Status", "Work Status", "NCX Status",
            "Location", "Full Address", "Serial Number", "SID SD-WAN", "SID Connectivity",
            "Taskname", "Created At", "Status"
        ]
        
        # Mapping dari field database ke header Google Sheet
        field_map = {
            "order_sdwan": "Order SD-WAN",
            "nama_pelanggan": "Customer Name",
            "alias": "Alias",
            "site_id": "Site ID",
            "hostname": "Hostname",
            "sistem_ip": "System IP",
            "sto": "STO",
            "reg": "REG",
            "status_link": "Link Status",
            "status": "Work Status",
            "status_ncx": "NCX Status",
            "lokasi": "Location",
            "alamat": "Full Address",
            "serial_number": "Serial Number",
            "sid_sdwan": "SID SD-WAN",
            "sid_connectivity": "SID Connectivity",
            "taskname": "Taskname",
            "created_at": "Created At",
            "is_deleted": "Status"
        }

        # Lakukan pembaruan untuk setiap field yang dikirim
        for field, new_val in updates.items():
            header_name = field_map.get(field)
            if header_name and header_name in headers:
                col_num = headers.index(header_name) + 1
                
                # Format value khusus
                if field == "is_deleted":
                    val_str = "DELETED" if new_val else "ACTIVE"
                else:
                    val_str = str(new_val)
                    if field in ("order_sdwan", "nama_pelanggan", "alias", "sto", "reg", "lokasi", "serial_number"):
                        val_str = val_str.upper()

                worksheet.update_cell(row_num, col_num, val_str)
        
        logger.info(f"Sheets: Berhasil update data ID {device_id}")
    except Exception as e:
        logger.error(f"Sheets: Gagal update data ID {device_id}: {e}")

def _delete_row_sync(device_id, hard=False):
    worksheet = get_worksheet()
    if not worksheet:
        return
    try:
        id_list = worksheet.col_values(1)
        try:
            row_num = id_list.index(str(device_id)) + 1
        except ValueError:
            logger.warning(f"Sheets: ID {device_id} tidak ditemukan untuk dihapus.")
            return

        if hard:
            worksheet.delete_rows(row_num)
            logger.info(f"Sheets: Berhasil menghapus permanen data ID {device_id}")
        else:
            # Soft delete -> ubah status menjadi DELETED di kolom 20
            worksheet.update_cell(row_num, 20, "DELETED")
            logger.info(f"Sheets: Berhasil memindahkan data ID {device_id} ke Recycle Bin")
    except Exception as e:
        logger.error(f"Sheets: Gagal menghapus data ID {device_id}: {e}")

def _restore_row_sync(device_id):
    worksheet = get_worksheet()
    if not worksheet:
        return
    try:
        id_list = worksheet.col_values(1)
        try:
            row_num = id_list.index(str(device_id)) + 1
        except ValueError:
            logger.warning(f"Sheets: ID {device_id} tidak ditemukan untuk dipulihkan.")
            return

        # Restore -> ubah status menjadi ACTIVE di kolom 20
        worksheet.update_cell(row_num, 20, "ACTIVE")
        logger.info(f"Sheets: Berhasil memulihkan data ID {device_id}")
    except Exception as e:
        logger.error(f"Sheets: Gagal memulihkan data ID {device_id}: {e}")

def _empty_trash_sync():
    worksheet = get_worksheet()
    if not worksheet:
        return
    try:
        # Baca semua kolom status (kolom 20)
        status_list = worksheet.col_values(20)
        
        # Hapus baris dari bawah ke atas agar indeks baris tidak bergeser saat proses penghapusan
        deleted_count = 0
        for i in range(len(status_list) - 1, -1, -1):
            if status_list[i].upper() == "DELETED":
                row_num = i + 1
                worksheet.delete_rows(row_num)
                deleted_count += 1
        
        if deleted_count > 0:
            logger.info(f"Sheets: Berhasil membersihkan {deleted_count} data DELETED dari Recycle Bin.")
    except Exception as e:
        logger.error(f"Sheets: Gagal mengosongkan Recycle Bin Google Sheets: {e}")

# ── Rute Wrapper Asinkron untuk dipanggil Flask ───────────────────

def run_async(func, *args, **kwargs):
    """Wrapper pembantu untuk mengeksekusi operasi gspread secara non-blocking."""
    t = threading.Thread(target=func, args=args, kwargs=kwargs)
    t.daemon = True
    t.start()

def add_row_async(device):
    run_async(_add_row_sync, device)

def update_row_async(device_id, updates):
    run_async(_update_row_sync, device_id, updates)

def soft_delete_row_async(device_id):
    run_async(_delete_row_sync, device_id, hard=False)

def hard_delete_row_async(device_id):
    run_async(_delete_row_sync, device_id, hard=True)

def restore_row_async(device_id):
    run_async(_restore_row_sync, device_id)

def empty_trash_async():
    run_async(_empty_trash_sync)

def _add_rows_sync(devices):
    worksheet = get_worksheet()
    if not worksheet:
        return
    try:
        init_headers_if_empty(worksheet)
        rows_values = [map_device_to_row(d) for d in devices]
        if rows_values:
            worksheet.append_rows(rows_values)
            logger.info(f"Sheets: Berhasil mengimport {len(rows_values)} data sekaligus.")
    except Exception as e:
        logger.error(f"Sheets: Gagal mengimport data massal: {e}")

def add_rows_async(devices):
    run_async(_add_rows_sync, devices)

def read_all_rows():
    """
    Membaca semua baris data dari Google Sheets dan mengkonversinya
    kembali ke format dictionary sesuai kolom database.
    Returns: {'status': 'ok', 'count': int, 'rows': [dict, ...]}
             {'status': 'error', 'message': str}
             {'status': 'not_configured'}
    """
    worksheet = get_worksheet()
    if not worksheet:
        return {'status': 'not_configured', 'count': 0, 'rows': []}

    try:
        all_values = worksheet.get_all_values()

        if not all_values or len(all_values) < 2:
            return {'status': 'ok', 'count': 0, 'rows': []}

        header_row = all_values[0]
        data_rows  = all_values[1:]

        # Mapping header Google Sheets → nama kolom database
        header_to_db = {
            "ID":               "id",
            "Order SD-WAN":     "order_sdwan",
            "Customer Name":    "nama_pelanggan",
            "Alias":            "alias",
            "Site ID":          "site_id",
            "Hostname":         "hostname",
            "System IP":        "sistem_ip",
            "STO":              "sto",
            "REG":              "reg",
            "Link Status":      "status_link",
            "Work Status":      "status",
            "NCX Status":       "status_ncx",
            "Location":         "lokasi",
            "Full Address":     "alamat",
            "Serial Number":    "serial_number",
            "SID SD-WAN":       "sid_sdwan",
            "SID Connectivity": "sid_connectivity",
            "Taskname":         "taskname",
            "Created At":       "created_at",
            "Status":           "_sheet_status",  # ACTIVE/DELETED flag
        }

        allowed_db_cols = {
            "id", "order_sdwan", "nama_pelanggan", "alias", "lokasi", "alamat",
            "sto", "reg", "status_link", "sid_sdwan", "sid_connectivity",
            "taskname", "status", "status_ncx", "hostname", "sistem_ip",
            "site_id", "type_edge", "serial_number", "created_at"
        }

        parsed = []
        for row in data_rows:
            record = {}
            for col_idx, header in enumerate(header_row):
                db_col = header_to_db.get(header)
                if not db_col:
                    continue
                val = row[col_idx].strip() if col_idx < len(row) else ''

                # Lewati baris yang ditandai DELETED di Sheets
                if db_col == '_sheet_status':
                    if val.upper() == 'DELETED':
                        record = None
                        break
                    continue

                if db_col in allowed_db_cols and val:
                    record[db_col] = val

            if record is not None and record:
                parsed.append(record)

        logger.info(f"Sheets: Berhasil membaca {len(parsed)} baris data dari Google Sheets.")
        return {'status': 'ok', 'count': len(parsed), 'rows': parsed}

    except Exception as e:
        logger.error(f"Sheets: Gagal membaca data dari Google Sheets: {e}")
        return {'status': 'error', 'message': str(e), 'count': 0, 'rows': []}

