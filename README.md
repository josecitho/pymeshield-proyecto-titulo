# PymeShield — Sistema de Auditoría y Contención de Ciberseguridad para PYMEs

PymeShield es un panel de control y auditoría de ciberseguridad híbrido diseñado para pequeñas y medianas empresas (PYMEs), el cual permite realizar el descubrimiento automático de activos de red, evaluar puertos expuestos, generar planes de remediación y aplicar mecanismos activos de contención de amenazas. 

Desarrollado como proyecto de título académico, el sistema demuestra la aplicación práctica de estándares internacionales de ciberseguridad y la legislación chilena en un entorno local y portátil.

---

## 1. Alineamiento con el Marco NIST CSF 2.0

El diseño técnico y operativo de PymeShield responde directamente a las cinco funciones principales del estándar **NIST Cybersecurity Framework (CSF) 2.0**:

1. **IDENTIFICAR (Identify - ID)**:
   * **Implementación**: Barrido de pings paralelo en la subred local (`ping`) y resolución física mediante tablas ARP (`arp -a`) para identificar hosts activos, mapeando sus direcciones IP, MAC y fabricantes (mediante un diccionario local ampliado y fallback a la API de MacVendors).
2. **PROTEGER (Protect - PR)**:
   * **Implementación**: Escáner asíncrono de puertos TCP comunes en busca de servicios críticos expuestos (22 SSH, 80 HTTP, 443 HTTPS, 445 SMB, 3389 RDP). Genera sugerencias y políticas de endurecimiento (*hardening*) de accesos.
3. **DETECTAR (Detect - DE)**:
   * **Implementación**: Sistema de monitoreo continuo automático cada 3 minutos en segundo plano y alertas instantáneas a través de WebSockets ante la detección de nuevos dispositivos sospechosos (no autorizados).
4. **RESPONDER (Respond - RS)**:
   * **Implementación**: Módulo de contención activa. Permite aislar y bloquear dispositivos específicos de la red mediante la inyección automatizada de reglas en el Firewall de Windows (`netsh advfirewall`).
5. **RECUPERAR (Recover - RC)**:
   * **Implementación**: Generación automatizada de reportes oficiales de cumplimiento en formato PDF mediante `PDFKit` y provisión de un plan de acción interactivo con guías paso a paso detalladas para mitigar las fallas encontradas.

---

## 2. Marco Regulatorio y Cumplimiento de Leyes Chilenas

PymeShield sirve como herramienta técnica de apoyo para el cumplimiento de las normativas de ciberseguridad vigentes en Chile:

* **Ley N° 21.663 (Ley Marco de Ciberseguridad)**: PymeShield ayuda a cumplir los deberes básicos de seguridad y análisis de vulnerabilidades, promoviendo la identificación del inventario tecnológico y la respuesta rápida ante incidentes.
* **Ley N° 21.719 (Protección de Infraestructura Crítica y Servicios Esenciales)**: Proporciona auditorías de puertos expuestos y herramientas de contención rápida (aislamiento por firewall), alineándose con los requisitos de continuidad operativa e inmunidad técnica exigidos a las entidades críticas.

---

## 3. Arquitectura y Stack Tecnológico

El sistema utiliza una arquitectura cliente-servidor ligera, optimizada para ejecutarse en entornos locales sin dependencias externas complejas de base de datos:

* **Backend**: Node.js + Express.
* **Comunicación en Tiempo Real**: WebSockets (`ws`) para telemetría y barra de progreso.
* **Persistencia**: SQLite y Prisma ORM para una portabilidad completa y cero fricción en la base de datos.
* **Motor de Reportes**: PDFKit para la generación del reporte PDF oficial de cumplimiento.
* **Contención Activa**: Ejecución de comandos del sistema nativos (Windows `netsh`) mediante subprocesos de Node.js.
* **Frontend**: HTML5 Semántico + Javascript Vanilla + CSS3 con diseño de vanguardia translúcido (Glassmorphic Dark Mode) y gráficos interactivos nativos en SVG (sin librerías externas para máxima velocidad).

---

## 4. Instrucciones de Instalación Local

### Requisitos Previos
* **Node.js** (versión 18 o superior).
* **NPM** (incluido con Node.js).
* **Privilegios de Administrador**: Requeridos para que la contención activa (Firewall de Windows) pueda aplicar las reglas.

### Paso 1: Clonar o extraer el proyecto
Asegúrate de que todos los archivos del proyecto se encuentren en el directorio de trabajo (ej. `C:\Users\josev\Escritorio\ProyectoPymeShield`).

