// ===== LOGIN =====
const VALID_USER = 'admin';
const VALID_PASS = 'pymeshield2024';

function doLogin() {
  const user = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value;
  const errorEl = document.getElementById('login-error');

  if (user === VALID_USER && pass === VALID_PASS) {
    sessionStorage.setItem('ps_auth', '1');
    document.getElementById('login-overlay').classList.add('hidden');
    errorEl.textContent = '';
  } else {
    errorEl.textContent = 'Usuario o contraseña incorrectos.';
    document.getElementById('login-pass').value = '';
  }
}

// Allow Enter key on login form
// Frontend Client Controller - PymeShield

let socket;
let currentTab = 'resumen';
let allDevices = [];

document.addEventListener('DOMContentLoaded', () => {
  // Login: bind Enter key and check session
  ['login-user', 'login-pass'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  });
  if (sessionStorage.getItem('ps_auth') === '1') {
    document.getElementById('login-overlay').classList.add('hidden');
  }

  // App init
  initApp();
  connectWebSocket();
});

// Initialize the Application Data
async function initApp() {
  await fetchSettings();
  await loadDashboardData();
}

// Fetch general settings
async function fetchSettings() {
  try {
    const res = await fetch('/api/settings');
    const settings = await res.json();
    document.getElementById('demo-toggle').checked = settings.demoMode;
  } catch (error) {
    console.error('Error cargando configuración:', error);
  }
}

// Toggle Academic Demo Mode
async function toggleDemoMode() {
  try {
    const res = await fetch('/api/settings/toggle-demo', { method: 'POST' });
    const data = await res.json();
    document.getElementById('demo-toggle').checked = data.demoMode;
    // Reload dashboard data in new mode
    loadDashboardData();
  } catch (error) {
    console.error('Error al cambiar modo:', error);
  }
}

// Load all items into dashboard
async function loadDashboardData() {
  try {
    // Parallel fetch for speed
    const [devicesRes, alertsRes, recsRes] = await Promise.all([
      fetch('/api/devices'),
      fetch('/api/alerts'),
      fetch('/api/recommendations')
    ]);

    const devices = await devicesRes.json();
    const alerts = await alertsRes.json();
    const recommendations = await recsRes.json();

    allDevices = devices;
    filterAndRenderDevices();
    renderPorts(devices);
    renderAlerts(alerts);
    renderRecommendations(recommendations);
    
    // Calculate and render security metrics
    updateMetrics(devices, alerts);

    // Render trend chart
    loadTrendChart();

    // Update Status footer
    const activeCount = devices.filter(d => d.status === 'Activo').length;
    document.getElementById('network-status').textContent = `Red activa · ${activeCount} conectados`;

  } catch (error) {
    console.error('Error cargando datos del dashboard:', error);
  }
}

