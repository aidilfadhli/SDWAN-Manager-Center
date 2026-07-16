'use strict';

/* ============================================================
   SD-WAN Inventory Dashboard — main.js
   ============================================================ */

// ── State ──────────────────────────────────────────────────────
let currentLang    = localStorage.getItem('lang') || 'id';
let translations   = {};
let allData        = [];
let isEditMode     = false;
let highlightRowId = null;
let editHistory    = [];        // [{id, field, oldVal, newVal}]
let editHistoryIdx = -1;
let pendingChanges = {};        // {id: {field: newVal}}
let originalData   = {};        // {id: rowSnapshot}
let importPayload  = null;      // {type:'xlsx'|'db', data|file}
let currentSort    = { col: null, dir: 'asc' };
let currentPage    = 1;
let pageSize       = 50;

// ── DOM refs ───────────────────────────────────────────────────
const form        = document.getElementById('deviceForm');
const searchInput = document.getElementById('searchInput');
const tableBody   = document.getElementById('tableBody');
const tableEmpty  = document.getElementById('tableEmpty');
const rowCount    = document.getElementById('rowCount');

// ── Collapsible form ───────────────────────────────────────────
(function initCollapsible() {
  const toggle = document.getElementById('formToggle');
  const body   = document.getElementById('formBody');
  body.style.maxHeight = body.scrollHeight + 'px';
  toggle.addEventListener('click', () => {
    const collapsed = toggle.classList.toggle('collapsed');
    body.style.maxHeight = collapsed ? '0' : body.scrollHeight + 'px';
  });
})();

// ── Auto IP formatter on form blur ─────────────────────────────
if (document.getElementById('sistem_ip')) {
  document.getElementById('sistem_ip').addEventListener('change', e => {
    e.target.value = autoFixIP(e.target.value);
  });
}

// ── Toast ──────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  let translatedMsg = msg;
  const toastMap = {
    'Gagal memuat data dari server.': 'toast_error_load',
    'Gagal menyimpan.': 'toast_error_duplicate_ip',
    'Kesalahan koneksi ke server.': 'toast_error_load',
    'dipindahkan ke Recycle Bin.': 'toast_success_delete',
    'Gagal memindahkan data.': 'toast_error_load',
    'Kesalahan koneksi.': 'toast_error_load',
    'Data tidak ditemukan.': 'no_data',
    'Gagal memuat detail.': 'toast_error_load',
    'Tidak ada data untuk diekspor.': 'no_data',
    'Tidak ada perubahan.': 'no_data',
    'Format tidak didukung.': 'toast_error_load',
    'Gagal membaca file Excel.': 'toast_error_load',
    'Import gagal.': 'toast_error_load',
    'Kesalahan koneksi saat import.': 'toast_error_load',
    'Gagal mengambil data statistik.': 'toast_error_load',
    'Kesalahan koneksi saat mengambil statistik.': 'toast_error_load',
    'Gagal memuat data perangkat.': 'toast_error_load',
    'Perubahan detail berhasil disimpan.': 'toast_success_update',
    'Gagal menyimpan perubahan.': 'toast_error_load',
    'Kesalahan koneksi saat menyimpan.': 'toast_error_load',
    'Data berhasil dikembalikan': 'toast_success_restore',
    'Gagal restore data': 'toast_error_load',
    'Kesalahan koneksi': 'toast_error_load',
    'Data dihapus permanen': 'toast_success_delete',
    'Gagal menghapus permanen': 'toast_error_load',
    'Recycle Bin berhasil dikosongkan': 'toast_success_delete',
    'Gagal mengosongkan Recycle Bin': 'toast_error_load',
    'Gagal meluncurkan ping': 'toast_error_load'
  };

  for (const [idStr, key] of Object.entries(toastMap)) {
    if (msg.includes(idStr)) {
      if (translations[key]) {
        translatedMsg = translations[key];
      }
      break;
    }
  }

  if (currentLang === 'en') {
    if (msg.includes('dipindahkan ke Recycle Bin')) {
      const name = msg.split(' dipindahkan')[0] || 'Device';
      translatedMsg = `${name} moved to Recycle Bin.`;
    } else if (msg.includes('Import berhasil:')) {
      const count = msg.match(/\d+/)?.[0] || '';
      translatedMsg = `Import successful: ${count} records added.`;
    } else if (msg.includes('baris dilewati')) {
      const count = msg.match(/\d+/)?.[0] || '';
      translatedMsg = `${count} rows skipped (empty).`;
    } else if (msg.includes('baris gagal')) {
      const count = msg.match(/\d+/)?.[0] || '';
      translatedMsg = `${count} rows failed.`;
    } else if (msg.includes('record diekspor ke Excel')) {
      const count = msg.match(/\d+/)?.[0] || '';
      translatedMsg = `${count} records exported to Excel.`;
    } else if (msg.includes('record berhasil disimpan')) {
      const count = msg.match(/\d+/)?.[0] || '';
      translatedMsg = `${count} records successfully saved.`;
    } else if (msg.includes('Auto-regen')) {
      translatedMsg = msg.replace('Auto-regen', 'Auto-regenerated');
    } else if (msg.includes('Data berhasil dikembalikan')) {
      translatedMsg = 'Data successfully restored';
    } else if (msg.includes('Data dihapus permanen')) {
      translatedMsg = 'Data deleted permanently';
    } else if (msg.includes('Recycle Bin berhasil dikosongkan')) {
      translatedMsg = 'Recycle Bin successfully emptied';
    } else if (msg.includes('Gagal mengosongkan')) {
      translatedMsg = 'Failed to empty Recycle Bin';
    } else if (msg.includes('Berhasil! Hostname:')) {
      translatedMsg = msg.replace('Berhasil!', 'Success!');
    }
  }

  const icons = {
    success: '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>',
    error:   '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>',
    info:    '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>',
  };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${icons[type] || ''}<span>${translatedMsg}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => {
    el.style.animation = 'fadeOut .3s ease forwards';
    el.addEventListener('animationend', () => el.remove());
  }, 3800);
}

