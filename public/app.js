// ==========================================
// CONTROLADOR FRONTEND PRINCIPAL - PYMESHIELD
// ==========================================
// Este archivo actúa como el "cerebro" en el navegador del usuario (cliente).
// Se encarga de capturar las interacciones en la interfaz, realizar peticiones HTTP a la API del servidor (server.js),
// procesar la telemetría en tiempo real por WebSockets y dibujar los componentes gráficos interactivos (SVG).

let socket;                   // Canal de comunicación WebSocket persistente
let currentTab = 'resumen';   // Pestaña o sección activa de la interfaz SPA
let allDevices = [];          // Inventario local de todos los dispositivos de la subred
let mfaIsSetupMode = false;   // Bandera para saber si estamos en la configuración inicial del Doble Factor
let mfaTempSecret = '';       // Semilla secreta TOTP temporal durante el setup inicial
let licenseStatus = 'Demo';   // Estado de la licencia comercial del software ('Demo' o 'Premium')

// --- INTERCEPTOR DE SERVIDORES ESTÁTICOS (MOCK BACKEND PARA GITHUB PAGES) ---
const isStaticDemo = window.location.hostname.includes('github.io') || window.location.protocol === 'file:';
if (isStaticDemo) {
  console.log('[PymeShield Demo] Ejecutando en modo demostración estático (sin servidor backend). Interceptando API.');
  
  // Forzar inicio de sesión automático para facilitar la demostración online sin login manual,
  // a menos que el usuario haya hecho clic explícitamente en "Cerrar Sesión".
  if (sessionStorage.getItem('pymeshield_logged_out') !== 'true') {
    sessionStorage.setItem('pymeshield_auth', 'true');
  }

  // Base de datos en memoria para la demo
  let mockDevices = [
    { id: "1", ip: "192.168.1.1", mac: "0C:01:4B:E7:8A:60", hostname: "Puerta de Enlace (Router)", vendor: "ZTE Corporation", status: "Activo", isAuthorized: true, riskLevel: "Bajo", lastSeen: new Date().toISOString(), ports: [] },
    { id: "2", ip: "192.168.1.9", mac: "48:5C:2C:BD:D9:7E", hostname: "SMARTTV_JORGE", vendor: "Earda Technologies", status: "Activo", isAuthorized: true, riskLevel: "Bajo", lastSeen: new Date().toISOString(), ports: [] },
    { id: "3", ip: "192.168.1.10", mac: "64:BB:1E:4F:DC:0E", hostname: "TELE_JOSE_Y_EVA", vendor: "Earda Technologies", status: "Activo", isAuthorized: true, riskLevel: "Bajo", lastSeen: new Date().toISOString(), ports: [] },
    { id: "4", ip: "192.168.1.165", mac: "LOCAL-HOST-DEV", hostname: "pepeithor", vendor: "Dispositivo Genérico", status: "Activo", isAuthorized: true, riskLevel: "Bajo", lastSeen: new Date().toISOString(), ports: [] },
    { id: "5", ip: "192.168.1.168", mac: "EA:0A:DD:B3:DA:0B", hostname: "CELULAR_JOSE", vendor: "Dispositivo Genérico", status: "Bloqueado", isAuthorized: false, riskLevel: "Bajo", lastSeen: new Date().toISOString(), ports: [] },
    { id: "6", ip: "192.168.1.8", mac: "3E:C2:05:E2:C8:EF", hostname: "CELULAR-JORGE", vendor: "Dispositivo Genérico", status: "Activo", isAuthorized: true, riskLevel: "Bajo", lastSeen: new Date().toISOString(), ports: [] },
    { id: "7", ip: "192.168.1.122", mac: "92:DC:A9:AE:FF:A0", hostname: "CELULAR_TRABAJO-EVA", vendor: "Dispositivo Genérico", status: "Activo", isAuthorized: true, riskLevel: "Bajo", lastSeen: new Date().toISOString(), ports: [] }
  ];

  let mockAlerts = [
    { id: "a1", title: "Dispositivo Bloqueado", description: "El dispositivo con IP 192.168.1.168 (CELULAR_JOSE) ha sido bloqueado del sistema.", riskLevel: "Azul", status: "No leída", createdAt: new Date().toISOString() },
    { id: "a2", title: "Intento de Intrusión Simulado", description: "Se detectó un intento de escaneo ARP masivo desde la IP 192.168.1.168.", riskLevel: "Rojo", status: "No leída", createdAt: new Date().toISOString() }
  ];

  let mockLogs = [
    { id: "l1", type: "SYSTEM_INIT", details: "Se inicializó el sistema PymeShield y se cargaron los datos de demostración.", ipAddress: "127.0.0.1", createdAt: new Date().toISOString() },
    { id: "l2", type: "CONTAINMENT_ACTION", details: "NAC: Dispositivo sospechoso 'CELULAR_JOSE' (IP 192.168.1.168) bloqueado automáticamente.", ipAddress: "127.0.0.1", createdAt: new Date().toISOString() }
  ];

  let mockSettings = {
    usuario: "admin",
    zeroTrustMode: true,
    webhookUrl: "https://api-soar.colegio.cl/alerts/webhook",
    licenseKey: "",
    licenseStatus: "Demo",
    mfaSecret: "J2FGT4RCWGHKOQZUO7B3PQ3JSTQH2V3C"
  };

  // Sobrescribimos window.fetch
  const originalFetch = window.fetch;
  window.fetch = async function (url, options) {
    const cleanUrl = url.split('?')[0]; // Limpiar query params si existen
    const method = (options && options.method || 'GET').toUpperCase();
    
    // Simular retraso de red de 150ms para realismo
    await new Promise(r => setTimeout(r, 150));

    if (cleanUrl === '/api/login' && method === 'POST') {
      sessionStorage.removeItem('pymeshield_logged_out');
      return {
        ok: true,
        json: async () => ({ success: true, mfaRequired: false })
      };
    }

    if (cleanUrl === '/api/settings') {
      if (method === 'GET') {
        return { ok: true, json: async () => mockSettings };
      }
    }

    if (cleanUrl === '/api/settings/activate-license' && method === 'POST') {
      const body = JSON.parse(options.body);
      if (body.key === 'PYMESHIELD-777-PREMIUM') {
        mockSettings.licenseStatus = 'Premium';
        mockSettings.licenseKey = 'PYMESHIELD-777-PREMIUM';
        return { ok: true, json: async () => ({ success: true, status: 'Premium' }) };
      } else {
        return { 
          ok: false, 
          status: 400, 
          json: async () => ({ error: 'Clave de licencia inválida o expirada.' }) 
        };
      }
    }

    if (cleanUrl === '/api/settings/update' && method === 'POST') {
      const body = JSON.parse(options.body);
      mockSettings.webhookUrl = body.webhookUrl;
      mockSettings.zeroTrustMode = body.zeroTrustMode;
      return { ok: true, json: async () => mockSettings };
    }

    if (cleanUrl === '/api/settings/toggle-demo' && method === 'POST') {
      return { ok: true, json: async () => ({ success: true }) };
    }

    if (cleanUrl === '/api/devices') {
      // Si la licencia es Demo, limitamos el escaneo a un máximo de 5 dispositivos en el inventario
      if (mockSettings.licenseStatus === 'Demo') {
        return { ok: true, json: async () => mockDevices.slice(0, 5) };
      }
      return { ok: true, json: async () => mockDevices };
    }

    if (cleanUrl === '/api/alerts') {
      return { ok: true, json: async () => mockAlerts };
    }

    if (cleanUrl === '/api/recommendations') {
      return {
        ok: true,
        json: async () => [
          { id: "r1", category: "NAC", title: "Habilitar Control Zero-Trust", description: "Garantiza que ningún dispositivo nuevo pueda comunicarse sin autorización previa.", status: "Completado" },
          { id: "r2", category: "MFA", title: "Doble Factor Activo", description: "La cuenta de administrador está protegida mediante TOTP.", status: "Completado" }
        ]
      };
    }

    if (cleanUrl === '/api/scans/history') {
      return {
        ok: true,
        json: async () => [
          { id: "s1", score: 95, devicesCount: 6, createdAt: "2026-06-27T10:00:00Z" },
          { id: "s2", score: 90, devicesCount: 7, createdAt: "2026-06-27T12:00:00Z" },
          { id: "s3", score: 85, devicesCount: 7, createdAt: "2026-06-27T14:00:00Z" }
        ]
      };
    }

    if (cleanUrl === '/api/audit-logs') {
      return { ok: true, json: async () => mockLogs };
    }

    if (cleanUrl === '/api/devices/block' && method === 'POST') {
      const body = JSON.parse(options.body);
      const dev = mockDevices.find(d => d.id === body.id);
      if (dev) {
        dev.status = body.block ? 'Bloqueado' : 'Activo';
        mockLogs.unshift({
          id: String(Date.now()),
          type: 'CONTAINMENT_ACTION',
          details: body.block 
            ? `Se bloqueó preventivamente el acceso de red al dispositivo sospechoso '${dev.hostname}' (IP ${dev.ip}) mediante Firewall.`
            : `Se eliminó la regla de bloqueo y se restauró el acceso al dispositivo '${dev.hostname}' (IP ${dev.ip}).`,
          ipAddress: '127.0.0.1',
          createdAt: new Date().toISOString()
        });
        mockAlerts.unshift({
          id: String(Date.now()),
          title: body.block ? 'Dispositivo Bloqueado' : 'Dispositivo Desbloqueado',
          description: `El dispositivo con IP ${dev.ip} (${dev.hostname}) ha sido ${body.block ? 'bloqueado' : 'desbloqueado'} del sistema.`,
          riskLevel: body.block ? 'Azul' : 'Amarillo',
          status: 'No leída',
          createdAt: new Date().toISOString()
        });
        return { ok: true, json: async () => dev };
      }
    }

    if (cleanUrl === '/api/devices/toggle-authorize' && method === 'POST') {
      const body = JSON.parse(options.body);
      const dev = mockDevices.find(d => d.id === body.id);
      if (dev) {
        dev.isAuthorized = body.authorize;
        if (body.alias !== undefined) dev.alias = body.alias;
        
        // Simular nuestra nueva funcionalidad de autodesbloqueo al autorizar
        if (dev.isAuthorized && dev.status === 'Bloqueado') {
          dev.status = 'Activo';
        }
        
        mockLogs.unshift({
          id: String(Date.now()),
          type: 'POLICY_CHANGE',
          details: dev.isAuthorized
            ? `Se marcó al dispositivo '${dev.alias || dev.hostname}' (IP ${dev.ip}) como de 'Confianza'.`
            : `Se marcó al dispositivo '${dev.alias || dev.hostname}' (IP ${dev.ip}) como 'Sospechoso/No Autorizado'.`,
          ipAddress: '127.0.0.1',
          createdAt: new Date().toISOString()
        });
        return { ok: true, json: async () => dev };
      }
    }

    if (cleanUrl === '/api/alerts/read-all' && method === 'POST') {
      mockAlerts.forEach(a => a.status = 'Leída');
      return { ok: true, json: async () => ({ success: true }) };
    }

    if (cleanUrl === '/api/scan' && method === 'POST') {
      // Simula agregar un dispositivo temporal nuevo
      if (!mockDevices.some(d => d.ip === '192.168.1.200')) {
        mockDevices.push({
          id: "200",
          ip: "192.168.1.200",
          mac: "F8:E9:03:AB:12:34",
          hostname: "Invitado-PC",
          vendor: "Apple Inc.",
          status: mockSettings.zeroTrustMode ? "Bloqueado" : "Activo",
          isAuthorized: !mockSettings.zeroTrustMode,
          riskLevel: "Bajo",
          lastSeen: new Date().toISOString(),
          ports: []
        });
        if (mockSettings.zeroTrustMode) {
          mockAlerts.unshift({
            id: String(Date.now()),
            title: "Dispositivo Bloqueado",
            description: "El dispositivo con IP 192.168.1.200 (Invitado-PC) ha sido bloqueado automáticamente por NAC Zero-Trust.",
            riskLevel: "Rojo",
            status: "No leída",
            createdAt: new Date().toISOString()
          });
        }
      }
      return { ok: true, json: async () => ({ success: true }) };
    }

    if (cleanUrl === '/api/scan/simulate-attack' && method === 'POST') {
      mockAlerts.unshift({
        id: String(Date.now()),
        title: "Ataque Detectado",
        description: "Alerta Crítica: Simulación de escaneo de vulnerabilidades detectada en la red local.",
        riskLevel: "Rojo",
        status: "No leída",
        createdAt: new Date().toISOString()
      });
      return { ok: true, json: async () => ({ success: true }) };
    }

    if (cleanUrl === '/api/assistant' && method === 'POST') {
      const body = JSON.parse(options.body);
      const msg = body.message.toLowerCase();
      let reply = "Lo siento, soy el asistente fuera de línea de PymeShield. No logré entender tu consulta. Prueba preguntándome sobre 'Zero-Trust', 'Modo NOC', 'Ley 21.719' o 'Docker'.";
      if (msg.includes('zero-trust') || msg.includes('nac')) {
        reply = "El Control de Admisión Zero-Trust (NAC) bloquea a cualquier dispositivo nuevo en el cortafuegos hasta que sea expresamente autorizado por un administrador en la Lista Blanca.";
      } else if (msg.includes('noc')) {
        reply = "El Modo NOC activa el monitoreo visual a pantalla completa, la sirena acústica de eventos críticos (usando Web Audio API para no sobrecargar el sistema) y actualiza la topología dinámicamente.";
      } else if (msg.includes('ley') || msg.includes('21.719') || msg.includes('21.663')) {
        reply = "PymeShield te ayuda a cumplir con la Ley N° 21.719 (Protección de Datos Personales, evitando multas de hasta 20.000 UTM) y la Ley Marco de Ciberseguridad N° 21.663 (obligación de reporte de incidentes graves en 3 horas).";
      } else if (msg.includes('docker') || msg.includes('despliegue')) {
        reply = "PymeShield se despliega fácilmente en un contenedor Docker utilizando 'docker-compose up -d', lo que garantiza portabilidad y aislamiento seguro de dependencias.";
      }
      return {
        ok: true,
        json: async () => ({ response: reply })
      };
    }

    if (cleanUrl === '/api/settings/test-webhook' && method === 'POST') {
      return { ok: true, json: async () => ({ success: true }) };
    }

    // Default fallback
    return originalFetch(url, options);
  };
}

