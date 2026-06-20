const express = require('express');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const { PrismaClient } = require('@prisma/client');
const { exec } = require('child_process');
const os = require('os');
const net = require('net');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const { generateSecret, verify, generateURI } = require('otplib');
const QRCode = require('qrcode');
const dns = require('dns');
const dgram = require('dgram');

const prisma = new PrismaClient();
const crypto = require('crypto');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Inicializar archivo de credenciales hashed si no existe (Criterio de Ciberseguridad)
const credsPath = path.join(__dirname, 'credenciales.json');
if (!fs.existsSync(credsPath)) {
  const defaultCreds = {
    usuario: 'admin',
    passwordHash: hashPassword('pymeshield2026'),
    zeroTrustMode: false,
    webhookUrl: '',
    licenseKey: '',
    licenseStatus: 'Demo'
  };
  fs.writeFileSync(credsPath, JSON.stringify(defaultCreds, null, 2), 'utf8');
}

// Variables de configuración de red y directivas
let demoMode = true;
let zeroTrustMode = false;
let webhookUrl = '';
let licenseKey = '';
let licenseStatus = 'Demo';

try {
  const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
  let updated = false;
  if (creds.zeroTrustMode === undefined) {
    creds.zeroTrustMode = false;
    updated = true;
  }
  if (creds.webhookUrl === undefined) {
    creds.webhookUrl = '';
    updated = true;
  }
  if (creds.licenseKey === undefined) {
    creds.licenseKey = '';
    updated = true;
  }
  if (creds.licenseStatus === undefined) {
    creds.licenseStatus = 'Demo';
    updated = true;
  }
  if (updated) {
    fs.writeFileSync(credsPath, JSON.stringify(creds, null, 2), 'utf8');
  }
  zeroTrustMode = creds.zeroTrustMode;
  webhookUrl = creds.webhookUrl;
  licenseKey = creds.licenseKey;
  licenseStatus = creds.licenseStatus;
} catch (e) {
  console.error('Error cargando configuraciones de credenciales.json:', e);
}

async function logEvent(action, details, ipAddress = null) {
  try {
    await prisma.auditLog.create({
      data: { action, details, ipAddress }
    });
    console.log(`[Bitácora - ${action}] ${details}`);
    
    // Si la acción es crítica, enviamos una alerta automática por Webhook (SOAR)
    if (action === 'AUTH_MFA_FAIL' || action === 'AUTH_FAIL' || action === 'CONTAINMENT_ACTION' || action.startsWith('POLICY_CHANGE') || action === 'SYSTEM_INIT') {
      let risk = 'Medio';
      if (action.includes('FAIL')) risk = 'Alto';
      if (action === 'CONTAINMENT_ACTION') risk = 'Alto';
      sendWebhookAlert(action, `Evento Crítico: ${action}`, details, risk);
    }
  } catch (err) {
    console.error('Error al registrar en bitácora:', err);
  }
}

// Helper: Envío asíncrono de alertas de incidentes vía Webhook (Integración SOAR / Cortex XSOAR)
async function sendWebhookAlert(event, title, description, riskLevel = 'Informativo') {
  if (!webhookUrl) return;

  const payload = JSON.stringify({
    event,
    title,
    description,
    riskLevel,
    timestamp: new Date().toISOString(),
    source: 'PymeShield Security Appliance'
  });

  try {
    const parsedUrl = new URL(webhookUrl);
    const isHttps = parsedUrl.protocol === 'https:';
    const transport = isHttps ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': 'PymeShield-SOAR-Agent/2.0'
      }
    };

    const req = transport.request(options);
    req.on('error', (err) => {
      console.error('[SOAR Webhook] Error al enviar alerta externa:', err.message);
    });
    req.write(payload);
    req.end();
  } catch (e) {
    console.error('[SOAR Webhook] URL inválida o error en configuración:', e.message);
  }
}

// Helper: Ejecución de comandos del Firewall local (Multiplataforma)
function executeFirewallBlock(ip, block) {
  const platform = os.platform(); // 'win32', 'linux', 'darwin'
  let command = '';

  switch (platform) {
    case 'win32':
      command = block 
        ? `netsh advfirewall firewall add rule name="PymeShield Block ${ip}" dir=in action=block protocol=ANY remoteip=${ip}`
        : `netsh advfirewall firewall delete rule name="PymeShield Block ${ip}"`;
      break;

    case 'linux':
      command = block
        ? `sudo iptables -A INPUT -s ${ip} -j DROP`
        : `sudo iptables -D INPUT -s ${ip} -j DROP`;
      break;

    case 'darwin':
      command = block
        ? `(pfctl -sr 2>/dev/null; echo "block in quick from ${ip}") | sudo pfctl -f -`
        : `sudo pfctl -F all && sudo pfctl -f /etc/pf.conf`;
      break;

    default:
      console.log(`[Contención] Plataforma '${platform}' no soporta contención de firewall nativa.`);
      return Promise.resolve(false);
  }

  return new Promise((resolve, reject) => {
    exec(command, (err, stdout) => {
      if (err) {
        console.error(`[Contención] Error al ejecutar bloqueo en ${platform}:`, err.message);
        return reject(err);
      }
      console.log(`[Contención] Regla de firewall aplicada en ${platform}: ${command}`);
      resolve(true);
    });
  });
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

app.use(express.json());

// Middleware de CORS para permitir peticiones desde archivos locales (file:// en el Escritorio)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/landing', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

// ==========================================
// RUTA DE COTIZACIONES (LANDING PAGE)
// ==========================================

app.post('/api/quotes', async (req, res) => {
  try {
    const { name, email, company, endpoints, plan, message } = req.body;
    if (!name || !email || !company || !endpoints || !plan) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }
    const quote = await prisma.quote.create({
      data: { name, email, company, endpoints, plan, message }
    });
    
    // Registrar en la bitácora física de auditoría
    await logEvent('QUOTE_RECEIVED', `Nueva cotización recibida de ${name} (${company}) para el plan ${plan}.`);
    
    // Enviar alerta SOAR/Webhook si está configurado
    sendWebhookAlert('QUOTE_RECEIVED', 'Nueva Cotización Recibida', `Cliente: ${name} (${company})\nPlan: ${plan}\nEquipos: ${endpoints}\nCorreo: ${email}`, 'Medio');
    
    // Transmitir por WebSockets para actualizar el panel de control en vivo
    broadcast({ type: 'quote_new', quote });
    
    res.status(201).json({ success: true, quote });
  } catch (err) {
    console.error('Error al guardar cotización:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/quotes', async (req, res) => {
  try {
    const quotes = await prisma.quote.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(quotes);
  } catch (err) {
    console.error('Error al obtener cotizaciones:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.delete('/api/quotes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.quote.delete({
      where: { id }
    });
    await logEvent('QUOTE_DELETED', `Se eliminó la solicitud de cotización ID: ${id}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Error al eliminar cotización:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});



let isScanning = false;
// demoMode is already declared above

// WebSocket Server Connection
wss.on('connection', (ws) => {
  console.log('Cliente WebSocket conectado');
  ws.send(JSON.stringify({ type: 'info', message: 'Conectado a PymeShield Backend' }));
});

// Helper to broadcast WS messages
function broadcast(data) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// 1. Helper: Get Local Subnet details
function getLocalSubnet() {
  const interfaces = os.networkInterfaces();
  const candidates = [];
  const virtualMacPrefixes = ['0A:00:27', '08:00:27', '00:15:5D', '00:50:56', '00:0C:29'];

  for (const name of Object.keys(interfaces)) {
    const nameLower = name.toLowerCase();
    const isVirtualName = nameLower.includes('virtualbox') || 
                          nameLower.includes('vmware') || 
                          nameLower.includes('vethernet') || 
                          nameLower.includes('wsl') || 
                          nameLower.includes('host-only') ||
                          nameLower.includes('vpn') ||
                          nameLower.includes('loopback');

    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const ip = iface.address;
        const netmask = iface.netmask;
        const macUpper = (iface.mac || '').toUpperCase();
        const isVirtualMac = virtualMacPrefixes.some(pref => macUpper.startsWith(pref));
        const isVirtual = isVirtualName || isVirtualMac;

        if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
          const parts = ip.split('.');
          const prefix = parts.slice(0, 3).join('.');
          
          // Prioridad: 0 = Wi-Fi, 1 = Ethernet Física, 2 = Otra Física, 3 = Virtual
          let priority = 3;
          if (!isVirtual) {
            if (nameLower.includes('wi-fi') || nameLower.includes('wifi') || nameLower.includes('wireless') || nameLower.includes('wlan')) {
              priority = 0;
            } else if (nameLower.includes('ethernet') || nameLower.includes('lan')) {
              priority = 1;
            } else {
              priority = 2;
            }
          }

          candidates.push({ ip, netmask, prefix, priority, name });
        }
      }
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => a.priority - b.priority);
    const best = candidates[0];
    console.log(`[Red] Selección de adaptador de red física: ${best.name} (${best.ip})`);
    return { ip: best.ip, netmask: best.netmask, prefix: best.prefix };
  }

  return { ip: '192.168.1.100', netmask: '255.255.255.0', prefix: '192.168.1' };
}

// 2. Helper: Check if IP is valid
function isValidIp(ip) {
  return /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(ip);
}

// 3. Helper: Check if MAC is valid
function isValidMac(mac) {
  return /^[0-9a-fA-F]{2}[-:][0-9a-fA-F]{2}[-:][0-9a-fA-F]{2}[-:][0-9a-fA-F]{2}[-:][0-9a-fA-F]{2}[-:][0-9a-fA-F]{2}$/.test(mac);
}

// 4. Helper: Common MAC Vendor prefixes (Expanded Dictionary)
const VENDORS = {
  'A4:2B:B0': 'TP-Link Archer',
  '00:11:32': 'Synology NAS',
  '00:0C:29': 'VMware Virtual Machine',
  '00:1A:11': 'HP LaserJet Printer',
  'EC:35:86': 'Samsung Mobile',
  'B0:C5:54': 'Intel Corp',
  '00:14:22': 'Dell Inc',
  'C8:D7:19': 'Apple iPhone',
  '70:3A:51': 'Apple Mac',
  '3C:A6:16': 'Xiaomi Mobile',
  '2C:30:11': 'Huawei Router',
  '90:E2:BA': 'Apple Device',
  'F4:5C:89': 'Google Pixel',
  '00:25:90': 'Supermicro Server',
  'D8:50:E6': 'Asus Device',
  'E0:D9:E3': 'Lenovo PC',
  '04:18:D6': 'Ubiquiti UniFi AP',
  '74:83:C2': 'HP Laptop',
  'B8:27:EB': 'Raspberry Pi',
  'DC:A6:32': 'Raspberry Pi 4',
  '00:04:20': 'Slim Devices',
  '00:1E:67': 'Intel Board',
  '00:0F:66': 'Cisco Router',
  '00:22:93': 'Sony PlayStation',
  'D4:9A:20': 'Nintendo Switch',
  // Prefijos físicos reales del entorno de usuario
  '0C:01:4B': 'ZTE Corporation (Router)',
  '78:66:9D': 'Gaoshengda Technology (Smart TV)',
  '64:BB:1E': 'Earda Technologies (TV Box)',
  '48:5C:2C': 'Earda Technologies (TV Box)',
  'F4:C8:8A': 'Intel Corporate (Notebook)',
  '30:95:87': 'FN-Link Technology (IoT Device)'
};

async function getVendor(mac) {
  if (!mac) return 'Desconocido';
  const prefix = mac.substring(0, 8).toUpperCase().replace(/-/g, ':');
  if (VENDORS[prefix]) return VENDORS[prefix];
  
  // Asynchronous API query fallback (uses native fetch in Node 18+)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1200); // 1.2s timeout
    const res = await fetch(`https://api.macvendors.com/${prefix}`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const vendorName = await res.text();
      return vendorName.trim();
    }
  } catch (error) {
    // Fail silently and return generic name
  }
  return 'Dispositivo Genérico';
}

// Helper: Intentar resolución DNS reversa local de forma asíncrona rápida
function reverseDnsLookup(ip) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(null);
    }, 150); // Timeout rápido de 150ms para no demorar el escaneo

    dns.reverse(ip, (err, hostnames) => {
      clearTimeout(timer);
      if (!err && hostnames && hostnames.length > 0) {
        const firstHost = hostnames[0];
        // Filtrar registros PTR genéricos o IPs reversas que no aportan un nombre real
        if (firstHost.includes('in-addr.arpa') || 
            firstHost.startsWith('192.') || firstHost.startsWith('10.') || firstHost.startsWith('172.') ||
            firstHost.startsWith('192-') || firstHost.startsWith('10-') || firstHost.startsWith('172-')) {
          resolve(null);
        } else {
          resolve(firstHost.split('.')[0]); // Retorna el primer segmento (ej. "iPhone-de-Jose")
        }
      } else {
        resolve(null);
      }
    });
  });
}

