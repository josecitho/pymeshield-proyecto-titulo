# Manual de Uso y Activación — PymeShield

Este manual describe el proceso de puesta en marcha (activación) y el uso operativo del panel de seguridad de red **PymeShield**, diseñado específicamente para PYMEs, establecimientos educacionales y centros de salud primaria.

---

## 1. Instalación y Configuración Inicial (Primer Uso)

Para facilitar la adopción masiva en PYMEs, Colegios y CESFAM, PymeShield cuenta con un **Asistente de Instalación Automatizado**.

1. **Copiar la carpeta**: Conecte el pendrive y copie la carpeta **`ProyectoPymeShield`** completa en el computador local (ej. en el Escritorio).
2. **Iniciar el Asistente**: Abra la carpeta y haga **doble clic** en el archivo **`Instalar_PymeShield.bat`**.
3. **Filtro de seguridad de Windows (SmartScreen)**:
   * Al ser la primera vez que inicia el asistente, es posible que Windows muestre una advertencia azul diciendo *"Windows protegió su PC"*.
   * Haga clic en el enlace **"Más información"** y luego presione el botón **"Ejecutar de todas formas"**.
4. **Instalación de Requisitos (Node.js)**:
   Si el asistente detecta que Node.js no está instalado, le presentará un menú interactivo con tres opciones de control:
   * *[1] Instalación Automática (Recomendado):* Descargará e instalará Node.js de forma silenciosa en segundo plano directamente desde `nodejs.org`.
   * *[2] Instalación Manual (Seguro):* Abrirá la web oficial de Node.js en su navegador para que lo instale usted mismo si prefiere un control directo de seguridad.
   * *[3] Cancelar:* Cancela y sale del asistente de instalación.
5. **Configuración de Dependencias y Base de Datos:**
   Tras validar Node.js, el asistente instalará las dependencias de software y sincronizará la base de datos SQLite local de forma automatizada.
6. **Acceso Directo en el Escritorio:**
   El asistente creará automáticamente un acceso directo llamado **`PymeShield`** en su Escritorio de Windows y levantará la aplicación por primera vez en su navegador (`http://localhost:3000`).

---

## 2. Puesta en Marcha y Uso Diario

Una vez completada la instalación inicial, el uso cotidiano es extremadamente sencillo y no requiere volver a abrir la carpeta de archivos del proyecto:

1. **Iniciar el sistema**: Vaya a su **Escritorio de Windows** y haga **doble clic** en el acceso directo de **`PymeShield`** (o en el archivo `Iniciar PymeShield.bat` dentro de la carpeta).
2. **Acceso automático**: Se abrirá una ventana en segundo plano que liberará el puerto de red, ejecutará la plataforma y abrirá automáticamente su navegador web favorito en: `http://localhost:3000`.
3. **Detener el sistema**: Para cerrar la plataforma, simplemente cierre la ventana de comandos negra que se ejecuta en segundo plano.

---

## 3. Guía de Uso del Panel de Control (Dashboard)

Una vez abierto PymeShield en el navegador, la pantalla principal te presentará un resumen de ciberseguridad mediante un semáforo interactivo y herramientas automatizadas:

### A. Auditorías de Red (Escaneo Manual y Automático)
* **Escaneo Manual (Escanear Red)**: En la esquina superior derecha, haga clic en el botón **"Escanear Red"**. El sistema iniciará un barrido de pings y sockets en tu red local. Observará una barra de progreso que le indicará el estado en tiempo real. Al finalizar, el sistema actualizará todo el panel con la información real de los dispositivos.
* **Escaneo Automático de Fondo**: PymeShield cuenta con un motor de monitoreo continuo. Cada **3 minutos**, realiza un escaneo silencioso en segundo plano. Si detecta nuevos equipos o amenazas, actualizará el dashboard automáticamente y generará las alertas correspondientes sin interrumpir el trabajo del usuario.

### B. Historial de Score de Seguridad (Tendencia Temporal)
En la parte superior de la pantalla principal verás una sección titulada **"Historial de Score de Seguridad"**:
* Este gráfico muestra la evolución del estado de ciberseguridad de tu negocio a lo largo del tiempo.
* Cada punto de color representa una auditoría realizada.
* Al pasar el cursor por encima de los puntos, verás el puntaje específico obtenido (sobre 100) y la hora/fecha del análisis.
* **Los Colores de los Puntos**: Al igual que un semáforo, los puntos se colorean según el nivel de riesgo en ese momento (Verde = Seguro, Amarillo = Requiere atención, Rojo = Estado Crítico). Una línea ascendente demuestra que las medidas tomadas están surtiendo efecto.