// EVENTO DE INICIO: Se ejecuta de forma automática en cuanto el HTML termina de cargarse en el navegador
document.addEventListener('DOMContentLoaded', () => {
  // Verificamos en el almacenamiento de sesión si el usuario ya se logueó previamente
  const isAuthenticated = sessionStorage.getItem('pymeshield_auth') === 'true';
  const overlay = document.getElementById('login-overlay');
  
  if (isAuthenticated) {
    // Si ya está autenticado, ocultamos el portal de acceso y levantamos los servicios frontend
    if (overlay) overlay.style.display = 'none';
    initApp();
    connectWebSocket();
  } else {
    // Si no está autenticado, forzamos la visualización del portal glassmorphic de acceso
    if (overlay) overlay.style.display = 'flex';
  }
});

// ==========================================
// 1. GESTIÓN DE ACCESO Y AUTENTICACIÓN (LOGIN)
// ==========================================

// MANEJAR LOGIN: Envía las credenciales ingresadas al servidor para validación criptográfica
async function handleLogin(event) {
  event.preventDefault(); // Evitamos que el formulario recargue la página web por defecto
  
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const errorDiv = document.getElementById('login-error');
  const loginForm = document.getElementById('login-form');
  const mfaForm = document.getElementById('mfa-form');
  const mfaDesc = document.getElementById('mfa-desc');
  const mfaQrContainer = document.getElementById('mfa-qr-container');

  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  try {
    // Consumimos el endpoint seguro de login
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (res.ok) {
      errorDiv.style.display = 'none';
      
      // Control de flujo: Si el servidor indica que el MFA (Doble Factor) está activo
      if (data.mfaRequired) {
        mfaIsSetupMode = data.isSetup;
        mfaTempSecret = data.tempSecret || '';

        // Ocultamos el panel de contraseña e iniciamos el paso 2 (TOTP de 6 dígitos)
        loginForm.style.display = 'none';
        mfaForm.style.display = 'block';

        if (data.isSetup) {
          // ESCENARIO A: Vinculación Inicial. El servidor entrega un código QR en Base64
          mfaDesc.innerHTML = '<strong>Configuración de Doble Factor (MFA)</strong>:<br>Escanea este código QR con tu aplicación móvil (Google Authenticator) para vincular tu cuenta.';
          mfaQrContainer.innerHTML = `<img src="${data.qrCode}" style="display: block; width: 160px; height: 160px; border: none; margin: 0 auto;" alt="MFA QR Code">`;
          mfaQrContainer.style.display = 'flex';
        } else {
          // ESCENARIO B: Acceso Normal. El usuario ya vinculó su teléfono anteriormente
          mfaDesc.innerHTML = 'Doble Factor de Seguridad (MFA) activo.<br>Ingresa el código dinámico de 6 dígitos generado en tu aplicación móvil.';
          mfaQrContainer.style.display = 'none';
          mfaQrContainer.innerHTML = '';
        }

        // Foco automático en el cuadro de texto del código
        setTimeout(() => {
          document.getElementById('mfa-code').focus();
        }, 100);
      } else {
        // Si no requiere MFA (MFA deshabilitado), autorizamos el ingreso directamente
        sessionStorage.setItem('pymeshield_auth', 'true');
        const overlay = document.getElementById('login-overlay');
        if (overlay) overlay.style.display = 'none';
        initApp();
        connectWebSocket();
      }
    } else {
      throw new Error(data.error || 'Credenciales inválidas');
    }
  } catch (err) {
    // Manejo de errores visuales: Muestra error y gatilla una animación de vibración (shake)
    errorDiv.textContent = err.message;
    errorDiv.style.display = 'block';
    passwordInput.value = '';
    
    // Reiniciar animación shake aplicando un reflow en caliente del navegador
    errorDiv.style.animation = 'none';
    void errorDiv.offsetWidth; 
    errorDiv.style.animation = 'shake 0.4s ease';
  }
}

// VERIFICAR CÓDIGO MFA: Envía el código TOTP de 6 dígitos al backend para verificación matemática temporal
async function handleMfaVerify(event) {
  event.preventDefault();
  const mfaCodeInput = document.getElementById('mfa-code');
  const errorDiv = document.getElementById('mfa-error');
  const overlay = document.getElementById('login-overlay');
  const code = mfaCodeInput.value.trim();

  // Dependiendo del flujo, enviamos a setup (registro inicial) o validación estándar
  const endpoint = mfaIsSetupMode ? '/api/login/mfa-setup' : '/api/login/mfa';
  const bodyData = mfaIsSetupMode ? { code, tempSecret: mfaTempSecret } : { code };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyData)
    });

    if (res.ok) {
      errorDiv.style.display = 'none';
      sessionStorage.setItem('pymeshield_auth', 'true');
      if (overlay) overlay.style.display = 'none';
      mfaIsSetupMode = false;
      mfaTempSecret = '';
      initApp();
      connectWebSocket();
    } else {
      const data = await res.json();
      throw new Error(data.error || 'Código de verificación incorrecto.');
    }
  } catch (err) {
    errorDiv.textContent = err.message;
    errorDiv.style.display = 'block';
    mfaCodeInput.value = '';
    
    // Reiniciar animación shake para avisar del error de forma interactiva
    errorDiv.style.animation = 'none';
    void errorDiv.offsetWidth; 
    errorDiv.style.animation = 'shake 0.4s ease';
  }
}

// CAMBIAR CONTRASEÑA EN AJUSTES: Permite actualizar la clave administrativa del panel
async function handleChangePassword(event) {
  event.preventDefault();
  const currentPasswordInput = document.getElementById('current-password');
  const newPasswordInput = document.getElementById('new-password');
  const confirmPasswordInput = document.getElementById('confirm-password');
  const successDiv = document.getElementById('change-pass-success');
  const errorDiv = document.getElementById('change-pass-error');

  const currentPassword = currentPasswordInput.value;
  const newPassword = newPasswordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  successDiv.style.display = 'none';
  errorDiv.style.display = 'none';

  // Validaciones del cliente
  if (newPassword !== confirmPassword) {
    errorDiv.textContent = 'Las contraseñas nuevas no coinciden.';
    errorDiv.style.display = 'flex';
    return;
  }

  if (newPassword.length < 6) {
    errorDiv.textContent = 'La nueva contraseña debe tener al menos 6 caracteres.';
    errorDiv.style.display = 'flex';
    return;
  }

  try {
    const res = await fetch('/api/settings/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword })
    });

    const data = await res.json();

    if (res.ok) {
      successDiv.style.display = 'flex';
      currentPasswordInput.value = '';
      newPasswordInput.value = '';
      confirmPasswordInput.value = '';
    } else {
      throw new Error(data.error || 'Error al cambiar contraseña.');
    }
  } catch (err) {
    errorDiv.textContent = err.message;
    errorDiv.style.display = 'flex';
  }
}

// CERRAR SESIÓN: Remueve la credencial del almacenamiento temporal y recarga el navegador
function logout() {
  sessionStorage.removeItem('pymeshield_auth');
  if (window.location.hostname.includes('github.io') || window.location.protocol === 'file:') {
    sessionStorage.setItem('pymeshield_logged_out', 'true');
  }
  window.location.reload();
}

// ==========================================
// 2. INICIALIZACIÓN Y CARGA DE DATOS (DASHBOARD)
// ==========================================

// INICIALIZACIÓN GENERAL DEL CLIENTE
async function initApp() {
  await fetchSettings();       // Carga políticas avanzadas, Zero-Trust y licenciamiento
  await loadDashboardData();   // Obtiene dispositivos, alertas y auditorías
  
  // Mostrar el widget del asistente virtual una vez logueado
  const widget = document.getElementById('assistant-widget');
  if (widget) widget.style.display = 'block';
  
  // Recuperar estado persistente del colapso del sidebar
  const isSidebarCollapsed = localStorage.getItem('pymeshield_sidebar_collapsed') === 'true';
  if (isSidebarCollapsed) {
    document.body.classList.add('sidebar-collapsed');
  }
  
  // Recuperar estado persistente del Modo NOC desde el almacenamiento del disco del navegador
  const isNocActive = localStorage.getItem('pymeshield_noc_mode') === 'true';
  const nocToggle = document.getElementById('noc-toggle');
  if (nocToggle) {
    nocToggle.checked = isNocActive;
    toggleNocMode(isNocActive);
  }
}

