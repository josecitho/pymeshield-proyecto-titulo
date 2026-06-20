const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { PrismaClient } = require('@prisma/client');
const { exec } = require('child_process');
const os = require('os');
const net = require('net');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let isScanning = false;
let demoMode = true; // Active by default for academic presentation

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
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Look for IPv4 and non-internal interface
      if (iface.family === 'IPv4' && !iface.internal) {
        const ip = iface.address;
        const netmask = iface.netmask;
        // Check if IP is in private range
        if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
          const parts = ip.split('.');
          const prefix = parts.slice(0, 3).join('.');
          return { ip, netmask, prefix };
        }
      }
    }
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


  // Seed demo scan history for trend chart (always reset in demo mode)
  await prisma.scanHistory.deleteMany();
  if (demoMode) {
    const now = new Date();
    const demoHistory = [
      { daysAgo: 13, score: 58, devices: 5, critical: 3 },
      { daysAgo: 11, score: 62, devices: 5, critical: 3 },
      { daysAgo: 9,  score: 55, devices: 6, critical: 4 },
      { daysAgo: 7,  score: 70, devices: 5, critical: 2 },
      { daysAgo: 5,  score: 74, devices: 5, critical: 2 },
      { daysAgo: 3,  score: 68, devices: 6, critical: 3 },
      { daysAgo: 1,  score: 72, devices: 5, critical: 2 },
      { daysAgo: 0,  score: 65, devices: 5, critical: 2 },
    ];
    for (const h of demoHistory) {
      const ts = new Date(now);
      ts.setDate(ts.getDate() - h.daysAgo);
      ts.setHours(9 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 60));
      await prisma.scanHistory.create({
        data: {
          timestamp: ts,
          devicesCount: h.devices,
          criticalAlertsCount: h.critical,
          score: h.score
        }
      });
    }
  }

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
}

// API Routes

// Settings
app.get('/api/settings', (req, res) => {
  res.json({ demoMode });
});

app.post('/api/settings/toggle-demo', async (req, res) => {
  demoMode = !demoMode;
  res.json({ success: true, demoMode });
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
  const { id } = req.body;
  try {
    const device = await prisma.device.findUnique({ where: { id } });
    if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });
    
    const updated = await prisma.device.update({
      where: { id },
      data: { isAuthorized: !device.isAuthorized },
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Block Device (Contention Module)
app.post('/api/devices/block', async (req, res) => {
  const { id, block } = req.body;
  try {
    const device = await prisma.device.findUnique({ where: { id } });
    if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });
    
    const status = block ? 'Bloqueado' : 'Activo';
    
    // Perform real firewall rule block in Windows (if administrator)
    const blockCmd = block 
      ? `netsh advfirewall firewall add rule name="PymeShield Block ${device.ip}" dir=in action=block protocol=ANY remoteip=${device.ip}`
      : `netsh advfirewall firewall delete rule name="PymeShield Block ${device.ip}"`;
      
    exec(blockCmd, (err, stdout) => {
      if (err) {
        console.log('Nota: No se pudo modificar la regla de firewall local (requiere privilegios de Administrador).');
      } else {
        console.log(`Comando firewall ejecutado: ${blockCmd}`);
      }
    });

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

// HELPER: Core Network Scan Implementation
async function runNetworkScan(isBackground = false) {
  if (isScanning) {
    throw new Error('El motor de escaneo ya se encuentra en ejecución.');
  }
  isScanning = true;

  try {
    if (!isBackground) {
      broadcast({ type: 'progress', percent: 5, message: 'Analizando adaptador de red...' });
    }
    const { prefix, ip: localIp } = getLocalSubnet();
    console.log(`[${isBackground ? 'Segundo Plano' : 'Manual'}] Iniciando escaneo de red en subred: ${prefix}.0/24`);

    if (!isBackground) {
      broadcast({ type: 'progress', percent: 15, message: `Realizando barrido de pings en ${prefix}.0/24 (Hosts locales)...` });
    }

    const activeIps = [localIp];
    const pingPromises = [];
    const currentLastOctet = parseInt(localIp.split('.')[3]);
    const startOctet = Math.max(1, currentLastOctet - 20);
    const endOctet = Math.min(254, currentLastOctet + 20);

    // Ping gateway
    pingPromises.push(new Promise((r) => exec(`ping -n 1 -w 100 ${prefix}.1`, () => r())));

    for (let i = startOctet; i <= endOctet; i++) {
      const ip = `${prefix}.${i}`;
      if (ip !== localIp) {
        pingPromises.push(new Promise((r) => {
          exec(`ping -n 1 -w 80 ${ip}`, (err) => {
            if (!err) activeIps.push(ip);
            r();
          });
        }));
      }
    }
    await Promise.all(pingPromises);

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

          const portsToCheck = [22, 80, 443, 445, 3389];
          const dbDevices = [];

          let completedCount = 0;
          for (const dev of scannedDevices) {
            const vendor = await getVendor(dev.mac);
            let hostname = 'Dispositivo Genérico';
            if (dev.ip === localIp) {
              hostname = 'Esta Máquina (Host)';
            } else if (dev.ip.endsWith('.1')) {
              hostname = 'Puerta de Enlace (Router)';
            }

            const openPorts = [];
            for (const port of portsToCheck) {
              const open = await checkPort(dev.ip, port, 150);
              if (open) {
                let sName = 'Desconocido';
                let risk = 'Bajo';
                let desc = '';
                if (port === 22) { sName = 'SSH'; risk = 'Alto'; desc = 'Acceso de control técnico remoto sin llave de seguridad.'; }
                if (port === 80) { sName = 'HTTP'; risk = 'Bajo'; desc = 'Página de configuración web del equipo sin cifrado.'; }
                if (port === 443) { sName = 'HTTPS'; risk = 'Bajo'; desc = 'Conexión web segura y cifrada.'; }
                if (port === 445) { sName = 'SMB'; risk = 'Medio'; desc = 'Carpetas de archivos compartidos visibles para toda la red.'; }
                if (port === 3389) { sName = 'RDP'; risk = 'Alto'; desc = 'Control total de la pantalla del computador visible en Internet.'; }
                
                openPorts.push({ portNumber: port, serviceName: sName, riskLevel: risk, description: desc });
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
            let dbDev;
            if (existing) {
              dbDev = await prisma.device.update({
                where: { mac: dev.mac },
                data: {
                  ip: dev.ip,
                  hostname: dev.hostname,
                  vendor: dev.vendor,
                  status: dev.status,
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
                  status: dev.status,
                  riskLevel: dev.riskLevel,
                  isAuthorized: dev.isAuthorized
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
