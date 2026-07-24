'use strict';

const REFRESH_INTERVAL_MS = 1000;
const DEVICE_SECTION_STATE_KEY = 'uwc-device-section-collapsed';
const HISTORY_SECTION_STATE_KEY = 'uwc-history-section-collapsed';
const HISTORY_REFRESH_INTERVAL_MS = 5000;
let totalPowerHistoryChart = null;
let devicesById = new Map();
let editingDeviceId = null;
let pendingDeleteDevice = null;
let currentSettings = { siteName: '', currency: 'ZAR', pricePerKwh: null };

const elements = {
  deviceCount: document.getElementById('deviceCount'),
  onlineCount: document.getElementById('onlineCount'),
  totalPower: document.getElementById('totalPower'),
  averageVoltage: document.getElementById('averageVoltage'),
  lastUpdate: document.getElementById('lastUpdate'),
  deviceGrid: document.getElementById('deviceGrid'),
  dashboardMessage: document.getElementById('dashboardMessage'),
  footerDeviceStatus: document.getElementById('footerDeviceStatus'),
  addDeviceButton: document.getElementById('addDeviceButton'),
  optionsButton: document.getElementById('optionsButton'),
  siteNameBanner: document.getElementById('siteNameBanner'),
  siteNameDisplay: document.getElementById('siteNameDisplay'),
  optionsDialog: document.getElementById('optionsDialog'),
  optionsForm: document.getElementById('optionsForm'),
  closeOptionsDialog: document.getElementById('closeOptionsDialog'),
  cancelOptions: document.getElementById('cancelOptions'),
  siteNameInput: document.getElementById('siteNameInput'),
  currencyInput: document.getElementById('currencyInput'),
  currencySymbol: document.getElementById('currencySymbol'),
  pricePerKwhInput: document.getElementById('pricePerKwhInput'),
  optionsMessage: document.getElementById('optionsMessage'),
  saveOptionsButton: document.getElementById('saveOptionsButton'),
  deviceSectionToggle: document.getElementById('deviceSectionToggle'),
  deviceSectionContent: document.getElementById('deviceSectionContent'),
  deviceSectionIndicator: document.getElementById('deviceSectionIndicator'),
  historySectionToggle: document.getElementById('historySectionToggle'),
  historySectionContent: document.getElementById('historySectionContent'),
  historySectionIndicator: document.getElementById('historySectionIndicator'),
  historyMessage: document.getElementById('historyMessage'),
  totalPowerHistoryCanvas: document.getElementById('totalPowerHistoryChart'),
  deviceDialog: document.getElementById('deviceDialog'),
  deviceForm: document.getElementById('deviceForm'),
  dialogTitle: document.getElementById('dialogTitle'),
  dialogEyebrow: document.getElementById('dialogEyebrow'),
  closeDeviceDialog: document.getElementById('closeDeviceDialog'),
  cancelDevice: document.getElementById('cancelDevice'),
  deviceMessage: document.getElementById('deviceMessage'),
  saveDeviceButton: document.getElementById('saveDeviceButton'),
  deleteDeviceButton: document.getElementById('deleteDeviceButton'),
  enabledLabel: document.getElementById('enabledLabel'),
  deleteDialog: document.getElementById('deleteDialog'),
  deleteDeviceName: document.getElementById('deleteDeviceName'),
  cancelDelete: document.getElementById('cancelDelete'),
  confirmDelete: document.getElementById('confirmDelete'),
  deleteMessage: document.getElementById('deleteMessage')
};


const CURRENCY_SYMBOLS = {
  ZAR: 'R',
  USD: '$',
  EUR: '€',
  GBP: '£'
};

function renderSiteName() {
  const siteName = String(currentSettings.siteName || '').trim();
  elements.siteNameDisplay.textContent = siteName;
  elements.siteNameBanner.hidden = !siteName;
}

function updateCurrencySymbol() {
  elements.currencySymbol.textContent = CURRENCY_SYMBOLS[elements.currencyInput.value] || elements.currencyInput.value;
}