// CARGAR CONFIGURACIÓN DESDE EL BACKEND
async function fetchSettings() {
  try {
    const res = await fetch('/api/settings');
    const settings = await res.json();
    
    // Sincronizamos los interruptores (toggles) del frontend con los valores persistentes del servidor
    document.getElementById('demo-toggle').checked = settings.demoMode;
    
    const ztToggle = document.getElementById('zt-toggle');
    const webhookUrlInput = document.getElementById('webhook-url');
    if (ztToggle) ztToggle.checked = !!settings.zeroTrustMode;
    if (webhookUrlInput) webhookUrlInput.value = settings.webhookUrl || '';

    // ACTUALIZACIÓN DE INTERFAZ POR LICENCIA COMERCIAL (WOW Factor)
    licenseStatus = settings.licenseStatus || 'Demo';
    const badge = document.getElementById('license-status-badge');
    const notice = document.getElementById('license-notice');
    const keyInput = document.getElementById('license-key-input');
    
    if (badge && notice) {
      if (licenseStatus === 'Premium') {
        // Si tiene licencia Enterprise, removemos límites visuales e inhabilitamos el formulario de activación
        badge.textContent = 'Licencia Enterprise Activa';
        badge.className = 'badge green';
        notice.style.display = 'none';
        if (keyInput) {
          keyInput.value = settings.licenseKey || 'PYMESHIELD-777-PREMIUM';
          keyInput.disabled = true;
        }
        const licenseForm = document.getElementById('license-form');
        if (licenseForm) {
          const btn = licenseForm.querySelector('button');
          if (btn) btn.disabled = true;
        }
      } else {
        // Si no tiene licencia, recordamos la restricción de 5 dispositivos en modo Demo
        badge.textContent = 'Licencia Demo / Evaluación';
        badge.className = 'badge amber';
        notice.style.display = 'block';
        if (keyInput) {
          keyInput.value = '';
          keyInput.disabled = false;
        }
        const licenseForm = document.getElementById('license-form');
        if (licenseForm) {
          const btn = licenseForm.querySelector('button');
          if (btn) btn.disabled = false;
        }
      }
    }
  } catch (error) {
    console.error('Error cargando configuración:', error);
  }
}

// CONMUTAR MODO DEMO ACADÉMICA: Envía directiva de cambio y recarga el dashboard
async function toggleDemoMode() {
  try {
    const res = await fetch('/api/settings/toggle-demo', { method: 'POST' });
    const data = await res.json();
    document.getElementById('demo-toggle').checked = data.demoMode;
    
    // Forzamos la recarga de los datos para pintar la red simulada o la red física real al instante
    loadDashboardData();
  } catch (error) {
    console.error('Error al cambiar modo:', error);
  }
}

// CARGAR TODA LA INFORMACIÓN DEL DASHBOARD (PROCESAMIENTO ASÍNCRONO PARALELO)
async function loadDashboardData() {
  try {
    // Realizamos consultas paralelas al servidor usando Promise.all para optimizar la velocidad de carga de red
    const [devicesRes, alertsRes, recsRes] = await Promise.all([
      fetch('/api/devices'),
      fetch('/api/alerts'),
      fetch('/api/recommendations')
    ]);

    const devices = await devicesRes.json();
    const alerts = await alertsRes.json();
    const recommendations = await recsRes.json();

    allDevices = devices;
    
    // Renderizado de las diferentes capas del panel
    filterAndRenderDevices();             // Tabla de dispositivos
    renderPorts(devices);                 // Puertos vulnerables expuestos
    renderAlerts(alerts);                 // Historial de alertas críticas
    renderRecommendations(recommendations); // Recomendaciones sugeridas
    renderWhitelist(devices);             // Tabla de Lista Blanca en Ajustes

    // ALERTA DE INTRUSO (Whitelisting Banner): 
    // Filtramos dispositivos activos sospechosos (isAuthorized = false)
    const unauthorizedActive = devices.filter(d => !d.isAuthorized && d.status === 'Activo' && d.mac !== 'LOCAL-HOST-DEV' && d.id !== 'gateway-router-node');
    const banner = document.getElementById('intruder-alert-banner');
    if (banner) {
      if (unauthorizedActive.length > 0) {
        document.getElementById('intruder-alert-text').textContent = `¡ALERTA DE SEGURIDAD! Se ha detectado ${unauthorizedActive.length} dispositivo(s) sospechoso(s) / no autorizado(s) en la red local.`;
        banner.style.display = 'flex';
      } else {
        banner.style.display = 'none';
      }
    }
    
    renderTopologyMap(devices);    // Dibujado del mapa de red SVG interactivo
    updateMetrics(devices, alerts); // Recálculo del score y métricas generales
    loadTrendChart();              // Gráfica de tendencia histórica lineal
    loadAuditLogs();               // Bitácora física de logs de base de datos
    
    // Sincroniza indicador de estado del footer de la barra lateral
    const activeCount = devices.filter(d => d.status === 'Activo').length;
    document.getElementById('network-status').textContent = `Red activa · ${activeCount} conectados`;

  } catch (error) {
    console.error('Error cargando datos del dashboard:', error);
  }
}

// ==========================================
// 3. COMPONENTES Y CAPAS DE RENDERIZACIÓN DE LA UI
// ==========================================

// RENDERIZAR TABLA DE DISPOSITIVOS
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
    
    // Visualización: si tiene un alias amigable asignado por el administrador, se destaca con un escudo
    const displayName = d.alias ? `🛡️ ${d.alias}` : d.hostname;
    const subLabel = d.alias ? `${d.hostname} | ${d.vendor || 'Dispositivo Genérico'}` : (d.vendor || 'Dispositivo Genérico');

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <strong>${displayName}</strong>
        <div class="device-sub">${subLabel}</div>
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
        <!-- Botón interactivo de Lista Blanca: cambia su estilo y texto según la confianza asignada -->
        <button class="btn-action ${!isAuthorized ? 'unauthorized' : ''}" onclick="toggleAuthorize('${d.id}', '${d.alias || ''}', ${isAuthorized})">
          ${isAuthorized ? '🛡️ Autorizado' : '⚠️ Autorizar'}
        </button>
      </td>
      <td style="text-align: right">
        <!-- Control de contención Firewall: el host local que aloja la app (Admin) no se puede auto-bloquear por seguridad -->
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

