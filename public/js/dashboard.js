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
  addDeviceDialog: document.getElementById('addDeviceDialog')
};

function formatNumber(value, decimals = 1) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(decimals) : '--';
}

function formatTime(timestamp) {
  if (!timestamp) return '--:--:--';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '--:--:--';
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

function isDeviceOnline(device) {
  return device.enabled !== false && Boolean(device.lastUpdate);
}

function getLatestTimestamp(devices) {
  const timestamps = devices
    .map(device => new Date(device.lastUpdate).getTime())
    .filter(Number.isFinite);
  return timestamps.length ? Math.max(...timestamps) : null;
}

function renderSummary(devices) {
  const onlineDevices = devices.filter(isDeviceOnline);
  const totalPower = devices.reduce((sum, device) => sum + Number(device.totalPower || 0), 0);
  const validVoltages = devices
    .map(device => Number(device.averageVoltage))
    .filter(Number.isFinite);
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
  return `
    <div class="metric-row ${className}">
      <span class="metric-label">${label}</span>
      <strong class="metric-value">${value}</strong>
    </div>`;
}

function createDeviceCard(device) {
  const online = isDeviceOnline(device);
  const statusClass = online ? '' : 'offline';
  const statusText = online ? 'ONLINE' : 'OFFLINE';
  const target = `/device.html?deviceId=${encodeURIComponent(device.name)}`;

  return `
    <a class="device-card" href="${target}" aria-label="Open details for ${device.name}">
      <div class="device-card-header">
        <h3>${device.name}</h3>
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
  if (!response.ok) {
    throw new Error(`Device API returned ${response.status}`);
  }
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

function initialiseDialog() {
  elements.addDeviceButton.addEventListener('click', () => {
    if (typeof elements.addDeviceDialog.showModal === 'function') {
      elements.addDeviceDialog.showModal();
    } else {
      window.alert('Device management will be added in a later milestone.');
    }
  });
}

function initialise() {
  initialiseDialog();
  refreshDashboard();
  window.setInterval(refreshDashboard, REFRESH_INTERVAL_MS);
}

document.addEventListener('DOMContentLoaded', initialise);
