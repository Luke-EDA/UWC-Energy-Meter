'use strict';

const byId = (id) => document.getElementById(id);
const fmt = (value, digits = 2) => Number(value ?? 0).toFixed(digits);
const params = new URLSearchParams(window.location.search);
const selectedDeviceId = params.get('deviceId');
const PHASES = ['l1', 'l2', 'l3'];
let chart;
let selectedDevice;
let phaseConfig = defaultPhaseConfig();
let originalPhaseConfig = defaultPhaseConfig();
let pendingPhaseConfig = null;
let currentHistoryRange = '24h';
let currentHistoryRows = [];
let historyRefreshTimer = null;
let currentEnergySummaryRange = 'current-month';
let energySummaryRefreshTimer = null;

function defaultPhaseConfig() {
  return {
    l1: { enabled: true, label: '' },
    l2: { enabled: true, label: '' },
    l3: { enabled: true, label: '' }
  };
}

function clonePhaseConfig(config) {
  return JSON.parse(JSON.stringify(config || defaultPhaseConfig()));
}

function normalisePhaseConfig(config) {
  const defaults = defaultPhaseConfig();
  return Object.fromEntries(PHASES.map((phase) => [phase, {
    enabled: config?.[phase]?.enabled !== false,
    label: String(config?.[phase]?.label || '').trim()
  }]));
}

function phaseDisplayName(phase, config = phaseConfig) {
  const phaseNumber = phase.toUpperCase();
  const label = config[phase]?.label;
  return label ? `${phaseNumber} - ${label}` : phaseNumber;
}

function chartThemeColours() {
  const styles = getComputedStyle(document.documentElement);
  return {
    text: styles.getPropertyValue('--text').trim() || '#334155',
    muted: styles.getPropertyValue('--muted').trim() || '#64748b',
    border: styles.getPropertyValue('--border').trim() || '#e2e8f0',
    phaseL1: styles.getPropertyValue('--phase-l1').trim() || '#d32f2f',
    phaseL2: styles.getPropertyValue('--phase-l2').trim() || '#fbc02d',
    phaseL3: styles.getPropertyValue('--phase-l3').trim() || '#1976d2'
  };
}

function applyChartTheme() {
  if (!chart) return;
  const colours = chartThemeColours();
  chart.options.plugins.legend.labels.color = colours.text;
  chart.options.scales.x.ticks.color = colours.muted;
  chart.options.scales.x.grid.color = colours.border;
  chart.options.scales.y.ticks.color = colours.muted;
  chart.options.scales.y.grid.color = colours.border;
  chart.options.scales.y.title.color = colours.text;
  const phaseColours = [colours.phaseL1, colours.phaseL2, colours.phaseL3];
  chart.data.datasets.forEach((dataset, index) => {
    dataset.borderColor = phaseColours[index];
    dataset.backgroundColor = `${phaseColours[index]}22`;
  });
  chart.update('none');
}