// RENDERIZAR TABLA DE PUERTOS EXPUESTOS
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
    portsList.innerHTML = `<div class="empty-state">No se han detectado puertos vulnerables.</div>`;
    return;
  }

  // Desplegamos únicamente los primeros 5 puertos de riesgo para evitar saturar visualmente el panel lateral
  exposedPorts.slice(0, 5).forEach(p => {
    const item = document.createElement('div');
    item.className = 'port-item';
    
    // Barra indicadora de nivel de riesgo porcentual
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
      <!-- Botón educativo de consulta CVE al microsegundo -->
      <button class="cve-btn" onclick="showCveDetails(${p.portNumber}, '${p.serviceName}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 12px; height: 12px;"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
        ¿Qué peligro representa?
      </button>
      <span class="badge ${colorClass}" style="font-size: 10px; padding: 2px 6px;">${p.riskLevel}</span>
    `;
    item.title = `Servicio expuesto en ${p.hostname} (${p.ip})`;
    portsList.appendChild(item);
  });
}

// RENDERIZAR FEED DE ALERTAS RECIENTES
function renderAlerts(alerts) {
  const alertsList = document.getElementById('alerts-list');
  alertsList.innerHTML = '';

  if (alerts.length === 0) {
    alertsList.innerHTML = `<div class="empty-state">No hay alertas de seguridad en el historial.</div>`;
    return;
  }

  // Muestra las últimas 4 alertas ordenadas cronológicamente por severidad
  alerts.slice(0, 4).forEach(a => {
    const item = document.createElement('div');
    const colorClass = a.riskLevel === 'Rojo' ? 'red' : a.riskLevel === 'Amarillo' ? 'amber' : 'blue';
    
    // Selección del ícono SVG representativo según la severidad del evento
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

// RENDERIZAR RECOMENDACIONES TÉCNICAS (NIST)
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

// ==========================================
// 4. MÉTRICAS DINÁMICAS Y FÓRMULAS DEL SCORE
// ==========================================

// ACTUALIZACIÓN DINÁMICA DEL SCORE DE SEGURIDAD (Algoritmo Tesis)
function updateMetrics(devices, alerts) {
  const activeCount = devices.filter(d => d.status === 'Activo').length;
  
  // Suma total de puertos expuestos activos
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

  // FÓRMULA DE CÁLCULO DE SCORE DE SEGURIDAD (Sobre base 100):
  // - Restamos 15 puntos por cada dispositivo sospechoso no autorizado conectado.
  // - Restamos 10 puntos por cada dispositivo activo con riesgo Alto general.
  // - Restamos 2 puntos por cada puerto TCP de riesgo abierto en la red.
  let score = 100;
  const unauthorizedCount = devices.filter(d => !d.isAuthorized).length;
  let criticalCount = devices.filter(d => d.riskLevel === 'Alto').length;

  score -= (unauthorizedCount * 15);
  score -= (criticalCount * 10);
  score -= (riskPortsCount * 2);
  
  if (score < 10) score = 10; // Cota inferior mínima de protección de diseño

  // Pintamos el score calculado en la UI
  document.getElementById('m-score').textContent = score;
  document.getElementById('score-num').textContent = score;

  const scoreSub = document.getElementById('m-score-sub');
  const card = document.getElementById('score-card');
  const circle = document.getElementById('score-circle');

  // ANIMACIÓN DE ANILLO SVG: Modificación en base a la circunferencia (2 * PI * r = 150)
  const circumference = 150;
  const offset = circumference - (score / 100) * circumference;
  circle.style.strokeDasharray = circumference;
  circle.style.strokeDashoffset = offset;

  // Cambios de colores dinámicos del panel según la severidad del score (Verde, Amarillo o Rojo)
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

// FORMATEAR TIMESTAMP LEGIBLE DE FORMA RELATIVA
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

// ==========================================
// 5. APIS BACKEND DE ACCIÓN DIRECTA (FIREWALL Y LISTA BLANCA)
// ==========================================

// ENVIAR SOLICITUD DE AISLAMIENTO FIREWALL (Contención de Intrusos)
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

// RENDERIZAR TABLA DE LISTA BLANCA EN AJUSTES
function renderWhitelist(devices) {
  const tbody = document.getElementById('whitelist-tbody');
  if (!tbody) return;

  const authorized = devices.filter(d => d.isAuthorized);

  if (authorized.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 12px; color: var(--muted); font-size: 12px;">No hay dispositivos autorizados en la Lista Blanca aún.</td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  authorized.forEach(d => {
    const isLocal = d.mac === 'LOCAL-HOST-DEV';
    const row = document.createElement('tr');
    row.style.borderBottom = '1px solid var(--border)';
    row.innerHTML = `
      <td style="padding: 8px; color: #fff;"><strong>🛡️ ${d.alias || d.hostname}</strong></td>
      <td style="padding: 8px; color: var(--muted);">${d.ip}</td>
      <td style="padding: 8px; font-family: var(--font-code); color: var(--muted);">${d.mac}</td>
      <td style="padding: 8px; text-align: right;">
        <!-- Botón rápido para revocar la confianza local -->
        ${isLocal ? '<span style="font-size: 10px; color: var(--muted)">Admin</span>' : `
          <button class="btn-action unauthorized" onclick="toggleAuthorize('${d.id}', '${d.alias || ''}', true, true)" style="font-size: 10px; padding: 4px 8px; border-radius: var(--radius-sm); cursor: pointer; transition: all 0.2s;">
            Revocar
          </button>
        `}
      </td>
    `;
    tbody.appendChild(row);
  });
}

// GESTIÓN INTERACTIVA DE AUTORIZACIÓN Y ALIAS (LISTA BLANCA)
async function toggleAuthorize(id, currentAlias = '', isAuth = false, forceRevoke = false) {
  let alias = null;
  let authorize = !isAuth;

  if (forceRevoke) {
    // Escenario 1: Revocación forzada desde la tabla de Ajustes
    const confirmRevoke = confirm("¿Estás seguro de que deseas revocar la autorización de este dispositivo? Se tratará como sospechoso en la red.");
    if (!confirmRevoke) return;
    authorize = false;
    alias = ""; // Borramos el alias para dejarlo vacío
  } else if (!isAuth) {
    // Escenario 2: Asignación de confianza y nombre amigable (Whitelisting de dispositivo nuevo)
    const val = prompt("Ingresa un nombre amigable o alias para este dispositivo (ej: Computador de Claudia):", currentAlias || "");
    if (val === null) return; // Cancelar acción
    alias = val.trim();
    authorize = true;
  } else {
    // Escenario 3: Modificación interactiva de dispositivo ya autorizado (Renombrar o Revocar escribiendo palabra clave)
    const val = prompt(`Este dispositivo ya está autorizado como "${currentAlias}".\n\n- Para cambiar su nombre/alias, ingresa el nuevo nombre.\n- Para revocar su autorización y marcarlo como sospechoso, escribe la palabra 'REVOCAR':`, currentAlias);
    if (val === null) return; // Cancelar acción
    
    if (val.trim().toUpperCase() === 'REVOCAR') {
      authorize = false;
      alias = "";
    } else {
      alias = val.trim();
      authorize = true;
      if (!alias) {
        alert("El nombre no puede estar vacío. Si deseas desautorizarlo escribe 'REVOCAR'.");
        return;
      }
    }
  }

  try {
    const res = await fetch('/api/devices/toggle-authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, alias, authorize })
    });
    if (res.ok) {
      loadDashboardData();
    }
  } catch (error) {
    console.error('Error al autorizar dispositivo:', error);
  }
}

// MARCAR TODAS LAS ALERTAS LEÍDAS
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

// INICIAR ESCANEO DE RED MANUAL (Petición HTTP no bloqueante)
async function runScan() {
  const btn = document.getElementById('scan-btn');
  const icon = document.getElementById('scan-icon');
  
  btn.disabled = true;
  btn.style.opacity = '0.6';
  icon.classList.add('spin'); // Activamos rotación CSS del icono de lupa

  // Mostramos visualmente la barra de progreso de red
  document.getElementById('scan-progress-bar').classList.add('active');
  document.getElementById('progress-msg').textContent = 'Iniciando conexión con el motor de escaneo...';
  document.getElementById('progress-fill').style.width = '0%';
  document.getElementById('progress-val').textContent = '0%';

  try {
    const res = await fetch('/api/scan', { method: 'POST' });
    if (!res.ok) {
      throw new Error('El motor de escaneo ya se encuentra ocupado.');
    }

    // Si estamos en modo de demostración estática, simulamos el progreso del escaneo en el cliente
    if (isStaticDemo) {
      const progressFill = document.getElementById('progress-fill');
      const progressVal = document.getElementById('progress-val');
      const progressMsg = document.getElementById('progress-msg');
      
      const steps = [
        { percent: 20, msg: 'Realizando barrido ARP en subred local...' },
        { percent: 50, msg: 'Enviando sondas UDP para despertar dispositivos móviles...' },
        { percent: 85, msg: 'Auditando puertos críticos en hosts descubiertos...' },
        { percent: 100, msg: 'Escaneo completado. Sincronizando inventario...' }
      ];
      
      let stepIdx = 0;
      const interval = setInterval(() => {
        if (stepIdx < steps.length) {
          const step = steps[stepIdx];
          progressFill.style.width = `${step.percent}%`;
          progressVal.textContent = `${step.percent}%`;
          progressMsg.textContent = step.msg;
          stepIdx++;
        } else {
          clearInterval(interval);
          
          const now = new Date();
          const lastScanElem = document.getElementById('last-scan');
          if (lastScanElem) {
            lastScanElem.textContent = `Último escaneo: hace un momento · ${now.toLocaleTimeString()}`;
          }
          
          // Reactivar botón y ocultar barra
          btn.disabled = false;
          btn.style.opacity = '1';
          icon.classList.remove('spin');
          document.getElementById('scan-progress-bar').classList.remove('active');
          
          // Refrescar inventario y alertas
          loadDashboardData();
        }
      }, 500); // Duración total de la animación: 2 segundos
    }
  } catch (error) {
    alert(error.message);
    btn.disabled = false;
    btn.style.opacity = '1';
    icon.classList.remove('spin');
    document.getElementById('scan-progress-bar').classList.remove('active');
  }
}

// DESCARGAR REPORTE CUMPLIMIENTO PDF (Abre endpoint nativo del backend en nueva pestaña)
function downloadPDF() {
  window.open('/api/reports/pdf', '_blank');
}

// ==========================================
// 6. COMUNICACIÓN DUPLEX POR WEBSOCKETS (WS)
// ==========================================

// CONECTAR WEBSOCKET: Escucha eventos reactivos empujados por el servidor server.js
function connectWebSocket() {
  if (window.location.hostname.includes('github.io') || window.location.protocol === 'file:') {
    console.log('[PymeShield Demo] Omitiendo canal de WebSocket en entorno estático.');
    return;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;
  
  socket = new WebSocket(wsUrl);

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    // EVENTO A: Progreso del motor de escaneo UDP/ARP en caliente
    if (data.type === 'progress') {
      document.getElementById('scan-progress-bar').classList.add('active');
      document.getElementById('progress-msg').textContent = data.message;
      document.getElementById('progress-fill').style.width = `${data.percent}%`;
      document.getElementById('progress-val').textContent = `${data.percent}%`;
    }
    
    // EVENTO B: Escaneo completado
    if (data.type === 'complete') {
      const now = new Date();
      document.getElementById('last-scan').textContent = `Último escaneo: hace un momento · ${now.toLocaleTimeString()}`;

      // Si el escaneo fue silencioso en segundo plano, simplemente recargamos datos sin alterar la interfaz
      if (data.isBackground) {
        loadDashboardData();
        return;
      }

      // Si fue escaneo manual, animamos la barra al 100% y la ocultamos suavemente tras 2 segundos
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

    // EVENTO C: Se gatilló una alerta crítica (ej: simulación de intrusión o nuevo host sospechoso)
    if (data.type === 'alert_new') {
      // Reproduce los sirena beeps acústicos si está el modo NOC activo y actualiza paneles
      playAlarmBeeps();
      loadDashboardData();
    }

    // EVENTO D: Nueva cotización recibida de la Landing Page
    if (data.type === 'quote_new') {
      if (currentTab === 'cotizaciones') {
        loadQuotes();
      }
      // Sonar feedback sonoro corto de éxito
      if (audioCtx && audioCtx.state === 'running') {
        const now = audioCtx.currentTime;
        playBeep(880, 0.08, now);
        playBeep(1046.5, 0.12, now + 0.08);
      }
    }
  };

  // Re-conexión resiliente automatizada ante caídas accidentales de red física o cierres del host
  socket.onclose = () => {
    console.log('WebSocket cerrado. Reconectando en 5 segundos...');
    setTimeout(connectWebSocket, 5000);
  };
}

// ==========================================
// 7. MÓDULO SPA (ENRUTAMIENTO LOCAL DE PESTAÑAS)
// ==========================================

// CAMBIAR PESTAÑA (SPA routing)
function switchTab(tab, element) {
  currentTab = tab;
  
  // Limpiamos la clase 'active' de todos los items de navegación y la inyectamos en la actual
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => item.classList.remove('active'));
  element.classList.add('active');

  const title = document.getElementById('section-title');
  
  // Acceso a los diferentes divs contenedores de la UI
  const metrics = document.getElementById('metrics-section');
  const trend = document.getElementById('trend-container');
  const devices = document.getElementById('devices-container');
  const sidePanels = document.getElementById('side-panels');
  const recommendations = document.getElementById('recommendations-container');
  const nist = document.getElementById('nist-container');
  const config = document.getElementById('config-container');
  const audit = document.getElementById('audit-container');
  const ports = document.getElementById('ports-container');
  const alerts = document.getElementById('alerts-container');
  const cotizaciones = document.getElementById('cotizaciones-container');
  
  // Configuraciones iniciales por defecto (Visualización global de inicio)
  metrics.style.display = 'grid';
  if (trend) trend.style.display = 'block';
  devices.style.display = 'block';
  sidePanels.style.display = 'flex';
  recommendations.style.display = 'block';
  if (nist) nist.style.display = 'none';
  if (config) config.style.display = 'none';
  if (audit) audit.style.display = 'none';
  if (ports) ports.style.display = 'block';
  if (alerts) alerts.style.display = 'block';
  if (cotizaciones) cotizaciones.style.display = 'none';

  // Lógica selectiva de visualización SPA:
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
    if (ports) ports.style.display = 'block';
    if (alerts) alerts.style.display = 'none';
  } else if (tab === 'alertas') {
    title.textContent = 'Panel de Alertas y Amenazas';
    metrics.style.display = 'none';
    if (trend) trend.style.display = 'none';
    devices.style.display = 'none';
    recommendations.style.display = 'none';
    if (ports) ports.style.display = 'none';
    if (alerts) alerts.style.display = 'block';
  } else if (tab === 'audit') {
    title.textContent = 'Bitácora de Actividad y Auditoría';
    metrics.style.display = 'none';
    if (trend) trend.style.display = 'none';
    devices.style.display = 'none';
    sidePanels.style.display = 'none';
    recommendations.style.display = 'none';
    if (audit) {
      audit.style.display = 'block';
      loadAuditLogs(); // Cargamos logs en vivo desde la base de datos SQLite
    }
  } else if (tab === 'recomendaciones') {
    title.textContent = 'Plan de Acción y Recomendaciones';
    metrics.style.display = 'none';
    if (trend) trend.style.display = 'none';
    devices.style.display = 'none';
    sidePanels.style.display = 'none';
  } else if (tab === 'nist') {
    title.textContent = 'Alineamiento con Marco NIST CSF 2.0';
    metrics.style.display = 'none';
    if (trend) trend.style.display = 'none';
    devices.style.display = 'none';
    sidePanels.style.display = 'none';
    recommendations.style.display = 'none';
    if (nist) nist.style.display = 'block';
  } else if (tab === 'config') {
    title.textContent = 'Ajustes de Acceso de Seguridad';
    metrics.style.display = 'none';
    if (trend) trend.style.display = 'none';
    devices.style.display = 'none';
    sidePanels.style.display = 'none';
    recommendations.style.display = 'none';
    if (config) config.style.display = 'block';
  } else if (tab === 'cotizaciones') {
    title.textContent = 'Solicitudes de Cotización Recibidas';
    metrics.style.display = 'none';
    if (trend) trend.style.display = 'none';
    devices.style.display = 'none';
    sidePanels.style.display = 'none';
    recommendations.style.display = 'none';
    if (cotizaciones) cotizaciones.style.display = 'block';
    loadQuotes(); // Carga las cotizaciones
  }
}


// BÚSQUEDA Y FILTRADO DE DISPOSITIVOS EN EL CLIENTE
function filterAndRenderDevices() {
  const searchInput = document.getElementById('device-search');
  const filterSelect = document.getElementById('device-filter');
  
  const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const filterValue = filterSelect ? filterSelect.value : 'todos';

  const filtered = allDevices.filter(d => {
    // 1. Filtro del buscador en vivo (IP, MAC, Hostname, Alias o Fabricante)
    const matchesSearch = 
      d.ip.toLowerCase().includes(searchQuery) ||
      (d.mac && d.mac.toLowerCase().includes(searchQuery)) ||
      d.hostname.toLowerCase().includes(searchQuery) ||
      (d.alias && d.alias.toLowerCase().includes(searchQuery)) ||
      (d.vendor && d.vendor.toLowerCase().includes(searchQuery));

    if (!matchesSearch) return false;

    // 2. Filtro del combo selectivo
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

    return true; 
  });

  renderDevices(filtered);
}

// Escuchadores de eventos para los filtros
function onDeviceSearchInput() {
  filterAndRenderDevices();
}

function onDeviceFilterChange() {
  filterAndRenderDevices();
}

// ==========================================
// 8. DIBUJADO DE LA TENDENCIA TEMPORAL (SVG)
// ==========================================

// DIBUJAR GRÁFICA DE TENDENCIA HISTÓRICA EN SVG
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
    
    // Limpiamos los elementos previos del contenedor SVG
    svg.innerHTML = '';

    // Declaramos degradados y efectos de brillo neón usando contenedores nativos defs de SVG
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

    // 1. Dibujamos las líneas horizontales de grilla de fondo (0%, 50% y 100% de seguridad)
    const gridScores = [0, 50, 100];
    gridScores.forEach(gScore => {
      const y = height - paddingY - (gScore / 100) * (height - 2 * paddingY);
      
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(paddingX));
      line.setAttribute('y1', String(y));
      line.setAttribute('x2', String(width - paddingX));
      line.setAttribute('y2', String(y));
      line.setAttribute('class', 'chart-grid-line');
      svg.appendChild(line);

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

    // Calculamos las coordenadas x,y de cada punto temporal
    history.forEach((h, index) => {
      const x = paddingX + (index / Math.max(1, pointsCount - 1)) * (width - 2 * paddingX);
      const y = height - paddingY - (h.score / 100) * (height - 2 * paddingY);
      
      let timeStr = '';
      let dateStr = '';
      try {
        timeStr = new Date(h.timestamp).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
        dateStr = new Date(h.timestamp).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
      } catch (dateErr) {
        // Rutina de respaldo (fallback) por si falla la configuración de idioma local de red
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

    // 2. Rellenamos el área inferior del gráfico aplicando el degradado neón
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

    // 3. Trazamos la línea principal de tendencia
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
      
      // Animamos el dibujado de la línea mediante transición CSS (stroke-dashoffset)
      const pathLength = points.length * 150; 
      path.style.strokeDasharray = String(pathLength);
      path.style.strokeDashoffset = String(pathLength);
      path.style.transition = 'stroke-dashoffset 1.5s ease-in-out';
      svg.appendChild(path);
      
      // Activamos el redibujado para forzar que corra la transición visual
      setTimeout(() => { path.style.strokeDashoffset = '0'; }, 50);
    }

    // 4. Pintamos círculos (puntos) y textos sobre cada elemento
    points.forEach((pt, index) => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', String(pt.x));
      circle.setAttribute('cy', String(pt.y));
      circle.setAttribute('r', '5');
      
      // Color del punto basado en el score particular
      let dotColor = 'var(--green)';
      if (pt.score < 70) dotColor = 'var(--red)';
      else if (pt.score < 90) dotColor = 'var(--amber)';

      circle.setAttribute('fill', dotColor);
      circle.setAttribute('stroke', '#fff');
      circle.setAttribute('stroke-width', '2');
      circle.setAttribute('class', 'chart-dot');
      svg.appendChild(circle);

      // Texto del score sobre el punto
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

      // Texto de fecha e IP debajo de la grilla
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

// ==========================================
// 9. MODAL CVE DETALLADO Y TRADUCCIÓN DIDÁCTICA
// ==========================================

// MOSTRAR EXPLICADOR DE RIESGOS EN ESPAÑOL SIMPLE (Mapeo de Amenazas CVE)
function showCveDetails(portNumber, serviceName) {
  const modal = document.getElementById('cve-modal');
  const portInfo = document.getElementById('cve-port-info');
  const simpleDesc = document.getElementById('cve-simple-desc');
  const codeRef = document.getElementById('cve-code-ref');

  if (!modal || !portInfo || !simpleDesc || !codeRef) return;

  portInfo.textContent = `Puerto :${portNumber} (${serviceName})`;
  portInfo.className = 'badge red';

  let description = '';
  let refCode = '';

  // Diccionario didáctico que traduce los números de puertos técnicos en explicaciones simples para Claudia
  switch (Number(portNumber)) {
    case 22:
      description = 'Este puerto (SSH) permite a tu informático o personal de soporte conectarse a distancia para darte asistencia técnica. Si está abierto o desprotegido, espías de internet podrían intentar descifrar tu contraseña, interceptar tu conexión o suplantar la identidad de tu técnico, pudiendo ver o robar lo que estás haciendo.';
      refCode = 'CVE-2023-48795 (Vulnerabilidad Terrapin)';
      break;
    case 53:
      description = 'El puerto 53 se utiliza para el servicio DNS, que es la libreta de direcciones de internet de tu red. Si está expuesto innecesariamente, atacantes podrían redirigir a los usuarios de tu red a páginas web falsas o bancos clonados (Secuestro de DNS).';
      refCode = 'Hardening DNS / Mitigación de DNS Amplification DDoS';
      break;
    case 80:
      description = 'El puerto 80 se usa para páginas web sin cifrar (HTTP). Esto significa que toda la información que transmitas viaja en "texto claro" por la red. Si un atacante o vecino malicioso se conecta a tu red Wi-Fi, podría interceptar fácilmente y leer tus contraseñas, correos y datos confidenciales sin que te des cuenta.';
      refCode = 'Exposición de Canal No Seguro (Tráfico HTTP sin SSL/TLS)';
      break;
    case 139:
      description = 'Este puerto (NetBIOS) se utiliza para el intercambio de archivos antiguos en Windows. Al estar abierto, expone información confidencial de tu computador como nombres de usuario, nombres de carpetas y detalles del sistema a posibles intrusos.';
      refCode = 'Mitigación de NetBIOS Spoofing / Hardening de Protocolos Heredados';
      break;
    case 631:
      description = 'Este puerto (IPP) es usado por las impresoras en red para aceptar trabajos de impresión. Si está expuesto, atacantes podrían enviar impresiones falsas infinitas, saturar la impresora o, en casos graves, explotar fallos en el sistema de impresión para tomar control del equipo.';
      refCode = 'Impresión No Autorizada / CVE-2024-47176 (Vulnerabilidad CUPS)';
      break;
    case 443:
      description = 'Este puerto es para conexiones web seguras (HTTPS). Aunque es normal tenerlo abierto para dar servicios web, si el servidor utiliza protocolos obsoletos o tiene fallos de configuración, un atacante remoto podría leer partes de la memoria del sistema, extrayendo claves de seguridad de forma silenciosa.';
      refCode = 'CVE-2014-0160 (Vulnerabilidad Heartbleed) / Hardening SSL';
      break;
    case 445:
      description = 'Es una vulnerabilidad extremadamente crítica (servicio de carpetas compartidas SMB). Permite que virus automatizados secuestren todos tus archivos de forma inmediata (fotos, documentos, planillas de contabilidad) bloqueando tu computador y exigiéndote un pago en dinero (Ransomware WannaCry).';
      refCode = 'CVE-2017-0144 (Vulnerabilidad EternalBlue / WannaCry)';
      break;
    case 1433:
      description = 'Este puerto se usa para la base de datos Microsoft SQL Server. Al estar expuesto, hackers de internet intentarán hackear tu clave de forma robótica y continua (fuerza bruta). Si lo logran, se adueñarán de toda tu información interna de clientes, cobros o alumnos.';
      refCode = 'Seguridad de Base de Datos / Mitigación de Fuerza Bruta MSSQL';
      break;
    case 3306:
      description = 'Este puerto se utiliza para bases de datos MySQL/MariaDB. Dejarlo expuesto a la red sin protección de cortafuegos permite que atacantes externos traten de robar la información sensible de tu negocio o inyectar código dañino en tu web.';
      refCode = 'Exposición Directa de Base de Datos MySQL';
      break;
    case 3389:
      description = 'Este puerto (Escritorio Remoto - RDP) permite controlar la pantalla de tu computador a distancia como si estuvieras sentado frente a él. Si queda expuesto a internet con claves sencillas, un ciberdelincuente puede ingresar, adueñarse de tus cuentas bancarias, robar tus bases de datos y borrar toda tu información.';
      refCode = 'CVE-2019-0708 (Vulnerabilidad BlueKeep)';
      break;
    case 5000:
      description = 'Este puerto da acceso al panel de administración de tu servidor de almacenamiento NAS. Si es hackeado, los atacantes podrán acceder a tus respaldos históricos, borrar copias de seguridad del negocio y secuestrar tus archivos confidenciales.';
      refCode = 'Seguridad NAS / Hardening de Interfaces de Administración';
      break;
    case 5900:
      description = 'Este puerto (VNC) permite la visualización remota de la pantalla de un computador. A diferencia de RDP, el tráfico de VNC muchas veces viaja sin cifrar o tiene claves débiles, lo que permite que espías en la red vean todo lo que escribes en tiempo real.';
      refCode = 'Exposición de Control Remoto VNC sin Cifrado';
      break;
    case 8080:
      description = 'Este puerto se usa como alternativa web (HTTP alternativo). Al igual que el puerto 80, transmite datos sin cifrado. Si aloja paneles de control de routers o cámaras sin actualizar, atacantes podrían tomar control del dispositivo físicamente.';
      refCode = 'Hardening de Puertos de Gestión Alternativos';
      break;
    case 9100:
      description = 'El puerto 9100 (JetDirect) es usado para enviar documentos directos a imprimir. No requiere contraseña por defecto, por lo que cualquier intruso en la red Wi-Fi podría mandar a imprimir miles de páginas de spam o alterar los ajustes de la impresora.';
      refCode = 'Exposición de Puerto RAW de Impresión (JetDirect)';
      break;
    default:
      description = 'Este puerto de red está expuesto y aceptando conexiones externas. En ciberseguridad, cada puerto abierto representa una "puerta de entrada" para posibles atacantes. Si el software asociado a este puerto no está actualizado a su última versión o usa contraseñas débiles, puede ser explotado para vulnerar la seguridad del negocio.';
      refCode = 'Políticas de Hardening de Puertos y Servicios Excesivos';
      break;
  }

  simpleDesc.textContent = description;
  codeRef.textContent = refCode;

  modal.style.display = 'flex';
}

function closeCveModal() {
  const modal = document.getElementById('cve-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// ==========================================
// 10. BITÁCORA DE ACTIVIDAD Y AUDITORÍA (SQLITE)
// ==========================================

// CARGAR BITÁCORA DE AUDITORÍA DESDE LA BASE DE DATOS SQLITE LOCAL
async function loadAuditLogs() {
  const tbody = document.getElementById('audit-tbody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/audit-logs');
    if (!res.ok) {
      throw new Error(`El servidor respondió con estado ${res.status}`);
    }
    const logs = await res.json();

    if (!Array.isArray(logs) || logs.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; color: var(--muted); padding: 30px;">
            No se han registrado eventos en la bitácora aún.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = '';
    logs.forEach(log => {
      const row = document.createElement('tr');

      // Formateamos la fecha en zona horaria de Chile
      let dateStr = '';
      try {
        const dateObj = new Date(log.timestamp);
        dateStr = dateObj.toLocaleString('es-CL', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
      } catch (e) {
        dateStr = log.timestamp;
      }

      // Clasificación semántica de eventos en español simple para la visualización del usuario
      let badgeClass = 'sys';
      let actionText = 'Sistema';
      
      const act = log.action;
      if (act.startsWith('AUTH_SUCCESS') || act === 'CREDENTIAL_CHANGE') {
        badgeClass = 'auth';
        actionText = 'Acceso Exitoso';
      } else if (act.startsWith('AUTH_FAIL') || act.startsWith('CREDENTIAL_CHANGE_FAIL') || act === 'AUTH_MFA_FAIL') {
        badgeClass = 'fail';
        actionText = 'Bloqueo / Fallo';
      } else if (act.startsWith('CONTAINMENT') || act.startsWith('POLICY_CHANGE') || act === 'AUTH_MFA_REQUEST') {
        badgeClass = 'alert';
        actionText = 'Seguridad';
      }

      row.innerHTML = `
        <td style="font-family: var(--font-code); font-size: 12px; color: var(--muted);">${dateStr}</td>
        <td><span class="audit-badge ${badgeClass}">${actionText}</span></td>
        <td style="font-size: 13px; color: var(--text); line-height: 1.4;">${log.details}</td>
        <td style="font-family: var(--font-code); font-size: 12px; text-align: right; color: var(--muted);">${log.ipAddress || '127.0.0.1'}</td>
      `;

      tbody.appendChild(row);
    });

  } catch (error) {
    console.error('Error al cargar bitácora de actividad:', error);
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; color: var(--red); padding: 30px;">
          Error al cargar bitácora: ${error.message}
        </td>
      </tr>
    `;
  }
}

