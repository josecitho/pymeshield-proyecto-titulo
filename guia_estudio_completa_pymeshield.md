# Guía de Estudio Exhaustiva: Proyecto de Título PymeShield

Esta guía de estudio consolida el 100% de los fundamentos teóricos, decisiones de diseño, detalles técnicos, cumplimiento legal y conceptos de red que integran el proyecto **PymeShield**. Utilízala para estudiar y dominar tu defensa de título ante la comisión evaluadora.

---

## ÍNDICE DE CONTENIDOS
0. **Fundamentación: ¿Por qué nace, Para quién va dirigido y Valor Operacional?**
1. **Ficha Técnica y Tecnologías (Stack)**
2. **Arquitectura y Motores de Red (Backend)**
3. **Seguridad Criptográfica y Control de Acceso (OWASP)**
4. **Mapeo Metodológico: NIST CSF 2.0 y Leyes Chilenas**
5. **Características de Alto Impacto (WOW Factors)**
6. **Módulos de Integración SOAR / SIEM (Webhooks)**
7. **Estrategia de Despliegue con Docker**
8. **Balotario de Preguntas y Respuestas de Examen (7.0)**

---

## 0. FUNDAMENTACIÓN: ¿POR QUÉ NACE, PARA QUIÉN VA DIRIGIDO Y VALOR OPERACIONAL?

### A. ¿Por qué nace PymeShield? (Justificación de la Ciberdefensa)
Las corporaciones de gran escala tienen la capacidad económica de costear licencias anuales de firewalls industriales y contratar personal para un Centro de Operaciones de Seguridad (SOC) de monitoreo 24/7. Sin embargo, las organizaciones de escala local en Chile sufren una desprotección crítica:
* **Limitación presupuestaria:** No cuentan con capital para costear equipamiento de red perimetral industrial.
* **Carencia de personal especializado:** La seguridad informática es administrada de forma parcial por técnicos generales o personal de soporte sin especialización en ciberdefensa.
* **Superficie de ataque expuesta:** Los ciberdelincuentes y virus automatizados (como WannaCry) se aprovechan de esta falta de visibilidad interna para secuestrar información y paralizar las operaciones.

### B. ¿Para quién está diseñado? (Público Objetivo)
PymeShield se adapta específicamente a cuatro sectores clave de la comunidad chilena que sufren estas brechas:
1. **Pequeñas y Medianas Empresas (PYMEs):** Protege la facturación, los registros de contabilidad y las bases de datos de clientes, evitando la paralización del negocio ante secuestros de información.
2. **Colegios:** Salvaguarda la privacidad de las fichas de matrículas, información sensible de menores de edad y registros del Ministerio de Educación, mitigando riesgos de fugas y sanciones.
3. **Liceos:** Monitorea y resguarda la infraestructura física de laboratorios de computación, robótica y redes Wi-Fi institucionales ante la conexión de intrusos no autorizados.
4. **Centros de Salud Familiar (CESFAM):** Asegura la confidencialidad de la ficha clínica electrónica de los pacientes de salud primaria, evitando intercepciones y protegiendo infraestructura sanitaria crítica bajo estándares legales.

### C. La Filosofía de Diseño: "Operador No Técnico"
El core tecnológico de PymeShield procesa complejos algoritmos de escaneo, reglas de firewall (`netsh`/`iptables`) y firmas criptográficas TOTP. Sin embargo, toda esa complejidad se abstrae para el usuario final. Operadoras sin formación en ciberseguridad (como Claudia, la administrativa del CESFAM, recepcionistas de colegios o dueños de PYMEs) pueden vigilar la red, descargar scripts de hardening, silenciar alertas y aislar atacantes con clicks intuitivos en un mapa gráfico a color.

---

## 1. FICHA TÉCNICA Y TECNOLOGÍAS (STACK)

La comisión evaluará la justificación técnica de las herramientas que elegiste. PymeShield utiliza una arquitectura ligera, libre de licencias costosas y de alto rendimiento.

* **Core Backend:** Node.js (Express framework). Elegido por su modelo asíncrono no bloqueante de I/O, ideal para realizar múltiples escaneos y pings en paralelo sin congelar el servidor.
* **Base de Datos & ORM:** SQLite + Prisma ORM. 
  * *Justificación:* SQLite almacena toda la información en un solo archivo físico local (`dev.db`). No requiere credenciales de red, no consume RAM en segundo plano y simplifica el despliegue a un solo clic (portabilidad de borde o *Edge Computing*).