// ── XSS-safe escape ───────────────────────────────────────────
function esc(s) {
  if (!s && s !== 0) return '—';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── Status badge ───────────────────────────────────────────────
function badge(val, field) {
  if (!val) return '<span class="badge badge-default">—</span>';
  const v = val.toUpperCase();
  let cls = 'badge-default';

  if (v === 'DONE') {
    cls = 'badge-done';
  } else if (v === 'UNKNOWN') {
    cls = 'badge-process';
  } else if (v === 'IN PROCESS') {
    cls = 'badge-waitne';
  } else if (v === 'CANCEL') {
    cls = 'badge-cancel';
  } else if (v === 'PENDING') {
    if (field === 'status_link') cls = 'badge-waitne';
    else cls = 'badge-cancel';
  }

  return `<span class="badge ${cls}">${esc(val)}</span>`;
}

// ── Select options ─────────────────────────────────────────────
const STATUS_LINK_OPTS = ['','DONE','CANCEL','PENDING','UNKNOWN'];
const STATUS_OPTS      = ['','DONE','IN PROCESS','CANCEL','UNKNOWN'];
const STATUS_NCX_OPTS  = ['','DONE','IN PROCESS','PENDING','UNKNOWN'];

function makeSelect(field, val, opts) {
  const o = opts.map(v => `<option value="${esc(v)}" ${v === val ? 'selected' : ''}>${v || '—'}</option>`).join('');
  return `<select class="cell-input cell-select" data-id="${field.id}" data-field="${field.field}" onchange="onCellChange(${field.id},'${field.field}',this.value)">${o}</select>`;
}
function makeInput(id, field, val, style='') {
  return `<input class="cell-input" ${style ? `style="${style}"` : ''} data-id="${id}" data-field="${field}" value="${esc(val === '—' ? '' : val)}" onchange="onCellChange(${id},'${field}',this.value)"/>`;
}

// ── Render table ───────────────────────────────────────────────
function renderTable(data, totalCountVal = null) {
  tableEmpty.style.display = data.length ? 'none' : 'block';
  const displayCount = totalCountVal !== null ? totalCountVal : data.length;
  const recordsText = translations['total_records'] || 'record';
  rowCount.textContent     = displayCount ? `${displayCount} ${recordsText}` : `0 ${recordsText}`;

  const tbl = document.getElementById('inventoryTable');
  tbl.classList.toggle('edit-mode-active', isEditMode);

  if (!data.length) { 
    requestAnimationFrame(() => {
      tableBody.innerHTML = '';
    });
    return; 
  }

  const html = data.map(d => {
    const changed = isEditMode && pendingChanges[d.id] ? 'cell-changed' : '';
    const downCls = d.status_link === 'CANCEL' ? 'row-down' : '';
    const highlight = d.id == highlightRowId ? 'row-highlight' : '';
    if (isEditMode) {
      return `<tr data-row-id="${d.id}" class="${changed} ${downCls} ${highlight}">
        <td style="font-weight:600;max-width:160px" class="td-trunc" title="${esc(d.nama_pelanggan)}">${esc(d.nama_pelanggan)}</td>
        <td class="td-trunc" style="max-width:120px" title="${esc(d.alias)}">${d.alias ? esc(d.alias) : '<span style="color:var(--light)">—</span>'}</td>
        <td class="td-mono td-red">${esc(d.site_id)}</td>
        <td class="td-mono td-trunc" style="max-width:220px" title="${esc(d.hostname)}">${esc(d.hostname)}</td>
        <td>${makeInput(d.id,'sistem_ip', d.sistem_ip||'')}</td>
        <td style="white-space:nowrap;display:flex;gap:4px;align-items:center;padding-top:10px;padding-bottom:10px">
          ${makeInput(d.id,'sto', d.sto||'', 'width:55px;padding:4px')}
          <span style="color:var(--muted)">/</span>
          ${makeInput(d.id,'reg', d.reg||'', 'width:45px;padding:4px')}
        </td>
        <td>${makeSelect({id:d.id,field:'status_link'}, d.status_link||'', STATUS_LINK_OPTS)}</td>
        <td>${makeSelect({id:d.id,field:'status'}, d.status||'', STATUS_OPTS)}</td>
        <td>${makeSelect({id:d.id,field:'status_ncx'}, d.status_ncx||'', STATUS_NCX_OPTS)}</td>
      </tr>`;
    }
    return `<tr class="${downCls} ${highlight}" data-id="${d.id}" data-name="${esc(d.nama_pelanggan)}">
      <td style="font-weight:600;max-width:160px" class="td-trunc" title="${esc(d.nama_pelanggan)}">${esc(d.nama_pelanggan)}</td>
      <td class="td-trunc" style="max-width:120px" title="${esc(d.alias)}">${d.alias ? esc(d.alias) : '<span style="color:var(--light)">—</span>'}</td>
      <td class="td-mono td-red">${esc(d.site_id)}</td>
      <td class="td-mono td-trunc" style="max-width:220px" title="${esc(d.hostname)}">${esc(d.hostname)}</td>
      <td class="td-ip">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;width:100%">
          <span>${esc(d.sistem_ip)}</span>
          ${d.sistem_ip ? `
          <button type="button" class="btn-table-ping" onclick="launchPing('${esc(d.sistem_ip)}', event)" title="Ping Perangkat (Terminal)">
            <svg viewBox="0 0 24 24"><path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/></svg>
          </button>` : ''}
        </div>
      </td>
      <td style="font-size:11px">${esc(d.sto)}/${esc(d.reg)}</td>
      <td>${badge(d.status_link,'status_link')}</td>
      <td>${badge(d.status,'status')}</td>
      <td>${badge(d.status_ncx,'status_ncx')}</td>
    </tr>`;
  }).join('');

  requestAnimationFrame(() => {
    tableBody.innerHTML = html;
  });
}

// ── Load data ──────────────────────────────────────────────────
async function loadData(q = '', forceRefresh = false) {
  if (forceRefresh || !allData || allData.length === 0) {
    renderSkeleton();
    try {
      const res = await fetch('/api/devices');
      allData = await res.json();
    } catch {
      showToast('Gagal memuat data dari server.', 'error');
      return;
    }
  }

  let displayedData = allData;

  if (q) {
    const qs = q.toLowerCase();
    displayedData = displayedData.filter(d => 
      (d.nama_pelanggan && d.nama_pelanggan.toLowerCase().includes(qs)) ||
      (d.hostname && d.hostname.toLowerCase().includes(qs)) ||
      (d.sistem_ip && d.sistem_ip.toLowerCase().includes(qs)) ||
      (d.site_id && String(d.site_id).toLowerCase().includes(qs)) ||
      (d.sto && d.sto.toLowerCase().includes(qs)) ||
      (d.reg && d.reg.toLowerCase().includes(qs)) ||
      (d.order_sdwan && d.order_sdwan.toLowerCase().includes(qs)) ||
      (d.serial_number && d.serial_number.toLowerCase().includes(qs)) ||
      (d.taskname && d.taskname.toLowerCase().includes(qs)) ||
      (d.alias && d.alias.toLowerCase().includes(qs)) ||
      (d.alamat && d.alamat.toLowerCase().includes(qs)) ||
      (d.sid_sdwan && d.sid_sdwan.toLowerCase().includes(qs)) ||
      (d.sid_connectivity && d.sid_connectivity.toLowerCase().includes(qs))
    );
  }

  if (currentSort.col) {
    // Already sorted globally inside sortData
  }

  const totalItems = displayedData.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;

  if (highlightRowId !== null) {
    const idx = displayedData.findIndex(d => d.id == highlightRowId);
    if (idx !== -1) {
      currentPage = Math.floor(idx / pageSize) + 1;
    }
  }

  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const startIdx = (currentPage - 1) * pageSize;
  const paginatedData = displayedData.slice(startIdx, startIdx + pageSize);
  
  renderTable(paginatedData, totalItems);
  renderPagination(totalItems);

  // Clear highlight after rendering so it only highlights once
  highlightRowId = null;
}

// ── Form submit ────────────────────────────────────────────────
form.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  const textSpan = btn.querySelector('[data-i18n="btn_save"]');
  btn.disabled = true;
  if (textSpan) textSpan.textContent = currentLang === 'en' ? 'Saving…' : 'Menyimpan…';

  const payload = {
    order_sdwan: document.getElementById('order_sdwan').value,
    platform:    document.getElementById('platform').value,
    pabrikan:    document.getElementById('pabrikan').value,
    customer:    document.getElementById('customer').value,
    alias:       document.getElementById('alias').value,
    lokasi:      document.getElementById('lokasi').value,
    alamat:      document.getElementById('alamat').value,
    sto:         document.getElementById('sto').value,
    reg:         document.getElementById('reg').value,
    status_link: document.getElementById('status_link').value,
    sid_sdwan:   document.getElementById('sid_sdwan').value,
    sid_connectivity: document.getElementById('sid_connectivity').value,
    type_edge:   document.getElementById('type_edge').value,
    kode_cust:   document.getElementById('kode_cust').value,
    kode_reg:    document.getElementById('kode_reg').value,
    kode_branch: document.getElementById('kode_branch').value,
    sistem_ip:   document.getElementById('sistem_ip').value,
    taskname:    document.getElementById('taskname').value,
    status:      document.getElementById('status').value,
    status_ncx:  document.getElementById('status_ncx').value,
    serial_number: document.getElementById('serial_number').value,
  };

  try {
    const res  = await fetch('/api/devices', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
    const json = await res.json();
    if (res.ok) {
      showToast(`Berhasil! Hostname: ${json.hostname}`, 'success');
      form.reset();
      highlightRowId = json.id;
      loadData(searchInput.value, true);
    } else {
      showToast(json.message || 'Gagal menyimpan.', 'error');
    }
  } catch {
    showToast('Kesalahan koneksi ke server.', 'error');
  } finally {
    btn.disabled = false;
    if (textSpan) textSpan.textContent = translations['btn_save'] || 'Generate & Simpan ke Database';
  }
});

// ── Custom Confirm Dialog ──────────────────────────────────────
function showConfirm(message) {
  return new Promise(resolve => {
    document.getElementById('confirmMessage').textContent = message;
    document.getElementById('confirmOverlay').classList.add('active');

    const okBtn     = document.getElementById('confirmOkBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');

    function cleanup(result) {
      document.getElementById('confirmOverlay').classList.remove('active');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    }
    const onOk     = () => cleanup(true);
    const onCancel = () => cleanup(false);

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  });
}

// ── Delete ─────────────────────────────────────────────────────
async function deleteDevice(id, name) {
  let msg = `Hapus data "${name}" ke Recycle Bin?`;
  if (translations['confirm_delete_msg']) {
    msg = translations['confirm_delete_msg'].replace('{name}', name);
  }
  const confirmed = await showConfirm(msg);
  if (!confirmed) return;
  try {
    const res = await fetch(`/api/devices/${id}`, {method:'DELETE'});
    if (res.ok) { showToast(`"${name}" dipindahkan ke Recycle Bin.`, 'info'); loadData(searchInput.value, true); }
    else showToast('Gagal memindahkan data.', 'error');
  } catch { showToast('Kesalahan koneksi.', 'error'); }
}