// RESTABLECER SEMILLA TOTP (MFA): Desvincula el celular en caliente
async function resetMfa() {
  if (!confirm('¿Estás seguro de que deseas restablecer el Doble Factor (MFA)? Esto desvinculará tu teléfono de confianza actual y se requerirá escanear un nuevo código QR al volver a iniciar sesión.')) {
    return;
  }

  const successDiv = document.getElementById('reset-mfa-success');
  const errorDiv = document.getElementById('reset-mfa-error');

  successDiv.style.display = 'none';
  errorDiv.style.display = 'none';

  try {
    const res = await fetch('/api/settings/reset-mfa', { method: 'POST' });
    if (res.ok) {
      successDiv.style.display = 'flex';
      setTimeout(() => {
        logout(); // Forzamos desconexión tras restablecer
      }, 2000);
    } else {
      const data = await res.json();
      throw new Error(data.error || 'Error al restablecer MFA.');
    }
  } catch (err) {
    errorDiv.textContent = err.message;
    errorDiv.style.display = 'flex';
  }
}

// ACTIVACIÓN DE LICENCIA PREMIUM COMERCIAL
async function handleActivateLicense(event) {
  event.preventDefault();
  const keyInput = document.getElementById('license-key-input');
  const successDiv = document.getElementById('license-success');
  const errorDiv = document.getElementById('license-error');

  if (!keyInput) return;
  const key = keyInput.value.trim();

  successDiv.style.display = 'none';
  errorDiv.style.display = 'none';

  try {
    const res = await fetch('/api/settings/activate-license', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    });

    const data = await res.json();

    if (res.ok) {
      successDiv.style.display = 'flex';
      await fetchSettings();
      await loadDashboardData();
    } else {
      throw new Error(data.error || 'Error al validar la licencia.');
    }
  } catch (err) {
    errorDiv.textContent = err.message;
    errorDiv.style.display = 'flex';
  }
}