### Paso 2: Instalar dependencias
Abre una terminal en la carpeta del proyecto y ejecuta:
```bash
npm install
```

### Paso 3: Inicializar la Base de Datos
Aplica las migraciones y genera el cliente Prisma:
```bash
npx prisma generate
npx prisma db push
```

### Paso 4: Iniciar la Aplicación
Puedes iniciar el servidor web ejecutando:
```bash
npm start
```
O bien, haciendo doble clic en el archivo automatizado para Windows: **`Iniciar PymeShield.bat`**.

### Paso 5: Acceso en el Navegador
Abre tu navegador e ingresa a: **`http://localhost:3000`**

### Credenciales de Acceso por Defecto:
* **Usuario**: `admin`
* **Contraseña**: `pymeshield2026`

### Gestión de Accesos y Ciberseguridad:
* **Almacenamiento Seguro Hashed (SHA-256)**: Las credenciales de acceso se guardan en el archivo `credenciales.json` de la raíz en un formato hash criptográfico SHA-256 no reversible. La clave nunca se almacena en texto plano en el servidor ni se valida en el navegador del cliente (evitando vulnerabilidades por exposición de código en F12).
* **Cambio de Contraseña interactivo**: El administrador validado puede actualizar su contraseña directamente desde el panel en la pestaña **Ajustes de Acceso**. Al guardar, el backend re-calcula el hash SHA-256 y re-escribe el archivo JSON de forma segura.
* **Restauración de Fábrica (Factory Reset)**: Si la contraseña personalizada se extravía, basta con borrar el archivo `credenciales.json` de la carpeta raíz y reiniciar la aplicación. El backend detectará la ausencia del archivo y generará uno nuevo con la clave por defecto (`admin` / `pymeshield2026`).

---

## 5. Despliegue Mediante Docker

PymeShield incluye soporte para su despliegue y empaquetado en contenedores mediante Docker. Esto garantiza un aislamiento total del entorno de desarrollo.

### Construir la Imagen de Docker
Desde la raíz del proyecto, ejecuta:
```bash
docker build -t pymeshield .
```

### Iniciar el Contenedor
Ejecuta el contenedor mapeando el puerto 3000 y persistiendo la base de datos de SQLite local:
```bash
docker run -d -p 3000:3000 --name pymeshield-app -v $(pwd)/prisma:/app/prisma pymeshield
```

### Uso de Docker Compose
Si prefieres usar Docker Compose, puedes iniciar el servicio de manera simple ejecutando:
```bash
docker-compose up -d
```
Esto levantará automáticamente el servicio de PymeShield en segundo plano en el puerto `3000`.

*Nota: La funcionalidad de contención activa en el firewall (comandos netsh) interactúa con la red local del host. Si se despliega en un contenedor Docker, se sugiere utilizar la opción de red `--network host` en Linux para conservar total acceso a las utilidades de red de la máquina local.*

---

## 6. Módulos de Ciberseguridad Avanzada y Usabilidad Educativa

Para potenciar su enfoque académico en ciberseguridad y adaptarlo al perfil de dueños de PYMEs sin conocimientos informáticos, PymeShield incorpora tres características clave:

### A. Doble Factor de Autenticación Real (TOTP)
* **Principio NIST (PR.AA)**: Autenticación multifactorial segura y desconectada (RFC 6238).
* **Funcionamiento**: Al ingresar las credenciales correctas por primera vez, el backend genera criptográficamente una semilla secreta (Base32) y renderiza en pantalla un código QR dinámico compatible con aplicaciones móviles como Google Authenticator o Microsoft Authenticator.
* **Vinculación y Login**: El usuario escanea el código QR para vincular su celular de confianza. En los accesos siguientes, el panel ya no mostrará el QR, sino que únicamente solicitará el código dinámico de 6 dígitos autogenerado en su celular. Todo el proceso matemático de verificación ocurre 100% de manera local y en el servidor, garantizando seguridad absoluta sin costos adicionales ni dependencias externas de red.
* **Gestión de Restablecimiento**: En la pestaña de **Ajustes de Acceso**, el administrador autenticado puede presionar el botón "Restablecer Doble Factor (MFA)" para desvincular voluntariamente su celular y borrar la llave secreta, lo que forzará la generación de un nuevo código QR en el siguiente login.