* **Frontend:** Single Page Application (SPA) en JavaScript Vanilla, HTML5 y CSS3.
  * *Justificación:* Al no usar frameworks pesados (como React o Angular), la aplicación es extremadamente ligera. Toda la renderización del mapa SVG y los filtros se procesa en el cliente (navegador del usuario), reduciendo la carga del servidor al mínimo.
* **Librerías Clave:**
  * `otplib` (criptografía TOTP para Doble Factor).
  * `qrcode` (generación de códigos QR en Base64).
  * `ws` (WebSockets nativos para telemetría en tiempo real).
  * `pdfkit` (compilación dinámica de reportes PDF).

---

## 2. ARQUITECTURA Y MOTORES DE RED (BACKEND)

### El Motor de Escaneo Híbrido (Explicación Técnica):
1. **Barrido de Ping Paralelo:** El servidor ejecuta una ráfaga de comandos `ping` por lotes (de 45 en 45 para no saturar el programador de tareas del kernel) a las 254 direcciones del segmento local (ej. `192.168.1.1` a `192.168.1.254`).
2. **Propósito del Ping:** El ping no busca necesariamente que el host responda (muchos dispositivos tienen el ping bloqueado por su firewall). El objetivo real es **forzar a la tarjeta de red del host a actualizar su tabla ARP** del sistema operativo.
3. **Consulta ARP:** Inmediatamente después, el servidor ejecuta el comando nativo `arp -a` y parsea la salida de la consola. Esto permite obtener la lista exacta de parejas **IP-MAC** de todos los dispositivos activos en la red física, sin generar ruidos ni ser bloqueado.
4. **Escaneo de Puertos:** Por cada dispositivo encontrado en la tabla ARP, se abren sockets TCP asíncronos en 14 puertos críticos comunes (22 SSH, 80 HTTP, 443 HTTPS, 445 SMB, 3389 RDP, etc.) con un timeout de 150ms.

### El Demonio de Escaneo Automático:
* El servidor ejecuta un temporizador de fondo (`setInterval`) cada **3 minutos** que corre de forma silenciosa. Si detecta que un dispositivo ha cambiado de IP, se desconectó, tiene nuevos puertos o es un intruso no autorizado, actualiza la base de datos y empuja la telemetría a la interfaz mediante WebSockets.

---

## 3. SEGURIDAD CRIPTOGRÁFICA Y CONTROL DE ACCESO (OWASP)

PymeShield implementa directivas estrictas de seguridad para proteger el acceso al panel administrativo local:

```
[Usuario + Clave] ──► [Hash SHA-256] ──► Coincide? ──► [TOTP Token 6 Dígitos] ──► [Acceso Concedido]
```