// GUARDAR POLÍTICAS DE ZERO-TRUST Y WEBHOOKS SOAR
async function handleSaveAdvancedSettings(event) {
  event.preventDefault();
  const ztToggle = document.getElementById('zt-toggle');
  const webhookUrlInput = document.getElementById('webhook-url');
  const successDiv = document.getElementById('adv-settings-success');
  const errorDiv = document.getElementById('adv-settings-error');

  successDiv.style.display = 'none';
  errorDiv.style.display = 'none';

  const zeroTrust = ztToggle ? ztToggle.checked : false;
  const webhook = webhookUrlInput ? webhookUrlInput.value.trim() : '';

  try {
    const res = await fetch('/api/settings/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zeroTrust, webhook })
    });

    const data = await res.json();

    if (res.ok) {
      successDiv.style.display = 'flex';
      await loadDashboardData();
    } else {
      throw new Error(data.error || 'Error al guardar las políticas.');
    }
  } catch (err) {
    errorDiv.textContent = err.message;
    errorDiv.style.display = 'flex';
  }
}

// PROBAR CONEXIÓN DEL WEBHOOK SIEM/SOAR EN CALIENTE
async function testWebhook() {
  const webhookUrlInput = document.getElementById('webhook-url');
  const successDiv = document.getElementById('adv-settings-success');
  const errorDiv = document.getElementById('adv-settings-error');

  successDiv.style.display = 'none';
  errorDiv.style.display = 'none';

  const webhook = webhookUrlInput ? webhookUrlInput.value.trim() : '';

  if (!webhook) {
    errorDiv.textContent = 'Por favor, ingresa una URL de webhook válida antes de probar.';
    errorDiv.style.display = 'flex';
    return;
  }

  try {
    const res = await fetch('/api/settings/test-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhook })
    });

    const data = await res.json();

    if (res.ok) {
      successDiv.textContent = '¡Prueba de Webhook enviada con éxito!';
      successDiv.style.display = 'flex';
      setTimeout(() => {
        successDiv.textContent = 'Políticas de seguridad actualizadas.';
      }, 4000);
    } else {
      throw new Error(data.error || 'Fallo al probar el webhook.');
    }
  } catch (err) {
    errorDiv.textContent = err.message;
    errorDiv.style.display = 'flex';
  }
}

// ==========================================
// 11. MAPA DE TOPOLOGÍA INTERACTIVO (WOW FACTOR)
// ==========================================

let selectedNodeId = null; // ID del nodo actualmente seleccionado
let audioCtx = null;       // Contexto de la Web Audio API para síntesis sonora