// ── Modal Detail ───────────────────────────────────────────────
async function openModal(id) {
  try {
    const res = await fetch(`/api/devices/${id}`);
    const d   = await res.json();
    if (!res.ok) { showToast('Data tidak ditemukan.', 'error'); return; }
    document.getElementById('m-order').textContent     = d.order_sdwan      || '—';
    document.getElementById('m-customer').textContent  = d.nama_pelanggan   || '—';
    document.getElementById('m-alias').textContent     = d.alias            || '—';
    document.getElementById('m-sto').textContent       = d.sto              || '—';
    document.getElementById('m-reg').textContent       = d.reg              || '—';
    document.getElementById('m-lokasi').textContent    = d.lokasi           || '—';
    document.getElementById('m-alamat').textContent    = d.alamat           || '—';
    document.getElementById('m-hostname').textContent  = d.hostname         || '—';
    document.getElementById('m-siteid').textContent    = d.site_id          || '—';
    document.getElementById('m-ip').textContent        = d.sistem_ip        || '—';
    document.getElementById('m-type').textContent      = d.type_edge        || '—';
    document.getElementById('m-serial').textContent    = d.serial_number    || '—';
    document.getElementById('m-sid-sdwan').textContent = d.sid_sdwan        || '—';
    document.getElementById('m-sid-conn').textContent  = d.sid_connectivity || '—';
    document.getElementById('m-taskname').textContent  = d.taskname         || '—';
    document.getElementById('m-status-link').innerHTML = badge(d.status_link,'status_link');
    document.getElementById('m-status').innerHTML      = badge(d.status,'status');
    document.getElementById('m-status-ncx').innerHTML  = badge(d.status_ncx,'status_ncx');
    document.getElementById('m-created').textContent   = d.created_at       || '—';
    document.getElementById('modalOverlay').classList.add('active');
  } catch { showToast('Gagal memuat detail.', 'error'); }
}

function closeModal(id) { document.getElementById(id).classList.remove('active'); }

document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => {
    if (e.target !== el) return;
    el.classList.remove('active');
    // Jika confirm modal ditutup via backdrop → resolve false
    if (el.id === 'confirmOverlay') {
      document.getElementById('confirmOkBtn').click === undefined || el.dispatchEvent(new Event('backdropClose'));
    }
  });
});

// ── Export Excel ───────────────────────────────────────────────
function exportToExcel() {
  if (!allData.length) { showToast('Tidak ada data untuk diekspor.', 'info'); return; }
  const ws = XLSX.utils.json_to_sheet(allData.map(d => ({
    'Order SD-WAN': d.order_sdwan, 'Nama Pelanggan': d.nama_pelanggan, 'Alias': d.alias,
    'Lokasi': d.lokasi, 'Alamat': d.alamat, 'STO': d.sto, 'REG': d.reg,
    'Hostname': d.hostname, 'Site ID': d.site_id, 'Sistem IP': d.sistem_ip,
    'Type Edge': d.type_edge, 'Serial Number': d.serial_number,
    'SID SDWAN': d.sid_sdwan, 'SID Connectivity': d.sid_connectivity,
    'Taskname': d.taskname, 'Status Link': d.status_link,
    'Status Pengerjaan': d.status, 'Status NCX': d.status_ncx, 'Created At': d.created_at,
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
  XLSX.writeFile(wb, 'SDWAN_Inventory_Export.xlsx');
  showToast(`${allData.length} record diekspor ke Excel.`, 'success');
}

// ── Search ─────────────────────────────────────────────────────
let searchTimer;
searchInput.addEventListener('input', () => {
  const val = searchInput.value.trim();
  const clearBtn = document.getElementById('searchClearBtn');
  if (clearBtn) clearBtn.style.display = val ? 'flex' : 'none';

  const spinner = document.getElementById('searchSpinner');
  if (spinner && val && !isEditMode) spinner.style.display = 'block';

  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    if (!isEditMode) {
      currentPage = 1;
      loadData(val).finally(() => {
        if (spinner) spinner.style.display = 'none';
      });
    } else {
      if (spinner) spinner.style.display = 'none';
    }
  }, 200);
});

function clearSearch() {
  searchInput.value = '';
  const clearBtn = document.getElementById('searchClearBtn');
  if (clearBtn) clearBtn.style.display = 'none';
  const spinner = document.getElementById('searchSpinner');
  if (spinner) spinner.style.display = 'none';
  if (!isEditMode) loadData('', false);
}

// ══════════════════════════════════════════════════════════════
// EDIT MODE
// ══════════════════════════════════════════════════════════════

function toggleEditMode() {
  isEditMode ? exitEditMode() : enterEditMode();
}

function enterEditMode() {
  isEditMode     = true;
  originalData   = {};
  pendingChanges = {};
  editHistory    = [];
  editHistoryIdx = -1;
  allData.forEach(d => { originalData[d.id] = {...d}; });

  document.getElementById('editModeBtn').style.background    = 'var(--orange)';
  document.getElementById('editModeBtn').style.color         = '#fff';
  document.getElementById('editModeBtn').style.borderColor   = 'var(--orange)';
  document.getElementById('editToolbar').classList.add('active');
  
  loadData(searchInput.value, false);
  updateEditUI();
}

function exitEditMode(reload = false) {
  isEditMode = false;
  document.getElementById('editModeBtn').style.cssText       = '';
  document.getElementById('editToolbar').classList.remove('active');
  originalData   = {};
  pendingChanges = {};
  editHistory    = [];
  editHistoryIdx = -1;
  
  if (reload) loadData(searchInput.value, true);
  else loadData(searchInput.value, false);
}

function onCellChange(id, field, newVal) {
  if (field === 'sistem_ip') {
    newVal = autoFixIP(newVal);
    const input = document.querySelector(`.cell-input[data-id="${id}"][data-field="sistem_ip"]`);
    if (input) input.value = newVal;
  }
  const oldVal = originalData[id]?.[field] ?? '';

  // Trim history above current index
  editHistory    = editHistory.slice(0, editHistoryIdx + 1);
  editHistory.push({id, field, oldVal, newVal});
  editHistoryIdx = editHistory.length - 1;

  if (!pendingChanges[id]) pendingChanges[id] = {};
  pendingChanges[id][field] = newVal;

  // Update allData mirror
  const rec = allData.find(d => d.id == id);
  if (rec) rec[field] = newVal;

  // Mark row as changed
  const row = document.querySelector(`tr[data-row-id="${id}"]`);
  if (row) row.classList.add('cell-changed');

  refreshLivePreview(id);
  updateEditUI();
}

function setCellValue(id, field, val) {
  const el = document.querySelector(`[data-id="${id}"][data-field="${field}"]`);
  if (el) el.value = val;
  const rec = allData.find(d => d.id == id);
  if (rec) rec[field] = val;
}

function undoEdit() {
  if (editHistoryIdx < 0) return;
  const {id, field, oldVal, newVal} = editHistory[editHistoryIdx];
  editHistoryIdx--;
  setCellValue(id, field, oldVal);

  if (pendingChanges[id]) {
    if (oldVal === (originalData[id]?.[field] ?? ''))
      delete pendingChanges[id][field];
    else
      pendingChanges[id][field] = oldVal;
    if (!Object.keys(pendingChanges[id]).length) delete pendingChanges[id];
  }

  // Re-check row highlight
  const row = document.querySelector(`tr[data-row-id="${id}"]`);
  if (row) row.classList.toggle('cell-changed', !!pendingChanges[id]);

  refreshLivePreview(id);
  updateEditUI();
}

function redoEdit() {
  if (editHistoryIdx >= editHistory.length - 1) return;
  editHistoryIdx++;
  const {id, field, newVal} = editHistory[editHistoryIdx];
  setCellValue(id, field, newVal);
  if (!pendingChanges[id]) pendingChanges[id] = {};
  pendingChanges[id][field] = newVal;

  const row = document.querySelector(`tr[data-row-id="${id}"]`);
  if (row) row.classList.add('cell-changed');

  refreshLivePreview(id);
  updateEditUI();
}

function refreshLivePreview(id) {
  const row = document.querySelector(`tr[data-row-id="${id}"]`);
  if (!row) return;

  const current = {...originalData[id], ...(pendingChanges[id] || {})};

  // Live Regen Hostname
  const plat = (current.hostname && current.hostname.length >= 4) ? current.hostname.slice(0, 2) : '02';
  const pabr = (current.hostname && current.hostname.length >= 4) ? current.hostname.slice(2, 4) : '01';
  const newHn = `${plat}${pabr}-${current.reg || ''}-${current.sto || ''}-${current.nama_pelanggan || ''}-${current.lokasi || ''}`.toUpperCase();
  
  const hnCell = row.querySelector('.td-mono.td-trunc');
  if (hnCell) {
    hnCell.textContent = newHn;
    hnCell.title = newHn;
  }

  // Live Regen Site ID (if reg contains digit)
  const match = (current.reg || '').match(/\d/);
  const sidCell = row.querySelector('.td-mono.td-red');
  if (sidCell) {
    if (match) {
      const kReg = match[0];
      const currSid = current.site_id || '';
      const edge = currSid.length >= 9 ? currSid[0] : '2';
      const cust = currSid.length >= 9 ? currSid.slice(1,4) : '001';
      const branch = currSid.length >= 9 ? currSid.slice(5,9) : '0001';
      sidCell.textContent = `${edge}${cust}${kReg}${branch}`;
    } else {
      sidCell.textContent = originalData[id]?.site_id || '';
    }
  }

  // Live Regen Row Background (CANCEL)
  if (current.status_link === 'CANCEL') {
    row.classList.add('row-down');
  } else {
    row.classList.remove('row-down');
  }
}

async function saveAllEdits() {
  const ids = Object.keys(pendingChanges);
  if (!ids.length) { showToast('Tidak ada perubahan.', 'info'); return; }

  document.getElementById('saveAllBtn').disabled = true;
  let ok = 0, fail = 0;
  const regenerated = []; // hostname/site_id yang berubah

  for (const id of ids) {
    try {
      const res  = await fetch(`/api/devices/${id}`, {
        method: 'PUT',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(pendingChanges[id])
      });
      const json = await res.json();
      if (res.ok) {
        ok++;
        if (json.hostname) regenerated.push(`Hostname: ${json.hostname}`);
        if (json.site_id)  regenerated.push(`Site ID: ${json.site_id}`);
      } else {
        fail++;
      }
    } catch { fail++; }
  }

  if (!fail) {
    showToast(`${ok} record berhasil disimpan.`, 'success');
    if (regenerated.length) {
      setTimeout(() => showToast(`Auto-regen → ${regenerated.join(' | ')}`, 'info'), 400);
    }
    if (ids.length) {
      highlightRowId = ids[ids.length - 1];
    }
    exitEditMode(true);
  } else {
    showToast(`${ok} berhasil, ${fail} gagal.`, 'error');
    document.getElementById('saveAllBtn').disabled = false;
  }
}

function discardEdits() {
  if (!Object.keys(pendingChanges).length && editHistoryIdx < 0) {
    exitEditMode();
    return;
  }
  if (!confirm('Batalkan semua perubahan yang belum disimpan?')) return;
  exitEditMode(true);
}

function updateEditUI() {
  document.getElementById('undoBtn').disabled    = editHistoryIdx < 0;
  document.getElementById('redoBtn').disabled    = editHistoryIdx >= editHistory.length - 1;
  const count = Object.keys(pendingChanges).length;
  const pc    = document.getElementById('pendingCount');
  pc.style.display = count ? 'inline' : 'none';
  pc.textContent   = `${count} baris diubah`;
  document.getElementById('saveAllBtn').disabled = count === 0;
}

// ══════════════════════════════════════════════════════════════
// IMPORT
// ══════════════════════════════════════════════════════════════

function openImportModal() {
  importPayload = null;
  document.getElementById('importFileInput').value = '';
  document.getElementById('importPreview').style.display = 'none';
  document.getElementById('importConfirmBtn').disabled = true;
  document.getElementById('importOverlay').classList.add('active');
}

// Drag & drop
const dropzone = document.getElementById('importDropzone');
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
dropzone.addEventListener('drop', e => {
  e.preventDefault();
  dropzone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) processImportFile(file);
});

function handleImportFile(e) {
  const file = e.target.files[0];
  if (file) processImportFile(file);
}

function processImportFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['db','xlsx'].includes(ext)) {
    showToast('Format tidak didukung. Gunakan .db atau .xlsx', 'error');
    return;
  }

  if (ext === 'xlsx') {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb      = XLSX.read(e.target.result, {type:'array'});
        const sheet   = wb.Sheets[wb.SheetNames[0]];
        const records = XLSX.utils.sheet_to_json(sheet, {defval:''});
        importPayload = {type:'xlsx', records};
        showImportPreview('xlsx', records);
      } catch {
        showToast('Gagal membaca file Excel.', 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  } else {
    importPayload = {type:'db', file};
    showImportPreview('db', null, file.name, file.size);
  }
}

