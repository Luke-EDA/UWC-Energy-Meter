'use strict';

const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

const EXPORT_RANGES = Object.freeze({
  'last-week': { label: 'Last Week', durationMs: 7 * 24 * 60 * 60 * 1000, bucketMs: 60 * 60 * 1000, resolution: 'Hourly averages' },
  'last-month': { label: 'Last Month', durationMs: 30 * 24 * 60 * 60 * 1000, bucketMs: 24 * 60 * 60 * 1000, resolution: 'Daily averages' },
  'last-6-months': { label: 'Last 6 Months', durationMs: 182 * 24 * 60 * 60 * 1000, bucketMs: 7 * 24 * 60 * 60 * 1000, resolution: 'Weekly averages' },
  'last-year': { label: 'Last Year', durationMs: 365 * 24 * 60 * 60 * 1000, bucketMs: 7 * 24 * 60 * 60 * 1000, resolution: 'Weekly averages' }
});

const PHASE_COLOURS = { l1: '#D32F2F', l2: '#D4A900', l3: '#1976D2' };
const PHASES = ['l1', 'l2', 'l3'];

function resolveExportRange(value) {
  const key = String(value || 'last-week').toLowerCase();
  const definition = EXPORT_RANGES[key] || EXPORT_RANGES['last-week'];
  const endMs = Date.now();
  return { key: EXPORT_RANGES[key] ? key : 'last-week', ...definition, startMs: endMs - definition.durationMs, endMs };
}

function allDb(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows || [])));
}

function getDb(db, sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row || null)));
}

function safeName(value, fallback = 'Report') {
  const cleaned = String(value || fallback).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-');
  return cleaned.replace(/^-|-$/g, '') || fallback;
}