function apiUrl(path, extraParams = {}) {
  const query = new URLSearchParams(extraParams);
  if (selectedDeviceId) query.set('deviceId', selectedDeviceId);
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

async function getJson(url, options = {}) {
  const response = await fetch(url, { cache: 'no-store', ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

function formatTime(timestamp) {
  if (!timestamp) return '--:--:--';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '--:--:--';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
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

function setUnavailableState(device) {
  byId('connectionDot').className = 'dot warn';
  byId('connectionText').textContent = device.status === 'adapter_not_configured' ? 'NOT CONFIGURED' : 'OFFLINE';
  byId('headerLastUpdate').textContent = device.statusMessage || 'No live data';
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

function applyPhaseConfig(config) {
  phaseConfig = normalisePhaseConfig(config);
  PHASES.forEach((phase) => {
    const enabled = phaseConfig[phase].enabled;
    byId(`${phase}Title`).textContent = phaseDisplayName(phase);
    byId(`${phase}Card`).classList.toggle('is-disabled', !enabled);
    byId(`${phase}Card`).querySelector('.measurement-list').hidden = !enabled;
    byId(`${phase}Disabled`).hidden = enabled;
  });
  updateChartLabels();
}

function updateChartLabels() {
  if (!chart) return;
  chart.data.datasets.forEach((dataset, index) => {
    dataset.label = `${phaseDisplayName(PHASES[index])} kW`;
  });
  chart.update('none');
}

function updateLive(data) {
  if (!data) return;
  updateDeviceName(data.deviceId);
  if (data.phaseConfig) applyPhaseConfig(data.phaseConfig);
  const lastUpdate = formatTime(data.ts);
  byId('neutralStatus').textContent = data.neutralPresent ? 'Present' : 'Missing';
  byId('totalKw').textContent = data.totalPowerKw == null ? 'N/A' : `${fmt(data.totalPowerKw)} kW`;
  byId('lastUpdate').textContent = lastUpdate;
  byId('headerLastUpdate').textContent = `Last update ${lastUpdate}`;

  PHASES.forEach((phase) => {
    if (!phaseConfig[phase].enabled || !data[phase]) return;
    byId(`${phase}v`).textContent = `${fmt(data[phase].voltage, 1)} V`;
    byId(`${phase}c`).textContent = `${fmt(data[phase].current, 2)} A`;
    byId(`${phase}p`).textContent = data[phase].powerKw == null ? 'N/A' : `${fmt(data[phase].powerKw, 3)} kW`;
  });
}

function formatEnergy(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-- kWh';
  return `${new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number)} kWh`;
}

function formatCurrency(value, currency) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '--';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'ZAR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(number);
  } catch (error) {
    return `${currency || ''} ${number.toFixed(2)}`.trim();
  }
}

function formatEnergyPeriod(startValue, endValue, isLive) {
  const start = new Date(startValue);
  const end = new Date(endValue);
  const dateOptions = { day: '2-digit', month: 'short', year: 'numeric' };
  const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
  const startText = `${start.toLocaleDateString([], dateOptions)} ${start.toLocaleTimeString([], timeOptions)}`;
  if (isLive) return `${startText} – Present`;
  const inclusiveEnd = new Date(end.getTime() - 1);
  return `${startText} – ${inclusiveEnd.toLocaleDateString([], dateOptions)} 23:59`;
}

async function loadDeviceEnergySummary(range = currentEnergySummaryRange, silent = false) {
  const supported = new Set(['current-month', 'last-month', 'last-6-months', 'last-year']);
  currentEnergySummaryRange = supported.has(range) ? range : 'current-month';
  byId('deviceEnergySummaryRange').value = currentEnergySummaryRange;
  const message = byId('deviceEnergySummaryMessage');
  if (!silent) message.textContent = 'Calculating energy usage…';
  message.classList.remove('error');

  try {
    const summary = await getJson(apiUrl('/api/energy-summary', { range: currentEnergySummaryRange }));
    byId('deviceEnergyUsageValue').textContent = formatEnergy(summary.energyKwh);
    byId('deviceEnergyCostValue').textContent = summary.cost === null
      ? 'Tariff not configured'
      : formatCurrency(summary.cost, summary.currency);
    byId('deviceEnergySummaryPeriod').textContent = formatEnergyPeriod(summary.start, summary.end, summary.isLive);
    message.textContent = '';
  } catch (error) {
    message.textContent = `Unable to calculate energy usage and cost: ${error.message}`;
    message.classList.add('error');
  }
}

function bindEnergySummaryRange() {
  byId('deviceEnergySummaryRange').addEventListener('change', (event) => {
    loadDeviceEnergySummary(event.target.value);
  });
  energySummaryRefreshTimer = window.setInterval(() => {
    if (currentEnergySummaryRange === 'current-month') loadDeviceEnergySummary(currentEnergySummaryRange, true);
  }, 60_000);
}

const RANGE_LABELS = Object.freeze({
  '24h': '24 hours',
  '7d': '7 days',
  '1m': '1 month',
  '6m': '6 months',
  '1y': '1 year'
});

function formatHistoryAxisLabel(timestamp, range = currentHistoryRange) {
  const date = new Date(timestamp);
  if (range === '24h') return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  if (range === '7d') return date.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  if (range === '1m' || range === '6m') return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
  return date.toLocaleDateString([], { month: 'short', year: '2-digit' });
}

function fullHistoryTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString([], {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
}

function updateChartData(historyPayload) {
  currentHistoryRows = Array.isArray(historyPayload) ? historyPayload : (historyPayload.rows || []);
  const labels = currentHistoryRows.map((row) => formatHistoryAxisLabel(row.ts));
  chart.data.labels = labels;
  PHASES.forEach((phase, index) => {
    chart.data.datasets[index].data = currentHistoryRows.map((row) => row[`${phase}_power_kw`]);
  });
  chart.update('none');
}

function buildChart(historyPayload) {
  currentHistoryRows = Array.isArray(historyPayload) ? historyPayload : (historyPayload.rows || []);
  const context = byId('powerChart');
  const themeColours = chartThemeColours();
  const labels = currentHistoryRows.map((row) => formatHistoryAxisLabel(row.ts));
  const colours = [themeColours.phaseL1, themeColours.phaseL2, themeColours.phaseL3];

  chart = new Chart(context, {
    type: 'line',
    data: {
      labels,
      datasets: PHASES.map((phase, index) => ({
        label: `${phaseDisplayName(phase)} kW`,
        data: currentHistoryRows.map((row) => row[`${phase}_power_kw`]),
        borderColor: colours[index],
        backgroundColor: `${colours[index]}22`,
        tension: 0.25,
        pointRadius: currentHistoryRange === '24h' ? 1.5 : 1,
        pointHoverRadius: 4,
        spanGaps: false
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: themeColours.text } },
        tooltip: {
          callbacks: {
            title: (items) => items.length ? fullHistoryTimestamp(currentHistoryRows[items[0].dataIndex]?.ts) : ''
          }
        }
      },
      scales: {
        x: { ticks: { color: themeColours.muted, maxTicksLimit: 12 }, grid: { color: themeColours.border } },
        y: { ticks: { color: themeColours.muted }, grid: { color: themeColours.border }, title: { display: true, text: 'kW', color: themeColours.text } }
      }
    }
  });
}

async function loadHistory(range = currentHistoryRange, silent = false) {
  const message = byId('deviceHistoryMessage');
  currentHistoryRange = RANGE_LABELS[range] ? range : '24h';
  byId('deviceHistoryRange').value = currentHistoryRange;
  byId('powerGraphTitle').textContent = `Power History · ${RANGE_LABELS[currentHistoryRange]}`;
  if (!silent) message.textContent = 'Loading power history…';
  message.classList.remove('error');

  try {
    const payload = await getJson(apiUrl('/api/history', { range: currentHistoryRange }));
    if (chart) updateChartData(payload); else buildChart(payload);
    message.textContent = payload.rows?.length ? '' : 'No historical data is available for this range.';
  } catch (error) {
    message.textContent = `Unable to load power history: ${error.message}`;
    message.classList.add('error');
  }
}

function bindHistoryRange() {
  byId('deviceHistoryRange').addEventListener('change', (event) => loadHistory(event.target.value));
  historyRefreshTimer = window.setInterval(() => loadHistory(currentHistoryRange, true), 5000);
}

function websocketUrl() {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${location.host}/ws`;
}

function connectWebSocket() {
  const socket = new WebSocket(websocketUrl());
  socket.onopen = () => setConnection(true);
  socket.onclose = () => { setConnection(false); window.setTimeout(connectWebSocket, 2500); };
  socket.onerror = () => setConnection(false);
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'phase-config') {
      if (!selectedDeviceId || message.data.deviceId === selectedDeviceId) applyPhaseConfig(message.data.phaseConfig);
      return;
    }
    if (message.type !== 'reading') return;
    const reading = message.data;
    if (selectedDeviceId && reading.deviceId !== selectedDeviceId) return;
    const apiShape = {
      deviceId: reading.deviceId,
      ts: reading.ts,
      neutralPresent: Boolean(reading.neutralPresent),
      totalPowerKw: reading.totalPowerKw,
      l1: reading.l1PowerKw == null ? null : { voltage: reading.l1Voltage, current: reading.l1Current, powerKw: reading.l1PowerKw },
      l2: reading.l2PowerKw == null ? null : { voltage: reading.l2Voltage, current: reading.l2Current, powerKw: reading.l2PowerKw },
      l3: reading.l3PowerKw == null ? null : { voltage: reading.l3Voltage, current: reading.l3Current, powerKw: reading.l3PowerKw }
    };
    updateLive(apiShape);
  };
}

function openPhaseDialog() {
  originalPhaseConfig = clonePhaseConfig(phaseConfig);
  PHASES.forEach((phase) => {
    byId(`${phase}Enabled`).checked = phaseConfig[phase].enabled;
    byId(`${phase}Label`).value = phaseConfig[phase].label;
  });
  byId('phaseDialogError').hidden = true;
  byId('phaseDialog').showModal();
}

function closePhaseDialog() {
  byId('phaseDialog').close();
}

function readPhaseForm() {
  return Object.fromEntries(PHASES.map((phase) => [phase, {
    enabled: byId(`${phase}Enabled`).checked,
    label: byId(`${phase}Label`).value.trim()
  }]));
}

async function savePhaseConfig(config) {
  const result = await getJson(`/api/devices/${selectedDevice.id}/phases`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  });
  applyPhaseConfig(result.phaseConfig);
  originalPhaseConfig = clonePhaseConfig(result.phaseConfig);
  pendingPhaseConfig = null;
  closePhaseDialog();
}

async function handlePhaseSave() {
  const nextConfig = readPhaseForm();
  const disabled = PHASES.filter((phase) => originalPhaseConfig[phase].enabled && !nextConfig[phase].enabled);
  if (disabled.length) {
    pendingPhaseConfig = nextConfig;
    byId('disablePhaseList').innerHTML = disabled.map((phase) => `<li>${phaseDisplayName(phase, nextConfig)}</li>`).join('');
    byId('disableConfirmDialog').showModal();
    return;
  }
  try {
    await savePhaseConfig(nextConfig);
  } catch (error) {
    byId('phaseDialogError').textContent = error.message;
    byId('phaseDialogError').hidden = false;
  }
}

function bindPhaseDialog() {
  byId('editPhasesButton').addEventListener('click', openPhaseDialog);
  document.querySelectorAll('[data-close-phase-dialog]').forEach((button) => button.addEventListener('click', closePhaseDialog));
  byId('savePhasesButton').addEventListener('click', handlePhaseSave);
  byId('cancelDisableButton').addEventListener('click', () => {
    pendingPhaseConfig = null;
    byId('disableConfirmDialog').close();
    PHASES.forEach((phase) => { byId(`${phase}Enabled`).checked = originalPhaseConfig[phase].enabled; });
  });
  byId('confirmDisableButton').addEventListener('click', async () => {
    byId('disableConfirmDialog').close();
    try {
      await savePhaseConfig(pendingPhaseConfig);
    } catch (error) {
      byId('phaseDialogError').textContent = error.message;
      byId('phaseDialogError').hidden = false;
    }
  });
}

async function initialise() {
  bindExportDialog();
  bindPhaseDialog();
  bindHistoryRange();
  bindEnergySummaryRange();
  if (!selectedDeviceId) {
    setPageError('No device was selected. Return to the dashboard and choose a device.');
    updateDeviceName('No Device Selected');
    setConnection(false);
    return;
  }

  updateDeviceName(selectedDeviceId);
  const devices = await getJson('/api/devices');
  selectedDevice = devices.find((device) => device.name === selectedDeviceId);
  if (!selectedDevice) throw new Error(`The device ${selectedDeviceId} is no longer configured`);
  applyPhaseConfig(selectedDevice.phaseConfig);

  const latest = await getJson(apiUrl('/api/latest'));
  await loadHistory('24h');
  await loadDeviceEnergySummary('current-month');

  if (selectedDevice.enabled === false) {
    setDisabledState();
    return;
  }
  if (selectedDevice.status !== 'online') {
    if (latest) updateLive(latest);
    setUnavailableState(selectedDevice);
    return;
  }
  if (!latest) {
    setConnection(true);
    byId('headerLastUpdate').textContent = 'Waiting for live measurements';
    connectWebSocket();
    return;
  }

  updateLive(latest);
  connectWebSocket();
}

initialise().catch((error) => {
  console.error(error);
  setConnection(false);
  setPageError(`Unable to load this device: ${error.message}`);
});

window.addEventListener('uwc-theme-change', applyChartTheme);

function exportFilenameFromDisposition(response, fallback) {
  const disposition = response.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return match ? match[1] : fallback;
}

async function generateDeviceExport() {
  const format = document.querySelector('input[name="deviceExportFormat"]:checked')?.value || 'pdf';
  const range = byId('deviceExportRange').value;
  const message = byId('exportMessage');
  const button = byId('generateExportButton');
  message.hidden = false;
  message.textContent = 'Generating export…';
  button.disabled = true;
  try {
    const response = await fetch(`/api/devices/${selectedDevice.id}/exports/${format}?range=${encodeURIComponent(range)}`);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `Export failed with HTTP ${response.status}`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = exportFilenameFromDisposition(response, `${selectedDevice.name}-Export.${format}`);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    byId('exportDialog').close();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function bindExportDialog() {
  const dialog = byId('exportDialog');
  byId('exportButton').addEventListener('click', () => {
    byId('deviceExportRange').value = 'last-week';
    byId('exportMessage').hidden = true;
    dialog.showModal();
  });
  byId('closeExportDialog').addEventListener('click', () => dialog.close());
  byId('cancelExport').addEventListener('click', () => dialog.close());
  byId('generateExportButton').addEventListener('click', generateDeviceExport);
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
}
