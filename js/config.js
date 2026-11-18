/*
 * Configuración de BreathSafe.
 * - Si SUPABASE_URL y SUPABASE_ANON_KEY están vacíos, el portal funciona en MODO DEMOSTRACIÓN
 *   (cuentas y lecturas simuladas, guardadas solo en este navegador).
 * - Para conectar el backend real, pegue aquí la URL y la clave pública (anon) de su proyecto
 *   Supabase y ejecute supabase/schema.sql. Ver README.md.
 */
window.BS_CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",

  // Formulario de contacto (FormSubmit.co, sin registro). El primer envío pide confirmar el correo destino.
  CONTACT_TO: "irina.dehidre.franco.camacho@gmail.com",
  CONTACT_CC: "josegabrielavilagonzalez716@gmail.com",

  // Intervalo de lectura del dispositivo simulado (ms)
  SIM_INTERVAL_MS: 2000,
  // Vigencia del PIN médico (minutos)
  PIN_MINUTES: 30
};
window.BS_CONFIG.DEMO = !(window.BS_CONFIG.SUPABASE_URL && window.BS_CONFIG.SUPABASE_ANON_KEY);
