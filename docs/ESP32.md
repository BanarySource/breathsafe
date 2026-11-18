# Envío de lecturas desde el ESP32

El prototipo envía cada lectura a la función `ingest_reading` de Supabase mediante HTTP REST (HTTPS).
No requiere que el paciente tenga sesión: el dispositivo se autentica con su `device_key`.

## 1. Registrar el dispositivo

En Supabase → SQL Editor:

```sql
insert into public.devices (id) values ('BS-2026-X89') returning id, device_key;
```

Copie la `device_key` que se genera al firmware. El paciente vincula después el código `BS-2026-X89` desde el portal.

## 2. Petición HTTP

```
POST https://<PROYECTO>.supabase.co/rest/v1/rpc/ingest_reading
apikey: <SUPABASE_ANON_KEY>
Authorization: Bearer <SUPABASE_ANON_KEY>
Content-Type: application/json

{
  "p_device_id": "BS-2026-X89",
  "p_device_key": "<DEVICE_KEY>",
  "p_payload": {
    "device_id": "BS-2026-X89",
    "timestamp": "2026-10-14T22:30:00Z",
    "metrics": {
      "respiratory_rate_bpm": 16,
      "spo2_percentage": 98,
      "air_flow_lmin": 12.5,
      "temperature_c": 23.4,
      "system_status": "NORMAL"
    }
  }
}
```

`timestamp` y `temperature_c` son opcionales (si se omite la hora, el servidor usa la actual).

## 3. Ejemplo para Arduino IDE (ESP32)

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

const char* WIFI_SSID = "RED";
const char* WIFI_PASS = "CLAVE";
const char* URL  = "https://PROYECTO.supabase.co/rest/v1/rpc/ingest_reading";
const char* ANON = "SUPABASE_ANON_KEY";
const char* DEVICE_ID  = "BS-2026-X89";
const char* DEVICE_KEY = "DEVICE_KEY";

void setup() {
  Serial.begin(115200);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
}

void enviar(float rr, float spo2, float flujo) {
  WiFiClientSecure client;
  client.setInsecure();               // Para el prototipo. En producción, cargar el certificado raíz.
  HTTPClient http;
  http.begin(client, URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", ANON);
  http.addHeader("Authorization", String("Bearer ") + ANON);

  const char* estado = (rr <= 8 || rr >= 25 || spo2 <= 91) ? "CRITICO"
                     : (rr <= 11 || rr >= 21 || spo2 <= 95) ? "ALERTA" : "NORMAL";
  String body = String("{\"p_device_id\":\"") + DEVICE_ID + "\",\"p_device_key\":\"" + DEVICE_KEY +
    "\",\"p_payload\":{\"device_id\":\"" + DEVICE_ID + "\",\"metrics\":{\"respiratory_rate_bpm\":" + String(rr, 1) +
    ",\"spo2_percentage\":" + String(spo2, 1) + ",\"air_flow_lmin\":" + String(flujo, 2) +
    ",\"system_status\":\"" + estado + "\"}}}";

  int code = http.POST(body);
  Serial.printf("HTTP %d\n", code);   // 204 = correcto
  http.end();
}

void loop() {
  float rr = 16, spo2 = 98, flujo = 7.5; // Sustituir por la lectura real de los sensores
  enviar(rr, spo2, flujo);
  delay(2000);
}
```

El panel del paciente recibe la lectura en tiempo real (Supabase Realtime) en menos de un segundo.

## Alternativas

- **MQTT:** usar un broker (p. ej. HiveMQ Cloud, plan gratuito) y un puente que llame a `ingest_reading`. Más complejo; HTTP es suficiente para la frecuencia de muestreo del prototipo.
- **Sin internet en la sede:** el portal funciona en modo demostración con el dispositivo simulado.
