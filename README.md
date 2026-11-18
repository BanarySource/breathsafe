# BreathSafe · Plataforma web (InnovaTecNM 2026 · Etapa Nacional)

Sitio estático (HTML, CSS y JavaScript, sin compilación) publicado en GitHub Pages.

## Estructura

| Ruta | Contenido |
|---|---|
| `index.html` | Inicio: presentación, ¿Qué es BreathSafe?, propuesta de valor, demostración |
| `nosotros.html` | Misión, visión, valores, trayectoria y equipo |
| `contacto.html` | Tarjetas de líder y co-líder + formulario (FormSubmit.co) |
| `privacidad.html` | Aviso de privacidad (referencia: LFPDPPP 2025, NOM-024-SSA3-2012, GDPR) |
| `acceso.html` | Registro e inicio de sesión del paciente |
| `vincular.html` | Vinculación del prototipo por código (BS-AAAA-XXX) o QR |
| `panel.html` | Panel de métricas, Modo Médico, reporte PDF, PIN médico |
| `medico.html` | Acceso del médico con PIN de 6 dígitos (solo lectura, 30 min) |
| `js/config.js` | **Configuración** (Supabase, correos del formulario) |
| `js/sim.js` | Umbrales NEWS2 y dispositivo simulado |
| `js/api.js` | Capa de datos: modo demostración o Supabase |
| `js/dashboard.js` | Tarjetas, gráficas, estadísticas y generación del PDF |
| `supabase/schema.sql` | Tablas, seguridad (RLS) y funciones del backend real |
| `docs/ESP32.md` | Cómo envía datos el prototipo |
| `sw.js`, `manifest.webmanifest` | Aplicación web progresiva (instalable) |

Las cabeceras y pies de página están repetidos en cada HTML: al cambiar el menú, actualizar todas las páginas.

## Modos de funcionamiento

**Demostración (actual):** `js/config.js` sin claves de Supabase. Cuentas y lecturas simuladas en `localStorage`
del navegador. El botón *Entrar con cuenta de demostración* crea una cuenta de ejemplo con `BS-2026-X89`.
El PIN médico funciona en el mismo navegador donde se generó.

**Backend real (Supabase, plan gratuito):**
1. Crear un proyecto en <https://supabase.com>.
2. SQL Editor → ejecutar `supabase/schema.sql`.
3. Database → Replication → habilitar Realtime en la tabla `readings`.
4. Authentication → URL Configuration → agregar la URL del sitio.
5. Project Settings → API → copiar *Project URL* y *anon public key* a `js/config.js`.
6. Registrar cada prototipo y programar el ESP32 según `docs/ESP32.md`.

> El plan gratuito de Supabase pausa el proyecto tras 7 días sin actividad; antes de la evaluación, abrir el panel de Supabase o hacer una consulta.

## Formulario de contacto

Usa FormSubmit.co sin registro. El **primer envío** llega como correo de activación a
`irina.dehidre.franco.camacho@gmail.com`; hay que confirmarlo una vez. Si el servicio falla, se ofrece un enlace `mailto:`.

## Pendientes del equipo

Ver `../VERIFICACION.md` (fuera del repositorio): logotipo definitivo, render o fotos del prototipo, video,
integrantes y asesores, institución, fechas de la trayectoria.