// DIBUJAR MAPA DE RED SVG EN BASE A FÓRMULAS TRIGONOMÉTRICAS
function renderTopologyMap(devices) {
  const svg = document.getElementById('topology-svg');
  if (!svg) return;

  // Filtramos para pintar únicamente hosts en línea o contención en firewall (Activos o Bloqueados)
  const activeDevices = devices.filter(d => d.status === 'Activo' || d.status === 'Bloqueado');

  svg.innerHTML = '';

  if (!activeDevices || activeDevices.length === 0) {
    svg.innerHTML = `
      <text x="400" y="190" fill="var(--muted)" font-size="14" text-anchor="middle" font-family="var(--font-main)">
        No hay dispositivos activos detectados para dibujar la red.
      </text>
    `;
    return;
  }

  // Gradientes lineales nativos de SVG
  svg.innerHTML += `
    <defs>
      <linearGradient id="link-grad-authorized" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="var(--blue)" stop-opacity="0.5"/>
        <stop offset="100%" stop-color="var(--green)" stop-opacity="0.5"/>
      </linearGradient>
      <linearGradient id="link-grad-suspicious" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="var(--blue)" stop-opacity="0.5"/>
        <stop offset="100%" stop-color="var(--amber)" stop-opacity="0.5"/>
      </linearGradient>
      <linearGradient id="link-grad-blocked" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="var(--blue)" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="var(--red)" stop-opacity="0.7"/>
      </linearGradient>
    </defs>
  `;

  // Coordenadas centrales fijas para la puerta de enlace (ZTE Gateway)
  const centerX = 400;
  const centerY = 165;

  // Identificamos el módem local
  let router = activeDevices.find(d => d.ip.endsWith('.1') || d.hostname.toLowerCase().includes('router') || d.hostname.toLowerCase().includes('gateway'));
  
  // Lista de hosts secundarios que orbitarán
  let orbiters = activeDevices.filter(d => d !== router);
  
  // CONTROL COMERCIAL DEMO: Si no tiene licencia Premium, ocultamos hosts si superan el límite de 5
  if (licenseStatus === 'Demo' && orbiters.length > 4) {
    const originalLength = orbiters.length;
    orbiters = orbiters.slice(0, 3);
    // Añadimos un nodo fantasma simulando el bloqueo comercial
    orbiters.push({
      id: 'locked-demo-node',
      hostname: '🔒 Licencia Requerida',
      ip: '192.168.1.xxx',
      mac: 'XX:XX:XX:XX:XX:XX',
      vendor: `Soporte Premium (${originalLength - 3} ocultos)`,
      isAuthorized: false,
      status: 'Inactivo',
      riskLevel: 'Alto',
      ports: [],
      isLockedDemo: true
    });
  }
  
  const routerNode = router || {
    id: 'gateway-router-node',
    hostname: 'Router ZTE (Gateway)',
    ip: '192.168.1.1',
    mac: '00:11:22:33:44:55',
    vendor: 'ZTE Corporation',
    isAuthorized: true,
    status: 'Activo',
    riskLevel: 'Bajo',
    ports: []
  };

  const rx = 270; // Radio horizontal del elipse de la órbita
  const ry = 100; // Radio vertical del elipse de la órbita
  const M = orbiters.length;

  // PASO 1: Dibujamos las líneas de enlace de red (líneas conectoras)
  orbiters.forEach((d, index) => {
    // FÓRMULA TRIGONOMÉTRICA DE ORBITADO ELÍPTICO:
    // x = centerX + rx * cos(ángulo)
    // y = centerY + ry * sin(ángulo)
    const angle = (index * 2 * Math.PI) / M;
    const x = centerX + rx * Math.cos(angle);
    const y = centerY + ry * Math.sin(angle);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(centerX));
    line.setAttribute('y1', String(centerY));
    line.setAttribute('x2', String(x));
    line.setAttribute('y2', String(y));

    // Estilos de la línea conector según postura Zero-Trust (Sólida, discontinua o roja de bloqueo)
    if (d.status === 'Bloqueado') {
      line.setAttribute('stroke', 'var(--red)');
      line.setAttribute('stroke-width', '2.5');
      line.setAttribute('class', 'topology-connection blocked');
    } else if (!d.isAuthorized) {
      line.setAttribute('stroke', 'var(--red)');
      line.setAttribute('stroke-width', '2');
      line.setAttribute('stroke-dasharray', '5,5'); // Línea rota/dashed
      line.setAttribute('class', 'topology-connection suspicious');
    } else {
      line.setAttribute('stroke', 'var(--green)');
      line.setAttribute('stroke-width', '1.5');
      line.setAttribute('class', 'topology-connection');
    }
    
    line.style.transition = 'all 0.5s ease';
    svg.appendChild(line);
  });

  // PASO 2: Dibujamos los nodos orbitales (dispositivos de red)
  orbiters.forEach((d, index) => {
    const angle = (index * 2 * Math.PI) / M;
    const x = centerX + rx * Math.cos(angle);
    const y = centerY + ry * Math.sin(angle);

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'topology-node-group');
    g.setAttribute('transform', `translate(${x}, ${y})`);
    g.style.cursor = 'pointer';

    // Evento de selección interactiva
    g.addEventListener('click', (e) => {
      e.stopPropagation();
      selectNode(d, x, y);
    });

    let colorClass = 'node-glow-authorized';
    let circleColor = 'var(--green)';
    if (d.status === 'Bloqueado') {
      colorClass = 'node-glow-blocked';
      circleColor = 'var(--red)';
    } else if (!d.isAuthorized) {
      colorClass = 'node-glow-blocked';
      circleColor = 'var(--red)';
    }

    // Dibujamos el círculo exterior neón pulsante
    const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bgCircle.setAttribute('cx', '0');
    bgCircle.setAttribute('cy', '0');
    bgCircle.setAttribute('r', '20');
    bgCircle.setAttribute('fill', 'rgba(10, 15, 30, 0.95)');
    bgCircle.setAttribute('stroke', circleColor);
    bgCircle.setAttribute('stroke-width', '2');
    bgCircle.setAttribute('class', `node-bg-circle ${colorClass}`);
    g.appendChild(bgCircle);

    // Detección inteligente de íconos (emojis) en base a hostname o fabricante (OUI IEEE)
    let nodeIcon = '💻';
    const hostLower = d.hostname.toLowerCase();
    const vendorLower = (d.vendor || '').toLowerCase();
    
    if (hostLower.includes('phone') || hostLower.includes('android') || hostLower.includes('iphone') || hostLower.includes('mobile') || vendorLower.includes('apple') || vendorLower.includes('samsung') || vendorLower.includes('huawei') || vendorLower.includes('xiaomi')) {
      nodeIcon = '📱';
    } else if (hostLower.includes('print') || vendorLower.includes('hp') || vendorLower.includes('epson') || vendorLower.includes('brother') || vendorLower.includes('canon')) {
      nodeIcon = '🖨️';
    } else if (hostLower.includes('tv') || hostLower.includes('smart') || vendorLower.includes('lg') || vendorLower.includes('sony') || vendorLower.includes('roku')) {
      nodeIcon = '📺';
    } else if (hostLower.includes('hacker') || hostLower.includes('rogue') || hostLower.includes('attack') || d.mac === 'EA:AA:BB:CC:DD:EE') {
      nodeIcon = '💀';
    } else if (d.mac === 'LOCAL-HOST-DEV') {
      nodeIcon = '🛡️';
    }

    const textIcon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textIcon.setAttribute('x', '0');
    textIcon.setAttribute('y', '5');
    textIcon.setAttribute('fill', '#ffffff');
    textIcon.setAttribute('font-size', '14');
    textIcon.setAttribute('text-anchor', 'middle');
    textIcon.textContent = nodeIcon;
    g.appendChild(textIcon);

    // Nombre amigable o hostname recortado si supera los 14 caracteres
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', '0');
    label.setAttribute('y', '34');
    label.setAttribute('fill', '#ffffff');
    label.setAttribute('font-size', '10');
    label.setAttribute('text-anchor', 'middle');
    let nameText = d.alias || d.hostname;
    if (nameText.length > 14) nameText = nameText.substring(0, 11) + '...';
    label.textContent = nameText;
    g.appendChild(label);

    // Dirección IP formateada
    const ipLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    ipLabel.setAttribute('x', '0');
    ipLabel.setAttribute('y', '45');
    ipLabel.setAttribute('fill', 'var(--muted)');
    ipLabel.setAttribute('font-size', '9');
    ipLabel.setAttribute('font-family', 'var(--font-code)');
    ipLabel.setAttribute('text-anchor', 'middle');
    ipLabel.textContent = d.ip;
    g.appendChild(ipLabel);

    svg.appendChild(g);
  });

  // PASO 3: Dibujamos el Router Central (Gateway) por encima de todo
  const routerG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  routerG.setAttribute('class', 'topology-node-group');
  routerG.setAttribute('transform', `translate(${centerX}, ${centerY})`);
  routerG.style.cursor = 'pointer';

  routerG.addEventListener('click', (e) => {
    e.stopPropagation();
    selectNode(routerNode, centerX, centerY);
  });

  const rCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  rCircle.setAttribute('cx', '0');
  rCircle.setAttribute('cy', '0');
  rCircle.setAttribute('r', '26');
  rCircle.setAttribute('fill', 'rgba(15, 23, 42, 0.98)');
  rCircle.setAttribute('stroke', 'var(--blue)');
  rCircle.setAttribute('stroke-width', '3');
  rCircle.setAttribute('class', 'node-bg-circle node-glow-router');
  routerG.appendChild(rCircle);

  const rText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  rText.setAttribute('x', '0');
  rText.setAttribute('y', '7');
  rText.setAttribute('fill', '#ffffff');
  rText.setAttribute('font-size', '20');
  rText.setAttribute('text-anchor', 'middle');
  rText.textContent = '🌐';
  routerG.appendChild(rText);

  const rLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  rLabel.setAttribute('x', '0');
  rLabel.setAttribute('y', '40');
  rLabel.setAttribute('fill', '#ffffff');
  rLabel.setAttribute('font-size', '11');
  rLabel.setAttribute('font-weight', '700');
  rLabel.setAttribute('text-anchor', 'middle');
  rLabel.textContent = routerNode.hostname;
  routerG.appendChild(rLabel);

  const rIp = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  rIp.setAttribute('x', '0');
  rIp.setAttribute('y', '51');
  rIp.setAttribute('fill', 'var(--muted)');
  rIp.setAttribute('font-size', '9');
  rIp.setAttribute('font-family', 'var(--font-code)');
  rIp.setAttribute('text-anchor', 'middle');
  rIp.textContent = routerNode.ip;
  routerG.appendChild(rIp);

  svg.appendChild(routerG);

  // Actualizar popover flotante si está abierto
  if (selectedNodeId) {
    const isPresent = devices.some(d => d.id === selectedNodeId) || selectedNodeId === 'gateway-router-node';
    if (!isPresent) {
      closePopover();
    } else {
      const activeDev = devices.find(d => d.id === selectedNodeId) || routerNode;
      updatePopoverContent(activeDev);
    }
  }
}

// SELECCIONAR NODO FLOTANTE
function selectNode(d, x, y) {
  if (d.isLockedDemo) {
    alert("🔒 Monitoreo Limitado: Has alcanzado el límite de 5 dispositivos activos en la licencia Demo.\n\nAdquiera una clave de licencia Enterprise Premium en la pestaña de Ajustes para auditar todos los hosts conectados.");
    return;
  }
  selectedNodeId = d.id;
  updatePopoverContent(d);
  
  const popover = document.getElementById('node-popover');
  if (popover) {
    popover.style.display = 'block';
  }
}

// ACTUALIZAR CONTENIDO DEL POPOVER FLOTANTE (DETALLES E HISTORIAL)
function updatePopoverContent(d) {
  const name = document.getElementById('popover-name');
  const ip = document.getElementById('popover-ip');
  const mac = document.getElementById('popover-mac');
  const vendor = document.getElementById('popover-vendor');
  const risk = document.getElementById('popover-risk');
  const status = document.getElementById('popover-status');
  const ports = document.getElementById('popover-ports');
  const actions = document.getElementById('popover-actions');

  if (!name || !ip || !mac || !vendor || !risk || !status || !ports || !actions) return;

  name.textContent = d.alias ? `🛡️ ${d.alias}` : d.hostname;
  ip.textContent = d.ip;
  mac.textContent = d.mac === 'LOCAL-HOST-DEV' ? '(Adaptador Local)' : d.mac;
  vendor.textContent = d.alias ? `${d.hostname} | ${d.vendor || 'Dispositivo Genérico'}` : (d.vendor || 'Dispositivo Genérico');
  
  risk.textContent = d.riskLevel;
  risk.className = 'badge ' + (d.riskLevel === 'Alto' ? 'red' : d.riskLevel === 'Medio' ? 'amber' : 'green');

  status.textContent = d.status;
  status.className = 'badge ' + (d.status === 'Activo' ? 'green' : d.status === 'Bloqueado' ? 'red' : 'blue');

  // Carga de puertos abiertos del host seleccionado
  if (d.ports && d.ports.length > 0) {
    ports.innerHTML = d.ports.map(p => `
      <span class="badge ${p.riskLevel === 'Alto' ? 'red' : p.riskLevel === 'Medio' ? 'amber' : 'blue'}" style="margin: 2px 2px 0 0; font-size: 10px; padding: 2px 6px;">
        :${p.portNumber} (${p.serviceName})
      </span>
    `).join(' ');
  } else {
    ports.textContent = 'Ningún puerto expuesto';
  }

  // Renderizar botones de acción dinámicos en el popover
  actions.innerHTML = '';
  
  if (d.id === 'gateway-router-node' || d.mac === '00:11:22:33:44:55') {
    actions.innerHTML = `<span style="font-size: 11px; color: var(--muted); text-align: center; display: block; width: 100%;">Dispositivo de red principal (Puerta de enlace)</span>`;
    return;
  }

  // Botón de confianza (Lista Blanca)
  const authBtn = document.createElement('button');
  authBtn.className = 'btn-action ' + (!d.isAuthorized ? 'unauthorized' : '');
  authBtn.style.justifyContent = 'center';
  authBtn.style.width = '100%';
  authBtn.textContent = d.isAuthorized ? '✓ Dispositivo Autorizado' : '⚠ Sospechoso (No Autorizado)';
  authBtn.onclick = () => toggleAuthorize(d.id, d.alias || '', d.isAuthorized);
  actions.appendChild(authBtn);

  // Botón de contención firewall (si no es el host del administrador)
  if (d.mac !== 'LOCAL-HOST-DEV') {
    const isBlocked = d.status === 'Bloqueado';
    const blockBtn = document.createElement('button');
    blockBtn.className = 'btn-action ' + (isBlocked ? 'block-active' : '');
    blockBtn.style.justifyContent = 'center';
    blockBtn.style.width = '100%';
    blockBtn.textContent = isBlocked ? '🔓 Quitar Bloqueo Red' : '🚫 Bloquear en Firewall';
    blockBtn.onclick = () => toggleBlock(d.id, !isBlocked);
    actions.appendChild(blockBtn);
  }

  // Botones de mitigación de hardening si posee vulnerabilidades detectadas
  if (d.ports && d.ports.length > 0) {
    const scriptContainer = document.createElement('div');
    scriptContainer.style.display = 'flex';
    scriptContainer.style.gap = '6px';
    scriptContainer.style.marginTop = '4px';

    const winBtn = document.createElement('button');
    winBtn.className = 'btn-hardening';
    winBtn.style.flex = '1';
    winBtn.innerHTML = `Script Win (.bat)`;
    winBtn.onclick = () => downloadHardeningScript(d.id, 'windows');

    const linBtn = document.createElement('button');
    linBtn.className = 'btn-hardening';
    linBtn.style.flex = '1';
    linBtn.innerHTML = `Script Linux (.sh)`;
    linBtn.onclick = () => downloadHardeningScript(d.id, 'linux');

    scriptContainer.appendChild(winBtn);
    scriptContainer.appendChild(linBtn);
    actions.appendChild(scriptContainer);
  }
}

function closePopover() {
  selectedNodeId = null;
  const popover = document.getElementById('node-popover');
  if (popover) {
    popover.style.display = 'none';
  }
}

// ==========================================
// 12. MODO NOC Y SÍNTESIS ACÚSTICA (HTML5 WEB AUDIO)
// ==========================================