### C. Inventario, Buscador y Filtros de Dispositivos
En la tabla principal se lista el inventario de equipos detectados en la red. Para facilitar la gestión, se han incorporado dos herramientas:
* **Barra de Búsqueda**: Escriba cualquier texto (como una IP, una MAC o el nombre del dispositivo, ej: *"NAS"* o *"Contabilidad"*) en el buscador ubicado sobre la tabla para aislar un equipo al instante.
* **Filtros de Estado**: Use el selector desplegable para filtrar la lista rápidamente:
  * *Todos los dispositivos*: Muestra todo el inventario.
  * *Dispositivos Activos*: Equipos conectados actualmente.
  * *Dispositivos Inactivos*: Equipos que estuvieron conectados pero se desconectaron.
  * *Dispositivos Bloqueados*: Equipos aislados del sistema.
  * *Sospechosos*: Equipos marcados como no autorizados.
  * *Vulnerables*: Muestra únicamente los equipos que tienen puertos críticos abiertos (como SSH :22 o RDP :3389).
* **Autorizar Dispositivo**: Haga clic en el botón **"Autorizado"** de un equipo si no lo reconoce, marcándolo como **"Sospechoso"** para que el sistema le reste puntaje e indique el peligro.
* **Bloquear Dispositivo (Contención)**: Presione **"Bloquear"** en un dispositivo sospechoso. PymeShield añadirá una regla de bloqueo en el Firewall de Windows para aislar el tráfico de ese atacante inmediatamente.

### D. Gestión de Alertas y Recomendaciones
* **Panel de Alertas**: Muestra los eventos anómalos detectados en orden cronológico (ej. *"Dispositivo sospechoso detectado"*). Puedes marcarlas como leídas para limpiar el panel.
* **Plan de Acción**: El módulo inferior te entregará recomendaciones explicadas paso a paso en lenguaje muy sencillo (sin términos técnicos complejos), indicándote exactamente qué botones pulsar o qué configuraciones cambiar para corregir cada problema detectado.

### E. Generación de Reportes PDF
* Para generar una evidencia documental, haga clic en el botón **"Reporte PDF"** en la barra superior.
* Se descargará un archivo PDF formal con el inventario de activos, análisis de vulnerabilidades y el plan de mitigación. 
* Este documento sirve ante fiscalizaciones o auditorías como evidencia técnica del cumplimiento de las exigencias de la **Ley N° 21.719 chilena**.

### F. Ajustes de Acceso y Políticas Avanzadas (NAC / Webhook)
Para configurar las políticas avanzadas de la herramienta, navegue a la pestaña **Ajustes de Acceso** en la barra lateral. Allí encontrará dos módulos críticos de protección:
* **Control de Admisión Zero-Trust (NAC)**:
  * Al activar la casilla de verificación y hacer clic en *"Guardar Políticas"*, el sistema entrará en modo de **Cero Confianza**.
  * **Efecto automático**: Cada vez que se realice un escaneo de red (manual o automático), cualquier dispositivo nuevo que no reconozcas o que no esté autorizado será bloqueado y aislado inmediatamente a nivel de firewall, impidiendo que robe datos o infecte al resto del colegio o negocio.
* **Integración SOAR / Cortex XSOAR (Webhooks)**:
  * Si su institución cuenta con una central de seguridad externa (SIEM, orquestador Palo Alto Cortex XSOAR) o canales de comunicación grupal (Slack, Microsoft Teams), puede pegar la **URL del Webhook** de su proveedor en este campo.
  * **Efecto automático**: El sistema enviará un informe digital instantáneo en tiempo real (formato JSON) con los detalles del incidente (ej. si se bloqueó un computador intruso, o si alguien falló la autenticación).
  * **Probar Conexión**: Antes de guardar, puede hacer clic en el botón **"Probar Conexión"** para enviar una alerta de prueba y verificar que los datos lleguen correctamente a su central de seguridad.
* **Persistencia del sistema**: Todas las configuraciones avanzadas y la URL del Webhook se guardan localmente en el archivo `credenciales.json` de la raíz del proyecto. Esto asegura que la configuración sea **permanente** y continúe activa aunque apague la computadora, sufra un corte de energía, o reinicie la aplicación.