function dateStamp(date = new Date()) {
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDateTime(ms) {
  return new Date(ms).toLocaleString('en-ZA', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatBucket(ms, rangeKey) {
  const date = new Date(ms);
  if (rangeKey === 'last-week') return date.toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  if (rangeKey === 'last-month') return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
  return `Week of ${date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })}`;
}

function integrateKwh(rows, startMs, endMs, maxGapMs = 15 * 60 * 1000) {
  if (!rows || rows.length < 2) return 0;
  let total = 0;
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    const gap = Number(current.ts) - Number(previous.ts);
    if (gap <= 0 || gap > maxGapMs) continue;
    const segmentStart = Math.max(Number(previous.ts), startMs);
    const segmentEnd = Math.min(Number(current.ts), endMs);
    if (segmentEnd <= segmentStart) continue;
    const averagePower = (Number(previous.total_power_kw) + Number(current.total_power_kw)) / 2;
    if (Number.isFinite(averagePower)) total += averagePower * ((segmentEnd - segmentStart) / 3600000);
  }
  return total;
}

async function getSettings(db) {
  const row = await getDb(db, 'SELECT site_name, currency, price_per_kwh FROM app_settings WHERE id = 1');
  return { siteName: row?.site_name || '', currency: row?.currency || 'ZAR', pricePerKwh: row?.price_per_kwh ?? null };
}

async function getDeviceHistory(db, deviceName, range) {
  // Aggregate each phase independently. The resulting phase series share a
  // timestamp axis, but no phase can invalidate or remove another phase's data.
  const aggregateRows = await allDb(db, `SELECT CAST(ts / ? AS INTEGER) * ? AS ts, phase,
      AVG(voltage) AS voltage, AVG(current) AS current, AVG(power_kw) AS power_kw
    FROM phase_readings
    WHERE device_id = ? AND ts >= ? AND ts <= ?
    GROUP BY CAST(ts / ? AS INTEGER), phase
    ORDER BY ts ASC, phase ASC`, [range.bucketMs, range.bucketMs, deviceName, range.startMs, range.endMs, range.bucketMs]);

  const events = await allDb(db, `SELECT phase, enabled, ts
    FROM phase_config_events
    WHERE device_id = ? AND ts <= ?
    ORDER BY ts ASC`, [deviceName, range.endMs]);

  const state = { l1: true, l2: true, l3: true };
  const openIntervals = { l1: null, l2: null, l3: null };
  const disabledIntervals = { l1: [], l2: [], l3: [] };

  // Resolve the configuration state at the start of the export period.
  for (const event of events) {
    if (!PHASES.includes(event.phase)) continue;
    if (Number(event.ts) > range.startMs) break;
    state[event.phase] = Boolean(event.enabled);
  }
  PHASES.forEach((phase) => {
    if (!state[phase]) openIntervals[phase] = range.startMs;
  });

  // Build explicit per-phase disabled intervals. Duplicate disable or enable
  // events are harmless and do not create overlapping intervals.
  for (const event of events) {
    const eventTs = Number(event.ts);
    const phase = event.phase;
    if (!PHASES.includes(phase) || eventTs <= range.startMs || eventTs > range.endMs) continue;
    const enabled = Boolean(event.enabled);

    if (!enabled && state[phase]) {
      openIntervals[phase] = eventTs;
      state[phase] = false;
    } else if (enabled && !state[phase]) {
      if (openIntervals[phase] != null) {
        disabledIntervals[phase].push({ startMs: openIntervals[phase], endMs: eventTs });
      }
      openIntervals[phase] = null;
      state[phase] = true;
    }
  }

  PHASES.forEach((phase) => {
    if (!state[phase] && openIntervals[phase] != null) {
      disabledIntervals[phase].push({ startMs: openIntervals[phase], endMs: range.endMs });
    }
  });

  const firstBucket = Math.floor(range.startMs / range.bucketMs) * range.bucketMs;
  const lastBucket = Math.floor(range.endMs / range.bucketMs) * range.bucketMs;
  const timestamps = [];
  for (let ts = firstBucket; ts <= lastBucket; ts += range.bucketMs) timestamps.push(ts);

  const aggregatesByPhase = Object.fromEntries(PHASES.map((phase) => [phase, new Map()]));
  for (const row of aggregateRows) {
    if (!PHASES.includes(row.phase)) continue;
    aggregatesByPhase[row.phase].set(Number(row.ts), {
      voltage: row.voltage == null ? null : Number(row.voltage),
      current: row.current == null ? null : Number(row.current),
      powerKw: row.power_kw == null ? null : Number(row.power_kw)
    });
  }

  const phaseSeries = {};
  PHASES.forEach((phase) => {
    phaseSeries[phase] = timestamps.map((ts) => {
      const bucketEnd = ts + range.bucketMs;
      const fullyDisabled = disabledIntervals[phase].some((interval) =>
        interval.startMs <= ts && interval.endMs >= bucketEnd
      );
      if (fullyDisabled) return null;
      return aggregatesByPhase[phase].get(ts) || null;
    });
  });

  // A row representation remains useful for generic consumers, but it is built
  // from the already independent phase arrays. Never derive one phase's
  // availability from another phase or from a shared bucket-valid flag.
  const rows = timestamps.map((ts, index) => {
    const row = { ts };
    PHASES.forEach((phase) => {
      if (phaseSeries[phase][index] != null) row[phase] = phaseSeries[phase][index];
    });
    return row;
  });

  return { timestamps, phaseSeries, rows, disabledIntervals };
}

async function getSiteHistory(db, range) {
  return allDb(db, `WITH device_buckets AS (
      SELECT CAST(ts / ? AS INTEGER) AS bucket, device_id, AVG(total_power_kw) AS power_kw
      FROM meter_snapshots WHERE ts >= ? AND ts <= ?
      GROUP BY CAST(ts / ? AS INTEGER), device_id
    )
    SELECT bucket * ? AS ts, SUM(power_kw) AS total_power_kw
    FROM device_buckets GROUP BY bucket ORDER BY bucket ASC`,
  [range.bucketMs, range.startMs, range.endMs, range.bucketMs, range.bucketMs]);
}

async function getEnergy(db, range, deviceName = null) {
  const params = [range.startMs - 15 * 60 * 1000, range.endMs];
  let where = 'ts >= ? AND ts <= ?';
  if (deviceName) { where += ' AND device_id = ?'; params.push(deviceName); }
  const rows = await allDb(db, `SELECT device_id, ts, total_power_kw FROM meter_snapshots WHERE ${where} ORDER BY device_id, ts ASC`, params);
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.device_id)) grouped.set(row.device_id, []);
    grouped.get(row.device_id).push(row);
  }
  let total = 0;
  for (const deviceRows of grouped.values()) total += integrateKwh(deviceRows, range.startMs, range.endMs);
  return total;
}