// CONMUTAR MODO NOC (WOW Factor)
function toggleNocMode(active) {
  document.body.classList.toggle('noc-active', active);
  localStorage.setItem('pymeshield_noc_mode', active ? 'true' : 'false');
  
  const checkbox = document.getElementById('noc-toggle');
  if (checkbox) checkbox.checked = active;

  if (active) {
    try {
      // Instanciamos el contexto de audio nativo de HTML5 al microsegundo de activar el Modo NOC
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      const now = audioCtx.currentTime;
      playBeep(523.25, 0.08, now);         // Nota C5 (Feedback acústico)
      playBeep(659.25, 0.12, now + 0.08);    // Nota E5
    } catch (e) {
      console.warn("No se pudo reproducir sonido inicial en navegador:", e);
    }
  }
}

// DESCARGAR HARDENING SCRIPTS
function downloadHardeningScript(id, os) {
  if (licenseStatus === 'Demo') {
    alert("🔒 Característica Limitada: La descarga automatizada de scripts de Hardening de PymeShield requiere una licencia corporativa Enterprise activa.\n\nPor favor, ingrese una clave de licencia válida en la pestaña de Ajustes (ej: PYMESHIELD-777-PREMIUM).");
    return;
  }
  window.open(`/api/devices/${id}/hardening-script?os=${os}`, '_blank');
}

// SIMULAR INTRUSIÓN DE HACKER
async function triggerAttackSimulation() {
  const btn = document.getElementById('simulate-btn');
  if (!btn) return;

  btn.disabled = true;
  btn.style.opacity = '0.5';

  try {
    const res = await fetch('/api/scan/simulate-attack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (res.ok) {
      // Forzamos sirena acústica de inmediato
      playAlarmBeeps();
      await loadDashboardData();
    } else {
      const err = await res.json();
      alert(`Simulador falló: ${err.error || 'Desconocido'}`);
    }
  } catch (err) {
    console.error('Error al simular ataque:', err);
    alert('Error al comunicarse con el simulador de intrusiones.');
  } finally {
    btn.disabled = false;
    btn.style.opacity = '1';
  }
}

// REPRODUCIR SIRENAS DE ADVERTENCIA USANDO AUDIO SINTETIZADO (WEB AUDIO API)
function playAlarmBeeps() {
  // Solo sonar si el interruptor del Modo NOC está activo
  const nocToggle = document.getElementById('noc-toggle');
  if (!nocToggle || !nocToggle.checked) return;

  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    
    const now = audioCtx.currentTime;
    
    // Genera 3 beeps agudos y continuos (frecuencia alta 980Hz) simulando una alarma de intrusión
    playBeep(980, 0.15, now);
    playBeep(980, 0.15, now + 0.25);
    playBeep(980, 0.15, now + 0.5);
  } catch (e) {
    console.warn("Error en la alarma acústica:", e);
  }
}

// FUNCIÓN SINTETIZADORA DE NOTA: Levanta oscilador físico en el kernel de audio del SO
function playBeep(frequency, duration, startTime) {
  if (!audioCtx) return;
  
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  
  osc.type = 'sine'; // Onda sinusoidal pura
  osc.frequency.setValueAtTime(frequency, startTime);
  
  gainNode.gain.setValueAtTime(0.12, startTime); // Control de volumen del sensor
  
  // Rampa de atenuación exponencial suavizada al final de la nota para evitar clics acústicos
  gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  
  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  
  osc.start(startTime);
  osc.stop(startTime + duration + 0.05); // Apagamos físicamente el oscilador para liberar memoria
}

// ==========================================
// 10. PYMESHIELD ASSISTANT (ASISTENTE VIRTUAL)
// ==========================================

let chatWelcomeSent = false;

function toggleAssistantChat() {
  const chatWindow = document.getElementById('assistant-chat-window');
  if (!chatWindow) return;
  
  if (chatWindow.style.display === 'none') {
    chatWindow.style.display = 'flex';
    // Enfoque automático en el campo de texto
    setTimeout(() => {
      document.getElementById('chat-input').focus();
    }, 100);
    
    // Enviar el mensaje de bienvenida si es la primera vez que se abre
    if (!chatWelcomeSent) {
      sendAssistantWelcomeMessage();
    }
  } else {
    chatWindow.style.display = 'none';
  }
}

function sendAssistantWelcomeMessage() {
  const chatMessages = document.getElementById('chat-messages');
  if (!chatMessages) return;
  
  chatMessages.innerHTML = '';
  chatWelcomeSent = true;
  
  // Burbuja inicial
  appendAssistantMessage(
    "¡Hola! Soy **PymeShield Assistant**, tu copiloto de ciberseguridad y cumplimiento legal en Chile.\n\n" +
    "Te puedo ayudar a:\n" +
    "• Entender el estado de seguridad de tu red local.\n" +
    "• Comprender las obligaciones y multas de la **Ley N° 21.719** y **Ley N° 21.663**.\n" +
    "• Resolver vulnerabilidades en puertos de red comunes.\n\n" +
    "¿En qué te puedo asesorar hoy?"
  );
  
  // Añadir sugerencias rápidas
  appendQuickSuggestions([
    "¿Cómo está la seguridad de mi red?",
    "¿Qué exige la Ley N° 21.719 de datos?",
    "¿Qué significa tener el puerto 445 expuesto?",
    "¿Qué es la directiva Zero-Trust (NAC)?"
  ]);
}

function appendAssistantMessage(text) {
  const chatMessages = document.getElementById('chat-messages');
  if (!chatMessages) return;
  
  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-msg assistant';
  
  // Formateador simple de Markdown
  let html = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>')
    .replace(/• (.*?)(<br>|$)/g, '<li>$1</li>');
  
  // Agrupar elementos de lista consecutivas
  if (html.includes('<li>')) {
    html = html.replace(/(<li>.*?<\/li>)+/g, '<ul>$&</ul>');
    html = html.replace(/<br><ul>/g, '<ul>').replace(/<\/ul><br>/g, '</ul>');
  }
  
  msgDiv.innerHTML = html;
  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendUserMessage(text) {
  const chatMessages = document.getElementById('chat-messages');
  if (!chatMessages) return;
  
  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-msg user';
  msgDiv.textContent = text;
  
  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendQuickSuggestions(suggestions) {
  const chatMessages = document.getElementById('chat-messages');
  if (!chatMessages) return;
  
  // Limpiar sugerencias previas
  const oldContainer = chatMessages.querySelector('.chat-suggestions');
  if (oldContainer) oldContainer.remove();
  
  const container = document.createElement('div');
  container.className = 'chat-suggestions';
  
  suggestions.forEach(s => {
    const btn = document.createElement('button');
    btn.className = 'btn-chat-suggestion';
    btn.textContent = s;
    btn.onclick = () => {
      container.remove();
      submitUserQuery(s);
    };
    container.appendChild(btn);
  });
  
  chatMessages.appendChild(container);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showTypingIndicator() {
  const chatMessages = document.getElementById('chat-messages');
  if (!chatMessages) return;
  
  hideTypingIndicator();
  
  const indicator = document.createElement('div');
  indicator.id = 'typing-indicator';
  indicator.className = 'typing-indicator chat-msg assistant';
  indicator.innerHTML = `
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
  `;
  
  chatMessages.appendChild(indicator);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function hideTypingIndicator() {
  const indicator = document.getElementById('typing-indicator');
  if (indicator) indicator.remove();
}

async function sendAssistantMessage(event) {
  if (event) event.preventDefault();
  
  const input = document.getElementById('chat-input');
  if (!input) return;
  
  const text = input.value.trim();
  if (!text) return;
  
  input.value = '';
  submitUserQuery(text);
}

async function submitUserQuery(query) {
  appendUserMessage(query);
  showTypingIndicator();
  
  try {
    const res = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: query })
    });
    
    hideTypingIndicator();
    
    if (res.ok) {
      const data = await res.json();
      appendAssistantMessage(data.reply);
      
      if (data.suggestions && data.suggestions.length > 0) {
        appendQuickSuggestions(data.suggestions);
      }
    } else {
      appendAssistantMessage("Lo siento, experimenté un error al procesar tu consulta. Por favor, intenta de nuevo.");
    }
  } catch (err) {
    hideTypingIndicator();
    console.error("Error in assistant communication:", err);
    appendAssistantMessage("Lo siento, no pude conectarme con el servicio local de PymeShield. Verifica tu conexión.");
  }
}

// CONMUTAR MOSTRAR/OCULTAR BARRA LATERAL (COLLAPSIBLE SIDEBAR)
function toggleSidebar() {
  if (window.innerWidth <= 1024) {
    document.body.classList.toggle('sidebar-expanded');
    document.body.classList.remove('sidebar-collapsed'); // Evitar conflicto
  } else {
    const isCollapsed = document.body.classList.toggle('sidebar-collapsed');
    localStorage.setItem('pymeshield_sidebar_collapsed', isCollapsed ? 'true' : 'false');
    document.body.classList.remove('sidebar-expanded'); // Evitar conflicto
  }
}

// CONMUTAR SECCIÓN DE NAVEGACIÓN DESPLEGABLE (DROPDOWN)
function toggleNavSection(element) {
  element.classList.toggle('collapsed');
}

// ==========================================
// RUTA DE COTIZACIONES - RENDERING FRONTEND
// ==========================================

async function loadQuotes() {
  const tbody = document.getElementById('quotes-tbody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/quotes');
    if (!res.ok) throw new Error('Error al consultar cotizaciones');
    const quotes = await res.json();
    renderQuotes(quotes);
  } catch (err) {
    console.error('Error cargando cotizaciones:', err);
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--red); padding: 30px;">Error al cargar: ${err.message}</td></tr>`;
  }
}

function renderQuotes(quotes) {
  const tbody = document.getElementById('quotes-tbody');
  if (!tbody) return;

  if (quotes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 30px; color: var(--muted); font-size: 13px;">No hay solicitudes de cotización registradas en la base de datos.</td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  quotes.forEach(q => {
    const row = document.createElement('tr');
    row.style.borderBottom = '1px solid var(--border)';
    
    let dateStr = '';
    try {
      dateStr = new Date(q.createdAt).toLocaleString('es-CL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      dateStr = q.createdAt;
    }

    row.innerHTML = `
      <td style="padding: 10px; font-family: var(--font-code); font-size: 12px; color: var(--muted);">${dateStr}</td>
      <td style="padding: 10px; color: #fff;">
        <strong>${q.name}</strong>
        <div style="font-size: 11px; color: var(--muted);">${q.company}</div>
      </td>
      <td style="padding: 10px;">
        <div style="color: #fff; font-size: 12.5px;">${q.email}</div>
      </td>
      <td style="padding: 10px;">
        <span class="badge blue" style="font-size: 11px;">${q.plan}</span>
        <div style="font-size: 11px; color: var(--muted); margin-top: 4px;">${q.endpoints} equipos</div>
      </td>
      <td style="padding: 10px; font-size: 12px; color: var(--text); line-height: 1.4; max-width: 300px; word-wrap: break-word; white-space: normal;">
        ${q.message || '<em style="color: var(--muted)">Sin mensaje adicional</em>'}
      </td>
      <td style="padding: 10px; text-align: right;">
        <button class="btn-action unauthorized" onclick="deleteQuote('${q.id}')" style="font-size: 11px; padding: 6px 10px; border-radius: var(--radius-sm); cursor: pointer;">
          Eliminar
        </button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

async function deleteQuote(id) {
  if (!confirm('¿Estás seguro de que deseas eliminar esta solicitud de cotización de la base de datos?')) {
    return;
  }

  try {
    const res = await fetch(`/api/quotes/${id}`, { method: 'DELETE' });
    if (res.ok) {
      loadQuotes();
    } else {
      const data = await res.json();
      throw new Error(data.error || 'Error al eliminar');
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