function showImportPreview(type, records, filename, filesize) {
  const header = document.getElementById('importPreviewHeader');
  const body   = document.getElementById('importPreviewBody');
  const prev   = document.getElementById('importPreview');

  if (type === 'xlsx') {
    if (currentLang === 'en') {
      header.textContent = `Excel File — ${records.length} rows found`;
    } else {
      header.textContent = `File Excel — ${records.length} baris ditemukan`;
    }
    const sample = records.slice(0, 4);
    const otherText = currentLang === 'en' ? `...and ${records.length - 4} more rows` : `...dan ${records.length - 4} baris lainnya`;
    body.innerHTML = sample.map(r => `
      <div class="preview-row">
        <span><strong>${esc(r['Nama Pelanggan'] || r['nama_pelanggan'] || '?')}</strong></span>
        <span style="color:var(--muted);font-size:11px">${esc(r['Hostname'] || r['hostname'] || r['Site ID'] || '—')}</span>
      </div>`).join('') + (records.length > 4 ? `<div style="font-size:11px;color:var(--muted);padding-top:6px">${otherText}</div>` : '');
  } else {
    if (currentLang === 'en') {
      header.textContent = 'SQLite Database File';
      body.innerHTML = `<div class="preview-row"><span>File Name</span><span style="color:var(--muted);font-size:11px">${esc(filename)}</span></div>
        <div class="preview-row"><span>Size</span><span style="color:var(--muted);font-size:11px">${(filesize/1024).toFixed(1)} KB</span></div>
        <div class="preview-row"><span>Target Table</span><span style="color:var(--muted);font-size:11px">inventory</span></div>`;
    } else {
      header.textContent = 'File SQLite Database';
      body.innerHTML = `<div class="preview-row"><span>Nama File</span><span style="color:var(--muted);font-size:11px">${esc(filename)}</span></div>
        <div class="preview-row"><span>Ukuran</span><span style="color:var(--muted);font-size:11px">${(filesize/1024).toFixed(1)} KB</span></div>
        <div class="preview-row"><span>Target Tabel</span><span style="color:var(--muted);font-size:11px">inventory</span></div>`;
    }
  }
  prev.style.display = 'block';
  document.getElementById('importConfirmBtn').disabled = false;
}

async function confirmImport() {
  if (!importPayload) return;
  const btn = document.getElementById('importConfirmBtn');
  btn.disabled = true; btn.textContent = 'Mengimport…';

  try {
    let res, json;

    if (importPayload.type === 'xlsx') {
      res  = await fetch('/api/import', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({records: importPayload.records})
      });
      json = await res.json();
      if (res.ok) {
        showToast(`Import berhasil: ${json.inserted} record ditambahkan.`, 'success');
        if (json.skipped)  showToast(`${json.skipped} baris dilewati (kosong).`, 'info');
        if (json.errors?.length) showToast(`${json.errors.length} baris gagal.`, 'error');
        closeModal('importOverlay');
        loadData(searchInput.value, true);
      } else {
        showToast(json.message || 'Import gagal.', 'error');
      }

    } else {
      const fd = new FormData();
      fd.append('file', importPayload.file);
      res  = await fetch('/api/import-db', {method:'POST', body:fd});
      json = await res.json();
      if (res.ok) {
        showToast(`Import berhasil: ${json.inserted} record dari file .db.`, 'success');
        closeModal('importOverlay');
        loadData(searchInput.value, true);
      } else {
        showToast(json.message || 'Import gagal.', 'error');
      }
    }
  } catch {
    showToast('Kesalahan koneksi saat import.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Import Sekarang';
  }
}

// ══════════════════════════════════════════════════════════════
// STATISTICS
// ══════════════════════════════════════════════════════════════

async function openStatsModal() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    if (!res.ok) { showToast('Gagal mengambil data statistik.', 'error'); return; }

    document.getElementById('s-total-devices').textContent = data.total;
    document.getElementById('s-total-cisco').textContent = data.pabrikan.Cisco;
    document.getElementById('s-total-fortinet').textContent = data.pabrikan.Fortinet;

    // Render Pabrikan list with progress bars
    const pabrikanList = document.getElementById('stats-pabrikan-list');
    pabrikanList.innerHTML = Object.entries(data.pabrikan)
      .sort((a,b) => b[1] - a[1])
      .map(([name, count]) => {
        const pct = data.total ? ((count / data.total) * 100).toFixed(0) : 0;
        return `
          <div style="font-size:12px;display:flex;flex-direction:column;gap:2px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-weight:500">${name}</span>
              <span style="font-weight:600;color:var(--muted)">${count} (${pct}%)</span>
            </div>
            <div style="height:5px;background:var(--border);border-radius:99px;overflow:hidden">
              <div style="width:${pct}%;height:100%;background:var(--red);border-radius:99px"></div>
            </div>
          </div>
        `;
      }).join('');

    // Render Edge list with progress bars
    const edgeList = document.getElementById('stats-edge-list');
    edgeList.innerHTML = Object.entries(data.edge)
      .sort((a,b) => b[1] - a[1])
      .map(([name, count]) => {
        const pct = data.total ? ((count / data.total) * 100).toFixed(0) : 0;
        return `
          <div style="font-size:12px;display:flex;flex-direction:column;gap:2px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-weight:500">${name}</span>
              <span style="font-weight:600;color:var(--muted)">${count} (${pct}%)</span>
            </div>
            <div style="height:5px;background:var(--border);border-radius:99px;overflow:hidden">
              <div style="width:${pct}%;height:100%;background:#2563eb;border-radius:99px"></div>
            </div>
          </div>
        `;
      }).join('');

    document.getElementById('statsOverlay').classList.add('active');
  } catch {
    showToast('Kesalahan koneksi saat mengambil statistik.', 'error');
  }
}