async function latestSnapshot(db, deviceName) {
  const snapshot = await getDb(db, 'SELECT * FROM meter_snapshots WHERE device_id = ? ORDER BY ts DESC LIMIT 1', [deviceName]);
  if (!snapshot) return null;
  const phases = await allDb(db, 'SELECT phase, voltage, current, power_kw FROM phase_readings WHERE device_id = ? AND ts = ?', [deviceName, snapshot.ts]);
  return { ...snapshot, phases: Object.fromEntries(phases.map((row) => [row.phase, row])) };
}

function currencyValue(value, currency) {
  if (value == null || !Number.isFinite(Number(value))) return 'Tariff not configured';
  try { return new Intl.NumberFormat('en-ZA', { style: 'currency', currency }).format(value); }
  catch { return `${currency} ${Number(value).toFixed(2)}`; }
}

function addPdfHeader(doc, title, subtitle) {
  doc.fillColor('#0F2D4A').fontSize(20).font('Helvetica-Bold').text(title);
  doc.moveDown(0.2).fillColor('#52657A').fontSize(9).font('Helvetica').text(subtitle);
  doc.moveDown(0.6).strokeColor('#D7E0E8').moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(0.7);
}

function addMetricRow(doc, metrics) {
  const startX = 50;
  const width = 495 / metrics.length;
  const top = doc.y;
  metrics.forEach((metric, index) => {
    const x = startX + index * width;
    doc.roundedRect(x, top, width - 8, 54, 5).fillAndStroke('#F4F7FA', '#D7E0E8');
    doc.fillColor('#52657A').fontSize(8).font('Helvetica').text(metric.label, x + 10, top + 10, { width: width - 28 });
    doc.fillColor('#13293D').fontSize(13).font('Helvetica-Bold').text(metric.value, x + 10, top + 27, { width: width - 28 });
  });
  doc.y = top + 67;
}

function niceAxisMaximum(maxValue, tickCount = 4) {
  if (!Number.isFinite(maxValue) || maxValue <= 0) return 1;
  const roughStep = maxValue / tickCount;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = niceNormalized * magnitude;
  return Math.ceil(maxValue / step) * step;
}

