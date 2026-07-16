# SD-WAN Center - Asset & Inventory Management

SD-WAN Center adalah aplikasi berbasis web yang dirancang khusus untuk mempermudah manajemen inventori dan pelacakan data perangkat jaringan SD-WAN (khususnya untuk layanan Telkom Indibiz). 

Aplikasi ini berfungsi sebagai pusat kontrol (dashboard) untuk mengelola data pelanggan, detail perangkat (hostname, IP, pabrikan), hingga melacak status pekerjaan dan koneksi jaringan secara *real-time*. Selain itu, aplikasi ini terhubung langsung dengan Google Sheets, sehingga seluruh tim dapat melihat data yang selalu sinkron antara database lokal dan spreadsheet.

---

## ✨ Fitur Utama

- **Manajemen Data (CRUD) Cepat & Lengkap**: Tambah, edit, cari, dan hapus data perangkat dengan antarmuka yang sangat responsif. Mendukung validasi otomatis seperti pengecekan IP atau Site ID ganda.
- **Sinkronisasi Google Sheets**: Integrasi langsung dengan Google Sheets. Kamu bisa menarik data terbaru dari Sheets atau mengirim perubahan data dari web kembali ke Sheets hanya dengan satu kali klik.
- **Import & Export Data**: Mendukung kemudahan impor data dari file database SQLite (`.db`) maupun Excel (`.xlsx`), serta bisa mengekspor data yang ada menjadi format Excel.
- **Recycle Bin (Tong Sampah)**: Data yang dihapus tidak langsung hilang (soft-delete), melainkan masuk ke *Recycle Bin* sehingga aman dari ketidaksengajaan dan bisa dipulihkan kapan saja.
- **Statistik & Overview**: Dashboard merangkum metrik penting seperti total perangkat, status *link*, status pekerjaan, hingga distribusi merk/platform yang digunakan secara otomatis.
- **Dukungan Multi-bahasa**: Tersedia dalam 7 bahasa (Indonesia, English, 中文, Español, हिन्दी, العربية, dan Русский) yang bisa diganti langsung dari menu pojok kanan atas.
- **Mode Gelap (Dark Mode)**: Antarmuka yang nyaman di mata dengan dukungan pergantian tema terang dan gelap.

---

## 🛠️ Teknologi yang Digunakan

- **Backend**: Python 3 & Flask
- **Database**: SQLite3 (`sdwan.db`)
- **Frontend**: HTML5, Vanilla CSS, Vanilla JavaScript (tanpa framework tambahan, murni *native*)
- **Integrasi Pihak Ketiga**: Google Sheets API (`gspread`), `oauth2client`, SheetJS (untuk pemrosesan Excel di sisi *client*)

---

## 🚀 Cara Instalasi & Penggunaan

Berikut adalah panduan lengkap dari awal hingga aplikasi bisa berjalan di komputermu:

### 1. Persiapan Awal
Pastikan kamu sudah menginstal **Python** (disarankan versi 3.8 ke atas) di komputermu. Jika belum, silakan unduh dan install dari [situs resmi Python](https://www.python.org/downloads/). Jangan lupa centang *'Add Python to PATH'* saat instalasi.

### 2. Instalasi Kebutuhan Aplikasi (Requirements)
1. Buka Terminal (Mac/Linux) atau Command Prompt / PowerShell (Windows).
2. Arahkan direktori terminal ke folder proyek ini.
3. (Opsional) Sangat disarankan untuk membuat *Virtual Environment* agar tidak bentrok dengan aplikasi lain:
   ```bash
   python -m venv venv
   ```
   Lalu aktifkan dengan perintah:
   - Windows: `venv\Scripts\activate`
   - Mac/Linux: `source venv/bin/activate`
4. Instal semua *library* pendukung dengan menjalankan:
   ```bash
   pip install -r requirements.txt
   ```

### 3. Pengaturan Google Sheets (Opsional tapi penting untuk fitur Sync)
Aplikasi ini butuh dua file konfigurasi agar bisa berkomunikasi dengan Google Sheets:
- `credentials.json`: File rahasia dari Google Cloud Console (Service Account) yang memberikan izin akses ke API. Pastikan file ini ada di root folder aplikasi.
- `config_sheets.txt`: File teks biasa yang di dalamnya hanya berisi **Spreadsheet ID** dari dokumen Google Sheets milikmu. (ID ini bisa kamu dapatkan dari URL Google Sheets yang panjang tersebut).

*Catatan: Pastikan email dari Service Account (yang ada di dalam credentials.json) sudah kamu berikan akses "Editor" pada file Google Sheets kamu.*

### 4. Menjalankan Aplikasi
1. Di terminal yang sama, pastikan kamu masih berada di dalam folder proyek ini.
2. Jalankan perintah berikut:
   ```bash
   python app.py
   ```
3. Jika berhasil, terminal akan menampilkan pesan bahwa server sedang berjalan (biasanya di port 5000).
4. Buka aplikasi *browser* andalanmu (Chrome, Firefox, Safari, dll), lalu ketikkan alamat berikut di kolom URL:
   ```
   http://127.0.0.1:5000
   ```
5. Selamat! Aplikasi SD-WAN Center sudah siap digunakan.

---

## 📝 Tips Tambahan
- Saat memasukkan data alamat IP, kamu tidak perlu repot mengetikkan titiknya. Sistem akan otomatis memformat ketikan angkamu (misal: mengetik `19216811` akan otomatis diubah menjadi `192.168.1.1`).
- Untuk melakukan kustomisasi *styling*, seluruh warna dan desain dapat diubah dengan mudah di dalam file `static/css/style.css`. 
- Kalau kamu punya pertanyaan atau mengalami error, periksa kembali log di layar terminalmu untuk mencari tahu bagian mana yang bermasalah.