### B. Mapeo Didáctico de Peligros (CVE en Español Simple)
* **Principio NIST (PR.IP)**: Evaluación inteligente del riesgo comercial.
* **Funcionamiento**: Al detectar puertos expuestos comunes en la pestaña **Puertos Abiertos**, se despliega el botón *"¿Qué peligro representa?"*.
* **Mitigación Didáctica**:
  * **Puerto 22 (SSH)**: Explica el peligro de espionaje en accesos de soporte remoto (Terrapin - CVE-2023-48795).
  * **Puerto 80 (HTTP)**: Ilustra cómo el tráfico sin cifrar permite el robo de claves en texto claro en redes Wi-Fi públicas.
  * **Puerto 443 (HTTPS)**: Explica cómo fallos antiguos en servidores HTTPS (Heartbleed - CVE-2014-0160) pueden filtrar claves de cifrado.
  * **Puerto 445 (SMB)**: Advierte sobre virus Ransomware que secuestran y bloquean los archivos del negocio (WannaCry - CVE-2017-0144).
  * **Puerto 3389 (RDP)**: Detalla el riesgo de control remoto total de la pantalla y cuentas bancarias por intrusos (BlueKeep - CVE-2019-0708).

### C. Bitácora de Actividad Humana (Auditoría y Trazabilidad)
* **Principio NIST (DE.AE)**: Monitoreo de seguridad y logs del sistema.
* **Funcionamiento**: Registra automáticamente cada acción crítica en una tabla SQLite dedicada (`AuditLog`).
* **Lenguaje Comprensible**: Traduce eventos técnicos complejos a descripciones amigables en español, tales como:
  * *Acceso Exitoso*: *"El administrador inició sesión en el panel de forma segura."*
  * *Bloqueo / Fallo*: *"Se bloqueó un intento de inicio de sesión con clave incorrecta. Por seguridad, verifica que solo personal autorizado tenga la clave."*
  * *Seguridad*: *"Se bloqueó preventivamente el tráfico del dispositivo sospechoso '{hostname}' (IP {ip}) para proteger tu información local."*

### D. Módulo NAC Zero-Trust Local (Control de Admisión de Red)
* **Principio NIST (RS.RP)**: Respuesta automática y contención proactiva.
* **Funcionamiento**: Cuando se activa desde los Ajustes Avanzados de Seguridad, el motor de escaneo de red asume una postura de "Cero Confianza" (*Zero-Trust*).
* **Bloqueo Automático**: Cualquier nuevo host detectado en la red local que no haya sido previamente registrado y marcado como de "Confianza" en la base de datos es catalogado instantáneamente como *Sospechoso/No Autorizado* y aislado en el firewall nativo (usando reglas de bloqueo a nivel IP con `netsh advfirewall` en Windows o `iptables` en Linux). Esto detiene de forma proactiva ataques de movimiento lateral o escaneos no autorizados dentro de la LAN.
* **Flexibilidad**: La política se puede habilitar o deshabilitar dinámicamente mediante un switch gráfico en los Ajustes del panel, y permite al administrador autorizar o desbloquear dispositivos manualmente desde el inventario.

### E. Módulo de Webhooks SOAR/Cortex (Integración Cortex XSOAR / SIEM / Slack)
* **Principio NIST (DE.CM)**: Detección y notificación remota de incidentes.
* **Funcionamiento**: Permite enviar alertas y payloads JSON estructurados en tiempo real a una URL externa configurable (como un orquestador SOAR tipo Palo Alto Cortex XSOAR, un canal de Slack/Teams, o un recolector SIEM).
* **Payload JSON Estandarizado**: Cada vez que ocurre un evento crítico de seguridad (fallo de MFA, bloqueo automático NAC de un dispositivo, inicio/parada del servidor), PymeShield genera una llamada HTTP/HTTPS POST asíncrona nativa hacia la URL definida con la siguiente estructura:
  ```json
  {
    "event": "CONTAINMENT_ACTION",
    "title": "Alerta de Seguridad: Bloqueo de Dispositivo",
    "description": "NAC: Dispositivo sospechoso detectado en el escaneo y bloqueado automáticamente.",
    "severity": "Alta",
    "timestamp": "2026-06-02T02:00:00.000Z",
    "ipAddress": "192.168.1.88"
  }
  ```
* **Validación de Conexión**: La interfaz de configuración incluye un botón de "Probar Conexión" que transmite un payload de prueba en tiempo real (`TEST_ALERT`) para validar la conectividad y el formato del webhook antes de poner en marcha las políticas.