function formatAxisValue(value, maximum) {
  const absoluteMaximum = Math.abs(maximum);
  if (absoluteMaximum >= 100) return Number(value).toFixed(0);
  if (absoluteMaximum >= 10) return Number(value).toFixed(1).replace(/\.0$/, '');
  return Number(value).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function xTickIndexes(length, desiredTicks = 5) {
  if (length <= 1) return [0];
  const count = Math.min(desiredTicks, length);
  return [...new Set(Array.from({ length: count }, (_, index) => Math.round(index * (length - 1) / (count - 1))))];
}

function addLineChart(doc, rows, series, title, options = {}) {
  const requiredHeight = 255;
  if (doc.y > doc.page.height - doc.page.margins.bottom - requiredHeight) doc.addPage();

  const figureNumber = options.figureNumber;
  const heading = figureNumber ? `Figure ${figureNumber} - ${title}` : title;
  doc.fillColor('#13293D').fontSize(12).font('Helvetica-Bold').text(heading);

  const outerX = 50;
  const chartTop = doc.y + 12;
  const outerWidth = 495;
  const outerHeight = 178;
  const leftMargin = 48;
  const rightMargin = 10;
  const topMargin = 8;
  const bottomMargin = 32;
  const plotX = outerX + leftMargin;
  const plotY = chartTop + topMargin;
  const plotW = outerWidth - leftMargin - rightMargin;
  const plotH = outerHeight - topMargin - bottomMargin;

  const values = [];
  series.forEach((item) => rows.forEach((row, index) => {
    const value = item.value(row, index);
    if (Number.isFinite(value)) values.push(value);
  }));

  const dataMaximum = Math.max(0, ...values);
  const yMaximum = options.fixedMaximum || niceAxisMaximum(dataMaximum || 1, 4);
  const yMinimum = Number.isFinite(options.fixedMinimum) ? options.fixedMinimum : 0;
  const tickCount = 4;

  doc.rect(outerX, chartTop, outerWidth, outerHeight).strokeColor('#D7E0E8').lineWidth(0.7).stroke();

  for (let tick = 0; tick <= tickCount; tick += 1) {
    const ratio = tick / tickCount;
    const gridY = plotY + plotH - ratio * plotH;
    const value = yMinimum + ratio * (yMaximum - yMinimum);
    doc.moveTo(plotX, gridY).lineTo(plotX + plotW, gridY).strokeColor('#E3E9EF').lineWidth(0.5).stroke();
    doc.fillColor('#52657A').fontSize(7).font('Helvetica').text(
      formatAxisValue(value, yMaximum),
      outerX + 2,
      gridY - 4,
      { width: leftMargin - 7, align: 'right' }
    );
  }

  const indexes = xTickIndexes(rows.length, 5);
  indexes.forEach((rowIndex) => {
    const ratio = rows.length <= 1 ? 0 : rowIndex / (rows.length - 1);
    const gridX = plotX + ratio * plotW;
    doc.moveTo(gridX, plotY).lineTo(gridX, plotY + plotH).strokeColor('#EEF2F6').lineWidth(0.4).stroke();
    const label = rows[rowIndex] ? formatBucket(rows[rowIndex].ts, options.rangeKey || 'last-week') : '';
    const labelWidth = 74;
    const labelX = Math.max(outerX + 2, Math.min(gridX - labelWidth / 2, outerX + outerWidth - labelWidth - 2));
    doc.fillColor('#52657A').fontSize(6.5).font('Helvetica').text(label, labelX, plotY + plotH + 5, { width: labelWidth, align: 'center' });
  });

  doc.moveTo(plotX, plotY).lineTo(plotX, plotY + plotH).lineTo(plotX + plotW, plotY + plotH)
    .strokeColor('#7A8C9E').lineWidth(0.8).stroke();

  if (rows.length > 1 && values.length) {
    series.forEach((item) => {
      let started = false;
      doc.strokeColor(item.colour).lineWidth(1.5);
      rows.forEach((row, index) => {
        const value = item.value(row, index);
        if (!Number.isFinite(value)) { started = false; return; }
        const px = plotX + (index / (rows.length - 1)) * plotW;
        const normalized = (value - yMinimum) / Math.max(yMaximum - yMinimum, Number.EPSILON);
        const py = plotY + plotH - Math.max(0, Math.min(1, normalized)) * plotH;
        if (!started) { doc.moveTo(px, py); started = true; } else doc.lineTo(px, py);
      });
      doc.stroke();
    });
  } else {
    doc.fillColor('#7A8C9E').fontSize(9).font('Helvetica').text('No historical data is available for this range.', plotX, plotY + plotH / 2 - 5, { width: plotW, align: 'center' });
  }

  doc.save();
  doc.rotate(-90, { origin: [outerX + 10, plotY + plotH / 2] });
  doc.fillColor('#52657A').fontSize(7).font('Helvetica-Bold').text(options.yAxisLabel || 'Value', outerX - 38, plotY + plotH / 2 - 4, { width: 76, align: 'center' });
  doc.restore();
  doc.fillColor('#52657A').fontSize(7).font('Helvetica-Bold').text(options.xAxisLabel || 'Date / Time', plotX, chartTop + outerHeight - 10, { width: plotW, align: 'center' });

  let legendX = outerX;
  const legendY = chartTop + outerHeight + 8;
  series.forEach((item) => {
    doc.rect(legendX, legendY + 1, 9, 7).fill(item.colour);
    doc.fillColor('#52657A').fontSize(8).font('Helvetica').text(item.label, legendX + 13, legendY);
    legendX += Math.max(105, doc.widthOfString(item.label) + 34);
  });

  const metadataY = legendY + 17;
  doc.fillColor('#52657A').fontSize(7.5).font('Helvetica')
    .text(`Reporting period: ${options.periodLabel || ''}`, outerX, metadataY, { width: outerWidth })
    .text(`Data resolution: ${options.resolution || ''}`, outerX, metadataY + 11, { width: outerWidth });

  let nextY = metadataY + 27;
  const availabilityLines = [];
  if (options.disabledIntervals) {
    PHASES.forEach((phase) => {
      const intervals = options.disabledIntervals[phase] || [];
      intervals.forEach((interval) => {
        const label = options.phaseLabels?.[phase] || phase.toUpperCase();
        availabilityLines.push(`${label} disabled: ${formatDateTime(interval.startMs)} - ${formatDateTime(interval.endMs)}`);
      });
    });
  }
  if (availabilityLines.length) {
    doc.fillColor('#52657A').fontSize(7.5).font('Helvetica-Bold').text('Data availability', outerX, nextY, { width: outerWidth });
    nextY += 11;
    availabilityLines.forEach((line) => {
      doc.fillColor('#52657A').fontSize(7.2).font('Helvetica').text(line, outerX, nextY, { width: outerWidth });
      nextY += 10;
    });
  }
  doc.y = nextY;
}

function addPdfFooters(doc, context = {}) {
  const range = doc.bufferedPageRange();
  const totalPages = range.count;
  for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex += 1) {
    doc.switchToPage(pageIndex);
    const footerY = doc.page.height - 33;
    doc.moveTo(50, footerY - 6).lineTo(545, footerY - 6).strokeColor('#D7E0E8').lineWidth(0.5).stroke();
    doc.fillColor('#52657A').fontSize(7).font('Helvetica')
      .text(context.siteName || 'UWC Energy Monitor', 50, footerY, { width: 190, align: 'left', lineBreak: false })
      .text(`Page ${pageIndex - range.start + 1} of ${totalPages}`, 240, footerY, { width: 115, align: 'center', lineBreak: false })
      .text(`Generated ${formatDateTime(context.generatedAt || Date.now())}`, 355, footerY, { width: 190, align: 'right', lineBreak: false });
  }
}