// ══════════════════════════════════════════════════════════════
// MODAL DETAILED EDITING
// ══════════════════════════════════════════════════════════════

function triggerModalRegen() {
  const plat = document.getElementById('ed-platform').value;
  const pabr = document.getElementById('ed-pabrikan').value;
  const reg  = document.getElementById('ed-reg').value.trim().toUpperCase();
  const sto  = document.getElementById('ed-sto').value.trim().toUpperCase();
  const cust = document.getElementById('ed-customer').value.trim().toUpperCase();
  const lok  = document.getElementById('ed-lokasi').value.trim().toUpperCase();

  const edge   = document.getElementById('ed-type_edge').value;
  const k_cust = document.getElementById('ed-kode_cust').value.trim();
  const k_reg  = document.getElementById('ed-kode_reg').value;
  const k_br   = document.getElementById('ed-kode_branch').value.trim();

  // Hostname
  if (plat && pabr && reg && sto && cust && lok) {
    document.getElementById('ed-hostname').value = `${plat}${pabr}-${reg}-${sto}-${cust}-${lok}`;
  } else {
    document.getElementById('ed-hostname').value = 'Lengkapi field wajib...';
  }

  // Site ID
  if (edge && k_cust && k_reg && k_br) {
    const padCust = String(k_cust).padStart(3, '0');
    const padBranch = String(k_br).padStart(4, '0');
    document.getElementById('ed-site_id').value = `${edge}${padCust}${k_reg}${padBranch}`;
  } else {
    document.getElementById('ed-site_id').value = 'Lengkapi field wajib...';
  }
}

async function openEditDetailModal(id) {
  try {
    const res = await fetch(`/api/devices/${id}`);
    const d   = await res.json();
    if (!res.ok) { showToast('Data tidak ditemukan.', 'error'); return; }

    document.getElementById('ed-id').value = d.id;
    document.getElementById('ed-order_sdwan').value = d.order_sdwan || '';
    document.getElementById('ed-customer').value = d.nama_pelanggan || '';
    document.getElementById('ed-alias').value = d.alias || '';
    document.getElementById('ed-lokasi').value = d.lokasi || '';
    document.getElementById('ed-sto').value = d.sto || '';
    document.getElementById('ed-reg').value = d.reg || '';
    document.getElementById('ed-alamat').value = d.alamat || '';

    // Ekstrak platform & pabrikan
    let platCode = '02';
    let pabrCode = '01';
    if (d.hostname && d.hostname.length >= 4) {
      platCode = d.hostname.slice(0, 2);
      pabrCode = d.hostname.slice(2, 4);
    }
    document.getElementById('ed-platform').value = platCode;
    document.getElementById('ed-pabrikan').value = pabrCode;
    document.getElementById('ed-type_edge').value = d.type_edge || '2';

    // Ekstrak Site ID parts
    let kCust = '';
    let kReg = '';
    let kBr = '';
    if (d.site_id && d.site_id.length >= 9) {
      kCust = parseInt(d.site_id.slice(1, 4), 10);
      kReg = d.site_id.slice(4, 5);
      kBr = parseInt(d.site_id.slice(5, 9), 10);
    }
    document.getElementById('ed-kode_cust').value = kCust;
    document.getElementById('ed-kode_reg').value = kReg;
    document.getElementById('ed-kode_branch').value = kBr;

    document.getElementById('ed-sistem_ip').value = d.sistem_ip || '';
    document.getElementById('ed-serial_number').value = d.serial_number || '';
    document.getElementById('ed-sid_sdwan').value = d.sid_sdwan || '';
    document.getElementById('ed-sid_connectivity').value = d.sid_connectivity || '';
    document.getElementById('ed-taskname').value = d.taskname || '';
    document.getElementById('ed-status_link').value = d.status_link || '';
    document.getElementById('ed-status').value = d.status || '';
    document.getElementById('ed-status_ncx').value = d.status_ncx || '';

    triggerModalRegen();

    document.getElementById('editDetailOverlay').classList.add('active');
  } catch {
    showToast('Gagal memuat data perangkat.', 'error');
  }
}

