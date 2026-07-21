const fmt = (n, digits = 2) => Number(n ?? 0).toFixed(digits);
const byId = (id) => document.getElementById(id);
let chart;

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function setConnection(ok) {
  byId('connectionDot').className = `dot ${ok ? 'ok' : 'warn'}`;
  byId('connectionText').textContent = ok ? 'Live connection' : 'Reconnecting...';
}

function updateLive(data) {
  byId('neutralStatus').textContent = data.neutralPresent ? 'Present' : 'Missing';
  byId('totalKw').textContent = `${fmt(data.totalPowerKw)} kW`;
  byId('frequency').textContent = `${fmt(data.frequencyHz || 50, 1)} Hz`;
  byId('lastUpdate').textContent = new Date(data.ts).toLocaleTimeString();
  ['l1','l2','l3'].forEach(line => {
    byId(`${line}v`).textContent = `${fmt(data[line].voltage, 1)} V`;
    byId(`${line}c`).textContent = `${fmt(data[line].current, 2)} A`;
    byId(`${line}p`).textContent = `${fmt(data[line].powerKw, 3)} kW`;
  });
}

async function loadSummary() {
  const rows = await getJson('/api/summary');
  const tbody = byId('summaryTable').querySelector('tbody');
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.period.label}</td>
      <td>${fmt(r.l1Kwh, 2)} kWh</td>
      <td>${fmt(r.l2Kwh, 2)} kWh</td>
      <td>${fmt(r.l3Kwh, 2)} kWh</td>
      <td><strong>${fmt(r.totalKwh, 2)} kWh</strong></td>
    </tr>`).join('');
}

function buildChart(historyRows) {
  const ctx = byId('powerChart');
  const labels = historyRows.map(r => new Date(r.ts).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }));
  const data = {
    labels,
    datasets: [
      { label:'Live 1 kW', data: historyRows.map(r => r.l1_power_kw), borderColor:'#38bdf8', backgroundColor:'#38bdf833', tension:.25, pointRadius:1.5 },
      { label:'Live 2 kW', data: historyRows.map(r => r.l2_power_kw), borderColor:'#22c55e', backgroundColor:'#22c55e33', tension:.25, pointRadius:1.5 },
      { label:'Live 3 kW', data: historyRows.map(r => r.l3_power_kw), borderColor:'#f97316', backgroundColor:'#f9731633', tension:.25, pointRadius:1.5 }
    ]
  };
  chart = new Chart(ctx, {
    type:'line', data,
    options:{ responsive:true, maintainAspectRatio:false, animation:false,
      plugins:{ legend:{ labels:{ color:'#e5e7eb' } } },
      scales:{ x:{ ticks:{ color:'#94a3b8', maxTicksLimit:12 }, grid:{ color:'#253044' } }, y:{ ticks:{ color:'#94a3b8' }, grid:{ color:'#253044' }, title:{ display:true, text:'kW', color:'#cbd5e1' } } }
    }
  });
}

function pushChartPoint(data) {
  if (!chart) return;
  const label = new Date(data.ts).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
  chart.data.labels.push(label);
  chart.data.datasets[0].data.push(data.l1PowerKw ?? data.l1?.powerKw);
  chart.data.datasets[1].data.push(data.l2PowerKw ?? data.l2?.powerKw);
  chart.data.datasets[2].data.push(data.l3PowerKw ?? data.l3?.powerKw);
  const maxPoints = 24 * 60 * 12; // 5-second readings over 24 hours
  while (chart.data.labels.length > maxPoints) {
    chart.data.labels.shift(); chart.data.datasets.forEach(ds => ds.data.shift());
  }
  chart.update('none');
}

function websocketUrl() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

function connectWs() {
  const ws = new WebSocket(websocketUrl());
  ws.onopen = () => setConnection(true);
  ws.onclose = () => { setConnection(false); setTimeout(connectWs, 2500); };
  ws.onerror = () => setConnection(false);
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'reading') {
      const r = msg.data;
      const apiShape = {
        ts: r.ts, neutralPresent: !!r.neutralPresent,
        frequencyHz: r.frequencyHz, totalPowerKw: r.totalPowerKw,
        l1: { voltage:r.l1Voltage, current:r.l1Current, powerKw:r.l1PowerKw },
        l2: { voltage:r.l2Voltage, current:r.l2Current, powerKw:r.l2PowerKw },
        l3: { voltage:r.l3Voltage, current:r.l3Current, powerKw:r.l3PowerKw }
      };
      updateLive(apiShape);
      pushChartPoint(r);
    }
  };
}

async function init() {
  const [latest, hist] = await Promise.all([getJson('/api/latest'), getJson('/api/history?hours=24')]);
  if (latest) updateLive(latest);
  buildChart(hist);
  await loadSummary();
  setInterval(loadSummary, 60_000);
  connectWs();
}

init().catch(err => {
  console.error(err);
  setConnection(false);
});