function pdfBuffer(build, context = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'portrait',
      margin: 50,
      bufferPages: true,
      info: { Title: context.title || 'UWC Energy Monitor Export' }
    });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    Promise.resolve(build(doc))
      .then(() => {
        addPdfFooters(doc, context);
        doc.end();
      })
      .catch(reject);
  });
}

function deviceDisplayName(device, phase) {
  const label = device.phaseConfig?.[phase]?.label?.trim();
  return label ? `${phase.toUpperCase()} - ${label}` : phase.toUpperCase();
}

async function addDevicePdfPage(doc, db, device, range, settings, addPage = true) {
  if (addPage) doc.addPage();
  const latest = await latestSnapshot(db, device.name);
  const historyResult = await getDeviceHistory(db, device.name, range);
  const history = historyResult.rows;
  const energyKwh = await getEnergy(db, range, device.name);
  const cost = settings.pricePerKwh == null ? null : energyKwh * settings.pricePerKwh;
  addPdfHeader(doc, device.name, `${range.label} | ${formatDateTime(range.startMs)} - ${formatDateTime(range.endMs)} | ${range.resolution}`);
  addMetricRow(doc, [
    { label: 'Status', value: device.enabled === false ? 'Disabled' : (device.status || 'Unknown') },
    { label: 'Total Power', value: latest ? `${Number(latest.total_power_kw).toFixed(2)} kW` : '--' },
  ]);
  addMetricRow(doc, [
    { label: 'Energy Usage', value: `${energyKwh.toFixed(2)} kWh` },
    { label: 'Energy Cost', value: currencyValue(cost, settings.currency) },
    { label: 'Last Update', value: latest ? formatDateTime(latest.ts) : '--' }
  ]);
  doc.fillColor('#13293D').fontSize(12).font('Helvetica-Bold').text('Phase Lines');
  const phaseMetrics = PHASES.map((phase) => {
    const enabled = device.phaseConfig?.[phase]?.enabled !== false;
    const row = latest?.phases?.[phase];
    let value = 'No data';
    if (!enabled) value = 'Disabled';
    else if (row && Number.isFinite(Number(row.power_kw))) value = `${Number(row.power_kw).toFixed(2)} kW`;
    return { label: deviceDisplayName(device, phase), value };
  });
  addMetricRow(doc, phaseMetrics);
  addLineChart(
    doc,
    history,
    PHASES.map((phase) => ({
      label: deviceDisplayName(device, phase),
      colour: PHASE_COLOURS[phase],
      value: (_row, index) => {
        const value = historyResult.phaseSeries[phase][index]?.powerKw;
        return value == null ? Number.NaN : Number(value);
      }
    })),
    'Phase Power History',
    {
      figureNumber: 1,
      yAxisLabel: 'Power (kW)',
      xAxisLabel: 'Date / Time',
      rangeKey: range.key,
      periodLabel: `${formatDateTime(range.startMs)} - ${formatDateTime(range.endMs)}`,
      resolution: range.resolution,
      disabledIntervals: historyResult.disabledIntervals,
      phaseLabels: Object.fromEntries(PHASES.map((phase) => [phase, deviceDisplayName(device, phase)]))
    }
  );
}