async function saveModalEdit(e) {
  e.preventDefault();
  const id = document.getElementById('ed-id').value;
  const payload = {
    order_sdwan:      document.getElementById('ed-order_sdwan').value,
    nama_pelanggan:   document.getElementById('ed-customer').value,
    alias:            document.getElementById('ed-alias').value,
    lokasi:           document.getElementById('ed-lokasi').value,
    alamat:           document.getElementById('ed-alamat').value,
    sto:              document.getElementById('ed-sto').value,
    reg:              document.getElementById('ed-reg').value,
    platform:         document.getElementById('ed-platform').value,
    pabrikan:         document.getElementById('ed-pabrikan').value,
    type_edge:        document.getElementById('ed-type_edge').value,
    kode_cust:        document.getElementById('ed-kode_cust').value,
    kode_reg:         document.getElementById('ed-kode_reg').value,
    kode_branch:      document.getElementById('ed-kode_branch').value,
    sistem_ip:        document.getElementById('ed-sistem_ip').value,
    serial_number:    document.getElementById('ed-serial_number').value,
    sid_sdwan:        document.getElementById('ed-sid_sdwan').value,
    sid_connectivity: document.getElementById('ed-sid_connectivity').value,
    taskname:         document.getElementById('ed-taskname').value,
    status_link:      document.getElementById('ed-status_link').value,
    status:           document.getElementById('ed-status').value,
    status_ncx:       document.getElementById('ed-status_ncx').value,
  };

  try {
    const res = await fetch(`/api/devices/${id}`, {
      method: 'PUT',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (res.ok) {
      showToast('Perubahan detail berhasil disimpan.', 'success');
      if (json.hostname || json.site_id) {
        showToast(`Auto-regen → Hostname: ${json.hostname || 'N/A'} | Site ID: ${json.site_id || 'N/A'}`, 'info');
      }
      closeModal('editDetailOverlay');
      highlightRowId = id;
      loadData(searchInput.value, true);
    } else {
      showToast(json.message || 'Gagal menyimpan perubahan.', 'error');
    }
  } catch {
    showToast('Kesalahan koneksi saat menyimpan.', 'error');
  }
}


// ── Skeleton Loader ────────────────────────────────────────────
function renderSkeleton() {
  const rowsCount = allData.length || 5;
  tableEmpty.style.display = 'none';
  let html = '';
  for (let i = 0; i < rowsCount; i++) {
    html += `<tr class="skeleton-row">
      <td><div class="skeleton-bar" style="width: 70%"></div></td>
      <td><div class="skeleton-bar" style="width: 50%"></div></td>
      <td><div class="skeleton-bar" style="width: 80%"></div></td>
      <td><div class="skeleton-bar" style="width: 90%"></div></td>
      <td><div class="skeleton-bar" style="width: 65%"></div></td>
      <td><div class="skeleton-bar" style="width: 45%"></div></td>
      <td><div class="skeleton-bar" style="width: 55%"></div></td>
      <td><div class="skeleton-bar" style="width: 55%"></div></td>
      <td><div class="skeleton-bar" style="width: 55%"></div></td>
      <td><div class="skeleton-bar" style="width: 30px"></div></td>
    </tr>`;
  }
  tableBody.innerHTML = html;
}

// ── Keyboard Navigation inside Edit Mode ───────────────────────
document.addEventListener('DOMContentLoaded', () => {
  tableBody.addEventListener('keydown', e => {
    if (!isEditMode) return;
    const target = e.target;
    if (!target.classList.contains('cell-input') && !target.classList.contains('cell-select')) return;

    const td = target.closest('td');
    const tr = target.closest('tr');
    if (!td || !tr) return;

    const colIndex = Array.from(tr.children).indexOf(td);
    const rows = Array.from(tableBody.children);
    const rowIndex = rows.indexOf(tr);

    if (e.key === 'Enter') {
      e.preventDefault();
      const nextRow = rows[rowIndex + 1];
      if (nextRow) {
        const nextTarget = nextRow.children[colIndex].querySelector('.cell-input, .cell-select');
        if (nextTarget) nextTarget.focus();
      }
    } else if (e.key === 'ArrowDown' && target.tagName === 'INPUT') {
      e.preventDefault();
      const nextRow = rows[rowIndex + 1];
      if (nextRow) {
        const nextTarget = nextRow.children[colIndex].querySelector('.cell-input, .cell-select');
        if (nextTarget) nextTarget.focus();
      }
    } else if (e.key === 'ArrowUp' && target.tagName === 'INPUT') {
      e.preventDefault();
      const prevRow = rows[rowIndex - 1];
      if (prevRow) {
        const prevTarget = prevRow.children[colIndex].querySelector('.cell-input, .cell-select');
        if (prevTarget) prevTarget.focus();
      }
    }
  });

  // Global Shortcuts for Edit Mode
  window.addEventListener('keydown', e => {
    if (!isEditMode) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undoEdit();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redoEdit();
    }
  });
});

// ── Sorting Logic ──────────────────────────────────────────────
function handleSort(col) {
  if (isEditMode) return; // Disable sorting while editing inline
  if (currentSort.col === col) {
    currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    currentSort.col = col;
    currentSort.dir = 'asc';
  }
  sortData(col, currentSort.dir);
}

function sortData(col, dir, render = true) {
  // Update sorting indicators on headers
  document.querySelectorAll('.sort-indicator').forEach(el => el.textContent = '');
  const indicator = document.getElementById(`sort-${col}`);
  if (indicator) {
    indicator.textContent = dir === 'asc' ? ' ▲' : ' ▼';
  }

  allData.sort((a, b) => {
    let valA = a[col] || '';
    let valB = b[col] || '';

    // Handle special IP address sorting
    if (col === 'sistem_ip') {
      return compareIPs(valA, valB) * (dir === 'asc' ? 1 : -1);
    }

    // Standard string/number comparison
    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();

    if (valA < valB) return dir === 'asc' ? -1 : 1;
    if (valA > valB) return dir === 'asc' ? 1 : -1;
    return 0;
  });

  if (render) {
    const q = searchInput ? searchInput.value : '';
    loadData(q, false);
  }
}

function compareIPs(ipA, ipB) {
  if (!ipA && !ipB) return 0;
  if (!ipA) return 1;
  if (!ipB) return -1;
  const parse = ip => ip.split('.').map(num => parseInt(num, 10) || 0);
  const aParts = parse(ipA);
  const bParts = parse(ipB);
  for (let i = 0; i < 4; i++) {
    if ((aParts[i] || 0) < (bParts[i] || 0)) return -1;
    if ((aParts[i] || 0) > (bParts[i] || 0)) return 1;
  }
  return 0;
}

// ── Floating Action Menu (FAB) Handlers ────────────────────────
function toggleFabMenu() {
  document.getElementById('fabContainer').classList.toggle('active');
}
function closeFabMenu() {
  document.getElementById('fabContainer').classList.remove('active');
}
// Close FAB when clicking outside
document.addEventListener('click', e => {
  const container = document.getElementById('fabContainer');
  if (container && !container.contains(e.target)) {
    closeFabMenu();
  }
});

// ── Recycle Bin ────────────────────────────────────────────────
async function openTrashModal() {
  document.getElementById('trashModalOverlay').classList.add('active');
  await loadTrash();
}

async function loadTrash() {
  const tbody = document.getElementById('trashTableBody');
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center"><div class="spinner" style="margin:20px auto;border-left-color:var(--red);"></div></td></tr>';
  try {
    const res = await fetch('/api/inventory/trash');
    const data = await res.json();
    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="5">
        <div class="empty-state">
          <svg viewBox="0 0 24 24"><path d="M15 4V3H9v1H4v2h1v13c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V6h1V4h-5zm2 15H7V6h10v13z"/></svg>
          <p>Recycle Bin Kosong</p>
          <span>Tidak ada data yang baru saja dihapus.</span>
        </div>
      </td></tr>`;
      return;
    }
    
    tbody.innerHTML = data.map(d => `
      <tr style="border-bottom: 1px solid var(--border-lt);">
        <td style="font-family:monospace; font-size:11px; padding:10px;">${d.id}</td>
        <td style="font-weight:600; padding:10px; font-size:12px;">${esc(d.hostname || '—')}</td>
        <td style="font-family:monospace; color:var(--red); font-size:11px; padding:10px;">${esc(d.sistem_ip || '—')}</td>
        <td style="font-size:12px; padding:10px;">${esc(d.nama_pelanggan || '—')}</td>
        <td style="text-align:right; padding:10px;">
          <button class="btn-icon btn-view" title="Restore Data" onclick="restoreItem(${d.id})">
            <svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:currentColor;"><path d="M14 12c0-1.1-.9-2-2-2s-2 .9-2 2 .9 2 2 2 2-.9 2-2zm-2-9a9 9 0 0 0-9 9H0l4 4 4-4H5c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.51 0-2.91-.49-4.06-1.3l-1.42 1.44C8.04 20.3 9.94 21 12 21c4.97 0 9-4.03 9-9s-4.03-9-9-9z"/></svg>
          </button>
          <button class="btn-icon btn-delete" title="Hapus Permanen" onclick="hardDeleteItem(${d.id})">
            <svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:currentColor;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--red); padding:20px; font-size:13px;">Gagal memuat Recycle Bin</td></tr>';
  }
}

async function restoreItem(id) {
  try {
    const res = await fetch(`/api/inventory/restore/${id}`, { method: 'POST' });
    const result = await res.json();
    if (res.ok) {
      showToast('Data berhasil dikembalikan', 'success');
      loadTrash();
      loadData(searchInput.value, true);
    } else {
      showToast(result.message || 'Gagal restore data', 'error');
    }
  } catch {
    showToast('Kesalahan koneksi', 'error');
  }
}

async function hardDeleteItem(id) {
  const confirmed = await showConfirm('Hapus data ini SECARA PERMANEN? Tidak dapat dikembalikan!');
  if (!confirmed) return;
  try {
    const res = await fetch(`/api/inventory/hard/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Data dihapus permanen', 'info');
      loadTrash();
    } else {
      showToast('Gagal menghapus permanen', 'error');
    }
  } catch {
    showToast('Kesalahan koneksi', 'error');
  }
}

async function emptyTrash() {
  const confirmed = await showConfirm('Yakin ingin MENGOSONGKAN seluruh Recycle Bin secara permanen?');
  if (!confirmed) return;
  try {
    const res = await fetch('/api/inventory/empty_trash', { method: 'DELETE' });
    if (res.ok) {
      showToast('Recycle Bin berhasil dikosongkan', 'success');
      loadTrash();
    } else {
      showToast('Gagal mengosongkan Recycle Bin', 'error');
    }
  } catch {
    showToast('Kesalahan koneksi', 'error');
  }
}

// ── Custom Context Menu ────────────────────────────────────────
const ctxMenu = document.getElementById('customContextMenu');
let ctxTargetId = null;
let ctxTargetName = null;

function hideContextMenu() {
  if (ctxMenu) {
    ctxMenu.classList.remove('active');
    ctxMenu.style.display = '';
  }
}

document.addEventListener('contextmenu', e => {
  const row = e.target.closest('#tableBody tr[data-id]');
  if (row) {
    e.preventDefault();
    ctxTargetId = row.getAttribute('data-id');
    ctxTargetName = row.getAttribute('data-name');
    
    // Position menu
    ctxMenu.style.display = 'flex';
    ctxMenu.classList.add('active');
    
    let x = e.pageX;
    let y = e.pageY;
    
    // Prevent clipping on right edge
    if (x + ctxMenu.offsetWidth > window.innerWidth) {
      x -= ctxMenu.offsetWidth;
    }
    // Prevent clipping on bottom edge
    if (y + ctxMenu.offsetHeight > window.innerHeight) {
      y -= ctxMenu.offsetHeight;
    }
    
    ctxMenu.style.left = `${x}px`;
    ctxMenu.style.top = `${y}px`;
  } else {
    hideContextMenu();
  }
});

document.addEventListener('dblclick', e => {
  const row = e.target.closest('#tableBody tr[data-id]');
  if (row) {
    const rowId = row.getAttribute('data-id');
    openModal(rowId);
  }
});

document.addEventListener('click', e => {
  if (ctxMenu && !ctxMenu.contains(e.target)) {
    hideContextMenu();
  }
  const langContainer = document.querySelector('.lang-switch-container');
  if (langContainer && !langContainer.contains(e.target)) {
    hideLangDropdown();
  }
});

if (document.getElementById('contextViewBtn')) {
  document.getElementById('contextViewBtn').addEventListener('click', () => {
    if (ctxTargetId) openModal(ctxTargetId);
    hideContextMenu();
  });
}

if (document.getElementById('contextEditBtn')) {
  document.getElementById('contextEditBtn').addEventListener('click', () => {
    if (ctxTargetId) openEditDetailModal(ctxTargetId);
    hideContextMenu();
  });
}

if (document.getElementById('contextDeleteBtn')) {
  document.getElementById('contextDeleteBtn').addEventListener('click', () => {
    if (ctxTargetId && ctxTargetName) deleteDevice(ctxTargetId, ctxTargetName);
    hideContextMenu();
  });
}

// ── Pagination Helper Functions ────────────────────────────────
function renderPagination(totalItems) {
  const container = document.getElementById('paginationContainer');
  const controls = document.getElementById('paginationControls');
  if (!container || !controls) return;

  if (totalItems <= 0) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'flex';

  const totalPages = Math.ceil(totalItems / pageSize);
  if (currentPage > totalPages) currentPage = Math.max(1, totalPages);

  // Update text
  const startIdx = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endIdx = Math.min(currentPage * pageSize, totalItems);
  document.getElementById('paginatedRange').textContent = `${startIdx}-${endIdx}`;
  document.getElementById('totalCount').textContent = totalItems;

  // Build controls buttons
  let html = '';
  
  // Previous button
  html += `<button class="pagination-btn" onclick="goToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>&laquo;</button>`;

  // Smart page numbers
  const range = 2; // Pages to show around current page
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - range && i <= currentPage + range)) {
      html += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    } else if (i === 2 || i === totalPages - 1) {
      // Prevents multiple consecutive ellipses
      if (!html.endsWith('<span class="pagination-ellipsis">...</span>')) {
        html += `<span class="pagination-ellipsis">...</span>`;
      }
    }
  }

  // Next button
  html += `<button class="pagination-btn" onclick="goToPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>&raquo;</button>`;

  controls.innerHTML = html;
}



