# 🛡️ PymeShield — Panel de Seguridad de Red para PYMEs

> **Proyecto de Titulación — Técnico en Nivel Superior en Informática Mención Ciberseguridad**
> Centro de Formación Técnica de la Región de Valparaíso · 2026

---

## 📋 Descripción General

**PymeShield** es una aplicación web de ciberseguridad diseñada para pequeñas y medianas empresas (PYMEs) chilenas que no cuentan con un equipo de TI dedicado. Permite monitorear en tiempo real los dispositivos conectados a la red local, detectar vulnerabilidades, generar alertas automáticas y producir reportes de cumplimiento normativo en formato PDF.

El sistema está alineado con el **Marco de Ciberseguridad NIST (CSF 2.0)** y los lineamientos de la **Ley N° 21.663 de Ciberseguridad** vigente en Chile.

---

## 🎯 Problema que Resuelve

La mayoría de las PYMEs chilenas operan sin ningún tipo de monitoreo de red. Esto las expone a:

- Dispositivos desconocidos conectados a su Wi-Fi corporativo
- Puertos críticos abiertos (RDP, SSH, SMB) sin saberlo
- Ausencia de historial de incidentes o trazabilidad
- Imposibilidad de generar reportes de cumplimiento para auditorías

**PymeShield** transforma este escenario entregando visibilidad total de la red en un panel simple, sin necesidad de conocimientos técnicos avanzados.

---

## ⚙️ Stack Tecnológico

| Capa | Tecnología | Propósito |
|------|-----------|-----------|
| **Frontend** | HTML5 + CSS3 + JavaScript Vanilla | Interfaz de usuario responsiva |
| **Backend** | Node.js + Express.js | API REST y servidor web |
| **Base de Datos** | SQLite + Prisma ORM | Persistencia de dispositivos, alertas y escaneos |
| **Tiempo Real** | WebSocket (ws) | Progreso de escaneo en vivo |
| **Reportes** | PDFKit | Generación de reportes PDF de cumplimiento |
| **Escaneo de Red** | TCP Socket Probing + ARP + ICMP Ping | Descubrimiento de hosts y puertos |

---

## 🏗️ Arquitectura del Sistema

```
┌─────────────────────────────────────────────────┐
│                   NAVEGADOR WEB                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ index.html│  │  app.js  │  │   style.css   │  │
│  └─────┬────┘  └────┬─────┘  └───────────────┘  │
│        │             │ HTTP REST + WebSocket       │
└────────┼─────────────┼────────────────────────────┘
         │             │
┌────────▼─────────────▼────────────────────────────┐
│                  SERVER.JS (Express)                │
│  ┌─────────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ API REST    │  │WebSocket │  │  PDF Engine  │  │
│  │ /api/*      │  │  /ws     │  │  (PDFKit)    │  │
│  └──────┬──────┘  └────┬─────┘  └──────────────┘  │
│         │              │                            │
│  ┌──────▼──────────────▼──────────────────────┐    │
│  │          MOTOR DE ESCANEO DE RED            │    │
│  │  Ping ICMP → ARP Table → TCP Port Probe     │    │
│  └──────────────────┬─────────────────────────┘    │
│                     │ Prisma ORM                    │
│  ┌──────────────────▼─────────────────────────┐    │
│  │            SQLite (dev.db)                  │    │
│  │  Device · Port · Alert · Recommendation     │    │
│  │  ScanHistory                                │    │
│  └─────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────┘
         │
┌────────▼────────────────┐
│     RED LOCAL (LAN)      │
│  Router · PCs · NAS     │
│  Impresoras · Celulares  │
└─────────────────────────┘
```

---

## 🔐 Marco de Seguridad NIST Implementado

PymeShield implementa las 5 funciones del **NIST Cybersecurity Framework (CSF) 2.0**:

| Función NIST | Implementación en PymeShield |
|-------------|------------------------------|
| **IDENTIFICAR** | Inventario automático de dispositivos, MACs, fabricantes y hostnames |
| **PROTEGER** | Detección de puertos expuestos (SSH, RDP, SMB, HTTP), bloqueo de dispositivos vía `netsh` |
| **DETECTAR** | Alertas automáticas por dispositivos no autorizados, escaneo periódico cada 3 minutos |
| **RESPONDER** | Panel de alertas en tiempo real vía WebSocket, acción de bloqueo inmediata |
| **RECUPERAR** | Reporte PDF de cumplimiento con historial de escaneos y plan de acción paso a paso |

---

## 🚀 Instalación y Ejecución

### Requisitos Previos