async function createDashboardPdf({ db, devices, rangeValue, includeDevices }) {
  const range = resolveExportRange(rangeValue);
  const settings = await getSettings(db);
  const siteHistory = await getSiteHistory(db, range);
  const energyKwh = await getEnergy(db, range);
  const cost = settings.pricePerKwh == null ? null : energyKwh * settings.pricePerKwh;
  const latestDevices = await Promise.all(devices.map(async (device) => ({ device, latest: await latestSnapshot(db, device.name) })));
  const generatedAt = Date.now();
  const buffer = await pdfBuffer(async (doc) => {
    addPdfHeader(doc, settings.siteName || 'UWC Energy Monitor', `Site Report | Generated ${formatDateTime(Date.now())}`);
    doc.fillColor('#52657A').fontSize(9).text(`Reporting period: ${formatDateTime(range.startMs)} - ${formatDateTime(range.endMs)}`);
    doc.text(`Data resolution: ${range.resolution}`);
    doc.moveDown(0.8);
    const totalPower = latestDevices.reduce((sum, item) => sum + (Number(item.latest?.total_power_kw) || 0), 0);
    addMetricRow(doc, [
      { label: 'Devices', value: String(devices.length) },
      { label: 'Online', value: String(devices.filter((device) => device.status === 'online' && device.enabled !== false).length) },
      { label: 'Current Power', value: `${totalPower.toFixed(2)} kW` },
      { label: 'Tariff', value: settings.pricePerKwh == null ? 'Not configured' : `${currencyValue(settings.pricePerKwh, settings.currency)} / kWh` }
    ]);
    addMetricRow(doc, [
      { label: 'Energy Usage', value: `${energyKwh.toFixed(2)} kWh` },
      { label: 'Energy Cost', value: currencyValue(cost, settings.currency) }
    ]);
    addLineChart(
      doc,
      siteHistory,
      [{ label: 'Total Power', colour: '#2B6CB0', value: (row) => Number(row.total_power_kw) }],
      'Total Power History',
      {
        figureNumber: 1,
        yAxisLabel: 'Power (kW)',
        xAxisLabel: 'Date / Time',
        rangeKey: range.key,
        periodLabel: `${formatDateTime(range.startMs)} - ${formatDateTime(range.endMs)}`,
        resolution: range.resolution
      }
    );
    doc.fillColor('#13293D').fontSize(12).font('Helvetica-Bold').text('Device Summary');
    doc.moveDown(0.4);
    latestDevices.forEach(({ device, latest }) => {
      doc.fillColor('#13293D').fontSize(9).font('Helvetica-Bold').text(device.name, { continued: true });
      doc.fillColor('#52657A').font('Helvetica').text(`   ${device.enabled === false ? 'Disabled' : (device.status || 'Unknown')}   ${latest ? `${Number(latest.total_power_kw).toFixed(2)} kW` : 'No data'}`);
    });
    if (includeDevices) {
      for (const device of devices) await addDevicePdfPage(doc, db, device, range, settings, true);
    }
  }, {
    title: `${settings.siteName || 'UWC Energy Monitor'} Site Report`,
    siteName: settings.siteName || 'UWC Energy Monitor',
    generatedAt
  });
  return { buffer, filename: `${safeName(settings.siteName || 'UWC-Energy-Monitor')}_Site_Report_${dateStamp()}.pdf` };
}