function goToPage(page) {
  if (isEditMode) return;
  currentPage = page;
  const q = searchInput ? searchInput.value.trim() : '';
  loadData(q, false);
}

function changePageSize(size) {
  if (isEditMode) return;
  pageSize = parseInt(size, 10) || 50;
  currentPage = 1;
  const q = searchInput ? searchInput.value.trim() : '';
  loadData(q, false);
}

// ── Dark/Light Theme Toggle ────────────────────────────────────
function toggleTheme() {
  const isDark = document.body.classList.toggle('dark-theme');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  updateThemeIcons(isDark);
}

function updateThemeIcons(isDark) {
  const sunIcon = document.querySelector('.sun-icon');
  const moonIcon = document.querySelector('.moon-icon');
  if (sunIcon && moonIcon) {
    if (isDark) {
      sunIcon.style.display = 'none';
      moonIcon.style.display = 'block';
    } else {
      sunIcon.style.display = 'block';
      moonIcon.style.display = 'none';
    }
  }
}

// Block scrolling on background when modal is active
(function initModalScrollBlocker() {
  const observer = new MutationObserver(() => {
    const activeModals = document.querySelectorAll('.modal-overlay.active');
    if (activeModals.length > 0) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
  });

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });
  });
})();

// Init theme on load
(function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = savedTheme === 'dark' || (!savedTheme && prefersDark);
  if (isDark) {
    document.body.classList.add('dark-theme');
  } else {
    document.body.classList.remove('dark-theme');
  }
  // Run after DOM content is loaded if element is not ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => updateThemeIcons(isDark));
  } else {
    updateThemeIcons(isDark);
  }
})();

// ── IP Auto-Formatter & Local Ping Launcher ────────────────────
function autoFixIP(ipStr) {
  if (!ipStr) return '';
  let s = ipStr.trim().replace(/\s+/g, '');
  
  if (s.includes('.')) {
    // Clean up duplicate dots
    return s.replace(/\.+/g, '.');
  }
  
  if (/^\d+$/.test(s)) {
    // 10.x.x.x (Prefix 10, length 11) -> 10255241151 -> 10.255.241.151
    if (s.startsWith('10') && s.length === 11) {
      return `10.${s.slice(2, 5)}.${s.slice(5, 8)}.${s.slice(8)}`;
    }
    // 192.168.x.x (Prefix 192168)
    if (s.startsWith('192168')) {
      let rem = s.slice(6);
      if (rem.length === 2) {
        return `192.168.${rem[0]}.${rem[1]}`;
      } else if (rem.length === 3) {
        return `192.168.${rem.slice(0, -1)}.${rem.slice(-1)}`;
      } else if (rem.length === 4) {
        return `192.168.${rem.slice(0, 3)}.${rem.slice(3)}`;
      }
    }
    // 12 digits -> 192168001001 -> 192.168.1.1
    if (s.length === 12) {
      const o1 = parseInt(s.slice(0, 3), 10);
      const o2 = parseInt(s.slice(3, 6), 10);
      const o3 = parseInt(s.slice(6, 9), 10);
      const o4 = parseInt(s.slice(9, 12), 10);
      if (o1 <= 255 && o2 <= 255 && o3 <= 255 && o4 <= 255) {
        return `${o1}.${o2}.${o3}.${o4}`;
      }
    }
    // 10.x.x.x with 8 digits
    if (s.startsWith('10') && s.length === 8) {
      return `10.${parseInt(s.slice(2, 4), 10)}.${parseInt(s.slice(4, 6), 10)}.${parseInt(s.slice(6, 8), 10)}`;
    }
  }
  return ipStr;
}

async function launchPing(ip, event) {
  if (event) event.stopPropagation(); // Prevent opening modal
  if (!ip) return;
  try {
    const res = await fetch(`/api/devices/ping/${ip}`, { method: 'POST' });
    const json = await res.json();
    if (res.ok) {
      showToast(json.message, 'success');
    } else {
      showToast(json.message || 'Gagal meluncurkan ping', 'error');
    }
  } catch {
    showToast('Kesalahan koneksi ke server.', 'error');
  }
}

// ── Keyboard Shortcuts ─────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  const tag = e.target.tagName.toLowerCase();
  const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;

  if (e.key === 'Escape') {
    const activeModal = document.querySelector('.modal-overlay.active');
    if (activeModal) {
      closeModal(activeModal.id);
    } else {
      clearSearch();
    }
    return;
  }

  if (isTyping) return;

  if (e.key === '/') {
    e.preventDefault();
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
    return;
  }

  if (e.key.toLowerCase() === 'e') {
    e.preventDefault();
    toggleEditMode();
    return;
  }

  if (e.key.toLowerCase() === 'n') {
    e.preventDefault();
    const toggle = document.getElementById('formToggle');
    if (toggle) toggle.click();
    return;
  }
});

// ── Language Switcher functions ─────────────────────────────────
async function loadTranslations(lang = null) {
  if (lang) {
    currentLang = lang;
    localStorage.setItem('lang', lang);
  }
  try {
    const res = await fetch(`/lang/${currentLang}`);
    if (!res.ok) throw new Error();
    translations = await res.json();
    translateDOM();
    updateSwitcherUI();
    
    if (allData && allData.length > 0) {
      const q = searchInput ? searchInput.value.trim() : '';
      loadData(q, false);
    }
  } catch (err) {
    console.error("Gagal memuat terjemahan:", err);
  }
}

function translateDOM() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (translations[key]) {
      if (el.children.length === 0) {
        el.textContent = translations[key];
      } else {
        let textNode = Array.from(el.childNodes).find(n => n.nodeType === Node.TEXT_NODE);
        if (textNode) {
          textNode.nodeValue = translations[key];
        }
      }
    }
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (translations[key]) {
      el.setAttribute('placeholder', translations[key]);
    }
  });

  const select = document.getElementById('pageSizeSelect');
  if (select && translations['per_page']) {
    Array.from(select.options).forEach(opt => {
      const size = opt.value;
      opt.textContent = `${size} ${translations['per_page']}`;
    });
  }
}

function updateSwitcherUI() {
  const flagWrap = document.getElementById('activeFlagWrap');
  const langText = document.getElementById('activeLangText');
  if (!flagWrap || !langText) return;
  
  langText.textContent = currentLang.toUpperCase();
  
  if (currentLang === 'id') {
    flagWrap.innerHTML = `<svg viewBox="0 0 3 2" class="flag-icon"><rect width="3" height="1" fill="#FF0000"/><rect y="1" width="3" height="1" fill="#FFFFFF"/></svg>`;
  } else if (currentLang === 'zh') {
    flagWrap.innerHTML = `<svg viewBox="0 0 900 600" class="flag-icon"><rect width="900" height="600" fill="#EE1C25"/><polygon points="150,85 170,147 235,147 182,185 202,247 150,209 97,247 117,185 64,147 130,147" fill="#FFFF00"/><polygon points="300,50 310,81 343,81 316,100 326,131 300,112 273,131 283,100 256,81 289,81" fill="#FFFF00"/><polygon points="360,140 370,171 403,171 376,190 386,221 360,202 333,221 343,190 316,171 349,171" fill="#FFFF00"/><polygon points="360,260 370,291 403,291 376,310 386,341 360,322 333,341 343,310 316,291 349,291" fill="#FFFF00"/><polygon points="300,350 310,381 343,381 316,400 326,431 300,412 273,431 283,400 256,381 289,381" fill="#FFFF00"/></svg>`;
  } else if (currentLang === 'es') {
    flagWrap.innerHTML = `<svg viewBox="0 0 3 2" class="flag-icon"><rect width="3" height="2" fill="#AA151B"/><rect y="0.5" width="3" height="1" fill="#F1BF00"/></svg>`;
  } else if (currentLang === 'hi') {
    flagWrap.innerHTML = `<svg viewBox="0 0 3 2" class="flag-icon"><rect width="3" height="0.666" fill="#FF9933"/><rect y="0.666" width="3" height="0.666" fill="#FFFFFF"/><rect y="1.333" width="3" height="0.666" fill="#138808"/><circle cx="1.5" cy="1" r="0.25" fill="none" stroke="#000080" stroke-width="0.05"/></svg>`;
  } else if (currentLang === 'ar') {
    flagWrap.innerHTML = `<svg viewBox="0 0 3 2" class="flag-icon"><rect width="3" height="2" fill="#006C35"/><rect x="0.5" y="0.9" width="2" height="0.2" fill="#FFFFFF"/></svg>`;
  } else if (currentLang === 'ru') {
    flagWrap.innerHTML = `<svg viewBox="0 0 3 2" class="flag-icon"><rect width="3" height="0.666" fill="#FFFFFF"/><rect y="0.666" width="3" height="0.666" fill="#0039A6"/><rect y="1.333" width="3" height="0.666" fill="#D52B1E"/></svg>`;
  } else {
    flagWrap.innerHTML = `<svg viewBox="0 0 50 30" class="flag-icon"><rect width="50" height="30" fill="#012169"/><path d="M0 0 L50 30 M50 0 L0 30" stroke="#fff" stroke-width="6"/><path d="M0 0 L50 30 M50 0 L0 30" stroke="#C8102E" stroke-width="2"/><path d="M25 0 V30 M0 15 H50" stroke="#fff" stroke-width="10"/><path d="M25 0 V30 M0 15 H50" stroke="#C8102E" stroke-width="6"/></svg>`;
  }
  
  document.querySelectorAll('.lang-dropdown-item').forEach(item => {
    item.classList.toggle('active', item.id === `lang-opt-${currentLang}`);
  });
}