// Render Devices Table
function renderDevices(devices) {
  const tbody = document.getElementById('devices-tbody');
  document.getElementById('devices-badge').textContent = `${devices.length} detectados`;
  
  if (devices.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--muted); padding: 30px;">No hay dispositivos detectados. Inicia un escaneo de red.</td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  devices.forEach(d => {
    const isLocal = d.mac === 'LOCAL-HOST-DEV';
    const isAuthorized = d.isAuthorized;
    const isBlocked = d.status === 'Bloqueado';
    
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <strong>${d.hostname}</strong>
        <div class="device-sub">${d.vendor || 'Dispositivo Genérico'}</div>
      </td>
      <td>
        <div>${d.ip}</div>
        <div class="device-code">${isLocal ? '(Adaptador local)' : d.mac}</div>
      </td>
      <td>
        <span class="badge ${d.status === 'Activo' ? 'green' : d.status === 'Bloqueado' ? 'red' : 'blue'}">
          <span class="dot"></span>${d.status}
        </span>
      </td>
      <td>
        <span class="badge ${d.riskLevel === 'Alto' ? 'red' : d.riskLevel === 'Medio' ? 'amber' : 'green'}">
          ${d.riskLevel}
        </span>
      </td>
      <td>
        <button class="btn-action ${!isAuthorized ? 'unauthorized' : ''}" onclick="toggleAuthorize('${d.id}')">
          ${isAuthorized ? 'Autorizado' : 'Sospechoso'}
        </button>
      </td>
      <td style="text-align: right">
        ${isLocal ? '<span style="font-size: 11px; color: var(--muted)">Admin</span>' : `
          <button class="btn-action ${isBlocked ? 'block-active' : ''}" onclick="toggleBlock('${d.id}', ${!isBlocked})">
            ${isBlocked ? 'Desbloquear' : 'Bloquear'}
          </button>
        `}
      </td>
    `;
    tbody.appendChild(row);
  });
}

// Render Exposed Ports
function renderPorts(devices) {
  const portsList = document.getElementById('ports-list');
  portsList.innerHTML = '';

  const exposedPorts = [];
  devices.forEach(d => {
    if (d.ports && d.ports.length > 0) {
      d.ports.forEach(p => {
        exposedPorts.push({
          ip: d.ip,
          hostname: d.hostname,
          ...p
        });
      });
    }
  });

  if (exposedPorts.length === 0) {
    portsList.innerHTML = `<div class="empty-state">No se han detectado puertos abiertos vulnerables.</div>`;
    return;
  }

  // Draw list
  exposedPorts.slice(0, 5).forEach(p => {
    const item = document.createElement('div');
    item.className = 'port-item';
    
    // Percentage for indicator bar
    let width = 30;
    if (p.riskLevel === 'Alto') width = 90;
    if (p.riskLevel === 'Medio') width = 60;
    
    const colorClass = p.riskLevel === 'Alto' ? 'red' : p.riskLevel === 'Medio' ? 'amber' : 'green';

    item.innerHTML = `
      <span class="port-num ${colorClass}">:${p.portNumber}</span>
      <div class="port-bar">
        <div class="port-bar-fill ${colorClass}" style="width: ${width}%"></div>
      </div>
      <span class="port-service">${p.serviceName}</span>
      <span class="badge ${colorClass}" style="font-size: 10px; padding: 2px 6px;">${p.riskLevel}</span>
    `;
    item.title = `Servicio expuesto en ${p.hostname} (${p.ip})`;
    portsList.appendChild(item);
  });
}

// Render Alerts
function renderAlerts(alerts) {
  const alertsList = document.getElementById('alerts-list');
  alertsList.innerHTML = '';

  const unreadAlerts = alerts.filter(a => a.status === 'No leída');

  if (alerts.length === 0) {
    alertsList.innerHTML = `<div class="empty-state">No hay alertas de seguridad en el historial.</div>`;
    return;
  }

  alerts.slice(0, 4).forEach(a => {
    const item = document.createElement('div');
    const colorClass = a.riskLevel === 'Rojo' ? 'red' : a.riskLevel === 'Amarillo' ? 'amber' : 'blue';
    
    // Icon SVG depending on category
    let iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    if (a.title.includes('Bloqueado') || a.title.includes('Desbloqueado')) {
      iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
    }

    item.className = 'alert-item';
    item.innerHTML = `
      <div class="alert-icon ${colorClass}">${iconSvg}</div>
      <div class="alert-details">
        <div class="alert-title">${a.title}</div>
        <div class="alert-desc">${a.description}</div>
      </div>
      <span class="alert-time">${formatTime(a.timestamp)}</span>
    `;
    alertsList.appendChild(item);
  });
}

// Render Recommendations
function renderRecommendations(recommendations) {
  const recList = document.getElementById('recommendations-list');
  recList.innerHTML = '';

  if (recommendations.length === 0) {
    recList.innerHTML = `<div class="empty-state">Todo seguro. No hay recomendaciones pendientes.</div>`;
    return;
  }

  recommendations.forEach((r, idx) => {
    const item = document.createElement('div');
    const priorityClass = r.priority === 'Alta' ? 'alta' : r.priority === 'Media' ? 'media' : 'baja';
    item.className = `rec-item ${priorityClass}`;
    item.innerHTML = `
      <div class="rec-badge">${idx + 1}</div>
      <div>
        <div class="rec-title">${r.title}</div>
        <div class="rec-desc">${r.description}</div>
      </div>
    `;
    recList.appendChild(item);
  });
}

// Calculate Metrics
function updateMetrics(devices, alerts) {
  const activeCount = devices.filter(d => d.status === 'Activo').length;
  
  // Ports in risk count
  let riskPortsCount = 0;
  devices.forEach(d => {
    if (d.ports) {
      riskPortsCount += d.ports.filter(p => p.riskLevel === 'Alto' || p.riskLevel === 'Medio').length;
    }
  });

  const unreadAlertsCount = alerts.filter(a => a.status === 'No leída').length;

  document.getElementById('m-devices').textContent = activeCount;
  document.getElementById('m-ports').textContent = riskPortsCount;
  document.getElementById('m-alerts').textContent = unreadAlertsCount;

  // Calculate Score dynamically
  let score = 100;
  const unauthorizedCount = devices.filter(d => !d.isAuthorized).length;
  let criticalCount = devices.filter(d => d.riskLevel === 'Alto').length;

  score -= (unauthorizedCount * 15);
  score -= (criticalCount * 10);
  score -= (riskPortsCount * 2);
  
  if (score < 10) score = 10;

  // Update Score UI
  document.getElementById('m-score').textContent = score;
  document.getElementById('score-num').textContent = score;

  const scoreSub = document.getElementById('m-score-sub');
  const card = document.getElementById('score-card');
  const circle = document.getElementById('score-circle');

  // SVG Circle Stroke Animation
  // Circumference = 2 * PI * r = 2 * 3.1415 * 24 = 150
  const circumference = 150;
  const offset = circumference - (score / 100) * circumference;
  circle.style.strokeDasharray = circumference;
  circle.style.strokeDashoffset = offset;

  // Color card and text based on score
  card.className = 'metric-card green';
  circle.style.stroke = 'var(--green)';
  document.getElementById('score-num').style.color = 'var(--green)';
  scoreSub.textContent = 'Bueno — mejorable';

  if (score < 70) {
    card.className = 'metric-card red';
    circle.style.stroke = 'var(--red)';
    document.getElementById('score-num').style.color = 'var(--red)';
    scoreSub.textContent = 'Crítico — peligro';
  } else if (score < 90) {
    card.className = 'metric-card amber';
    circle.style.stroke = 'var(--amber)';
    document.getElementById('score-num').style.color = 'var(--amber)';
    scoreSub.textContent = 'Regular — requiere atención';
  }
}

// Format timestamp
function formatTime(timestamp) {
  const date = new Date(timestamp);
  const diffMs = new Date() - date;
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'ahora';
  if (diffMins < 60) return `hace ${diffMins}m`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `hace ${diffHours}h`;
  
  return date.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
}

// Device API: Block Device
async function toggleBlock(id, block) {
  try {
    const res = await fetch('/api/devices/block', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, block })
    });
    if (res.ok) {
      loadDashboardData();
    }
  } catch (error) {
    console.error('Error al bloquear/desbloquear:', error);
  }
}

// Device API: Toggle Authorization
async function toggleAuthorize(id) {
  try {
    const res = await fetch('/api/devices/toggle-authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    if (res.ok) {
      loadDashboardData();
    }
  } catch (error) {
    console.error('Error al autorizar dispositivo:', error);
  }
}

// Alerts API: Read All
async function readAllAlerts() {
  try {
    const res = await fetch('/api/alerts/read-all', { method: 'POST' });
    if (res.ok) {
      loadDashboardData();
    }
  } catch (error) {
    console.error('Error al leer alertas:', error);
  }
}

// TRIGGER SCAN
async function runScan() {
  const btn = document.getElementById('scan-btn');
  const icon = document.getElementById('scan-icon');
  
  btn.disabled = true;
  btn.style.opacity = '0.6';
  icon.classList.add('spin');

  // Clear progress indicator
  document.getElementById('scan-progress-bar').classList.add('active');
  document.getElementById('progress-msg').textContent = 'Iniciando conexión con el motor de escaneo...';
  document.getElementById('progress-fill').style.width = '0%';
  document.getElementById('progress-val').textContent = '0%';

  try {
    const res = await fetch('/api/scan', { method: 'POST' });
    if (!res.ok) {
      throw new Error('El motor de escaneo ya se encuentra ocupado.');
    }
  } catch (error) {
    alert(error.message);
    btn.disabled = false;
    btn.style.opacity = '1';
    icon.classList.remove('spin');
    document.getElementById('scan-progress-bar').classList.remove('active');
  }
}

// PDF Export
function downloadPDF() {
  window.open('/api/reports/pdf', '_blank');
}

// WebSocket connection for live scan progress & updates
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;
  
  socket = new WebSocket(wsUrl);

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === 'progress') {
      // Update progress bar
      document.getElementById('scan-progress-bar').classList.add('active');
      document.getElementById('progress-msg').textContent = data.message;
      document.getElementById('progress-fill').style.width = `${data.percent}%`;
      document.getElementById('progress-val').textContent = `${data.percent}%`;
    }
    
    if (data.type === 'complete') {
      const now = new Date();
      document.getElementById('last-scan').textContent = `Último escaneo: hace un momento · ${now.toLocaleTimeString()}`;

      if (data.isBackground) {
        // Silent update for background scans
        loadDashboardData();
        return;
      }

      // Complete Manual Scan
      document.getElementById('progress-msg').textContent = 'Auditoría completada exitosamente.';
      document.getElementById('progress-fill').style.width = '100%';
      document.getElementById('progress-val').textContent = '100%';

      setTimeout(() => {
        document.getElementById('scan-progress-bar').classList.remove('active');
        const btn = document.getElementById('scan-btn');
        const icon = document.getElementById('scan-icon');
        btn.disabled = false;
        btn.style.opacity = '1';
        icon.classList.remove('spin');
      }, 2000);

      loadDashboardData();
    }

    if (data.type === 'alert_new') {
      loadDashboardData();
    }
  };

  socket.onclose = () => {
    console.log('WebSocket cerrado. Reconectando en 5 segundos...');
    setTimeout(connectWebSocket, 5000);
  };
}

// SPA tab switching logic
function switchTab(tab, element) {
  currentTab = tab;
  
  // Update nav active classes
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => item.classList.remove('active'));
  element.classList.add('active');

  const title = document.getElementById('section-title');
  
  // Show / Hide containers depending on tab selection
  const metrics = document.getElementById('metrics-section');
  const trend = document.getElementById('trend-container');
  const devices = document.getElementById('devices-container');
  const sidePanels = document.getElementById('side-panels');
  const recommendations = document.getElementById('recommendations-container');
  
  // Defaults
  metrics.style.display = 'grid';
  if (trend) trend.style.display = 'block';
  devices.style.display = 'block';
  sidePanels.style.display = 'flex';
  recommendations.style.display = 'block';

  if (tab === 'resumen') {
    title.textContent = 'Resumen de Seguridad de Red';
  } else if (tab === 'dispositivos') {
    title.textContent = 'Inventario de Dispositivos Conectados';
    metrics.style.display = 'none';
    if (trend) trend.style.display = 'none';
    sidePanels.style.display = 'none';
    recommendations.style.display = 'none';
  } else if (tab === 'puertos') {
    title.textContent = 'Monitoreo de Puertos y Servicios';
    metrics.style.display = 'none';
    if (trend) trend.style.display = 'none';
    devices.style.display = 'none';
    recommendations.style.display = 'none';
    document.getElementById('ports-container').style.display = 'block';
    document.getElementById('alerts-container').style.display = 'none';
  } else if (tab === 'alertas') {
    title.textContent = 'Panel de Alertas y Amenazas';
    metrics.style.display = 'none';
    if (trend) trend.style.display = 'none';
    devices.style.display = 'none';
    recommendations.style.display = 'none';
    document.getElementById('ports-container').style.display = 'none';
    document.getElementById('alerts-container').style.display = 'block';
  } else if (tab === 'recomendaciones') {
    title.textContent = 'Plan de Acción y Recomendaciones';
    metrics.style.display = 'none';
    if (trend) trend.style.display = 'none';
    devices.style.display = 'none';
    sidePanels.style.display = 'none';
  }
}

// Client-side search and filtering logic
function filterAndRenderDevices() {
  const searchInput = document.getElementById('device-search');
  const filterSelect = document.getElementById('device-filter');
  
  const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const filterValue = filterSelect ? filterSelect.value : 'todos';

  const filtered = allDevices.filter(d => {
    // 1. Search filter
    const matchesSearch = 
      d.ip.toLowerCase().includes(searchQuery) ||
      (d.mac && d.mac.toLowerCase().includes(searchQuery)) ||
      d.hostname.toLowerCase().includes(searchQuery) ||
      (d.vendor && d.vendor.toLowerCase().includes(searchQuery));

    if (!matchesSearch) return false;

    // 2. Dropdown filter selection
    if (filterValue === 'activo') {
      return d.status === 'Activo';
    } else if (filterValue === 'inactivo') {
      return d.status === 'Inactivo';
    } else if (filterValue === 'bloqueado') {
      return d.status === 'Bloqueado';
    } else if (filterValue === 'sospechoso') {
      return !d.isAuthorized;
    } else if (filterValue === 'vulnerable') {
      return d.ports && d.ports.length > 0;
    }

    return true; // "todos"
  });

  renderDevices(filtered);
}

// Event listeners for search input & filter dropdown
function onDeviceSearchInput() {
  filterAndRenderDevices();
}

function onDeviceFilterChange() {
  filterAndRenderDevices();
}

// Load and draw the SVG Security Score Trend Chart
async function loadTrendChart() {
  const trendBadge = document.getElementById('trend-badge');
  const svg = document.getElementById('trend-svg');
  if (!svg) return;

  try {
    const res = await fetch('/api/scans/history');
    if (!res.ok) {
      throw new Error(`El servidor respondió con código ${res.status}. Asegúrate de reiniciar el servidor ejecutando "Iniciar PymeShield.bat".`);
    }
    
    const history = await res.json();
    
    if (!Array.isArray(history)) {
      throw new Error('Los datos devueltos por el servidor no son válidos.');
    }
    
    if (history.length === 0) {
      trendBadge.textContent = 'Sin historial';
      svg.innerHTML = `
        <text x="400" y="90" fill="var(--muted)" font-size="13" text-anchor="middle" font-family="var(--font-main)">
          No hay suficientes datos históricos. Realice escaneos para comenzar a ver la tendencia.
        </text>
      `;
      return;
    }

    trendBadge.textContent = `${history.length} análisis guardados`;
    
    const width = 800;
    const height = 180;
    const paddingX = 60;
    const paddingY = 25;
    
    // Clear SVG content
    svg.innerHTML = '';

    // Add CSS definitions to SVG (gradients, filters)
    svg.innerHTML += `
      <defs>
        <linearGradient id="chart-area-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--blue)" stop-opacity="0.25" />
          <stop offset="100%" stop-color="var(--blue)" stop-opacity="0" />
        </linearGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
    `;

    // 1. Draw Grid Lines (0%, 50%, 100%)
    const gridScores = [0, 50, 100];
    gridScores.forEach(gScore => {
      const y = height - paddingY - (gScore / 100) * (height - 2 * paddingY);
      
      // Grid line
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(paddingX));
      line.setAttribute('y1', String(y));
      line.setAttribute('x2', String(width - paddingX));
      line.setAttribute('y2', String(y));
      line.setAttribute('class', 'chart-grid-line');
      svg.appendChild(line);

      // Grid text label
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(paddingX - 15));
      text.setAttribute('y', String(y + 4));
      text.setAttribute('class', 'chart-grid-text');
      text.setAttribute('text-anchor', 'end');
      text.textContent = `${gScore}%`;
      svg.appendChild(text);
    });

    const pointsCount = history.length;
    const points = [];

    // Calculate coordinates for each score point
    history.forEach((h, index) => {
      const x = paddingX + (index / Math.max(1, pointsCount - 1)) * (width - 2 * paddingX);
      const y = height - paddingY - (h.score / 100) * (height - 2 * paddingY);
      
      let timeStr = '';
      let dateStr = '';
      try {
        timeStr = new Date(h.timestamp).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
        dateStr = new Date(h.timestamp).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
      } catch (dateErr) {
        // Fallback robust date parsing in case localizer format fails or is unsupported
        const dateObj = new Date(h.timestamp);
        if (isNaN(dateObj.getTime())) {
          timeStr = '--:--';
          dateStr = 'Fecha desc.';
        } else {
          timeStr = `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
          dateStr = `${dateObj.getDate()}/${dateObj.getMonth() + 1}`;
        }
      }

      points.push({ x, y, score: h.score, time: timeStr, date: dateStr });
    });

    // 2. Draw Area under the line (Gradients)
    if (points.length > 1) {
      let areaD = `M ${points[0].x} ${height - paddingY}`;
      points.forEach(pt => {
        areaD += ` L ${pt.x} ${pt.y}`;
      });
      areaD += ` L ${points[points.length - 1].x} ${height - paddingY} Z`;

      const areaPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      areaPath.setAttribute('d', areaD);
      areaPath.setAttribute('fill', 'url(#chart-area-grad)');
      areaPath.setAttribute('class', 'chart-area');
      svg.appendChild(areaPath);
    }

    // 3. Draw Trend Line
    let lineD = '';
    points.forEach((pt, index) => {
      if (index === 0) {
        lineD = `M ${pt.x} ${pt.y}`;
      } else {
        lineD += ` L ${pt.x} ${pt.y}`;
      }
    });

    if (points.length > 0) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', lineD);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'var(--blue)');
      path.setAttribute('stroke-width', '3');
      path.setAttribute('filter', 'url(#glow)');
      path.setAttribute('class', 'chart-line');
      
      // Animate line path drawing
      const pathLength = points.length * 150; // Approximated length
      path.style.strokeDasharray = String(pathLength);
      path.style.strokeDashoffset = String(pathLength);
      path.style.transition = 'stroke-dashoffset 1.5s ease-in-out';
      svg.appendChild(path);
      
      // Trigger SVG redraw trigger for CSS transition to fire
      setTimeout(() => { path.style.strokeDashoffset = '0'; }, 50);
    }

    // 4. Draw Score Points (Circles) and Labels
    points.forEach((pt, index) => {
      // Score point circle
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', String(pt.x));
      circle.setAttribute('cy', String(pt.y));
      circle.setAttribute('r', '5');
      
      // Color dot based on security level
      let dotColor = 'var(--green)';
      if (pt.score < 70) dotColor = 'var(--red)';
      else if (pt.score < 90) dotColor = 'var(--amber)';

      circle.setAttribute('fill', dotColor);
      circle.setAttribute('stroke', '#fff');
      circle.setAttribute('stroke-width', '2');
      circle.setAttribute('class', 'chart-dot');
      svg.appendChild(circle);

      // Score Value Label (drawn slightly above dot)
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', String(pt.x));
      label.setAttribute('y', String(pt.y - 12));
      label.setAttribute('font-size', '10');
      label.setAttribute('font-family', 'var(--font-main)');
      label.setAttribute('font-weight', '700');
      label.setAttribute('fill', '#ffffff');
      label.setAttribute('text-anchor', 'middle');
      label.textContent = pt.score;
      svg.appendChild(label);

      // Date/Time Label (drawn below the baseline)
      const timeLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      timeLabel.setAttribute('x', String(pt.x));
      timeLabel.setAttribute('y', String(height - 8));
      timeLabel.setAttribute('font-size', '9');
      timeLabel.setAttribute('font-family', 'var(--font-main)');
      timeLabel.setAttribute('font-weight', '500');
      timeLabel.setAttribute('fill', 'var(--muted)');
      timeLabel.setAttribute('text-anchor', 'middle');
      timeLabel.textContent = `${pt.date} ${pt.time}`;
      svg.appendChild(timeLabel);
    });

  } catch (error) {
    console.error('Error dibujando gráfica de tendencia:', error);
    if (trendBadge) {
      trendBadge.textContent = 'Error';
      trendBadge.title = error.message;
    }
    svg.innerHTML = `
      <text x="400" y="80" fill="var(--red)" font-size="12" text-anchor="middle" font-family="var(--font-main)" font-weight="600">
        Error al cargar la tendencia: ${error.message}
      </text>
      <text x="400" y="105" fill="var(--muted)" font-size="11" text-anchor="middle" font-family="var(--font-main)">
        Por favor, cierra la ventana negra y vuelve a abrir "Iniciar PymeShield.bat" para reiniciar el servidor.
      </text>
    `;
  }
}