async function createDevicePdf({ db, device, rangeValue }) {
  const range = resolveExportRange(rangeValue);
  const settings = await getSettings(db);
  const generatedAt = Date.now();
  const buffer = await pdfBuffer(
    (doc) => addDevicePdfPage(doc, db, device, range, settings, false),
    {
      title: `${device.name} Device Report`,
      siteName: settings.siteName || 'UWC Energy Monitor',
      generatedAt
    }
  );
  return { buffer, filename: `${safeName(device.name)}_Report_${dateStamp()}.pdf` };
}

function styleHeader(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2D4A' } };
  row.alignment = { vertical: 'middle', horizontal: 'center' };
  row.height = 22;
}

function setupSheet(sheet) {
  sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
  sheet.properties.defaultRowHeight = 18;
  sheet.getColumn(1).width = 34;
}

function addMetadata(sheet, rows) {
  rows.forEach(([label, value]) => sheet.addRow([label, value]));
  sheet.addRow([]);
  sheet.getColumn(1).font = { bold: true };
}

async function addDeviceWorksheet(workbook, db, device, range, settings) {
  const name = safeName(device.name).slice(0, 31) || 'Device';
  let sheetName = name;
  let suffix = 2;
  while (workbook.getWorksheet(sheetName)) sheetName = `${name.slice(0, 27)}-${suffix++}`;
  const sheet = workbook.addWorksheet(sheetName);
  setupSheet(sheet);
  const historyResult = await getDeviceHistory(db, device.name, range);
  const history = historyResult.rows;
  const energyKwh = await getEnergy(db, range, device.name);
  const cost = settings.pricePerKwh == null ? null : energyKwh * settings.pricePerKwh;
  addMetadata(sheet, [
    ['Device', device.name], ['Reporting Period', `${formatDateTime(range.startMs)} - ${formatDateTime(range.endMs)}`],
    ['Data Resolution', range.resolution], ['Energy Usage (kWh)', energyKwh], ['Energy Cost', cost == null ? 'Tariff not configured' : cost],
    ['Currency', settings.currency], ['Tariff per kWh', settings.pricePerKwh ?? 'Not configured']
  ]);
  PHASES.forEach((phase) => {
    historyResult.disabledIntervals[phase].forEach((interval) => {
      sheet.addRow([`${deviceDisplayName(device, phase)} disabled`, `${formatDateTime(interval.startMs)} - ${formatDateTime(interval.endMs)}`]);
    });
  });
  if (PHASES.some((phase) => historyResult.disabledIntervals[phase].length)) sheet.addRow([]);
  const header = ['Data Point', ...history.map((row) => formatBucket(row.ts, range.key))];
  const headerRow = sheet.addRow(header); styleHeader(headerRow);
  const rowDefinitions = [];
  PHASES.forEach((phase) => {
    const display = deviceDisplayName(device, phase);
    rowDefinitions.push(
      [`${display} Voltage (V)`, phase, 'voltage'],
      [`${display} Current (A)`, phase, 'current'],
      [`${display} Power (kW)`, phase, 'powerKw']
    );
  });
  rowDefinitions.forEach(([label, phaseKey, field]) => {
    const values = historyResult.phaseSeries[phaseKey].map((point) => point?.[field] ?? null);
    const row = sheet.addRow([label, ...values]);
    const phase = label.slice(0, 2).toLowerCase();
    if (PHASE_COLOURS[phase]) row.getCell(1).font = { bold: true, color: { argb: `FF${PHASE_COLOURS[phase].slice(1)}` } };
  });
  for (let column = 2; column <= header.length; column += 1) sheet.getColumn(column).width = range.key === 'last-week' ? 18 : 16;
  sheet.eachRow((row, rowNumber) => { if (rowNumber > headerRow.number) row.alignment = { vertical: 'middle' }; });
  return sheet;
}