async function loadSettings() {
  try {
    const response = await fetch('/api/settings', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Settings API returned ${response.status}`);
    currentSettings = await response.json();
    renderSiteName();
  } catch (error) {
    console.error('Unable to load site settings:', error);
  }
}

function openOptionsDialog() {
  elements.siteNameInput.value = currentSettings.siteName || '';
  elements.currencyInput.value = currentSettings.currency || 'ZAR';
  elements.pricePerKwhInput.value = currentSettings.pricePerKwh ?? '';
  elements.optionsMessage.textContent = '';
  elements.optionsMessage.classList.remove('error', 'success');
  updateCurrencySymbol();
  elements.optionsDialog.showModal();
  elements.siteNameInput.focus();
}

async function submitOptions(event) {
  event.preventDefault();
  elements.optionsMessage.textContent = 'Saving options…';
  elements.optionsMessage.classList.remove('error', 'success');
  elements.saveOptionsButton.disabled = true;

  const payload = {
    siteName: elements.siteNameInput.value.trim(),
    currency: elements.currencyInput.value,
    pricePerKwh: elements.pricePerKwhInput.value === '' ? null : Number(elements.pricePerKwhInput.value)
  };

  try {
    const response = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Unable to save options (${response.status})`);

    currentSettings = result;
    renderSiteName();
    elements.optionsMessage.textContent = 'Options saved successfully.';
    elements.optionsMessage.classList.add('success');
    window.setTimeout(() => elements.optionsDialog.close(), 500);
  } catch (error) {
    elements.optionsMessage.textContent = error.message;
    elements.optionsMessage.classList.add('error');
  } finally {
    elements.saveOptionsButton.disabled = false;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatNumber(value, decimals = 1) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(decimals) : '--';
}

function formatTime(timestamp) {
  if (!timestamp) return '--:--:--';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '--:--:--';
  return date.toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
}

function isDeviceOnline(device) {
  return device.enabled !== false && device.status === 'online';
}

function getLatestTimestamp(devices) {
  const timestamps = devices
    .filter(isDeviceOnline)
    .map((device) => new Date(device.lastUpdate).getTime())
    .filter(Number.isFinite);
  return timestamps.length ? Math.max(...timestamps) : null;
}

function renderSummary(devices) {
  const onlineDevices = devices.filter(isDeviceOnline);
  const totalPower = onlineDevices.reduce((sum, device) => sum + Number(device.totalPower || 0), 0);
  const validVoltages = onlineDevices.map((device) => Number(device.averageVoltage)).filter(Number.isFinite);
  const averageVoltage = validVoltages.length
    ? validVoltages.reduce((sum, value) => sum + value, 0) / validVoltages.length
    : 0;

  elements.deviceCount.textContent = String(devices.length);
  elements.onlineCount.textContent = String(onlineDevices.length);
  elements.totalPower.textContent = `${formatNumber(totalPower, 2)} kW`;
  elements.averageVoltage.textContent = `${formatNumber(averageVoltage, 1)} V`;
  elements.lastUpdate.textContent = formatTime(getLatestTimestamp(devices));
  elements.footerDeviceStatus.textContent = `${onlineDevices.length} Devices Online`;
}

function createMetricRow(label, value, className = '') {
  return `<div class="metric-row ${className}"><span class="metric-label">${label}</span><strong class="metric-value">${value}</strong></div>`;
}

function getStatusPresentation(device) {
  if (device.enabled === false || device.status === 'disabled') {
    return { text: 'DISABLED', className: 'disabled', message: 'No live data' };
  }
  if (device.status === 'online') {
    return { text: 'ONLINE', className: '', message: '' };
  }
  if (device.status === 'adapter_not_configured') {
    return { text: 'NOT CONFIGURED', className: 'offline', message: 'Network adapter not configured' };
  }
  if (device.status === 'initialising') {
    return { text: 'INITIALISING', className: 'offline', message: 'Waiting for first reading' };
  }
  return { text: 'OFFLINE', className: 'offline', message: device.statusMessage || 'No live data' };
}

function createDeviceCard(device) {
  const safeName = escapeHtml(device.name);
  const target = `/device.html?deviceId=${encodeURIComponent(device.name)}`;
  const status = getStatusPresentation(device);
  const hasLiveData = isDeviceOnline(device);

  const content = hasLiveData
    ? `<div class="device-metrics">
        ${createMetricRow('Voltage', `${formatNumber(device.averageVoltage, 1)} V`)}
        ${createMetricRow('Current', `${formatNumber(device.totalCurrent, 1)} A`)}
        ${createMetricRow('Power', `${formatNumber(device.totalPower, 2)} kW`)}
        ${createMetricRow('Last Update', formatTime(device.lastUpdate), 'last-update')}
      </div>`
    : `<div class="disabled-message">${escapeHtml(status.message)}</div>`;

  return `
    <article class="device-card ${hasLiveData ? '' : 'is-disabled'}">
      <div class="device-card-header">
        <h3>${safeName}</h3>
        <div class="device-card-controls">
          <span class="status ${status.className}">${status.text}</span>
          <button class="settings-button" type="button" data-device-id="${device.id}" aria-label="Configure ${safeName}" title="Configure device">⚙</button>
        </div>
      </div>
      <a class="device-card-link" href="${target}" aria-label="Open details for ${safeName}">${content}</a>
    </article>`;
}

function renderDevices(devices) {
  devicesById = new Map(devices.map((device) => [Number(device.id), device]));
  elements.deviceGrid.innerHTML = devices.map(createDeviceCard).join('');
  elements.dashboardMessage.textContent = devices.length ? '' : 'No devices have been configured.';
}

async function fetchDevices() {
  const response = await fetch('/api/devices', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Device API returned ${response.status}`);
  return response.json();
}

async function refreshDashboard() {
  try {
    const devices = await fetchDevices();
    renderSummary(devices);
    renderDevices(devices);
    elements.dashboardMessage.classList.remove('error');
  } catch (error) {
    console.error('Unable to update dashboard:', error);
    elements.dashboardMessage.textContent = 'Unable to load device data. Check that the server is running.';
    elements.dashboardMessage.classList.add('error');
  }
}

function setDialogMode(device = null) {
  editingDeviceId = device ? Number(device.id) : null;
  elements.deviceForm.reset();
  elements.deviceMessage.textContent = '';
  elements.deviceMessage.classList.remove('error', 'success');

  if (device) {
    elements.dialogEyebrow.textContent = 'Device configuration';
    elements.dialogTitle.textContent = 'Edit Device';
    elements.saveDeviceButton.textContent = 'Save Changes';
    elements.deleteDeviceButton.hidden = false;
    elements.enabledLabel.textContent = 'Enable this device';
    elements.deviceForm.elements.name.value = device.name;
    elements.deviceForm.elements.provider.value = device.provider || device.type || 'dummy';
    elements.deviceForm.elements.host.value = device.connection?.host || device.ipAddress || '';
    elements.deviceForm.elements.pollInterval.value = device.pollInterval;
    elements.deviceForm.elements.enabled.checked = device.enabled !== false;
  } else {
    elements.dialogEyebrow.textContent = 'Device setup';
    elements.dialogTitle.textContent = 'Add Device';
    elements.saveDeviceButton.textContent = 'Save Device';
    elements.deleteDeviceButton.hidden = true;
    elements.enabledLabel.textContent = 'Enable this device immediately';
    elements.deviceForm.elements.provider.value = 'dummy';
    elements.deviceForm.elements.pollInterval.value = 1000;
    elements.deviceForm.elements.enabled.checked = true;
  }
}

function openDeviceDialog(device = null) {
  setDialogMode(device);
  if (typeof elements.deviceDialog.showModal === 'function') {
    elements.deviceDialog.showModal();
    document.getElementById('deviceNameInput').focus();
  }
}

function formPayload() {
  const formData = new FormData(elements.deviceForm);
  return {
    name: formData.get('name'),
    provider: formData.get('provider'),
    connection: { host: formData.get('host') },
    providerOptions: {},
    pollInterval: Number(formData.get('pollInterval')),
    enabled: formData.get('enabled') === 'on'
  };
}

async function submitDevice(event) {
  event.preventDefault();
  const isEditing = editingDeviceId !== null;
  elements.deviceMessage.textContent = isEditing ? 'Saving changes…' : 'Saving device…';
  elements.deviceMessage.classList.remove('error', 'success');
  elements.saveDeviceButton.disabled = true;

  try {
    const response = await fetch(isEditing ? `/api/devices/${editingDeviceId}` : '/api/devices', {
      method: isEditing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formPayload())
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Unable to save device (${response.status})`);

    elements.deviceMessage.textContent = isEditing
      ? `${result.name} was updated successfully.`
      : `${result.name} was added successfully.`;
    elements.deviceMessage.classList.add('success');
    await refreshDashboard();
    window.setTimeout(() => elements.deviceDialog.close(), 650);
  } catch (error) {
    elements.deviceMessage.textContent = error.message;
    elements.deviceMessage.classList.add('error');
  } finally {
    elements.saveDeviceButton.disabled = false;
  }
}