// 5. Helper: TCP Port Probe
function checkPort(ip, port, timeout = 250) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let opened = false;
    socket.setTimeout(timeout);
    socket.on('connect', () => {
      opened = true;
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, ip);
  });
}

// Seed Initial Recommendations and Alerts
async function seedData() {
  // Limpiamos datos anteriores de recomendaciones y alertas para asegurar que se carguen las versiones simplificadas
  await prisma.recommendation.deleteMany();
  await prisma.recommendation.createMany({
    data: [
      { 
        title: 'Cerrar el acceso de soporte técnico remoto cuando no se use', 
        description: 'Tu Servidor NAS tiene activado un canal para que informáticos se conecten desde lejos. Esto es como dejar la puerta trasera sin llave.<br><br><strong>Guía Paso a Paso para cerrarlo:</strong><br>1. Escribe la dirección IP del NAS (ej. 192.168.1.45) en tu navegador web e inicia sesión.<br>2. Ve a <strong>Panel de Control</strong> -> <strong>Terminal y SNMP</strong>.<br>3. Desmarca la casilla <strong>\'Habilitar servicio SSH\'</strong>.<br>4. Haz clic en <strong>Aplicar</strong>.', 
        priority: 'Alta', 
        status: 'Pendiente' 
      },
      { 
        title: 'Proteger pantallas compartidas en computadoras de oficina (PC Contabilidad)', 
        description: 'La computadora "PC Contabilidad" permite que cualquiera intente controlar su pantalla de forma remota desde internet.<br><br><strong>Guía Paso a Paso para cerrarlo:</strong><br>1. Ve a la PC de Contabilidad física.<br>2. Abre el menú Inicio de Windows y haz clic en la rueda de <strong>Configuración</strong>.<br>3. Ve a <strong>Sistema</strong> -> <strong>Escritorio remoto</strong>.<br>4. Apaga el interruptor que dice <strong>\'Habilitar Escritorio remoto\'</strong>.<br>5. Confirma la acción.', 
        priority: 'Alta', 
        status: 'Pendiente' 
      },
      { 
        title: 'Desconectar celulares o computadoras desconocidas del Wi-Fi', 
        description: 'Hay un celular sospechoso conectado al Wi-Fi de la oficina que no reconocemos.<br><br><strong>Guía Paso a Paso para aislarlo y sacarlo:</strong><br>1. En la tabla de arriba de este panel, busca el dispositivo desconocido y pulsa el botón rojo <strong>\'Bloquear\'</strong>.<br>2. Para sacarlo definitivamente, ingresa al panel de tu Wi-Fi (ej. escribiendo la IP 192.168.1.1 en tu navegador).<br>3. Ve a <strong>Wi-Fi</strong> o <strong>Seguridad</strong> y cambia la clave de tu red por una nueva contraseña más segura.<br>4. Reconecta tus equipos de confianza con la nueva clave.', 
        priority: 'Alta', 
        status: 'Pendiente' 
      },
      { 
        title: 'Actualizar el módem/aparato de Wi-Fi de tu proveedor de Internet', 
        description: 'El aparato que te da Wi-Fi (Router) tiene su sistema desactualizado y vulnerable.<br><br><strong>Guía Paso a Paso para solucionarlo:</strong><br>1. Llama al número de soporte de tu compañía de internet (ej. Movistar: 103, VTR: 600 800 9000, Entel: 103).<br>2. Solicita hablar con <strong>Soporte Técnico</strong>.<br>3. Diles textualmente: <em>"Hola, mi módem tiene fallas de seguridad. Por favor, actualicen el software interno (firmware) de mi módem a la última versión disponible"</em>.<br>4. Ellos lo realizarán de forma remota y sin costo en 5 minutos.', 
        priority: 'Media', 
        status: 'Pendiente' 
      },
    ]
  });

  await prisma.alert.deleteMany();
  await prisma.alert.createMany({
    data: [
      { 
        title: '¿Dispositivo sospechoso en la red?', 
        description: 'Un teléfono Android desconocido se conectó a la red del establecimiento. Si no lo reconoces, podría estar viendo tus archivos.', 
        riskLevel: 'Rojo', 
        status: 'No leída' 
      },
      { 
        title: 'Acceso remoto desprotegido detectado', 
        description: 'La PC de Contabilidad tiene activado el Escritorio Remoto hacia Internet. Un atacante externo podría intentar adivinar tu contraseña para controlarla.', 
        riskLevel: 'Rojo', 
        status: 'No leída' 
      },
      { 
        title: 'Módem de Internet vulnerable', 
        description: 'El aparato del Wi-Fi tiene software desactualizado y necesita ser actualizado por tu proveedor para evitar hackeos.', 
        riskLevel: 'Amarillo', 
        status: 'No leída' 
      },
    ]
  });

  const devCount = await prisma.device.count();
  if (devCount === 0 && demoMode) {
    // Initial academic demo devices
    const devices = [
      { ip: '192.168.1.1', mac: 'A4:2B:B0:11:22:33', hostname: 'Router Principal', vendor: 'TP-Link', status: 'Activo', riskLevel: 'Bajo', isAuthorized: true },
      { ip: '192.168.1.45', mac: '00:11:32:AA:BB:CC', hostname: 'Servidor NAS', vendor: 'Synology', status: 'Activo', riskLevel: 'Alto', isAuthorized: true },
      { ip: '192.168.1.22', mac: '00:0C:29:11:22:33', hostname: 'PC Contabilidad', vendor: 'Windows 11', status: 'Activo', riskLevel: 'Medio', isAuthorized: true },
      { ip: '192.168.1.30', mac: '00:1A:11:22:33:44', hostname: 'Impresora HP', vendor: 'HP LaserJet', status: 'Activo', riskLevel: 'Medio', isAuthorized: true },
      { ip: '192.168.1.88', mac: 'EC:35:86:11:22:33', hostname: 'Celular desconocido', vendor: 'Android', status: 'Activo', riskLevel: 'Alto', isAuthorized: false },
    ];
    for (const d of devices) {
      const dev = await prisma.device.create({ data: d });
      // Add ports for demo
      if (d.ip === '192.168.1.45') {
        await prisma.port.createMany({
          data: [
            { portNumber: 22, serviceName: 'SSH', riskLevel: 'Alto', description: 'Secure Shell remote access', deviceId: dev.id },
            { portNumber: 445, serviceName: 'SMB', riskLevel: 'Medio', description: 'Samba File Share', deviceId: dev.id },
          ]
        });
      } else if (d.ip === '192.168.1.22') {
        await prisma.port.create({
          data: { portNumber: 3389, serviceName: 'RDP', riskLevel: 'Alto', description: 'Remote Desktop Protocol', deviceId: dev.id }
        });
      } else if (d.ip === '192.168.1.30') {
        await prisma.port.create({
          data: { portNumber: 80, serviceName: 'HTTP', riskLevel: 'Bajo', description: 'HP Printer Admin Page', deviceId: dev.id }
        });
      }
    }
  }

  // Seeding de Historial de Scores para el Gráfico SVG en Modo Demo
  if (demoMode) {
    await prisma.scanHistory.deleteMany();
    const now = new Date();
    await prisma.scanHistory.createMany({
      data: [
        { score: 95, devicesCount: 4, criticalAlertsCount: 0, timestamp: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000) },
        { score: 88, devicesCount: 4, criticalAlertsCount: 1, timestamp: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000) },
        { score: 68, devicesCount: 5, criticalAlertsCount: 2, timestamp: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000) },
        { score: 51, devicesCount: 5, criticalAlertsCount: 4, timestamp: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000) },
        { score: 80, devicesCount: 5, criticalAlertsCount: 2, timestamp: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000) },
        { score: 85, devicesCount: 5, criticalAlertsCount: 1, timestamp: new Date(now.getTime() - 12 * 60 * 60 * 1000) },
      ]
    });
  }
  
  await logEvent('SYSTEM_INIT', 'Se inicializó el sistema PymeShield y se cargaron los datos de demostración.');
}

async function seedDemoDevicesOnly() {
  const demoDevicesData = [
    { ip: '192.168.1.1', mac: 'A4:2B:B0:11:22:33', hostname: 'Router Principal', vendor: 'TP-Link', status: 'Activo', riskLevel: 'Bajo', isAuthorized: true },
    { ip: '192.168.1.45', mac: '00:11:32:AA:BB:CC', hostname: 'Servidor NAS', vendor: 'Synology', status: 'Activo', riskLevel: 'Alto', isAuthorized: true },
    { ip: '192.168.1.22', mac: '00:0C:29:11:22:33', hostname: 'PC Contabilidad', vendor: 'Windows 11', status: 'Activo', riskLevel: 'Medio', isAuthorized: true },
    { ip: '192.168.1.30', mac: '00:1A:11:22:33:44', hostname: 'Impresora HP', vendor: 'HP LaserJet', status: 'Activo', riskLevel: 'Medio', isAuthorized: true },
    { ip: '192.168.1.88', mac: 'EC:35:86:11:22:33', hostname: 'Celular desconocido', vendor: 'Android', status: 'Activo', riskLevel: 'Alto', isAuthorized: false },
  ];

  for (const d of demoDevicesData) {
    const existing = await prisma.device.findUnique({ where: { mac: d.mac } });
    if (!existing) {
      const dev = await prisma.device.create({
        data: {
          ip: d.ip,
          mac: d.mac,
          hostname: d.hostname,
          vendor: d.vendor,
          status: d.status,
          riskLevel: d.riskLevel,
          isAuthorized: d.isAuthorized
        }
      });
      // Add ports for demo
      if (d.ip === '192.168.1.45') {
        await prisma.port.createMany({
          data: [
            { portNumber: 22, serviceName: 'SSH', riskLevel: 'Alto', description: 'Secure Shell remote access', deviceId: dev.id },
            { portNumber: 445, serviceName: 'SMB', riskLevel: 'Medio', description: 'Samba File Share', deviceId: dev.id },
          ]
        });
      } else if (d.ip === '192.168.1.22') {
        await prisma.port.create({
          data: { portNumber: 3389, serviceName: 'RDP', riskLevel: 'Alto', description: 'Remote Desktop Protocol', deviceId: dev.id }
        });
      } else if (d.ip === '192.168.1.30') {
        await prisma.port.create({
          data: { portNumber: 80, serviceName: 'HTTP', riskLevel: 'Bajo', description: 'HP Printer Admin Page', deviceId: dev.id }
        });
      }
    }
  }
}


