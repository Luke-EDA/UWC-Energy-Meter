'use strict';

const byId = (id) => document.getElementById(id);
const fmt = (value, digits = 2) => Number(value ?? 0).toFixed(digits);
const params = new URLSearchParams(window.location.search);
const selectedDeviceId = params.get('deviceId');
let chart;

function apiUrl(path, extraParams = {}) {
  const query = new URLSearchParams(extraParams);
  if (selectedDeviceId) query.set('deviceId', selectedDeviceId);
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

async function getJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function formatTime(timestamp) {
  if (!timestamp) return '--:--:--';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '--:--:--';
  return date.toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
}

function setConnection(ok) {
  byId('connectionDot').className = `dot ${ok ? 'ok' : 'warn'}`;
  byId('connectionText').textContent = ok ? 'ONLINE' : 'RECONNECTING';
}

function setDisabledState() {
  byId('connectionDot').className = 'dot disabled';
  byId('connectionText').textContent = 'DISABLED';
  byId('headerLastUpdate').textContent = 'No live data';
}

function setPageError(message) {
  const element = byId('pageMessage');
  element.textContent = message;
  element.hidden = false;
}

function updateDeviceName(name) {
  const deviceName = name || selectedDeviceId || 'Unknown Device';
  byId('deviceName').textContent = deviceName;
  document.title = `${deviceName} · UWC Energy Monitor`;
}

function updateLive(data) {
  if (!data) return;

  updateDeviceName(data.deviceId);
  const lastUpdate = formatTime(data.ts);

  byId('neutralStatus').textContent = data.neutralPresent ? 'Present' : 'Missing';
  byId('totalKw').textContent = `${fmt(data.totalPowerKw)} kW`;
  byId('frequency').textContent = `${fmt(data.frequencyHz ?? 50, 2)} Hz`;
  byId('powerFactor').textContent = fmt(data.powerFactor ?? 1, 2);
  byId('lastUpdate').textContent = lastUpdate;
  byId('headerLastUpdate').textContent = `Last update ${lastUpdate}`;

  ['l1', 'l2', 'l3'].forEach((line) => {
    byId(`${line}v`).textContent = `${fmt(data[line].voltage, 1)} V`;
    byId(`${line}c`).textContent = `${fmt(data[line].current, 2)} A`;
    byId(`${line}p`).textContent = `${fmt(data[line].powerKw, 3)} kW`;
  });
}

async function loadSummary() {
  const rows = await getJson(apiUrl('/api/summary'));
  const tbody = byId('summaryTable').querySelector('tbody');
  tbody.innerHTML = rows.map((row) => `
    <tr>
      <td>${row.period.label}</td>
      <td>${fmt(row.l1Kwh, 2)} kWh</td>
      <td>${fmt(row.l2Kwh, 2)} kWh</td>
      <td>${fmt(row.l3Kwh, 2)} kWh</td>
      <td><strong>${fmt(row.totalKwh, 2)} kWh</strong></td>
    </tr>`).join('');
}

function buildChart(historyRows) {
  const context = byId('powerChart');
  const labels = historyRows.map((row) => new Date(row.ts).toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit'
  }));

  chart = new Chart(context, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'L1 kW', data: historyRows.map((row) => row.l1_power_kw), borderColor: '#0b63ce', backgroundColor: '#0b63ce22', tension: 0.25, pointRadius: 1.5 },
        { label: 'L2 kW', data: historyRows.map((row) => row.l2_power_kw), borderColor: '#28a745', backgroundColor: '#28a74522', tension: 0.25, pointRadius: 1.5 },
        { label: 'L3 kW', data: historyRows.map((row) => row.l3_power_kw), borderColor: '#f59e0b', backgroundColor: '#f59e0b22', tension: 0.25, pointRadius: 1.5 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: '#334155' } } },
      scales: {
        x: { ticks: { color: '#64748b', maxTicksLimit: 12 }, grid: { color: '#e2e8f0' } },
        y: { ticks: { color: '#64748b' }, grid: { color: '#e2e8f0' }, title: { display: true, text: 'kW', color: '#475569' } }
      }
    }
  });
}

function pushChartPoint(data) {
  if (!chart) return;

  chart.data.labels.push(new Date(data.ts).toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit'
  }));
  chart.data.datasets[0].data.push(data.l1PowerKw ?? data.l1?.powerKw);
  chart.data.datasets[1].data.push(data.l2PowerKw ?? data.l2?.powerKw);
  chart.data.datasets[2].data.push(data.l3PowerKw ?? data.l3?.powerKw);

  const maxPoints = 24 * 60 * 60;
  while (chart.data.labels.length > maxPoints) {
    chart.data.labels.shift();
    chart.data.datasets.forEach((dataset) => dataset.data.shift());
  }
  chart.update('none');
}

function websocketUrl() {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${location.host}/ws`;
}

function connectWebSocket() {
  const socket = new WebSocket(websocketUrl());

  socket.onopen = () => setConnection(true);
  socket.onclose = () => {
    setConnection(false);
    window.setTimeout(connectWebSocket, 2500);
  };
  socket.onerror = () => setConnection(false);
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.type !== 'reading') return;

    const reading = message.data;
    if (selectedDeviceId && reading.deviceId !== selectedDeviceId) return;

    const apiShape = {
      deviceId: reading.deviceId,
      ts: reading.ts,
      neutralPresent: Boolean(reading.neutralPresent),
      frequencyHz: reading.frequencyHz,
      powerFactor: reading.powerFactor,
      totalPowerKw: reading.totalPowerKw,
      l1: { voltage: reading.l1Voltage, current: reading.l1Current, powerKw: reading.l1PowerKw },
      l2: { voltage: reading.l2Voltage, current: reading.l2Current, powerKw: reading.l2PowerKw },
      l3: { voltage: reading.l3Voltage, current: reading.l3Current, powerKw: reading.l3PowerKw }
    };

    updateLive(apiShape);
    pushChartPoint(reading);
  };
}

async function initialise() {
  if (!selectedDeviceId) {
    setPageError('No device was selected. Return to the dashboard and choose a device.');
    updateDeviceName('No Device Selected');
    setConnection(false);
    return;
  }

  updateDeviceName(selectedDeviceId);

  const devices = await getJson('/api/devices');
  const selectedDevice = devices.find((device) => device.name === selectedDeviceId);
  if (!selectedDevice) {
    throw new Error(`The device ${selectedDeviceId} is no longer configured`);
  }

  const [latest, historyRows] = await Promise.all([
    getJson(apiUrl('/api/latest')),
    getJson(apiUrl('/api/history', { hours: 24 }))
  ]);

  buildChart(historyRows);
  await loadSummary();
  window.setInterval(loadSummary, 60_000);

  if (selectedDevice.enabled === false) {
    setDisabledState();
    return;
  }

  if (!latest) {
    throw new Error(`No readings are available for ${selectedDeviceId}`);
  }

  updateLive(latest);
  connectWebSocket();
}

initialise().catch((error) => {
  console.error(error);
  setConnection(false);
  setPageError(`Unable to load this device: ${error.message}`);
});