### A. Almacenamiento Hashed SHA-256
* Las contraseñas administrativas nunca se guardan en texto plano en la máquina local.
* Al configurar una clave en **Ajustes**, el backend calcula su hash SHA-256 y lo guarda en [credenciales.json](file:///C:/Users/josev/Escritorio/ProyectoPymeShield01/ProyectoPymeShield/credenciales.json). Al iniciar sesión, se compara el hash de la clave ingresada, neutralizando la fuga de contraseñas si el archivo JSON es robado.

### B. Doble Factor de Autenticación (MFA TOTP)
* Sigue el estándar industrial **RFC 6238 (Time-Based One-Time Password)**.
* **Setup:** El servidor genera una clave secreta aleatoria de 32 caracteres (Base32) y la codifica en un código QR. El usuario lo escanea en su móvil.
* **Verificación:** Cada 30 segundos, el celular genera un token dinámico de 6 dígitos que resulta de aplicar un hash HMAC-SHA1 sobre el tiempo actual y la clave secreta. El servidor realiza el mismo cálculo matemático localmente; si coinciden, autoriza la sesión.

---

## 4. MAPEO METODOLÓGICO: NIST CSF 2.0 Y LEYES CHILENAS

Este es el núcleo conceptual de tu tesis. Debes demostrar cómo tu software da cumplimiento a los estándares internacionales y a la legislación chilena de infraestructura crítica.

### A. Alineamiento con el Marco NIST CSF 2.0
* **IDENTIFICAR (ID.AM):** Catastro automático de dispositivos de red en base a IP, MAC física y resolución de fabricante OUI (MacVendors).
* **PROTEGER (PR.AT / PR.AC):** Cierre de puertos vulnerables mediante la descarga de scripts de Hardening personalizados, control de accesos con hash SHA-256 y autenticación multifactor (MFA).
* **DETECTAR (DE.CM):** Monitoreo asíncrono y continuo en segundo plano cada 3 minutos, alertando anomalías mediante eventos WebSocket instantáneos.
* **RESPONDER (RS.RP):** Aislamiento perimetral activo bloqueando la IP del intruso en el cortafuegos de Windows (`netsh`) o Linux (`iptables`).
* **RECUPERAR (RC.RP):** Planes de remediación paso a paso explicados en lenguaje sencillo para el usuario y reporte de cumplimiento en PDF formal firmable.

### B. Cumplimiento con la Ley N° 21.663 (Marco de Ciberseguridad / ANCI)
* La nueva ley exige reportar incidentes cibernéticos graves a la Agencia Nacional de Ciberseguridad (ANCI) en plazos mínimos. PymeShield cumple con esto al exportar bitácoras forenses de auditoría SQLite y enviar JSONs a centrales de gobierno vía Webhooks.

### C. Cumplimiento con la Ley N° 21.719 (Protección de Infraestructura Crítica)
* Los consultorios, CESFAM y liceos públicos son considerados ahora infraestructura crítica que debe poseer planes de resiliencia de datos. PymeShield entrega los planes de hardening sugeridos por el CSIRT de Gobierno para mitigar vulnerabilidades como WannaCry (SMB 445) o BlueKeep (RDP 3389).

---

## 5. CARACTERÍSTICAS DE ALTO IMPACTO (WOW FACTORS)

Diseñadas para generar un fuerte impacto visual y didáctico ante la comisión evaluadora:

* **Mapa de Topología SVG Dinámico:** Dibuja el Router central y los dispositivos conectados en una órbita elíptica. Utiliza animaciones CSS (`stroke-dasharray`) para simular flujos de paquetes de datos activos (verde), sospechosos (amarillo intermitente) o enlaces bloqueados/rotos (rojo con candado).
* **Modo NOC (Network Operations Center):** Conmuta de forma persistente la interfaz a colores negro puro con bordes rojo neón y verde neón, simulando un panel militar de ciberdefensa táctica.
* **Síntesis Acústica HTML5 Web Audio API:** Genera sirenas de alerta acústica (`beep-beep-beep!`) sintetizando ondas sinusoidales de alta frecuencia (980Hz) de manera directa en el navegador. Esto evita depender de descargas o carga de archivos de audio locales.
* **Explicador CVE Didáctico:** Traduce las alertas técnicas a español sencillo para el usuario final (Claudia), y añade las referencias CVE oficiales (ej. CVE-2017-0144 para WannaCry) para el personal técnico del CESFAM.

---

## 6. MÓDULOS DE INTEGRACIÓN SOAR / SIEM (WEBHOOKS)

* **¿Qué es un Webhook?** Es una notificación automática que se envía mediante una petición HTTP POST desde PymeShield hacia un servidor externo en el instante exacto en que ocurre un evento de seguridad.
* **Diferencia técnica con el Polling:** El Polling requiere que la central esté consultando la base de datos de PymeShield repetidamente. El Webhook realiza un **envío empujado (Push)** inmediato, ahorrando ancho de banda y reduciendo el tiempo de respuesta a 1 segundo.
* **El Payload JSON:** PymeShield envía un objeto JSON estructurado con el tipo de alerta, descripción, IP/MAC de origen y severidad. Esto permite que herramientas SOAR (Cortex XSOAR, bots de Slack/Discord) automaticen la creación de incidentes.

---

## 7. ESTRATEGIA DE DESPLIEGUE CON DOCKER

Un Ingeniero debe justificar cómo empaqueta y despliega la aplicación de forma profesional.

* **El Dockerfile:** Utiliza una imagen base súper ligera (`node:20-alpine`) para minimizar el peso del contenedor a menos de 150MB de RAM. Instala de forma interna la herramienta `nmap` para que el escaneo funcione en Linux.
* **La diferencia multiplataforma (Clave de Redes):**
  * **En Linux (Producción real):** Se utiliza `network_mode: "host"`. Esto es obligatorio porque permite que el contenedor comparta la interfaz de red física real del servidor para poder enviar pings ARP y descubrir la LAN real del CESFAM/colegio.
  * **En Windows/macOS (Desarrollo/Demo):** Debido a que Docker Desktop corre dentro de una máquina virtual (NAT), `network_mode: "host"` no es compatible. Se comenta esa directiva y se activa el mapeo de puertos (`ports: - "3000:3000"`), utilizando el "Modo Demostración" de PymeShield para asegurar el éxito visual de la defensa.

---

## 8. BALOTARIO DE PREGUNTAS Y RESPUESTAS DE EXAMEN (7.0)

Ensaya estas respuestas ante las preguntas más probables de los profesores:

* **P1: ¿Por qué no usaron una base de datos más robusta como PostgreSQL?**
  * *Respuesta:* *"Buscamos optimizar la viabilidad operacional de las PYMEs y colegios. PostgreSQL requiere instalar un motor pesado, configurar servidores de red, usuarios y mantener el servicio activo, lo que consume hardware y requiere un administrador de bases de datos. SQLite es una base de datos local embebida en un solo archivo físico, con cero configuraciones iniciales y consumo mínimo de recursos, ideal para correr en appliances locales de bajo costo como una Raspberry Pi."*
* **P2: Si el sistema de contención (bloqueo) requiere privilegios de Administrador, ¿cómo reacciona PymeShield ante la falta de permisos?**
  * *Respuesta:* *"Para asegurar la resiliencia del software, implementamos un control de excepciones asíncrono (try-catch). Si el servidor no se inició como Administrador, el sistema operativo deniega la inyección de reglas en el firewall. PymeShield captura este error de forma segura, registra el evento técnico en la bitácora y continúa con el bloqueo lógico en la interfaz web para no interrumpir el flujo operacional."*
* **P3: ¿Cómo se asegura que las alertas no se pierdan si se apaga el servidor?**
  * *Respuesta:* *"Toda la bitácora de auditoría y las alertas se persisten de forma permanente en la base de datos local SQLite en disco, y en el caso del contenedor Docker, se protegen utilizando un volumen local (`db-data`). Además, las alertas críticas son despachadas de inmediato al exterior mediante Webhooks a una plataforma en la nube, garantizando que el historial de incidentes se conserve en la central SOAR remota."*

---

## 9. GLOSARIO DE CONCEPTOS ADVANCED DE REDES Y CIBERDEFENSA

Para asegurar que manejes el vocabulario técnico más avanzado ante la comisión evaluadora, repasa estos términos clave implementados en PymeShield:

* **OUI IEEE (Organizationally Unique Identifier / Identificador Único de Organización):**
  * *Definición:* Son los primeros 24 bits (3 octetos) de una dirección MAC física. Son asignados de forma oficial por el IEEE a cada fabricante de tarjetas de interfaz de red (NIC).
  * *Aplicación en PymeShield:* El software toma la dirección MAC descubierta en el escaneo, extrae sus primeros tres octetos y consulta una tabla local de mapeo OUI (ej. `00:0C:29` pertenece a VMware, `40:8D:5C` a Apple). Esto nos permite identificar con precisión si el dispositivo conectado es un celular, una impresora, un servidor virtual o un dispositivo IoT, ayudando a catalogar y clasificar los activos dentro del inventario de ciberseguridad.

* **WebSockets (TCP Full-Duplex Persistent Pipelines / Tuberías Persistentes Bidireccionales):**
  * *Definición:* Es un protocolo de comunicación de red basado en TCP que proporciona un canal de comunicación bidireccional simultáneo (full-duplex) sobre una única conexión física de larga duración.
  * *Diferencia con HTTP Tradicional:* HTTP es de naturaleza unidireccional y basado en peticiones puntuales del cliente (Request-Response). Si ocurren incidentes en la red, el servidor no tiene forma de enviarlos de forma proactiva al navegador sin técnicas ineficientes como el polling recurrente. WebSockets elimina la latencia y la sobrecarga de cabeceras HTTP, permitiendo que PymeShield actualice la topología SVG y reproduzca las alarmas acústicas en el frontend al microsegundo de que el daemon de backend detecte un ataque.

* **Zero-Trust Network Access (ZTNA) / Network Access Control (NAC):**
  * *Definición:* Filosofías de ciberdefensa basadas en el principio fundamental de "nunca confiar, siempre verificar". El NAC (Control de Acceso a la Red) valida la identidad y postura de seguridad de un host antes de permitirle comunicarse dentro de la red.
  * *Aplicación en PymeShield:* Cuando un nuevo host desconocido se conecta a la red LAN (como en los laboratorios de un Liceo, la red de un Colegio, o la red de un CESFAM), el sistema lo clasifica inicialmente como "No Autorizado/Sospechoso" bajo una postura Zero-Trust. Si se activa la directiva de aislamiento, PymeShield ejecuta comandos del sistema operativo local (`netsh advfirewall` en Windows / `iptables` en Linux) para bloquear su tráfico, conteniendo la amenaza antes de que pueda propagarse lateralmente (movimiento lateral) por la intranet de la institución.