async function createDashboardWorkbook({ db, devices, rangeValue, includeDevices }) {
  const range = resolveExportRange(rangeValue);
  const settings = await getSettings(db);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'UWC Energy Monitor';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Site Summary');
  setupSheet(sheet);
  const history = await getSiteHistory(db, range);
  const energyKwh = await getEnergy(db, range);
  const cost = settings.pricePerKwh == null ? null : energyKwh * settings.pricePerKwh;
  addMetadata(sheet, [
    ['Site', settings.siteName || 'UWC Energy Monitor'], ['Reporting Period', `${formatDateTime(range.startMs)} - ${formatDateTime(range.endMs)}`],
    ['Data Resolution', range.resolution], ['Energy Usage (kWh)', energyKwh], ['Energy Cost', cost == null ? 'Tariff not configured' : cost],
    ['Currency', settings.currency], ['Tariff per kWh', settings.pricePerKwh ?? 'Not configured']
  ]);
  const headerRow = sheet.addRow(['Data Point', ...history.map((row) => formatBucket(row.ts, range.key))]); styleHeader(headerRow);
  sheet.addRow(['Total Power (kW)', ...history.map((row) => row.total_power_kw)]);
  for (let column = 2; column <= history.length + 1; column += 1) sheet.getColumn(column).width = range.key === 'last-week' ? 18 : 16;
  if (includeDevices) for (const device of devices) await addDeviceWorksheet(workbook, db, device, range, settings);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer, filename: `${safeName(settings.siteName || 'UWC-Energy-Monitor')}_Site_Data_${dateStamp()}.xlsx` };
}

async function createDeviceWorkbook({ db, device, rangeValue }) {
  const range = resolveExportRange(rangeValue);
  const settings = await getSettings(db);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'UWC Energy Monitor';
  workbook.created = new Date();
  await addDeviceWorksheet(workbook, db, device, range, settings);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer, filename: `${safeName(device.name)}_Data_${dateStamp()}.xlsx` };
}

module.exports = {
  resolveExportRange,
  createDashboardPdf,
  createDevicePdf,
  createDashboardWorkbook,
  createDeviceWorkbook
};
