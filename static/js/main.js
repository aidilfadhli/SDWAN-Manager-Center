const form = document.getElementById('deviceForm');
let currentData = [];

// Menarik data dari backend
const loadData = async () => {
  const res = await fetch('/api/devices');
  currentData = await res.json();
  document.getElementById('tableBody').innerHTML = currentData
    .map(
      (d) => `
          <tr>
              <td style="font-weight: 500;">${d.customer}</td>
              <td class="tech-id">${d.site_id}</td>
              <td class="tech-id" style="color: var(--cisco-text);">${d.hostname}</td>
              <td><span style="background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-family: monospace;">${d.ip_address}</span></td>
          </tr>
      `,
    )
    .join('');
};

// Export data ke Excel
const exportToExcel = () => {
  if (currentData.length === 0) {
    alert('Database kosong, tidak ada yang bisa diekspor.');
    return;
  }

  const worksheetData = currentData.map((d) => ({
    'Customer Name': d.customer,
    'Site ID': d.site_id,
    Hostname: d.hostname,
    'System IP': d.ip_address,
  }));

  const ws = XLSX.utils.json_to_sheet(worksheetData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Inventory');

  XLSX.writeFile(wb, 'SDWAN_Inventory_Export.xlsx');
};

// Menyimpan data baru
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    platform: document.getElementById('platform').value,
    pabrikan: document.getElementById('pabrikan').value,
    regional: document.getElementById('regional').value.toUpperCase(),
    sto: document.getElementById('sto').value.toUpperCase(),
    customer: document.getElementById('customer').value.toUpperCase(),
    lokasi: document.getElementById('lokasi').value.toUpperCase(),
    tipe_edge: document.getElementById('tipe_edge').value,
    kode_cust: document.getElementById('kode_cust').value,
    kode_reg: document.getElementById('kode_reg').value,
    kode_branch: document.getElementById('kode_branch').value,
    ip_address: document.getElementById('ip_address').value,
  };

  await fetch('/api/devices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  form.reset();
  loadData();
});

loadData();
