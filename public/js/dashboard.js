'use strict';

const REFRESH_INTERVAL_MS = 1000;

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
  addDeviceDialog: document.getElementById('addDeviceDialog'),
  addDeviceForm: document.getElementById('addDeviceForm'),
  cancelAddDevice: document.getElementById('cancelAddDevice'),
  addDeviceMessage: document.getElementById('addDeviceMessage'),
  saveDeviceButton: document.getElementById('saveDeviceButton')
};

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
  return device.enabled !== false && Boolean(device.lastUpdate);
}

function getLatestTimestamp(devices) {
  const timestamps = devices.map((device) => new Date(device.lastUpdate).getTime()).filter(Number.isFinite);
  return timestamps.length ? Math.max(...timestamps) : null;
}

function renderSummary(devices) {
  const onlineDevices = devices.filter(isDeviceOnline);
  const totalPower = devices.reduce((sum, device) => sum + Number(device.totalPower || 0), 0);
  const validVoltages = devices.map((device) => Number(device.averageVoltage)).filter(Number.isFinite);
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

function createDeviceCard(device) {
  const online = isDeviceOnline(device);
  const statusClass = online ? '' : 'offline';
  const statusText = online ? 'ONLINE' : 'OFFLINE';
  const safeName = escapeHtml(device.name);
  const target = `/device.html?deviceId=${encodeURIComponent(device.name)}`;

  return `
    <a class="device-card" href="${target}" aria-label="Open details for ${safeName}">
      <div class="device-card-header">
        <h3>${safeName}</h3>
        <span class="status ${statusClass}">${statusText}</span>
      </div>
      <div class="device-metrics">
        ${createMetricRow('Voltage', `${formatNumber(device.averageVoltage, 1)} V`)}
        ${createMetricRow('Current', `${formatNumber(device.totalCurrent, 1)} A`)}
        ${createMetricRow('Power', `${formatNumber(device.totalPower, 2)} kW`)}
        ${createMetricRow('Last Update', formatTime(device.lastUpdate), 'last-update')}
      </div>
    </a>`;
}

function renderDevices(devices) {
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

function openAddDeviceDialog() {
  elements.addDeviceForm.reset();
  elements.addDeviceMessage.textContent = '';
  elements.addDeviceMessage.classList.remove('error', 'success');
  if (typeof elements.addDeviceDialog.showModal === 'function') {
    elements.addDeviceDialog.showModal();
    document.getElementById('deviceNameInput').focus();
  }
}

async function submitAddDevice(event) {
  event.preventDefault();
  elements.addDeviceMessage.textContent = 'Saving device…';
  elements.addDeviceMessage.classList.remove('error', 'success');
  elements.saveDeviceButton.disabled = true;

  const formData = new FormData(elements.addDeviceForm);
  const payload = {
    name: formData.get('name'),
    type: formData.get('type'),
    ipAddress: formData.get('ipAddress'),
    port: Number(formData.get('port')),
    slaveId: Number(formData.get('slaveId')),
    pollInterval: Number(formData.get('pollInterval')),
    enabled: formData.get('enabled') === 'on'
  };

  try {
    const response = await fetch('/api/devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Unable to add device (${response.status})`);

    elements.addDeviceMessage.textContent = `${result.name} was added successfully.`;
    elements.addDeviceMessage.classList.add('success');
    await refreshDashboard();
    window.setTimeout(() => elements.addDeviceDialog.close(), 650);
  } catch (error) {
    elements.addDeviceMessage.textContent = error.message;
    elements.addDeviceMessage.classList.add('error');
  } finally {
    elements.saveDeviceButton.disabled = false;
  }
}

function initialiseDialog() {
  elements.addDeviceButton.addEventListener('click', openAddDeviceDialog);
  elements.cancelAddDevice.addEventListener('click', () => elements.addDeviceDialog.close());
  elements.addDeviceForm.addEventListener('submit', submitAddDevice);
  elements.addDeviceDialog.addEventListener('click', (event) => {
    if (event.target === elements.addDeviceDialog) elements.addDeviceDialog.close();
  });
}

function initialise() {
  initialiseDialog();
  refreshDashboard();
  window.setInterval(refreshDashboard, REFRESH_INTERVAL_MS);
}

document.addEventListener('DOMContentLoaded', initialise);
