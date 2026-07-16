# Telkom SD-WAN Center (Inventory Dashboard)

**SD-WAN Center** adalah aplikasi berbasis web yang dirancang khusus untuk manajemen aset dan inventarisasi perangkat jaringan SD-WAN (Software-Defined Wide Area Network) Telkom Indibiz. Aplikasi ini memudahkan pengelolaan data secara terpusat, menyediakan pemantauan status *link*, serta fitur sinkronisasi langsung dengan Google Sheets.

## 🎯 Tujuan & Fungsi Utama
- **Manajemen Inventaris Terpusat**: Mencatat seluruh detail perangkat keras (seperti Cisco, Fortinet, dll) dari berbagai lokasi, regional, hingga data *customer* secara rapi dan tervalidasi.
- **Pemantauan Status Berkelanjutan**: Memonitor detail teknis setiap *router/edge*, seperti *Link Status*, *Work Status*, dan *NCX Status*.
- **Efisiensi Pendataan**: Menghilangkan pendataan ganda dan inkonsisten berkat standarisasi data, pencarian yang efisien, serta fitur integrasi *spreadsheet*.

## ✨ Fitur-Fitur Unggulan
- **CRUD Operasional Cepat**: Tambah (*Add*), Ubah (*Edit*), dan Hapus (*Delete*) data perangkat dan konfigurasi IP secara *real-time*.
- **Google Sheets Sync**: Fitur integrasi cerdas untuk menyinkronkan (menarik & menimpa) data yang telah divalidasi ke *Google Sheets* via API.
- **Dukungan Multi-Bahasa (7 Bahasa)**: Antarmuka sistem sudah mendukung *switch language* instan untuk Bahasa Indonesia, Inggris, Cina (中文), Spanyol, Hindi, Arab, dan Rusia.
- **Recycle Bin (Pemulihan Data)**: Sistem keamanan *logical delete*, di mana data yang dihapus akan dipindahkan ke Recycle Bin terlebih dahulu dan dapat dipulihkan (*restore*) kapan saja.
- **Import & Export XLSX**: Mendukung pengunggahan data baru secara massal via `.xlsx` atau `.db` dan bisa men-*download* database ke format Excel kapan pun.
- **Statistik Ringkasan Dasbor**: Papan ringkasan persentase status *link*, persebaran alat manufaktur/pabrikan, hingga ringkasan kondisi tipe *edge*.
- **Tema Gelap & Terang (Dark/Light Mode)**: Antarmuka yang nyaman di mata karena bisa berganti warna secara otomatis (*system preference*) atau disesuaikan manual.

## 🛠 Teknologi yang Digunakan
- **Backend (Server)**: Python 3, Flask Framework
- **Database**: SQLite3 (`sdwan.db`)
- **Integrasi Pihak Ketiga**: `gspread` & `oauth2client` (Google Sheets API)
- **Frontend (UI/UX)**: Vanilla HTML5, Vanilla JavaScript, CSS3
- **Utility Libraries**: `xlsx.js` / SheetJS (untuk memproses konversi ke Excel di *browser*), `bleach` (pencegahan XSS/HTML Sanitization).

## 🚀 Cara Pemakaian Aplikasi

### 1. Persiapan Lingkungan
Pastikan Anda telah memiliki Python di komputer Anda, kemudian buka *Terminal/Command Prompt* dan masuk ke *folder* proyek ini:

```bash
cd sdwan_inventory
pip install -r requirements.txt
```

### 2. Pengaturan Konfigurasi Google Sheets (Khusus Sinkronisasi)
Untuk dapat menggunakan tombol sinkronisasi dengan tabel di Google Sheets:
1. Simpan kunci *Service Account* Anda dari Google Cloud dalam file bernama `credentials.json` di dalam folder ini.
2. Isi file `config_sheets.txt` dengan *Spreadsheet ID* (*Key* yang tertera pada URL tabel Google Sheets Anda).
3. Beri akses (*share/editor*) file Google Sheets Anda kepada email bot yang tertera di dalam file `credentials.json`.

### 3. Menjalankan Server Aplikasi
Jalankan file utama melalui terminal:
```bash
python app.py
```
Aplikasi ini akan membaca secara mandiri dan menginisialisasi ulang *database* lokal (`sdwan.db`) Anda apabila belum pernah dijalankan.

### 4. Mengakses Dasbor UI
- Buka peramban (*web browser*) favorit Anda (direkomendasikan Chrome/Edge).
- Kunjungi tautan *localhost* (*default* port 5000): **`http://127.0.0.1:5000/`**
- Selesai! Kini Anda dapat memakai aplikasi secara lokal untuk mendata perangkat, mengubah bahasa, dan menarik tabel *sheet*.