- **Node.js** v18 o superior → [https://nodejs.org/](https://nodejs.org/)
- Sistema Operativo: **Windows 10/11** (el escaneo de red usa comandos nativos de Windows)

### Pasos de Instalación

```bash
# 1. Clonar o descomprimir el proyecto
cd PymeShield/

# 2. Instalar dependencias
npm install

# 3. Inicializar la base de datos
npx prisma db push

# 4. Iniciar el servidor
node server.js
```

### Inicio Rápido (Windows)

Simplemente hacer doble clic en:

```
📄 Iniciar_PymeShield.bat
```

El lanzador verificará Node.js, instalará dependencias, sincronizará la base de datos y abrirá el navegador automáticamente en `http://localhost:3000`.

### Credenciales de Acceso

| Campo | Valor |
|-------|-------|
| **Usuario** | `admin` |
| **Contraseña** | `pymeshield2024` |

---

## 📱 Funcionalidades del Panel

### 1. Resumen de Red
- Métricas en tiempo real: dispositivos activos, puertos en riesgo, alertas no leídas
- **Score de Seguridad** calculado dinámicamente (0–100) según vulnerabilidades detectadas
- Gráfico de tendencia histórica del score de seguridad

### 2. Inventario de Dispositivos
- Tabla completa con IP, MAC, fabricante, estado y nivel de riesgo
- Búsqueda y filtros por estado (activo, bloqueado, sospechoso, vulnerable)
- Autorizar o marcar dispositivos como sospechosos
- **Bloqueo real** de dispositivos mediante reglas de firewall de Windows (`netsh advfirewall`)

### 3. Puertos Expuestos
- Visualización de servicios vulnerables detectados por escaneo TCP
- Clasificación por nivel de riesgo: Alto (RDP, SSH), Medio (SMB), Bajo (HTTP)
- Barra de riesgo visual por servicio

### 4. Alertas del Sistema
- Notificaciones en tiempo real vía WebSocket al detectar amenazas
- Historial de las últimas 20 alertas con timestamp
- Marcar como leídas individualmente o en conjunto

### 5. Recomendaciones y Plan de Acción
- Guías paso a paso redactadas en lenguaje simple (sin jerga técnica)
- Pensadas para el dueño de la PYME, no para un técnico
- Alineadas con los hallazgos del último escaneo

### 6. Reporte PDF de Cumplimiento
- Generado al instante con un clic
- Incluye: inventario de dispositivos, puertos expuestos, score de seguridad y plan de acción
- Referencia normativa: **Ley N° 21.663** y **Ley N° 21.719** de Chile
- Firma de responsable TI al pie del documento

---

## 🧪 Modo Demostración

PymeShield incluye un **Modo Demostración** activado por defecto, ideal para presentaciones académicas o comerciales. En este modo:

- Se carga una red simulada con 5 dispositivos típicos de una PYME (router, NAS, PC contabilidad, impresora, celular desconocido)
- Se generan alertas y recomendaciones predefinidas
- El historial de escaneos muestra 8 análisis de los últimos 13 días
- El escaneo real se combina con los datos de demo

Para activar el escaneo real de la red local, desactivar el toggle **"Modo Demostración"** en la barra superior.

---

## 📁 Estructura del Proyecto

```
PymeShield/
├── 📄 server.js              # Servidor Express, API REST, motor de escaneo
├── 📄 schema.prisma          # Esquema de base de datos (5 modelos)
├── 📄 dev.db                 # Base de datos SQLite
├── 📄 Iniciar_PymeShield.bat # Lanzador automático para Windows
├── 📄 package.json           # Dependencias Node.js
├── 📁 public/
│   ├── 📄 index.html         # Interfaz SPA principal
│   ├── 📄 app.js             # Controlador frontend
│   └── 📄 style.css          # Estilos (Glassmorphism + Dark Theme)
└── 📄 README.md              # Este archivo
```

---

## 🗄️ Modelo de Datos

```prisma
Device        → IP, MAC, hostname, vendor, status, riskLevel, isAuthorized
Port          → portNumber, serviceName, riskLevel, description (→ Device)
Alert         → title, description, riskLevel, timestamp, status
Recommendation→ title, description, priority, status
ScanHistory   → timestamp, devicesCount, criticalAlertsCount, score
```

---

## 📊 Cálculo del Score de Seguridad

```
Score inicial: 100 puntos

- Dispositivo no autorizado detectado:  -15 puntos c/u
- Dispositivo con riesgo Alto:          -10 puntos c/u
- Puerto expuesto detectado:             -2 puntos c/u

Mínimo posible: 10 puntos
```

---

## 📚 Referencias Normativas y Técnicas

- NIST. (2024). *Cybersecurity Framework (CSF) 2.0*. https://doi.org/10.6028/NIST.CSWP.29
- Biblioteca del Congreso Nacional. (2025). *Ley N° 21.663 — Ley Marco de Ciberseguridad*. https://www.bcn.cl/
- OWASP Foundation. (2021). *OWASP Top 10:2021*. https://owasp.org/www-project-top-ten/
- CIS. (2021). *CIS Controls Version 8*. https://www.cisecurity.org/controls/

---

## 👨‍💻 Autor

**José Santo Valdebenito Olivares**
Técnico en Nivel Superior en Informática Mención Ciberseguridad
Centro de Formación Técnica de la Región de Valparaíso · 2026

---

> *PymeShield fue desarrollado como proyecto de titulación con el objetivo de democratizar la ciberseguridad para las pequeñas empresas de Chile, entregando herramientas profesionales en un formato accesible y sin costo.*