function openDeleteDialog() {
  const device = devicesById.get(editingDeviceId);
  if (!device) return;
  pendingDeleteDevice = device;
  elements.deleteDeviceName.textContent = device.name;
  elements.deleteMessage.textContent = '';
  elements.deleteMessage.classList.remove('error');
  elements.deviceDialog.close();
  elements.deleteDialog.showModal();
}

async function confirmDeleteDevice() {
  if (!pendingDeleteDevice) return;
  elements.confirmDelete.disabled = true;
  elements.deleteMessage.textContent = 'Removing device…';

  try {
    const response = await fetch(`/api/devices/${pendingDeleteDevice.id}`, { method: 'DELETE' });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Unable to remove device (${response.status})`);
    elements.deleteDialog.close();
    pendingDeleteDevice = null;
    await refreshDashboard();
  } catch (error) {
    elements.deleteMessage.textContent = error.message;
    elements.deleteMessage.classList.add('error');
  } finally {
    elements.confirmDelete.disabled = false;
  }
}


function chartThemeColours() {
  const styles = getComputedStyle(document.documentElement);
  return {
    primary: styles.getPropertyValue('--primary').trim() || '#0b63ce',
    text: styles.getPropertyValue('--text').trim() || '#334155',
    muted: styles.getPropertyValue('--muted').trim() || '#64748b',
    border: styles.getPropertyValue('--border').trim() || '#e2e8f0'
  };
}

function formatHistoryLabel(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', hour12: false
  });
}

function buildTotalPowerHistoryChart(rows) {
  const colours = chartThemeColours();
  const data = rows.map((row) => Number(row.total_power_kw));
  const labels = rows.map((row) => formatHistoryLabel(row.ts));

  if (totalPowerHistoryChart) {
    totalPowerHistoryChart.data.labels = labels;
    totalPowerHistoryChart.data.datasets[0].data = data;
    totalPowerHistoryChart.update('none');
    return;
  }

  totalPowerHistoryChart = new Chart(elements.totalPowerHistoryCanvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Total Power',
        data,
        borderColor: colours.primary,
        backgroundColor: `${colours.primary}22`,
        fill: true,
        tension: 0.25,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: colours.text } },
        tooltip: {
          callbacks: {
            label: (context) => `Total Power: ${Number(context.parsed.y).toFixed(2)} kW`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: colours.muted, maxTicksLimit: 12 },
          grid: { color: colours.border }
        },
        y: {
          beginAtZero: true,
          ticks: { color: colours.muted },
          grid: { color: colours.border },
          title: { display: true, text: 'Power (kW)', color: colours.text }
        }
      }
    }
  });
}

async function refreshTotalPowerHistory() {
  try {
    const response = await fetch('/api/history/total-power?hours=24', { cache: 'no-store' });
    if (!response.ok) throw new Error(`History API returned ${response.status}`);
    const rows = await response.json();
    buildTotalPowerHistoryChart(rows);
    elements.historyMessage.textContent = rows.length ? '' : 'No historical power readings are available yet.';
    elements.historyMessage.classList.remove('error');
  } catch (error) {
    console.error('Unable to update total power history:', error);
    elements.historyMessage.textContent = 'Unable to load total power history.';
    elements.historyMessage.classList.add('error');
  }
}

function applyTotalPowerChartTheme() {
  if (!totalPowerHistoryChart) return;
  const colours = chartThemeColours();
  const dataset = totalPowerHistoryChart.data.datasets[0];
  dataset.borderColor = colours.primary;
  dataset.backgroundColor = `${colours.primary}22`;
  totalPowerHistoryChart.options.plugins.legend.labels.color = colours.text;
  totalPowerHistoryChart.options.scales.x.ticks.color = colours.muted;
  totalPowerHistoryChart.options.scales.x.grid.color = colours.border;
  totalPowerHistoryChart.options.scales.y.ticks.color = colours.muted;
  totalPowerHistoryChart.options.scales.y.grid.color = colours.border;
  totalPowerHistoryChart.options.scales.y.title.color = colours.text;
  totalPowerHistoryChart.update('none');
}

function setHistorySectionCollapsed(collapsed, persist = true) {
  elements.historySectionToggle.setAttribute('aria-expanded', String(!collapsed));
  elements.historySectionContent.classList.toggle('is-expanded', !collapsed);
  elements.historySectionIndicator.textContent = collapsed ? '▶' : '▼';

  if (!collapsed && totalPowerHistoryChart) {
    window.setTimeout(() => totalPowerHistoryChart.resize(), 230);
  }

  if (persist) {
    try {
      localStorage.setItem(HISTORY_SECTION_STATE_KEY, String(collapsed));
    } catch (error) {
      console.warn('Unable to save history section state:', error);
    }
  }
}

function initialiseHistorySection() {
  let collapsed = false;
  try {
    collapsed = localStorage.getItem(HISTORY_SECTION_STATE_KEY) === 'true';
  } catch (error) {
    console.warn('Unable to read history section state:', error);
  }

  setHistorySectionCollapsed(collapsed, false);
  elements.historySectionToggle.addEventListener('click', () => {
    const isExpanded = elements.historySectionToggle.getAttribute('aria-expanded') === 'true';
    setHistorySectionCollapsed(isExpanded);
  });
}

function setDeviceSectionCollapsed(collapsed, persist = true) {
  elements.deviceSectionToggle.setAttribute('aria-expanded', String(!collapsed));
  elements.deviceSectionContent.classList.toggle('is-expanded', !collapsed);
  elements.deviceSectionIndicator.textContent = collapsed ? '▶' : '▼';

  if (persist) {
    try {
      localStorage.setItem(DEVICE_SECTION_STATE_KEY, String(collapsed));
    } catch (error) {
      console.warn('Unable to save device section state:', error);
    }
  }
}

function initialiseDeviceSection() {
  let collapsed = false;
  try {
    collapsed = localStorage.getItem(DEVICE_SECTION_STATE_KEY) === 'true';
  } catch (error) {
    console.warn('Unable to read device section state:', error);
  }

  setDeviceSectionCollapsed(collapsed, false);
  elements.deviceSectionToggle.addEventListener('click', () => {
    const isExpanded = elements.deviceSectionToggle.getAttribute('aria-expanded') === 'true';
    setDeviceSectionCollapsed(isExpanded);
  });
}

function initialiseDialogs() {
  elements.optionsButton.addEventListener('click', openOptionsDialog);
  elements.closeOptionsDialog.addEventListener('click', () => elements.optionsDialog.close());
  elements.cancelOptions.addEventListener('click', () => elements.optionsDialog.close());
  elements.currencyInput.addEventListener('change', updateCurrencySymbol);
  elements.optionsForm.addEventListener('submit', submitOptions);
  elements.addDeviceButton.addEventListener('click', () => openDeviceDialog());
  elements.closeDeviceDialog.addEventListener('click', () => elements.deviceDialog.close());
  elements.cancelDevice.addEventListener('click', () => elements.deviceDialog.close());
  elements.deviceForm.addEventListener('submit', submitDevice);
  elements.deleteDeviceButton.addEventListener('click', openDeleteDialog);
  elements.cancelDelete.addEventListener('click', () => {
    elements.deleteDialog.close();
    pendingDeleteDevice = null;
  });
  elements.confirmDelete.addEventListener('click', confirmDeleteDevice);

  elements.deviceGrid.addEventListener('click', (event) => {
    const button = event.target.closest('.settings-button');
    if (!button) return;
    const device = devicesById.get(Number(button.dataset.deviceId));
    if (device) openDeviceDialog(device);
  });

  [elements.optionsDialog, elements.deviceDialog, elements.deleteDialog].forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  });
}

function initialise() {
  initialiseHistorySection();
  initialiseDeviceSection();
  initialiseDialogs();
  loadSettings();
  refreshDashboard();
  refreshTotalPowerHistory();
  window.setInterval(refreshDashboard, REFRESH_INTERVAL_MS);
  window.setInterval(refreshTotalPowerHistory, HISTORY_REFRESH_INTERVAL_MS);
}

document.addEventListener('DOMContentLoaded', initialise);
window.addEventListener('uwc-theme-change', applyTotalPowerChartTheme);