### G. Mapa de Topología de Red SVG
* **Visualización en Vivo:** Muestra un mapa gráfico interactivo en la pestaña principal de resumen. Muestra el Router central (puerta de enlace) y los dispositivos descubiertos orbitando a su alrededor.
* **Estado de Enlaces:** Las líneas de conexión se mueven dinámicamente y se colorean según el estado:
  * *Verde (flujo continuo):* Dispositivo autorizado y conectado de manera segura.
  * *Amarillo (flujo rápido intermitente):* Dispositivo no autorizado (sospechoso).
  * *Rojo (línea rota discontinua):* Dispositivo bloqueado a nivel de firewall (aislado de la red).
* **Popover de Control:** Haga clic sobre cualquier dispositivo en el mapa para abrir una tarjeta flotante de detalles con IP, MAC, fabricante, riesgo y puertos abiertos, permitiendo ejecutar acciones rápidas de autorización o bloqueo desde la topología.

### H. Descarga de Scripts de Hardening y Simulador de Ataques
* **Scripts de Hardening (Remediación NIST):** Al presionar un equipo en el mapa de topología que tenga puertos expuestos, aparecerán botones para descargar archivos de remediación `.bat` (Windows) o `.sh` (Linux). Estos scripts desactivan los protocolos inseguros del host automáticamente con un solo clic.
* **Simular Intrusión (Prueba Didáctica):** En la cabecera verá un botón rojo titulado **"Simular Intrusión"**. Al presionarlo, el sistema simula la inserción de un hacker en la red, disparando el aislamiento de red Zero-Trust, el registro de auditoría SQLite y la alerta en vivo vía Webhook para demostraciones ante la comisión evaluadora.

### I. Modo NOC (Network Operations Center) y Sirenas Acústicas
* **Modo NOC (Centro de Control):** El interruptor de la barra superior le permite cambiar el estilo visual completo a un fondo táctico de comando en negro y rojo neón.
* **Alarmas Acústicas:** Al estar en Modo NOC, el sistema emitirá sirenas sonoras de alerta (`beep-beep-beep!`) al recibir alertas críticas o gatillar la simulación, utilizando la API nativa de Web Audio de su navegador.

---

## 4. Solución de Problemas (FAQ)

* **La ventana negra del `.bat` se cierra sola al instante**:
  Asegúrese de haber instalado Node.js en el sistema. Si ya lo instaló, reinicie la computadora para que Windows actualice las rutas del sistema y vuelva a intentarlo.
* **El navegador web no se abre automáticamente**:
  Abra su navegador de preferencia (Chrome, Edge, Firefox) e ingrese manualmente la dirección: `http://localhost:3000`.
* **No detecta mis dispositivos de red reales**:
  Asegúrese de que el switch de **"Modo Demostración"** en la barra superior esté desactivado. En modo demostración, el sistema mezcla dispositivos reales con simulados para fines de presentación académica. Desactívelo si desea auditar estrictamente su red de producción real.

---

## 5. Anexo Técnico: Despliegue Avanzado con Docker (Linux / Servidores)

Para entornos de servidores de red o sistemas basados en **Linux**, PymeShield incluye soporte nativo para contenedores Docker mediante los archivos [`Dockerfile`](file:///C:/Users/josev/Escritorio/Nueva%20carpeta/Dockerfile) y [`docker-compose.yml`](file:///C:/Users/josev/Escritorio/Nueva%20carpeta/docker-compose.yml) incluidos en la raíz del proyecto.

### Ventajas de usar Docker:
1. **Cero dependencias locales**: No requiere instalar Node.js ni configurar bases de datos en la máquina host.
2. **Nmap Integrado**: La imagen de Docker (basada en Alpine Node) instala automáticamente la herramienta `nmap` de forma interna para realizar escaneos profundos de red.

### Instrucciones de Despliegue:

1. Abra una terminal de comandos en la carpeta del proyecto.
2. Construya e inicie el contenedor en segundo plano ejecutando:
   ```bash
   docker-compose up --build -d
   ```
3. El sistema descargará la imagen, compilará la base de datos local y dejará el servicio escuchando de manera persistente.
4. Acceda desde su navegador web en: **`http://localhost:3000`**.
5. Para detener el servicio en cualquier momento, ejecute:
   ```bash
   docker-compose down
   ```