// API Routes

// Auth: Validar Inicio de Sesión (Criterio de Ciberseguridad)
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const ip = req.ip || req.socket.remoteAddress;
  try {
    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    const inputHash = hashPassword(password);
    if (username === creds.usuario && inputHash === creds.passwordHash) {
      if (creds.mfaSecret) {
        await logEvent('AUTH_MFA_REQUEST', 'Credenciales administrativas correctas. Solicitando código de Doble Factor (MFA) configurado.', ip);
        return res.json({ mfaRequired: true, isSetup: false });
      } else {
        const tempSecret = generateSecret();
        const otpauth = generateURI({ issuer: 'PymeShield', label: 'admin', secret: tempSecret });
        const qrCode = await QRCode.toDataURL(otpauth);
        
        await logEvent('AUTH_MFA_REQUEST', 'Credenciales correctas. Generando QR para primera vinculación de Doble Factor (MFA).', ip);
        return res.json({ mfaRequired: true, isSetup: true, qrCode, tempSecret });
      }
    }
    await logEvent('AUTH_FAIL', `Intento de acceso fallido para el usuario '${username}'. Contraseña incorrecta.`, ip);
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  } catch (err) {
    console.error('Error en autenticación:', err);
    // Fallback de resiliencia
    if (username === 'admin' && hashPassword(password) === hashPassword('pymeshield2026')) {
      const tempSecret = generateSecret();
      const otpauth = generateURI({ issuer: 'PymeShield', label: 'admin', secret: tempSecret });
      const qrCode = await QRCode.toDataURL(otpauth);
      return res.json({ mfaRequired: true, isSetup: true, qrCode, tempSecret });
    }
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Auth: Configurar primer Doble Factor (MFA)
app.post('/api/login/mfa-setup', async (req, res) => {
  const { code, tempSecret } = req.body;
  const ip = req.ip || req.socket.remoteAddress;
  
  if (!code || !tempSecret) {
    return res.status(400).json({ error: 'Faltan parámetros requeridos para el setup de MFA.' });
  }

  try {
    const isOk = await verify({ token: code, secret: tempSecret });
    if (isOk && isOk.valid === true) {
      const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
      creds.mfaSecret = tempSecret;
      fs.writeFileSync(credsPath, JSON.stringify(creds, null, 2), 'utf8');
      
      await logEvent('AUTH_SUCCESS', 'Se vinculó exitosamente el celular de confianza y se inició sesión con MFA real.', ip);
      return res.json({ success: true });
    } else {
      await logEvent('AUTH_MFA_FAIL', 'Código de verificación del setup MFA incorrecto.', ip);
      return res.status(401).json({ error: 'Código incorrecto. Vuelve a intentar con el código de tu celular.' });
    }
  } catch (err) {
    console.error('Error en setup de MFA:', err);
    return res.status(500).json({ error: 'Error interno al guardar la configuración de MFA.' });
  }
});

// Auth: Validar Doble Factor (MFA)
app.post('/api/login/mfa', async (req, res) => {
  const { code } = req.body;
  const ip = req.ip || req.socket.remoteAddress;
  try {
    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    if (!creds.mfaSecret) {
      return res.status(400).json({ error: 'MFA no configurado aún en este servidor. Por favor, reinicia el login.' });
    }

    const isOk = await verify({ token: code, secret: creds.mfaSecret });
    if (isOk && isOk.valid === true) {
      await logEvent('AUTH_SUCCESS', 'Acceso concedido al panel. Inicio de sesión completado con Doble Factor (MFA) real.', ip);
      return res.json({ success: true });
    } else {
      await logEvent('AUTH_MFA_FAIL', 'Código de Doble Factor incorrecto. Intento de acceso bloqueado.', ip);
      return res.status(401).json({ error: 'Código de verificación incorrecto.' });
    }
  } catch (err) {
    console.error('Error en autenticación MFA:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Auth: Cambiar Contraseña desde el Panel
app.post('/api/settings/change-password', async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const ip = req.ip || req.socket.remoteAddress;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
  }
  try {
    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    const currentInputHash = hashPassword(currentPassword);
    
    if (currentInputHash !== creds.passwordHash) {
      await logEvent('CREDENTIAL_CHANGE_FAIL', 'Intento fallido de cambio de contraseña: Clave actual incorrecta.', ip);
      return res.status(401).json({ error: 'La contraseña actual es incorrecta.' });
    }
    
    // Actualizar credenciales con el nuevo hash
    creds.passwordHash = hashPassword(newPassword);
    fs.writeFileSync(credsPath, JSON.stringify(creds, null, 2), 'utf8');
    
    await logEvent('CREDENTIAL_CHANGE', 'El administrador cambió con éxito su contraseña de acceso al panel.', ip);
    return res.json({ success: true });
  } catch (err) {
    console.error('Error al cambiar contraseña:', err);
    return res.status(500).json({ error: 'No se pudo actualizar la contraseña.' });
  }
});

// Auth: Restablecer / Desvincular Doble Factor (MFA)
app.post('/api/settings/reset-mfa', async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress;
  try {
    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    creds.mfaSecret = ""; // Eliminar secreto
    fs.writeFileSync(credsPath, JSON.stringify(creds, null, 2), 'utf8');
    
    await logEvent('POLICY_CHANGE', 'El administrador desvinculó su dispositivo móvil y restableció el Doble Factor (MFA) a su estado original.', ip);
    return res.json({ success: true });
  } catch (err) {
    console.error('Error al restablecer MFA:', err);
    return res.status(500).json({ error: 'No se pudo restablecer la configuración de MFA.' });
  }
});

// GET: Obtener Historial de Actividad (Bitácora)
app.get('/api/audit-logs', async (req, res) => {
  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 40
    });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Settings
app.get('/api/settings', (req, res) => {
  res.json({ demoMode, zeroTrustMode, webhookUrl, licenseKey, licenseStatus });
});

app.post('/api/settings/toggle-demo', async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress;
  demoMode = !demoMode;

  try {
    const demoMacs = [
      'A4:2B:B0:11:22:33',
      '00:11:32:AA:BB:CC',
      '00:0C:29:11:22:33',
      '00:1A:11:22:33:44',
      'EC:35:86:11:22:33',
      'EA:AA:BB:CC:DD:EE'
    ];

    if (!demoMode) {
      // Delete ports of demo devices
      await prisma.port.deleteMany({
        where: {
          device: {
            mac: { in: demoMacs }
          }
        }
      });
      // Delete demo devices
      await prisma.device.deleteMany({
        where: {
          mac: { in: demoMacs }
        }
      });
    } else {
      // Re-seed demo devices when turning it back ON
      await seedDemoDevicesOnly();
    }
  } catch (err) {
    console.error('Error al sincronizar datos de modo demostración:', err);
  }

  await logEvent('SYSTEM_CONFIG', `Se ${demoMode ? 'activó' : 'desactivó'} el Modo Demostración académica.`, ip);
  res.json({ success: true, demoMode, zeroTrustMode, webhookUrl, licenseKey, licenseStatus });
});

// Activar Licencia de Software (Comercialización / Criterio de Propiedad Intelectual)
app.post('/api/settings/activate-license', async (req, res) => {
  const { key } = req.body;
  const ip = req.ip || req.socket.remoteAddress;

  if (!key) {
    return res.status(400).json({ error: 'Clave de licencia requerida' });
  }

  const validKeys = ['PYMESHIELD-777-PREMIUM', 'CESFAM-SECURE-999', 'PYME-GROWTH-555'];
  const formattedKey = key.trim().toUpperCase();

  if (validKeys.includes(formattedKey)) {
    try {
      const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
      creds.licenseKey = formattedKey;
      creds.licenseStatus = 'Premium';
      fs.writeFileSync(credsPath, JSON.stringify(creds, null, 2), 'utf8');

      licenseKey = creds.licenseKey;
      licenseStatus = creds.licenseStatus;

      await logEvent('LICENSE_ACTIVATED', `Licencia Enterprise activada con éxito usando la clave '${formattedKey}'. Características desbloqueadas.`, ip);
      
      // Enviar Webhook de activación
      await sendWebhookAlert('LICENSE_ACTIVATED', 'PymeShield: Licencia Activada', `El software ha sido licenciado exitosamente en el host. Estado actual: Enterprise Premium.`, 'Informativo');

      return res.json({ success: true, licenseStatus, licenseKey });
    } catch (err) {
      console.error('Error al guardar licencia:', err);
      return res.status(500).json({ error: 'Error interno del servidor al activar la licencia.' });
    }
  } else {
    await logEvent('LICENSE_ACTIVATE_FAIL', `Intento fallido de activación de licencia con la clave '${key}'. Clave no válida.`, ip);
    return res.status(400).json({ error: 'Clave de licencia inválida. Verifique el código e intente nuevamente.' });
  }
});

// Actualizar políticas avanzadas (Zero-Trust y Webhook SOAR)
app.post('/api/settings/update', async (req, res) => {
  const { zeroTrust, webhook } = req.body;
  const ip = req.ip || req.socket.remoteAddress;

  try {
    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    
    creds.zeroTrustMode = !!zeroTrust;
    creds.webhookUrl = (webhook || '').trim();

    fs.writeFileSync(credsPath, JSON.stringify(creds, null, 2), 'utf8');

    zeroTrustMode = creds.zeroTrustMode;
    webhookUrl = creds.webhookUrl;

    await logEvent('SYSTEM_CONFIG', `Se actualizaron las políticas: Zero-Trust ${zeroTrustMode ? 'ACTIVADO' : 'DESACTIVADO'}, Webhook: '${webhookUrl || 'ninguno'}'.`, ip);
    return res.json({ success: true, zeroTrustMode, webhookUrl });
  } catch (err) {
    console.error('Error al guardar políticas:', err);
    return res.status(500).json({ error: 'No se pudo guardar la configuración de políticas avanzadas.' });
  }
});

// Enviar alerta de prueba por Webhook
app.post('/api/settings/test-webhook', async (req, res) => {
  const { webhook } = req.body;
  
  if (!webhook) {
    return res.status(400).json({ error: 'No se ha provisto ninguna URL de webhook para la prueba.' });
  }

  const originalUrl = webhookUrl;
  webhookUrl = webhook.trim();

  try {
    await sendWebhookAlert(
      'TEST_ALERT',
      'PymeShield: Alerta de Prueba SOAR',
      'Esta es una notificación de prueba de integración emitida de forma exitosa por PymeShield para verificar la conexión con tu plataforma SIEM o Cortex XSOAR.',
      'Informativo'
    );
    webhookUrl = originalUrl;
    return res.json({ success: true });
  } catch (err) {
    webhookUrl = originalUrl;
    console.error('Error al probar webhook:', err);
    return res.status(500).json({ error: `La prueba de webhook falló: ${err.message}` });
  }
});

// Devices List
app.get('/api/devices', async (req, res) => {
  try {
    const devices = await prisma.device.findMany({
      include: { ports: true },
      orderBy: { ip: 'asc' },
    });
    res.json(devices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Authorize / Unauthorize Device
app.post('/api/devices/toggle-authorize', async (req, res) => {
  const { id, alias, authorize } = req.body;
  const ip = req.ip || req.socket.remoteAddress;
  try {
    const device = await prisma.device.findUnique({ where: { id } });
    if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });
    
    let nextAuthorized = !device.isAuthorized;
    if (authorize !== undefined) {
      nextAuthorized = !!authorize;
    }
    
    let nextAlias = device.alias;
    if (alias !== undefined) {
      nextAlias = alias ? alias.trim() : null;
    }
    
    // If authorizing with a new alias, ensure it is set to authorized
    if (alias) {
      nextAuthorized = true;
    }

    const updated = await prisma.device.update({
      where: { id },
      data: { 
        isAuthorized: nextAuthorized,
        alias: nextAlias
      },
    });
    
    const displayName = updated.alias || device.hostname;
    const logDetails = updated.isAuthorized
      ? `Se marcó al dispositivo '${displayName}' (IP ${device.ip}) como de 'Confianza'${alias ? ` con alias '${alias}'` : ''}.`
      : `Se marcó al dispositivo '${displayName}' (IP ${device.ip}) como 'Sospechoso/No Autorizado'.`;
    await logEvent('POLICY_CHANGE', logDetails, ip);
    
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Block Device (Contention Module)
app.post('/api/devices/block', async (req, res) => {
  const { id, block } = req.body;
  const ip = req.ip || req.socket.remoteAddress;
  try {
    const device = await prisma.device.findUnique({ where: { id } });
    if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });
    
    const status = block ? 'Bloqueado' : 'Activo';
    
    // Aplicar bloqueo en el firewall nativo (Multiplataforma)
    try {
      await executeFirewallBlock(device.ip, block);
    } catch (err) {
      console.log('Nota: No se pudo modificar la regla de firewall local (requiere privilegios sudo/Administrador).');
    }

    const updated = await prisma.device.update({
      where: { id },
      data: { status },
    });

    // Create alarm
    await prisma.alert.create({
      data: {
        title: block ? 'Dispositivo Bloqueado' : 'Dispositivo Desbloqueado',
        description: `El dispositivo con IP ${device.ip} (${device.hostname}) ha sido ${block ? 'bloqueado' : 'desbloqueado'} del sistema.`,
        riskLevel: block ? 'Azul' : 'Amarillo',
        status: 'No leída',
      }
    });

    const logDetails = block
      ? `Se bloqueó preventivamente el acceso de red al dispositivo sospechoso '${device.hostname}' (IP ${device.ip}) mediante Firewall de Windows.`
      : `Se eliminó la regla de bloqueo y se restauró el acceso al dispositivo '${device.hostname}' (IP ${device.ip}).`;
    await logEvent('CONTAINMENT_ACTION', logDetails, ip);

    broadcast({ type: 'alert_new', message: `Dispositivo ${device.ip} ${block ? 'bloqueado' : 'desbloqueado'}.` });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Alerts
app.get('/api/alerts', async (req, res) => {
  try {
    const alerts = await prisma.alert.findMany({
      orderBy: { timestamp: 'desc' },
      take: 20
    });
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/alerts/read-all', async (req, res) => {
  try {
    await prisma.alert.updateMany({
      where: { status: 'No leída' },
      data: { status: 'Leída' },
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/alerts/delete', async (req, res) => {
  const { id } = req.body;
  try {
    await prisma.alert.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Recommendations
app.get('/api/recommendations', async (req, res) => {
  try {
    const recommendations = await prisma.recommendation.findMany({
      orderBy: { priority: 'asc' },
    });
    res.json(recommendations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// HELPER: Send UDP probes to all subnetwork hosts to force ARP cache updates (Cybersecurity Sweep)
function sendUdpProbes(ips) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    let sentCount = 0;
    const buf = Buffer.from([0]); // 1-byte dummy packet
    
    if (ips.length === 0) {
      try { socket.close(); } catch (e) {}
      return resolve();
    }

    ips.forEach(ip => {
      // Send to port 9 (Discard, completely harmless)
      socket.send(buf, 0, 1, 9, ip, () => {
        sentCount++;
        if (sentCount === ips.length) {
          // Allow 200ms for ARP responses to populate system cache
          setTimeout(() => {
            try {
              socket.close();
            } catch (e) {}
            resolve();
          }, 200);
        }
      });
    });
  });
}

// HELPER: Core Network Scan Implementation
async function runNetworkScan(isBackground = false) {
  if (isScanning) {
    throw new Error('El motor de escaneo ya se encuentra en ejecución.');
  }
  isScanning = true;

  // Registrar inicio de escaneo en la bitácora
  await logEvent(
    isBackground ? 'SCAN_AUTO' : 'SCAN_MANUAL', 
    isBackground ? 'El motor ejecutó una auditoría de red automática periódica en segundo plano.' : 'Se inició una auditoría de red manual desde el panel de control.'
  );

  try {
    if (!isBackground) {
      broadcast({ type: 'progress', percent: 5, message: 'Analizando adaptador de red...' });
    }
    const { prefix, ip: localIp } = getLocalSubnet();
    console.log(`[${isBackground ? 'Segundo Plano' : 'Manual'}] Iniciando escaneo de red en subred: ${prefix}.0/24`);

    if (!isBackground) {
      broadcast({ type: 'progress', percent: 10, message: `Iniciando barrido UDP táctico para forzar resolución ARP...` });
    }

    const activeIps = [localIp];
    const subIps = [];
    for (let i = 1; i <= 254; i++) {
      subIps.push(`${prefix}.${i}`);
    }

    // Ejecutar barrido UDP silencioso para actualizar caché ARP del sistema operativo
    await sendUdpProbes(subIps);

    if (!isBackground) {
      broadcast({ type: 'progress', percent: 25, message: `Realizando pings rápidos de verificación...` });
    }

    // Ping rápido de respaldo en lotes de 60
    const pings = subIps.filter(ip => ip !== localIp);
    const batchSize = 60;
    for (let i = 0; i < pings.length; i += batchSize) {
      const batch = pings.slice(i, i + batchSize);
      if (!isBackground) {
        const percent = 25 + Math.floor((i / pings.length) * 20);
        broadcast({ type: 'progress', percent, message: `Verificando hosts activos (${i}/254)...` });
      }
      await Promise.all(batch.map(ip => new Promise((resolve) => {
        exec(`ping -n 1 -w 50 ${ip}`, (err) => {
          if (!err) activeIps.push(ip);
          resolve();
        });
      })));
    }

    if (!isBackground) {
      broadcast({ type: 'progress', percent: 45, message: 'Consultando la tabla de resolución física ARP...' });
    }

    return new Promise((resolve, reject) => {
      exec('arp -a', async (err, stdout) => {
        try {
          const scannedDevices = [];
          if (!err) {
            const lines = stdout.split('\n');
            for (const line of lines) {
              const parts = line.trim().split(/\s+/);
              if (parts.length >= 3) {
                const ip = parts[0];
                const mac = parts[1];
                const type = parts[2];
                if (isValidIp(ip) && isValidMac(mac) && type.toLowerCase().includes('din')) {
                  if (!ip.startsWith('224.') && !ip.startsWith('239.') && ip !== '255.255.255.255') {
                    scannedDevices.push({
                      ip,
                      mac: mac.toUpperCase().replace(/-/g, ':'),
                    });
                  }
                }
              }
            }
          }

          if (!scannedDevices.some(d => d.ip === localIp)) {
            scannedDevices.push({ ip: localIp, mac: 'LOCAL-HOST-DEV' });
          }

          if (!isBackground) {
            broadcast({ type: 'progress', percent: 60, message: `Detectados ${scannedDevices.length} dispositivos en ARP. Escaneando puertos expuestos...` });
          }

          const portsToCheck = [22, 53, 80, 139, 443, 445, 631, 1433, 3306, 3389, 5000, 5900, 8080, 9100];
          const dbDevices = [];

          let completedCount = 0;
          for (const dev of scannedDevices) {
            const vendor = await getVendor(dev.mac);
            
            const openPorts = [];
            for (const port of portsToCheck) {
              const open = await checkPort(dev.ip, port, 150);
              if (open) {
                let sName = 'Desconocido';
                let risk = 'Bajo';
                let desc = '';
                if (port === 22) { sName = 'SSH'; risk = 'Alto'; desc = 'Acceso de control técnico remoto sin llave de seguridad.'; }
                else if (port === 53) { sName = 'DNS'; risk = 'Medio'; desc = 'Servidor de resolución de nombres expuesto a consultas externas.'; }
                else if (port === 80) { sName = 'HTTP'; risk = 'Bajo'; desc = 'Página de configuración web del equipo sin cifrado.'; }
                else if (port === 139) { sName = 'NetBIOS'; risk = 'Medio'; desc = 'Servicios heredados de Windows para compartir carpetas en red.'; }
                else if (port === 443) { sName = 'HTTPS'; risk = 'Bajo'; desc = 'Conexión web segura y cifrada.'; }
                else if (port === 445) { sName = 'SMB'; risk = 'Medio'; desc = 'Carpetas de archivos compartidos visibles para toda la red.'; }
                else if (port === 631) { sName = 'IPP (Printer)'; risk = 'Bajo'; desc = 'Protocolo de impresión en red activo.'; }
                else if (port === 1433) { sName = 'MSSQL'; risk = 'Alto'; desc = 'Servidor de base de datos SQL Server expuesto directamente.'; }
                else if (port === 3306) { sName = 'MySQL'; risk = 'Alto'; desc = 'Servidor de base de datos MySQL expuesto directamente.'; }
                else if (port === 3389) { sName = 'RDP'; risk = 'Alto'; desc = 'Control total de la pantalla del computador visible en Internet.'; }
                else if (port === 5000) { sName = 'NAS Admin (Web)'; risk = 'Medio'; desc = 'Panel de control web de almacenamiento NAS expuesto.'; }
                else if (port === 5900) { sName = 'VNC (Remote)'; risk = 'Alto'; desc = 'Control de pantalla remota sin cifrar mediante protocolo VNC.'; }
                else if (port === 8080) { sName = 'HTTP-Alt (Web)'; risk = 'Bajo'; desc = 'Puerto alternativo de administración web de equipos.'; }
                else if (port === 9100) { sName = 'RAW-Printer'; risk = 'Bajo'; desc = 'Servidor de impresión directa activo (JetDirect).'; }
                
                openPorts.push({ portNumber: port, serviceName: sName, riskLevel: risk, description: desc });
              }
            }

            let hostname = 'Dispositivo Genérico';
            if (dev.ip === localIp) {
              hostname = 'Esta Máquina (Host)';
            } else if (dev.ip.endsWith('.1')) {
              hostname = 'Puerta de Enlace (Router)';
            } else {
              // 1. Intentar DNS reverso local
              const resolved = await reverseDnsLookup(dev.ip);
              if (resolved) {
                hostname = resolved;
              } else {
                // 2. Heurística inteligente según puertos y fabricante
                const vLower = vendor.toLowerCase();
                const secondChar = dev.mac && dev.mac.length > 1 ? dev.mac.charAt(1).toUpperCase() : '';
                const isRandomMac = ['2', '6', 'A', 'E'].includes(secondChar);

                if (openPorts.some(p => p.portNumber === 9100 || p.portNumber === 631)) {
                  hostname = 'Impresora / Multifuncional de Red';
                } else if (openPorts.some(p => p.portNumber === 3389)) {
                  hostname = 'Estación de Trabajo (Windows PC)';
                } else if (openPorts.some(p => p.portNumber === 5900)) {
                  hostname = 'Estación de Trabajo (VNC Remote PC)';
                } else if (openPorts.some(p => p.portNumber === 5000)) {
                  hostname = 'Servidor de Almacenamiento (NAS)';
                } else if (openPorts.some(p => p.portNumber === 1433 || p.portNumber === 3306)) {
                  hostname = 'Servidor de Base de Datos';
                } else if (openPorts.some(p => p.portNumber === 445)) {
                  hostname = 'Servidor de Archivos / PC Compartido';
                } else if (vLower.includes('earda') || vLower.includes('gaoshengda')) {
                  hostname = 'Smart TV / Dispositivo Multimedia';
                } else if (vLower.includes('apple') || vLower.includes('iphone') || vLower.includes('ipad') || vLower.includes('mac')) {
                  hostname = 'Dispositivo Apple';
                } else if (vLower.includes('samsung') || vLower.includes('xiaomi') || vLower.includes('huawei') || vLower.includes('google') || vLower.includes('android') || isRandomMac) {
                  hostname = 'Dispositivo Móvil (Smartphone)';
                } else if (vLower.includes('hp') || vLower.includes('printer') || vLower.includes('epson') || vLower.includes('canon')) {
                  hostname = 'Impresora / Multifuncional de Red';
                } else if (vLower.includes('cisco') || vLower.includes('linksys') || vLower.includes('tp-link') || vLower.includes('ubiquiti') || vLower.includes('router') || vLower.includes('ap')) {
                  hostname = 'Equipo de Red / Conectividad';
                } else if (vLower.includes('dell') || vLower.includes('lenovo') || vLower.includes('intel') || vLower.includes('asus')) {
                  hostname = 'Computador / Notebook de Red';
                } else if (openPorts.some(p => p.portNumber === 22)) {
                  hostname = 'Servidor / Consola de Control (Linux)';
                } else if (openPorts.some(p => p.portNumber === 80) || openPorts.some(p => p.portNumber === 443)) {
                  hostname = 'Dispositivo con Panel Web';
                } else {
                  hostname = 'Dispositivo Genérico';
                }
              }
            }

            let riskLevel = 'Bajo';
            if (openPorts.some(p => p.riskLevel === 'Alto')) {
              riskLevel = 'Alto';
            } else if (openPorts.some(p => p.riskLevel === 'Medio')) {
              riskLevel = 'Medio';
            }

            dbDevices.push({
              ip: dev.ip,
              mac: dev.mac,
              hostname,
              vendor,
              status: 'Activo',
              riskLevel,
              isAuthorized: true,
              ports: openPorts
            });

            completedCount++;
            if (!isBackground) {
              const percent = 60 + Math.floor((completedCount / scannedDevices.length) * 30);
              broadcast({ type: 'progress', percent, message: `Escaneando puertos en ${dev.ip}...` });
            }
          }

          if (!isBackground) {
            broadcast({ type: 'progress', percent: 95, message: 'Almacenando resultados en la base de datos...' });
          }

          if (demoMode) {
            const demoDevicesData = [
              { ip: '192.168.1.1', mac: 'A4:2B:B0:11:22:33', hostname: 'Router Principal', vendor: 'TP-Link', riskLevel: 'Bajo', isAuthorized: true, ports: [] },
              { ip: '192.168.1.45', mac: '00:11:32:AA:BB:CC', hostname: 'Servidor NAS', vendor: 'Synology', riskLevel: 'Alto', isAuthorized: true, ports: [
                { portNumber: 22, serviceName: 'SSH', riskLevel: 'Alto', description: 'Secure Shell remote access' },
                { portNumber: 445, serviceName: 'SMB', riskLevel: 'Medio', description: 'Samba File Share' }
              ] },
              { ip: '192.168.1.22', mac: '00:0C:29:11:22:33', hostname: 'PC Contabilidad', vendor: 'Windows 11', riskLevel: 'Medio', isAuthorized: true, ports: [
                { portNumber: 3389, serviceName: 'RDP', riskLevel: 'Alto', description: 'Remote Desktop Protocol' }
              ] },
              { ip: '192.168.1.30', mac: '00:1A:11:22:33:44', hostname: 'Impresora HP', vendor: 'HP LaserJet', riskLevel: 'Medio', isAuthorized: true, ports: [
                { portNumber: 80, serviceName: 'HTTP', riskLevel: 'Bajo', description: 'HP Printer Admin Page' }
              ] },
              { ip: '192.168.1.88', mac: 'EC:35:86:11:22:33', hostname: 'Celular desconocido', vendor: 'Android', riskLevel: 'Alto', isAuthorized: false, ports: [] }
            ];

            for (const demoDev of demoDevicesData) {
              const isScanned = dbDevices.some(d => d.mac === demoDev.mac);
              if (!isScanned) {
                dbDevices.push({
                  ...demoDev,
                  status: 'Activo'
                });
              }
            }
          }

          // Sync database
          await prisma.device.updateMany({
            data: { status: 'Inactivo' }
          });

          let criticalCount = 0;
          for (const dev of dbDevices) {
            const existing = await prisma.device.findUnique({ where: { mac: dev.mac } });
            
            // Lógica NAC Zero-Trust
            let isAuthorized = true;
            if (existing) {
              isAuthorized = existing.isAuthorized;
            } else {
              // Si es un dispositivo nuevo y Zero-Trust está activo, no es de confianza
              isAuthorized = zeroTrustMode ? false : true;
            }

            let status = dev.status; // "Activo"

            if (!isAuthorized && zeroTrustMode) {
              status = 'Bloqueado';
              try {
                await executeFirewallBlock(dev.ip, true);
                if (!existing || existing.status !== 'Bloqueado') {
                  const hName = existing ? existing.hostname : dev.hostname;
                  await logEvent(
                    'CONTAINMENT_ACTION',
                    `NAC: Dispositivo sospechoso '${hName}' (IP ${dev.ip}, MAC ${dev.mac}) detectado en el escaneo y bloqueado automáticamente.`,
                    dev.ip
                  );
                }
              } catch (fwErr) {
                console.log(`[NAC] Omitiendo bloqueo de Firewall real para ${dev.ip} (puede requerir privilegios).`);
              }
            }

            let dbDev;
            if (existing) {
              dbDev = await prisma.device.update({
                where: { mac: dev.mac },
                data: {
                  ip: dev.ip,
                  hostname: dev.hostname,
                  vendor: dev.vendor,
                  status: status,
                  riskLevel: dev.riskLevel,
                  lastSeen: new Date()
                }
              });
            } else {
              dbDev = await prisma.device.create({
                data: {
                  ip: dev.ip,
                  mac: dev.mac,
                  hostname: dev.hostname,
                  vendor: dev.vendor,
                  status: status,
                  riskLevel: dev.riskLevel,
                  isAuthorized: isAuthorized
                }
              });
            }

            if (dev.riskLevel === 'Alto') criticalCount++;

            await prisma.port.deleteMany({ where: { deviceId: dbDev.id } });

            if (dev.ports && dev.ports.length > 0) {
              for (const port of dev.ports) {
                await prisma.port.create({
                  data: {
                    portNumber: port.portNumber,
                    serviceName: port.serviceName,
                    riskLevel: port.riskLevel,
                    description: port.description,
                    deviceId: dbDev.id
                  }
                });
              }
            }
          }

          let score = 100;
          const totalDevices = dbDevices.length;
          const unauthorizedCount = dbDevices.filter(d => !d.isAuthorized).length;
          const portsCount = dbDevices.reduce((acc, d) => acc + (d.ports ? d.ports.length : 0), 0);

          score -= (unauthorizedCount * 15);
          score -= (criticalCount * 10);
          score -= (portsCount * 2);
          if (score < 10) score = 10;

          await prisma.scanHistory.create({
            data: {
              devicesCount: totalDevices,
              criticalAlertsCount: criticalCount + unauthorizedCount,
              score: score
            }
          });

          // Registrar fin de escaneo en la bitácora
          await logEvent(
            'SCAN_COMPLETE', 
            `Auditoría de red completada. Se detectaron ${totalDevices} dispositivos activos, ${portsCount} puertos expuestos y un Score de seguridad final de ${score}/100.`
          );

          if (unauthorizedCount > 0) {
            const alertExists = await prisma.alert.findFirst({ where: { title: 'Dispositivo desconocido detectado', status: 'No leída' } });
            if (!alertExists) {
              await prisma.alert.create({
                data: {
                  title: 'Dispositivo desconocido detectado',
                  description: `Se detectaron ${unauthorizedCount} dispositivos no autorizados en la red.`,
                  riskLevel: 'Rojo',
                  status: 'No leída'
                }
              });
            }
          }

          if (!isBackground) {
            broadcast({ type: 'progress', percent: 100, message: 'Escaneo de red completado exitosamente.' });
          }
          broadcast({ type: 'complete', score, isBackground });
          isScanning = false;
          resolve(score);
        } catch (innerErr) {
          isScanning = false;
          reject(innerErr);
        }
      });
    });
  } catch (err) {
    isScanning = false;
    if (!isBackground) {
      broadcast({ type: 'error', message: 'Error durante el escaneo: ' + err.message });
    }
    console.error('Error en escaneo de red:', err);
    throw err;
  }
}

// POST: PymeShield Assistant local contextual NLP engine
app.post('/api/assistant', async (req, res) => {
  const message = req.body.message || '';
  const query = message.toLowerCase().trim();
  
  try {
    // 1. Obtener estado en tiempo real de la base de datos local
    const devices = await prisma.device.findMany({ include: { ports: true } });
    const activeDevices = devices.filter(d => d.status === 'Activo' || d.status === 'Bloqueado');
    const totalActive = activeDevices.length;
    const unauthorizedActive = activeDevices.filter(d => !d.isAuthorized);
    const totalUnauthorized = unauthorizedActive.length;
    
    const lastScan = await prisma.scanHistory.findFirst({ orderBy: { timestamp: 'desc' } });
    const currentScore = lastScan ? lastScan.score : 100;
    
    // Contar puertos y vulnerabilidades en equipos activos
    let totalPorts = 0;
    let highRiskPorts = 0;
    let portsListText = [];
    
    activeDevices.forEach(d => {
      if (d.ports && d.ports.length > 0) {
        totalPorts += d.ports.length;
        d.ports.forEach(p => {
          if (p.riskLevel === 'Alto') {
            highRiskPorts++;
          }
          portsListText.push(`• **${d.alias || d.hostname}** (${d.ip}): puerto **${p.portNumber} (${p.serviceName})** - Riesgo: ${p.riskLevel}`);
        });
      }
    });
    
    const alerts = await prisma.alert.findMany({ where: { status: 'No leída' } });
    const unreadAlertsCount = alerts.length;
    
    let reply = "";
    let suggestions = [];
    
    // 2. Procesamiento de Lenguaje Natural (PLN) contextual local
    if (query.includes('hola') || query.includes('buenos dias') || query.includes('buenas tardes') || query.includes('ayuda') || query.includes('quien eres') || query.includes('que haces')) {
      reply = "¡Hola! Soy **PymeShield Assistant**, tu copiloto de ciberseguridad.\n\nEstoy aquí para guiarte e informarte sobre el estado de protección de tu empresa y el cumplimiento legal. Puedes preguntarme sobre:\n\n" +
              "• El estado actual de la red local.\n" +
              "• Dispositivos desconocidos (intrusos).\n" +
              "• La **Ley N° 21.719** y **Ley N° 21.663** en Chile.\n" +
              "• Remediación de vulnerabilidades (Hardening).\n" +
              "• El marco de seguridad **NIST CSF 2.0**.\n\n" +
              "¿De qué te gustaría hablar?";
      suggestions = [
        "¿Cómo está la seguridad de mi red?",
        "¿Qué exige la Ley N° 21.719 de datos?",
        "¿Qué significa tener el puerto 445 expuesto?",
        "¿Qué es la directiva Zero-Trust (NAC)?"
      ];
    }
    else if (query.includes('estado') || query.includes('red') || query.includes('resumen') || query.includes('dispositivos') || query.includes('equipos') || query.includes('conectados') || query.includes('score') || query.includes('puntaje')) {
      let scoreText = currentScore >= 80 ? 'Excelente 🛡️' : currentScore >= 50 ? 'Riesgo Moderado ⚠️' : 'Estado Crítico 🚨';
      reply = `Actualmente hay **${totalActive} dispositivos activos** en tu red local. El Score de Seguridad de PymeShield es de **${currentScore}/100**, catalogado como **${scoreText}**.\n\n` +
              `Detalles de seguridad de red:\n` +
              `• Dispositivos sospechosos (no autorizados): **${totalUnauthorized}**\n` +
              `• Puertos expuestos en red: **${totalPorts}** (de los cuales **${highRiskPorts}** son de riesgo Alto).\n` +
              `• Alertas pendientes de revisión: **${unreadAlertsCount}**\n\n` +
              `Te recomiendo revisar la pestaña **Resumen de Red** para ver el mapa interactivo o iniciar un escaneo de red fresco.`;
      suggestions = [
        "¿Cuáles son los dispositivos sospechosos?",
        "¿Qué puertos en riesgo tengo?",
        "¿Cómo mejoro mi score?"
      ];
    }
    else if (query.includes('sospechoso') || query.includes('intruso') || query.includes('desconocido') || query.includes('no autorizado') || query.includes('hacker') || query.includes('bloqueado') || query.includes('lista blanca') || query.includes('autorizar')) {
      if (totalUnauthorized === 0) {
        reply = "¡Buenas noticias! **No se detectan dispositivos no autorizados** activos en la red local. Todos los equipos que operan están en la Lista Blanca y han sido validados por ti.";
        suggestions = [
          "¿Cómo está la seguridad de mi red?",
          "¿Qué es la directiva Zero-Trust (NAC)?"
        ];
      } else {
        let listText = unauthorizedActive.map(d => `• **${d.alias || d.hostname}** (IP: ${d.ip} | MAC: ${d.mac} | Marca: ${d.vendor || 'Genérica'})`).join('\n');
        reply = `¡Alerta! He detectado **${totalUnauthorized} dispositivo(s) sospechoso(s) / no autorizado(s)** activos en la red:\n\n${listText}\n\n` +
                `**Medidas recomendadas:**\n` +
                `1. Si reconoces el equipo (ej: el celular de un cliente o empleado), ve a la sección **Dispositivos** en el sidebar y presiona **⚠️ Autorizar** asignándole un nombre descriptivo.\n` +
                `2. Si no lo reconoces y tienes activo el **Modo Zero-Trust (NAC)** en los Ajustes, PymeShield bloqueará su tráfico e inyectará políticas de aislamiento en el firewall del host de inmediato para neutralizar su avance.`;
        suggestions = [
          "¿Qué es la directiva Zero-Trust (NAC)?",
          "¿Cómo inicio un escaneo?",
          "¿Cómo funciona la Lista Blanca?"
        ];
      }
    }
    else if (query.includes('ley') || query.includes('normativa') || query.includes('21719') || query.includes('21.719') || query.includes('21663') || query.includes('21.663') || query.includes('multas') || query.includes('sanciones') || query.includes('cumplimiento') || query.includes('obligación') || query.includes('gubernamental') || query.includes('regulaci')) {
      reply = "La ciberseguridad corporativa en Chile cambió profundamente con la promulgación de dos normativas claves:\n\n" +
              "• **Ley N° 21.719 (Protección de Datos Personales)**: Protege los datos personales de clientes, pacientes y alumnos. Las fugas de datos o no contar con medidas básicas de seguridad acarrea multas de hasta **20.000 UTM** (aproximadamente $1.300 millones de pesos). PymeShield ayuda a cumplirla entregando el **Reporte de Cumplimiento PDF** que demuestra controles de seguridad activos.\n" +
              "• **Ley N° 21.663 (Ley Marco de Ciberseguridad)**: Crea la Agencia Nacional de Ciberseguridad (ANCI) y obliga a las instituciones (como CESFAM o colegios) a implementar controles preventivos e informar incidentes en un plazo máximo de **3 horas** al CSIRT nacional.\n\nPymeShield automatiza estos reportes para darte tranquilidad ante inspecciones y multas.";
      suggestions = [
        "¿Cómo me ayuda PymeShield con la ley?",
        "¿Cómo descargo el Reporte PDF?",
        "¿Qué es la ANCI y el CSIRT?"
      ];
    }
    else if (query.includes('ayuda nist') || query.includes('nist') || query.includes('marco') || query.includes('estandar') || query.includes('csf') || query.includes('funciones') || query.includes('identificar') || query.includes('proteger') || query.includes('detectar') || query.includes('responder') || query.includes('recuperar')) {
      reply = "PymeShield está alineado con el estándar de ciberseguridad mundial **NIST CSF 2.0 (Cybersecurity Framework)** cubriendo sus 5 pilares funcionales de forma simplificada:\n\n" +
              "• **Identificar (ID)**: Mapeo interactivo elíptico en 3D de la topología local e inventario automatizado.\n" +
              "• **Proteger (PR)**: Doble Factor de Autenticación (MFA/TOTP) y generación de Scripts de Hardening.\n" +
              "• **Detectar (DE)**: Escaneo híbrido de 14 puertos lógicos críticos e identificación de intrusos.\n" +
              "• **Responder (RS)**: Aislamiento dinámico en firewall (NAC Zero-Trust) y despachos Webhooks en JSON a sistemas SOAR.\n" +
              "• **Recuperar (RC)**: Bitácora de auditoría histórica y Reporte de cumplimiento PDF firmado para evidenciar remediación.";
      suggestions = [
        "¿Qué es el Hardening?",
        "¿Cómo configuro el MFA?",
        "Ver mi resumen de red"
      ];
    }
    else if (query.includes('puerto') || query.includes('puertos') || query.includes('riesgo') || query.includes('vulnerabilidad') || query.includes('abierto') || query.includes('amenaza') || query.includes('eternalblue') || query.includes('bluekeep') || query.includes('wannacry')) {
      if (totalPorts === 0) {
        reply = "¡Excelente! **No se detectan puertos críticos abiertos** en los dispositivos activos de la red. Esto significa que la superficie de ataque expuesta de tus computadores está debidamente minimizada.";
        suggestions = [
          "¿Cómo está la seguridad de mi red?",
          "¿Qué es la directiva Zero-Trust (NAC)?"
        ];
      } else {
        reply = `Se detectan **${totalPorts} puertos expuestos** en los equipos de tu red local:\n\n${portsListText.join('\n')}\n\n` +
                `**Amenazas críticas de red comunes:**\n` +
                `• **Puerto 445 (SMB)**: Vulnerable al exploit *EternalBlue*. Fue la vía de propagación de ransomware como **WannaCry**, el cual secuestra y cifra todos los archivos del negocio pidiendo rescates monetarios.\n` +
                `• **Puerto 3389 (RDP)**: Escritorio remoto de Windows expuesto. Vulnerable a *BlueKeep*. Permite a un atacante tomar control total de la máquina sin credenciales.\n` +
                `• **Puerto 22 (SSH)**: Puerto de consola remota Linux. Expuesto a ataques de fuerza bruta automatizados.\n\n` +
                `Ve a la sección **Puertos Abiertos** o descarga un script de Hardening en la pestaña **Dispositivos** para solucionarlo.`;
        suggestions = [
          "¿Qué es un script de Hardening?",
          "¿Cómo descargo los scripts de remediación?",
          "¿Cómo se simula un ataque?"
        ];
      }
    }
    else if (query.includes('zero-trust') || query.includes('zerotrust') || query.includes('nac') || query.includes('firewall') || query.includes('bloqueo') || query.includes('aislar') || query.includes('contencion')) {
      reply = "El módulo **NAC Zero-Trust (Control de Admisión de Red)** de PymeShield implementa una política de seguridad estricta: **'Nunca confiar, siempre verificar'**:\n\n" +
              "• **Aislamiento en Firewall**: Si se activa un escaneo y hay un dispositivo desconocido (no autorizado) operando, PymeShield ejecuta comandos del sistema operativo local (como `netsh advfirewall` en Windows) para bloquear e impedir su tráfico en la subred.\n" +
              "• **Prevenir Propagación**: De esta forma, el dispositivo sospechoso no puede realizar escaneos de vulnerabilidades, infectar con ransomware o conectarse a otros servidores de la oficina.\n\nPuedes habilitarlo o deshabilitarlo con un interruptor en la pestaña **Ajustes de Acceso**.";
      suggestions = [
        "¿Cómo se simula una intrusión?",
        "¿Qué hace el Agente Endpoint?",
        "Ver mi resumen de red"
      ];
    }
    else if (query.includes('hardening') || query.includes('script') || query.includes('remediaci') || query.includes('solucion') || query.includes('corregir') || query.includes('reparar') || query.includes('mejorar score')) {
      reply = "El **Hardening** (endurecimiento) es un conjunto de buenas prácticas técnicas para cerrar configuraciones inseguras de fábrica en computadores.\n\nPymeShield automatiza esto:\n" +
              "• Genera scripts auto-ejecutables (`.bat` para Windows y `.sh` para Linux/macOS) adaptados a los puertos abiertos que tiene tu PC en el escaneo.\n" +
              "• Al descargarlo y ejecutarlo en la máquina vulnerable (con doble clic), desactiva protocolos obsoletos (como SMBv1/v2 vulnerable) y bloquea puertos inseguros de manera autónoma, aumentando de inmediato tu Score de Seguridad.";
      suggestions = [
        "¿Cómo funciona la Lista Blanca?",
        "¿Qué exige la Ley N° 21.719 de datos?",
        "Ver mi resumen de red"
      ];
    }
    else if (query.includes('mfa') || query.includes('totp') || query.includes('segundo factor') || query.includes('doble factor') || query.includes('autenticaci') || query.includes('google authenticator') || query.includes('token')) {
      reply = "PymeShield implementa **MFA (Doble Factor de Autenticación)** real mediante el protocolo estándar TOTP (RFC 6238):\n\n" +
              "• **¿Por qué es necesario?**: Cumple con la directiva NIST de control de acceso robusto. Aunque un atacante te rote la contraseña administrativa, no podrá entrar al panel sin el código dinámico de 6 dígitos de tu celular.\n" +
              "• **Configuración**: Se realiza en el portal de acceso escaneando un código QR con apps como Google Authenticator o Microsoft Authenticator.\n" +
              "• **Administración**: Puedes desvincular el dispositivo o restablecer el factor desde la pestaña **Ajustes de Acceso**.";
      suggestions = [
        "¿Qué es la directiva Zero-Trust (NAC)?",
        "¿Cómo funciona la Bitácora de Actividad?"
      ];
    }
    else {
      // Fallback
      reply = "Entiendo tu pregunta, pero como asistente local de PymeShield, estoy especializado en responder sobre tu red y ciberseguridad práctica. ¿Te gustaría saber sobre alguno de estos temas?";
      suggestions = [
        "¿Cómo está la seguridad de mi red?",
        "¿Qué exige la Ley N° 21.719 de datos?",
        "¿Qué es la directiva Zero-Trust (NAC)?",
        "¿Qué puertos en riesgo tengo?"
      ];
    }
    
    return res.json({ reply, suggestions });
  } catch (err) {
    console.error("Error en PymeShield Assistant API:", err);
    return res.status(500).json({ error: "Error interno del asistente virtual local: " + err.message });
  }
});

// TRIGGER MANUAL SCAN
app.post('/api/scan', async (req, res) => {
  if (isScanning) {
    return res.status(400).json({ error: 'Escaneo ya en ejecución' });
  }
  res.json({ status: 'started' });
  try {
    await runNetworkScan(false);
  } catch (err) {
    console.error('Error al ejecutar escaneo manual:', err);
  }
});

// GET SCAN HISTORY FOR TREND CHART
app.get('/api/scans/history', async (req, res) => {
  try {
    const history = await prisma.scanHistory.findMany({
      orderBy: { timestamp: 'asc' },
      take: 8
    });
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PDF REPORT GENERATOR (NIST RECUPERAR)
app.get('/api/reports/pdf', async (req, res) => {
  try {
    const devices = await prisma.device.findMany({ include: { ports: true } });
    const alerts = await prisma.alert.findMany({ where: { status: 'No leída' } });
    const recommendations = await prisma.recommendation.findMany();
    const lastScan = await prisma.scanHistory.findFirst({ orderBy: { timestamp: 'desc' } });

    const doc = new PDFDocument({ size: 'A4', margin: 40 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=Reporte_Cumplimiento_PymeShield.pdf');
    doc.pipe(res);

    // Blue Banner Header
    doc.rect(0, 0, 595, 75).fill('#1e3a8a');
    doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold').text('PymeShield', 40, 20);
    doc.fillColor('#cbd5e1').fontSize(10).font('Helvetica').text('Panel de Control y Auditoría de Ciberseguridad local', 40, 46);

    // Subtitle & Metadata
    doc.fillColor('#64748b').fontSize(8).text('Reporte Oficial de Cumplimiento Técnico (Ley N° 21.719 / Ley N° 21.663)', 40, 90, { align: 'right' });
    doc.y = 110;

    // Summary Box
    const startY = doc.y;
    doc.rect(40, startY, 515, 65).fill('#f8fafc');
    doc.strokeColor('#cbd5e1').lineWidth(0.5).rect(40, startY, 515, 65).stroke();

    doc.fillColor('#1e293b').fontSize(11).font('Helvetica-Bold').text('Resumen del Estado de la Red', 55, startY + 10);
    doc.fontSize(9).font('Helvetica').fillColor('#475569');
    doc.text(`Fecha de Auditoría: ${new Date().toLocaleString()}`, 55, startY + 26);
    doc.text(`Dispositivos Totales: ${devices.length} (${devices.filter(d => d.status === 'Activo').length} Activos)`, 55, startY + 40);

    const score = lastScan ? lastScan.score : 87;
    const scoreText = score >= 90 ? 'Bueno' : score >= 70 ? 'Regular' : 'Crítico';
    const scoreColor = score >= 90 ? '#10b981' : score >= 70 ? '#f59e0b' : '#ef4444';

    doc.text(`Puntuación de Seguridad:`, 310, startY + 26);
    doc.fillColor(scoreColor).font('Helvetica-Bold').text(`${score}/100 (${scoreText})`, 430, startY + 26);

    doc.font('Helvetica').fillColor('#475569');
    doc.text(`Alertas Críticas Pendientes:`, 310, startY + 40);
    doc.fillColor(alerts.length > 0 ? '#ef4444' : '#475569').font('Helvetica-Bold').text(`${alerts.length}`, 445, startY + 40);

    // Advance doc cursor properly
    doc.y = startY + 85;

    // Helper: Draw Table Headers
    const drawTableHeader = (doc, y) => {
      doc.rect(40, y, 515, 20).fill('#1e293b');
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold');
      doc.text('IP', 45, y + 5, { width: 90 });
      doc.text('MAC', 135, y + 5, { width: 110 });
      doc.text('Nombre / Fabricante', 250, y + 5, { width: 160 });
      doc.text('Nivel Riesgo', 420, y + 5, { width: 70 });
      doc.text('Estado', 495, y + 5, { width: 55 });
      doc.font('Helvetica'); // Reset
    };

    // 1. Devices Section
    doc.fillColor('#1e293b').fontSize(12).font('Helvetica-Bold').text('1. Inventario de Dispositivos Conectados (NIST: IDENTIFICAR)');
    doc.moveDown(0.5);

    let tableY = doc.y;
    drawTableHeader(doc, tableY);
    tableY += 20;

    let alternating = false;
    for (const d of devices) {
      if (tableY > 720) {
        doc.addPage();
        tableY = 50;
        drawTableHeader(doc, tableY);
        tableY += 20;
      }

      if (alternating) {
        doc.rect(40, tableY, 515, 20).fill('#f8fafc');
      }
      alternating = !alternating;

      doc.fillColor('#334155').fontSize(9).font('Helvetica');
      doc.text(d.ip, 45, tableY + 5);
      doc.text(d.mac, 135, tableY + 5);
      doc.text(`${d.hostname} (${d.vendor || 'Genérico'})`, 250, tableY + 5, { width: 165, ellipsis: true });

      const riskColor = d.riskLevel === 'Alto' ? '#ef4444' : d.riskLevel === 'Medio' ? '#f59e0b' : '#10b981';
      doc.fillColor(riskColor).font('Helvetica-Bold').text(d.riskLevel, 420, tableY + 5);

      const statusColor = d.status === 'Activo' ? '#10b981' : d.status === 'Bloqueado' ? '#ef4444' : '#64748b';
      doc.fillColor(statusColor).text(d.status, 495, tableY + 5);

      doc.strokeColor('#e2e8f0').lineWidth(0.5).moveTo(40, tableY + 20).lineTo(555, tableY + 20).stroke();
      tableY += 20;
    }

    // Set cursor below table
    doc.y = tableY;
    doc.moveDown(2);

    // 2. Vulnerabilities / Ports Section
    doc.fillColor('#1e293b').fontSize(12).font('Helvetica-Bold').text('2. Puertos Expuestos y Servicios (NIST: PROTEGER / DETECTAR)');
    doc.moveDown(0.5);

    let hasPorts = false;
    doc.fontSize(9).font('Helvetica').fillColor('#475569');
    for (const d of devices) {
      if (d.ports && d.ports.length > 0) {
        hasPorts = true;
        
        if (doc.y > 700) doc.addPage();
        
        doc.fillColor('#1e293b').font('Helvetica-Bold').text(`Dispositivo: ${d.hostname} (${d.ip})`, { paragraphGap: 4 });
        for (const p of d.ports) {
          if (doc.y > 725) doc.addPage();
          
          doc.fillColor('#ef4444').font('Helvetica-Bold').text(`  · Puerto :${p.portNumber} (${p.serviceName})`, { continued: true });
          doc.fillColor('#475569').font('Helvetica').text(` - Riesgo: ${p.riskLevel} - ${p.description || 'Puerto abierto expuesto en la red.'}`, { paragraphGap: 3 });
        }
        doc.moveDown(0.5);
      }
    }

    if (!hasPorts) {
      doc.text('No se detectaron puertos vulnerables o expuestos en los dispositivos conectados en este escaneo.', { paragraphGap: 10 });
      doc.moveDown(1);
    }

    // 3. Action Plan / Recommendations Section
    if (doc.y > 600) {
      doc.addPage();
    } else {
      doc.moveDown(1.5);
    }
    
    doc.fillColor('#1e293b').fontSize(12).font('Helvetica-Bold').text('3. Plan de Acción y Recomendaciones (NIST: RESPONDER / RECUPERAR)');
    doc.moveDown(0.5);

    let idx = 1;
    for (const r of recommendations) {
      if (doc.y > 700) doc.addPage();

      const prioColor = r.priority === 'Alta' ? '#ef4444' : r.priority === 'Media' ? '#f59e0b' : '#3b82f6';

      const cleanDesc = r.description
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?[a-z][a-z0-9]*[^<>]*>/gi, '');

      doc.fillColor('#1e293b').fontSize(10).font('Helvetica-Bold').text(`${idx}. ${r.title}`, { continued: true });
      doc.fillColor(prioColor).text(`  [Prioridad: ${r.priority}]`, { paragraphGap: 4 });
      doc.fillColor('#475569').fontSize(9).font('Helvetica').text(`Guía paso a paso para solucionar:\n${cleanDesc}`, { paragraphGap: 14 });
      idx++;
    }

    // Footer Signature
    if (doc.y > 680) {
      doc.addPage();
    } else {
      doc.moveDown(2);
    }

    const signY = doc.y + 20;
    doc.strokeColor('#94a3b8').lineWidth(0.5).moveTo(150, signY).lineTo(395, signY).stroke();
    doc.y = signY + 5;
    doc.fillColor('#64748b').fontSize(8).font('Helvetica').text('Firma Responsable TI / Auditor PymeShield', { align: 'center' });

    doc.end();
  } catch (error) {
    res.status(500).send('Error generando PDF: ' + error.message);
  }
});

// GET: Generar script de Hardening para mitigar puertos abiertos (NIST PROTEGER/RECUPERAR)
app.get('/api/devices/:id/hardening-script', async (req, res) => {
  if (licenseStatus === 'Demo') {
    return res.status(403).send('🔒 Acceso Denegado: La descarga de scripts de Hardening esta deshabilitada en la version Demo. Ingrese una clave de licencia activa en el panel de Ajustes.');
  }
  const { id } = req.params;
  const targetOs = req.query.os || 'windows'; // 'windows' o 'linux'
  try {
    const device = await prisma.device.findUnique({
      where: { id },
      include: { ports: true }
    });
    if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });

    let scriptContent = '';
    let fileName = '';

    if (targetOs === 'windows') {
      fileName = `Hardening_${device.ip.replace(/\./g, '_')}.bat`;
      scriptContent = `@echo off\ntitle Script de Hardening - PymeShield (${device.ip})\n`;
      scriptContent += `echo =======================================================\n`;
      scriptContent += `echo   Aplicando Mitigacion de Vulnerabilidades - PymeShield\n`;
      scriptContent += `echo   Dispositivo: ${device.hostname} (IP: ${device.ip})\n`;
      scriptContent += `echo =======================================================\n\n`;

      if (device.ports && device.ports.length > 0) {
        for (const port of device.ports) {
          scriptContent += `echo [+] Mitigando vulnerabilidad en Puerto ${port.portNumber} (${port.serviceName})...\n`;
          if (port.portNumber === 22) {
            scriptContent += `echo [SSH] Cerrando puerto 22 en el Firewall local...\n`;
            scriptContent += `netsh advfirewall firewall add rule name="PymeShield_Hardening_SSH" dir=in action=block protocol=TCP localport=22\n`;
          } else if (port.portNumber === 445) {
            scriptContent += `echo [SMB] Deshabilitando protocolo inseguro SMBv1 y bloqueando puerto 445...\n`;
            scriptContent += `powershell -ExecutionPolicy Bypass -Command "Disable-WindowsOptionalFeature -Online -FeatureName SMB1Protocol -NoRestart" >nul 2>&1\n`;
            scriptContent += `netsh advfirewall firewall add rule name="PymeShield_Hardening_SMB" dir=in action=block protocol=TCP localport=445\n`;
          } else if (port.portNumber === 3389) {
            scriptContent += `echo [RDP] Deshabilitando servicio de Escritorio Remoto inseguro...\n`;
            scriptContent += `reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server" /v fDenyTSConnections /t REG_DWORD /d 1 /f >nul 2>&1\n`;
            scriptContent += `netsh advfirewall firewall add rule name="PymeShield_Hardening_RDP" dir=in action=block protocol=TCP localport=3389\n`;
          } else if (port.portNumber === 5900) {
            scriptContent += `echo [VNC] Bloqueando acceso a VNC sin cifrar...\n`;
            scriptContent += `netsh advfirewall firewall add rule name="PymeShield_Hardening_VNC" dir=in action=block protocol=TCP localport=5900\n`;
          } else if (port.portNumber === 139) {
            scriptContent += `echo [NetBIOS] Bloqueando puerto de NetBIOS...\n`;
            scriptContent += `netsh advfirewall firewall add rule name="PymeShield_Hardening_NetBIOS" dir=in action=block protocol=TCP localport=139\n`;
          } else if (port.portNumber === 1433) {
            scriptContent += `echo [MSSQL] Cerrando acceso externo a SQL Server...\n`;
            scriptContent += `netsh advfirewall firewall add rule name="PymeShield_Hardening_MSSQL" dir=in action=block protocol=TCP localport=1433\n`;
          } else if (port.portNumber === 3306) {
            scriptContent += `echo [MySQL] Cerrando acceso externo a MySQL...\n`;
            scriptContent += `netsh advfirewall firewall add rule name="PymeShield_Hardening_MySQL" dir=in action=block protocol=TCP localport=3306\n`;
          } else {
            scriptContent += `echo [Web/Generico] Bloqueando puerto generico ${port.portNumber}...\n`;
            scriptContent += `netsh advfirewall firewall add rule name="PymeShield_Hardening_Port_${port.portNumber}" dir=in action=block protocol=TCP localport=${port.portNumber}\n`;
          }
          scriptContent += `echo [OK] Mitigacion aplicada para puerto ${port.portNumber}.\n\n`;
        }
      } else {
        scriptContent += `echo [OK] No se detectaron puertos vulnerables activos que requieran hardening.\n`;
      }
      scriptContent += `echo.\necho =======================================================\n`;
      scriptContent += `echo   Hardening completado exitosamente.\n`;
      scriptContent += `echo =======================================================\n`;
      scriptContent += `pause\n`;
    } else {
      fileName = `Hardening_${device.ip.replace(/\./g, '_')}.sh`;
      scriptContent = `#!/bin/bash\n# Script de Hardening - PymeShield (${device.ip})\n`;
      scriptContent += `echo "======================================================="\n`;
      scriptContent += `echo "  Aplicando Mitigacion de Vulnerabilidades - PymeShield"\n`;
      scriptContent += `echo "  Dispositivo: ${device.hostname} (IP: ${device.ip})"\n`;
      scriptContent += `echo "======================================================="\n\n`;

      if (device.ports && device.ports.length > 0) {
        for (const port of device.ports) {
          scriptContent += `echo "[+] Mitigando puerto ${port.portNumber} (${port.serviceName})..."\n`;
          if (port.portNumber === 22) {
            scriptContent += `echo "[SSH] Bloqueando puerto SSH 22 usando ufw..."\n`;
            scriptContent += `sudo ufw deny 22/tcp >/dev/null 2>&1 || sudo iptables -A INPUT -p tcp --dport 22 -j DROP\n`;
          } else if (port.portNumber === 445) {
            scriptContent += `echo "[SMB] Bloqueando puerto Samba 445..."\n`;
            scriptContent += `sudo ufw deny 445/tcp >/dev/null 2>&1 || sudo iptables -A INPUT -p tcp --dport 445 -j DROP\n`;
          } else if (port.portNumber === 3306) {
            scriptContent += `echo "[MySQL] Cerrando acceso externo a MySQL..."\n`;
            scriptContent += `sudo ufw deny 3306/tcp >/dev/null 2>&1 || sudo iptables -A INPUT -p tcp --dport 3306 -j DROP\n`;
          } else {
            scriptContent += `echo "[Generico] Bloqueando puerto ${port.portNumber}..."\n`;
            scriptContent += `sudo ufw deny ${port.portNumber}/tcp >/dev/null 2>&1 || sudo iptables -A INPUT -p tcp --dport ${port.portNumber} -j DROP\n`;
          }
          scriptContent += `echo "[OK] Mitigacion aplicada para puerto ${port.portNumber}."\n\n`;
        }
      } else {
        scriptContent += `echo "[OK] No se detectaron puertos vulnerables activos que requieran hardening."\n`;
      }
      scriptContent += `echo "Hardening completado."\n`;
    }

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(scriptContent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST: Simulador de ataque e intrusión en vivo (Didáctico para Tesis)
app.post('/api/scan/simulate-attack', async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress;
  try {
    const mac = 'EA:AA:BB:CC:DD:EE';
    const hostname = 'Rogue-Hacker-Device (Simulado)';
    const ipSim = '192.168.1.66';
    const vendor = 'Dispositivo Genérico';
    
    let dev = await prisma.device.findUnique({ where: { mac } });
    let isNew = false;
    if (!dev) {
      isNew = true;
      dev = await prisma.device.create({
        data: {
          ip: ipSim,
          mac,
          hostname,
          vendor,
          status: 'Activo',
          riskLevel: 'Alto',
          isAuthorized: false
        }
      });
    } else {
      dev = await prisma.device.update({
        where: { mac },
        data: {
          ip: ipSim,
          status: 'Activo',
          riskLevel: 'Alto',
          isAuthorized: false
        }
      });
    }

    // Crear puertos de ataque expuestos
    await prisma.port.deleteMany({ where: { deviceId: dev.id } });
    await prisma.port.createMany({
      data: [
        { portNumber: 22, serviceName: 'SSH', riskLevel: 'Alto', description: 'Acceso SSH abierto para fuerza bruta.', deviceId: dev.id },
        { portNumber: 445, serviceName: 'SMB', riskLevel: 'Medio', description: 'Servicio Samba vulnerable a exploit EternalBlue.', deviceId: dev.id },
        { portNumber: 3389, serviceName: 'RDP', riskLevel: 'Alto', description: 'Acceso Escritorio Remoto vulnerable a BlueKeep.', deviceId: dev.id }
      ]
    });

    let status = 'Activo';
    let blockedText = '';
    if (zeroTrustMode) {
      status = 'Bloqueado';
      await prisma.device.update({
        where: { id: dev.id },
        data: { status: 'Bloqueado' }
      });

      // Intentar bloqueo firewall
      try {
        await executeFirewallBlock(ipSim, true);
      } catch (e) {
        // Ignorar si no es admin
      }

      blockedText = ' y bloqueado automaticamente por la directiva NAC Zero-Trust';
      
      await logEvent(
        'CONTAINMENT_ACTION',
        `NAC (SIMULADO): Dispositivo de intrusion de alto riesgo '${hostname}' (IP ${ipSim}, MAC ${mac}) detectado en la red${blockedText}.`,
        ipSim
      );
    } else {
      await logEvent(
        'SECURITY_ALERT',
        `ALERTA (SIMULADA): Dispositivo no autorizado de alto riesgo '${hostname}' (IP ${ipSim}, MAC ${mac}) detectado operando en la LAN.`,
        ipSim
      );
    }

    // Alerta de sistema
    await prisma.alert.create({
      data: {
        title: zeroTrustMode ? 'Intrusion Contenida (NAC)' : 'Intrusion Detectada',
        description: `Se detecto al atacante con IP ${ipSim} intentando realizar un escaneo de puertos local${blockedText}.`,
        riskLevel: 'Rojo',
        status: 'No leída'
      }
    });

    // Enviar Webhook SOAR
    if (webhookUrl) {
      await sendWebhookAlert(
        'CONTAINMENT_ACTION',
        zeroTrustMode ? 'PymeShield: Intruso Bloqueado por NAC (Zero-Trust)' : 'PymeShield: Intruso Detectado en la LAN',
        `NAC: El host sospechoso '${hostname}' (IP ${ipSim}, MAC ${mac}) fue identificado operando de forma anomala con puertos abiertos. Accion: ${zeroTrustMode ? 'BLOQUEADO' : 'NOTIFICADO'}.`,
        'Rojo'
      );
    }

    broadcast({ type: 'alert_new', message: `Intrusion simulada de ${ipSim}` });
    broadcast({ type: 'complete', score: 45, isBackground: false });

    return res.json({ success: true, zeroTrustActive: zeroTrustMode });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

// START BACKEND SERVER AND RUN SEEDING
const PORT = process.env.PORT || 3000;
server.on('upgrade', (request, socket, head) => {
  if (request.url === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, async () => {
  console.log(`\n========================================`);
  console.log(`Servidor PymeShield iniciado en puerto ${PORT}`);
  console.log(`Dirección: http://localhost:${PORT}`);
  console.log(`========================================\n`);
  
  try {
    await seedData();
    console.log('Semillero de base de datos cargado correctamente.');
  } catch (err) {
    console.error('Error cargando semillero:', err);
  }

  // Background timer: run automatic scan every 3 minutes
  const THREE_MINUTES = 3 * 60 * 1000;
  setInterval(async () => {
    console.log('Ejecutando escaneo automático de fondo...');
    try {
      await runNetworkScan(true);
      console.log('Escaneo automático de fondo completado.');
    } catch (err) {
      console.log('Escaneo automático de fondo omitido/fallado:', err.message);
    }
  }, THREE_MINUTES);
});