function toggleLangDropdown(event) {
  if (event) event.stopPropagation();
  const container = document.querySelector('.lang-switch-container');
  const dropdown = document.getElementById('langDropdown');
  if (container && dropdown) {
    const active = container.classList.toggle('active');
    dropdown.classList.toggle('active', active);
  }
}

function hideLangDropdown() {
  const container = document.querySelector('.lang-switch-container');
  const dropdown = document.getElementById('langDropdown');
  if (container && dropdown) {
    container.classList.remove('active');
    dropdown.classList.remove('active');
  }
}

function changeLanguage(lang) {
  loadTranslations(lang);
  hideLangDropdown();
}

// ── Sync from Google Sheets ───────────────────────────────────────
let _syncSheetsForce = false; // flag jika user mau lanjut walaupun Sheets kosong

async function initSyncFromSheets() {
  _syncSheetsForce = false;

  // Reset state modal
  const loading      = document.getElementById('syncSheetsLoading');
  const infoDiv      = document.getElementById('syncSheetsInfo');
  const footer       = document.getElementById('syncSheetsFooter');
  const warningBanner= document.getElementById('syncSheetsWarningBanner');
  const header       = document.getElementById('syncSheetsHeader');
  const confirmBtn   = document.getElementById('syncSheetsConfirmBtn');

  loading.style.display       = 'block';
  infoDiv.style.display       = 'none';
  footer.style.display        = 'none';
  warningBanner.style.display = 'none';
  header.style.color          = '';
  confirmBtn.style.background = '';
  confirmBtn.style.borderColor= '';

  document.getElementById('syncSheetsOverlay').classList.add('active');

  try {
    const res  = await fetch('/api/sync-from-sheets/preview');
    const json = await res.json();

    loading.style.display = 'none';
    infoDiv.style.display = 'block';
    footer.style.display  = 'flex';

    if (json.status === 'not_configured') {
      document.getElementById('syncSheetsStats').innerHTML = `
        <div style="grid-column:span 2;background:rgba(234,179,8,0.08);border:1.5px solid rgba(234,179,8,0.35);border-radius:8px;padding:12px 14px;font-size:13px;color:#b45309">
          ⚠️ Google Sheets belum dikonfigurasi. Pastikan <strong>credentials.json</strong> dan <strong>config_sheets.txt</strong> sudah ada di folder proyek.
        </div>`;
      document.getElementById('syncSheetsDesc').textContent = '';
      footer.style.display = 'none';
      return;
    }

    if (json.status === 'error') {
      document.getElementById('syncSheetsStats').innerHTML = `
        <div style="grid-column:span 2;background:rgba(239,68,68,0.08);border:1.5px solid rgba(239,68,68,0.35);border-radius:8px;padding:12px 14px;font-size:13px;color:#dc2626">
          ❌ Gagal membaca Google Sheets: ${json.message || 'Error tidak diketahui'}
        </div>`;
      document.getElementById('syncSheetsDesc').textContent = '';
      footer.style.display = 'none';
      return;
    }

    const sheetsCount = json.count || 0;
    const localCount  = json.local_count || 0;
    const isEmpty     = sheetsCount === 0;

    // Stats card
    document.getElementById('syncSheetsStats').innerHTML = `
      <div style="background:rgba(99,102,241,0.08);border:1.5px solid rgba(99,102,241,0.25);border-radius:8px;padding:12px;text-align:center">
        <div style="font-size:22px;font-weight:700;color:#6366f1">${sheetsCount}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">Data di Google Sheets</div>
      </div>
      <div style="background:rgba(99,102,241,0.06);border:1.5px solid rgba(99,102,241,0.15);border-radius:8px;padding:12px;text-align:center">
        <div style="font-size:22px;font-weight:700;color:var(--text)">${localCount}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">Data Lokal (sdwan.db)</div>
      </div>`;

    if (isEmpty) {
      // Mode BAHAYA: Sheets kosong
      _syncSheetsForce = false; // masih butuh konfirmasi lagi
      warningBanner.style.display = 'flex';
      document.getElementById('syncWarningText').textContent =
        `Data di Google Sheets kosong (0 baris). Jika dilanjutkan, ${localCount} data lokal Anda akan TERHAPUS PERMANEN dan tidak dapat dipulihkan!`;
      document.getElementById('syncSheetsDesc').textContent =
        'Apakah Anda benar-benar yakin ingin melanjutkan sinkronisasi ini?';
      // Warnakan tombol konfirmasi jadi merah
      confirmBtn.style.background  = '#ef4444';
      confirmBtn.style.borderColor = '#ef4444';
      document.getElementById('syncSheetsConfirmText').textContent = 'Ya, Sinkron Tetap Lanjut';
      header.style.color = '#ef4444';
    } else {
      // Mode NORMAL: Sheets punya data
      warningBanner.style.display = 'none';
      document.getElementById('syncSheetsDesc').textContent =
        `Sinkronisasi ini akan menggantikan ${localCount} data lokal dengan ${sheetsCount} data dari Google Sheets. Pastikan data di Sheets sudah benar sebelum melanjutkan.`;
      confirmBtn.style.background  = '';
      confirmBtn.style.borderColor = '';
      document.getElementById('syncSheetsConfirmText').textContent = 'Sinkronkan Sekarang';
      header.style.color = '';
    }

  } catch (err) {
    loading.style.display = 'none';
    infoDiv.style.display = 'block';
    document.getElementById('syncSheetsStats').innerHTML = `
      <div style="grid-column:span 2;font-size:13px;color:var(--muted)">Gagal menghubungi server. Pastikan aplikasi berjalan.</div>`;
    document.getElementById('syncSheetsDesc').textContent = '';
    footer.style.display = 'none';
  }
}

async function executeSyncFromSheets() {
  const confirmBtn = document.getElementById('syncSheetsConfirmBtn');
  const origText   = document.getElementById('syncSheetsConfirmText').textContent;

  confirmBtn.disabled = true;
  document.getElementById('syncSheetsConfirmText').textContent = 'Menyinkronkan…';

  const isEmpty = document.getElementById('syncSheetsWarningBanner').style.display !== 'none';
  const force   = isEmpty; // kirim force=true jika Sheets kosong

  try {
    const res  = await fetch('/api/sync-from-sheets', {
      method:  'POST',
      headers: {'Content-Type': 'application/json'},
      body:    JSON.stringify({ force })
    });
    const json = await res.json();

    closeModal('syncSheetsOverlay');

    if (json.status === 'success') {
      showToast(`✅ Sinkronisasi selesai — ${json.inserted} data berhasil dimuat dari Google Sheets.`, 'success');
      loadData(searchInput.value, true);
    } else if (json.status === 'empty_warning') {
      showToast('Sinkronisasi dibatalkan: Sheets masih kosong.', 'info');
    } else {
      showToast(json.message || 'Gagal sinkronisasi dari Google Sheets.', 'error');
    }
  } catch (err) {
    closeModal('syncSheetsOverlay');
    showToast('Kesalahan koneksi saat sinkronisasi.', 'error');
  } finally {
    confirmBtn.disabled = false;
    document.getElementById('syncSheetsConfirmText').textContent = origText;
  }
}

// ── Init ───────────────────────────────────────────────────────
loadTranslations().then(() => {
  loadData();
});
