#include <WiFi.h>
#include <WiFiMulti.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <Preferences.h>
#include <time.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <freertos/semphr.h>

// ============================================================
//  DIRECT GPIO SETUP (4 Devices)
// ============================================================
#define NUM_DEVICES 4

// OUTPUTS: Connect Relay 'IN' pins directly to these GPIOs (Active LOW)
const int RELAY_PINS[NUM_DEVICES] = {32, 33, 25, 26};

// INPUTS: Connect physical switches between these GPIOs and GND
const int INPUT_PINS[NUM_DEVICES] = {19, 18, 5, 17};

// ============================================================
//  CREDENTIALS & CONFIGURATION
//  NOTE: This file previously contained unresolved git merge
//  conflict markers which prevented compilation entirely.
//  They have been resolved below.
// ============================================================

// Home Wi-Fi credentials are saved in Preferences from the local setup page.
String homeWifiSSID = "";
String homeWifiPassword = "";
volatile bool wifiConfigPending = false;

// Provisioning replaces this fallback identifier for each installed board.
const char* BOARD_IDENTIFIER = "esp32-unconfigured";
const char* SUPABASE_BASE = "";
const char* SUPABASE_SERVICE_KEY = ""; 

// Mesh / SoftAP Configuration for Offline Autonomous Control.
// One elected LEADER broadcasts MESH_SSID; MEMBER boards join it
// as Wi-Fi clients so multiple ESP32s form one local network.
const char* MESH_SSID = "HOME-AUTO-LEADER";
const char* MESH_PASS = "12345678"; // Min 8 chars for WPA2
IPAddress AP_IP(192, 168, 4, 1);
IPAddress AP_GATEWAY(192, 168, 4, 1);
IPAddress AP_SUBNET(255, 255, 255, 0);

// ============================================================
//  VARIABLES & STATE
// ============================================================
String boardUUID = "";
String deviceUUIDs[NUM_DEVICES] = {"", "", "", ""};
bool isRelayOn[NUM_DEVICES] = {false, false, false, false};

// Switch Input State Tracking (Debounced)
bool lastInputRead[NUM_DEVICES] = {HIGH, HIGH, HIGH, HIGH};
bool confirmedInputState[NUM_DEVICES] = {HIGH, HIGH, HIGH, HIGH};
unsigned long lastDebounceTime[NUM_DEVICES] = {0, 0, 0, 0};
const unsigned long DEBOUNCE_DELAY = 50;

// Live Serial Monitor
unsigned long lastSerialDumpTime = 0;
const unsigned long SERIAL_DUMP_INTERVAL = 60000;

WiFiMulti wifiMulti;
WebServer server(80);
Preferences preferences;
SemaphoreHandle_t preferencesMutex = nullptr;
SemaphoreHandle_t offlineQueueMutex = nullptr;
TaskHandle_t cloudSyncTaskHandle = nullptr;
TaskHandle_t cloudPollTaskHandle = nullptr;
volatile bool cloudDevicesReady = false;

// Cloud polling runs in the background worker, not in the local HTTP loop.
// A cloud-to-relay read is only a fallback path; local controls remain immediate.
// Ten seconds cuts idle PostgREST traffic by 90% compared with one-second polling.
const unsigned long POLL_INTERVAL = 10000;

// Heartbeat
const unsigned long HEARTBEAT_INTERVAL = 20000;

// Edge Cloud Alarms
struct Alarm { String id; String triggerAt; bool action; bool active; int deviceIndex; };
#define MAX_ALARMS 20
Alarm alarms[MAX_ALARMS];
const unsigned long ALARM_POLL_INTERVAL = 30000;

// Store-and-Forward Offline Queue
struct PendingUpdate { int deviceIndex; bool state; bool isFeedback; bool pending; };
#define MAX_PENDING 16
PendingUpdate offlineQueue[MAX_PENDING];
int queueCount = 0;

// ============================================================
//  LOCAL MESH (MULTI-BOARD SUPPORT)
// ============================================================
// Roles: IDLE (cloud mode / deciding), LEADER (broadcasts MESH_SSID,
// coordinates the local network), MEMBER (joined an existing leader).
enum NodeRole { ROLE_IDLE, ROLE_LEADER, ROLE_MEMBER };
NodeRole localRole = ROLE_IDLE;

// Leader-side registry of member boards
struct MeshNode {
  String nodeId;
  String ip;
  unsigned long lastSeen;
  int devicesCount;
  bool active;
};
#define MAX_MESH_NODES 8
MeshNode meshNodes[MAX_MESH_NODES];
int meshNodeCount = 0;

// Cached device snapshot pushed by each member in its announcement
struct MeshDeviceCache {
  String nodeId;
  int relayIndex;
  bool isOn;
  bool feedbackKnown;
  bool feedbackOn;
};
#define MAX_MESH_DEVICE_CACHE (MAX_MESH_NODES * NUM_DEVICES)
MeshDeviceCache meshDeviceCache[MAX_MESH_DEVICE_CACHE];
int meshCacheCount = 0;

// Timers - deliberately SLOW. No aggressive polling anywhere.
unsigned long lastWifiRetry     = 0;  const unsigned long WIFI_RETRY_INTERVAL      = 3000;   // Station reconnect attempts (was: every loop!)
unsigned long lastLeaderWifiTry = 0;  const unsigned long LEADER_WIFI_RETRY_INTERVAL = 30000; // Leader home-Wi-Fi probes (non-blocking begin)
unsigned long lastRoleEval      = 0;  const unsigned long ROLE_EVAL_INTERVAL       = 5000;   // Role decision cadence
unsigned long lastMemberJoin    = 0;  const unsigned long MESH_JOIN_INTERVAL       = 25000;  // Member -> leader announce
unsigned long lastHomeWifiProbe = 0;  const unsigned long HOME_WIFI_PROBE_INTERVAL = 60000;  // Member checks if home Wi-Fi returned
unsigned long leaderUptimeMillis = 0;

// Function Prototypes
void setRelay(int index, bool on, bool saveToNVS = true);
bool updateDeviceInDB(int index, bool state);
bool updateFeedbackInDB(int index, bool feedback);
void markAlarmFiredInDB(String alarmId);
void pollDatabase();
void pollAlarms();
void sendHeartbeat();
bool resolveBoardAndDevices();
bool syncAllStatesToDB();
void setupWebServer();
void handleDeviceToggle(int rIndex);
void enqueueOfflineUpdate(int index, bool state, bool isFeedback);
bool flushOfflineQueue();
String getIsoTime();
void evaluateLocalRole();
bool tryJoinMeshLeader();
void becomeLeader();
void becomeMember();
bool isHomeWifiConnected();
String getSelfIp();
int findMeshNode(const String& nodeId);
bool meshNodeActive(const String& nodeId);
void upsertMeshNode(const String& nodeId, const String& ip, int devicesCount);
void upsertMeshDeviceCache(const String& nodeId, int relayIndex, bool isOn, bool feedbackKnown, bool feedbackOn);
void pruneStaleMeshNodes();
void buildDevicesPayload(JsonArray& arr, bool includeMesh);
void handleToggleAllMesh(bool on);
void loadOfflineQueue();
void saveOfflineQueue();
void cloudSyncTask(void* parameter);
void cloudPollTask(void* parameter);
void configureHttp(HTTPClient& http, uint16_t connectTimeout = 2500, uint16_t requestTimeout = 4000);
bool isCloudConfigured();
void loadHomeWifiCredentials();
void applyPendingWifiConfiguration();

// ============================================================
//  SMALL HELPERS
// ============================================================
bool isHomeWifiConnected() {
  return homeWifiSSID.length() > 0 && WiFi.status() == WL_CONNECTED &&
         WiFi.SSID() == homeWifiSSID;
}

bool isCloudConfigured() {
  return strlen(SUPABASE_BASE) > 0 && strlen(SUPABASE_SERVICE_KEY) > 0;
}

void loadHomeWifiCredentials() {
  if (preferencesMutex) xSemaphoreTake(preferencesMutex, portMAX_DELAY);
  homeWifiSSID = preferences.getString("wifi_ssid", "");
  homeWifiPassword = preferences.getString("wifi_pass", "");
  if (preferencesMutex) xSemaphoreGive(preferencesMutex);
  Serial.printf("-> Home Wi-Fi credentials: %s\n",
                homeWifiSSID.length() ? "saved" : "not configured");
  Serial.printf("-> Supabase cloud sync: %s\n",
                isCloudConfigured() ? "configured" : "disabled (missing URL/key)");
}

String getSelfIp() {
  if (localRole == ROLE_LEADER) return WiFi.softAPIP().toString();
  if (WiFi.status() == WL_CONNECTED) return WiFi.localIP().toString();
  return WiFi.softAPIP().toString();
}

void configureHttp(HTTPClient& http, uint16_t connectTimeout, uint16_t requestTimeout) {
  http.setConnectTimeout(connectTimeout);
  http.setTimeout(requestTimeout);
}

// Stable pseudo-random delay derived from the board id so that boards
// booting simultaneously don't all decide to become leader at once.
unsigned long nodeIdHashDelay() {
  unsigned long h = 2166136261u;
  const char* p = BOARD_IDENTIFIER;
  while (*p) { h ^= (unsigned char)(*p++); h *= 16777619u; }
  return 1000 + (h % 3000); // 1s - 4s
}

// ============================================================
//  setRelay - Direct GPIO & NVS Control
// ============================================================
void setRelay(int index, bool on, bool saveToNVS) {
  if (index < 0 || index >= NUM_DEVICES) return;

  isRelayOn[index] = on;

  digitalWrite(RELAY_PINS[index], on ? LOW : HIGH); // Active-LOW relays

  if (saveToNVS) {
    char key[8];
    sprintf(key, "r_%d", index);
    if (preferencesMutex) xSemaphoreTake(preferencesMutex, portMAX_DELAY);
    preferences.putBool(key, on);
    if (preferencesMutex) xSemaphoreGive(preferencesMutex);
  }

  Serial.printf(">> RELAY [%d] -> %s\n", index, on ? "ON" : "OFF");
}

// ============================================================
//  TIME HELPER
// ============================================================
String getIsoTime() {
  time_t now; time(&now); struct tm timeinfo; gmtime_r(&now, &timeinfo);
  char buf[32];
  sprintf(buf, "%04d-%02d-%02dT%02d:%02d:%02d",
          timeinfo.tm_year + 1900, timeinfo.tm_mon + 1, timeinfo.tm_mday,
          timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec);
  return String(buf);
}

// ============================================================
//  EMBEDDED HTML5 DASHBOARD (DIRECT LOCAL CONTROL PANEL)
// ============================================================
const char INDEX_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Smart Home - ESP32 Local Panel</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: #0b0f17; color: #f1f5f9; min-height: 100vh; padding: 20px 16px; display: flex; flex-direction: column; align-items: center; }
    .container { width: 100%; max-width: 480px; }
    header { text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #1e293b; }
    .badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; background: rgba(16,185,129,0.15); color: #34d399; border: 1px solid rgba(16,185,129,0.3); margin-bottom: 10px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #34d399; animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    h1 { font-size: 20px; font-weight: 800; color: #fff; margin-bottom: 4px; }
    p.sub { font-size: 12px; color: #94a3b8; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 20px; }
    .card { background: #131b2e; border: 1px solid #1e293b; border-radius: 16px; padding: 16px; display: flex; flex-direction: column; justify-content: space-between; min-height: 125px; transition: all 0.2s ease; }
    .card.on { border-color: #3b82f6; background: #172554; box-shadow: 0 0 20px rgba(59,130,246,0.2); }
    .card-head { display: flex; justify-content: space-between; align-items: center; }
    .dev-name { font-size: 14px; font-weight: 700; color: #e2e8f0; }
    .dev-node { font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
    .feedback-pill { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: #334155; color: #94a3b8; }
    .feedback-pill.active { background: #065f46; color: #6ee7b7; }
    .btn-toggle { margin-top: 12px; width: 100%; padding: 10px; border-radius: 12px; border: none; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.15s ease; background: #1e293b; color: #94a3b8; }
    .card.on .btn-toggle { background: #3b82f6; color: #ffffff; box-shadow: 0 4px 12px rgba(59,130,246,0.35); }
    .quick-bar { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 24px; }
    .btn-quick { padding: 12px; border-radius: 12px; border: 1px solid #334155; background: #1e293b; color: #cbd5e1; font-size: 13px; font-weight: 700; cursor: pointer; transition: 0.15s; }
    .btn-quick:active { transform: scale(0.98); }
    .wifi-config { min-height: 0; margin-bottom: 20px; gap: 10px; }
    .wifi-config h2 { font-size: 14px; font-weight: 800; color: #e2e8f0; }
    .wifi-config form { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 6px; }
    .wifi-config input { width: 100%; min-width: 0; padding: 10px; border-radius: 10px; border: 1px solid #334155; background: #0b1220; color: #f1f5f9; font-size: 12px; }
    .wifi-config button { grid-column: 1 / -1; padding: 10px; border-radius: 10px; border: 0; background: #3b82f6; color: white; font-weight: 800; font-size: 12px; cursor: pointer; }
    .wifi-config button:disabled { opacity: .55; cursor: wait; }
    #wifi-message { min-height: 16px; margin-top: 4px; }
    @media (max-width: 360px) { .wifi-config form { grid-template-columns: 1fr; } .wifi-config button { grid-column: auto; } }
    .footer { text-align: center; font-size: 11px; color: #64748b; margin-top: auto; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="badge"><span class="dot"></span> Local Autonomous Mesh</div>
      <h1>Direct ESP32 Control</h1>
      <p class="sub">SoftAP Leader &bull; Sub-100ms Response</p>
    </header>

    <section class="card wifi-config" aria-labelledby="wifi-heading">
      <h2 id="wifi-heading">Home Wi-Fi Setup</h2>
      <p class="sub">Cloud sync reconnects when your router is available. Local relay control stays available while Wi-Fi is configured.</p>
      <form id="wifi-form">
        <input id="wifi-ssid" name="ssid" type="text" maxlength="32" placeholder="Home Wi-Fi name (SSID)" autocomplete="off" required>
        <input id="wifi-password" name="password" type="password" maxlength="63" placeholder="Wi-Fi password (blank for open Wi-Fi)" autocomplete="new-password">
        <button id="wifi-submit" type="submit">Save Wi-Fi &amp; Connect</button>
      </form>
      <p id="wifi-message" class="sub" role="status" aria-live="polite"></p>
    </section>

    <div class="quick-bar">
      <button class="btn-quick" onclick="toggleAll(true)">&#9889; Turn All ON</button>
      <button class="btn-quick" onclick="toggleAll(false)">&#127761; Turn All OFF</button>
    </div>

    <div class="grid" id="devices-grid"></div>

    <div class="footer">
      Connected to ESP32 Hardware Mesh &bull; No Internet Required
    </div>
  </div>

  <script>
    const wifiForm = document.getElementById('wifi-form');
    const wifiMessage = document.getElementById('wifi-message');
    const wifiSubmit = document.getElementById('wifi-submit');

    wifiForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const ssid = document.getElementById('wifi-ssid').value.trim();
      const password = document.getElementById('wifi-password').value;
      if (!ssid) { wifiMessage.textContent = 'Enter a Wi-Fi network name.'; return; }
      if (password.length > 0 && password.length < 8) {
        wifiMessage.textContent = 'Wi-Fi passwords must contain at least 8 characters.';
        return;
      }
      wifiSubmit.disabled = true;
      wifiMessage.textContent = 'Saving credentials…';
      try {
        const response = await fetch('/api/wifi/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ssid, password })
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || 'Could not save Wi-Fi settings.');
        wifiMessage.textContent = result.message || 'Saved. Connecting in the background.';
        document.getElementById('wifi-password').value = '';
      } catch (error) {
        wifiMessage.textContent = error.message || 'Could not save Wi-Fi settings.';
      } finally {
        wifiSubmit.disabled = false;
      }
    });

    async function loadStatus() {
      try {
        const res = await fetch('/api/devices');
        const devices = await res.json();
        const grid = document.getElementById('devices-grid');
        grid.innerHTML = devices.map(d => `
          <div class="card ${d.is_on ? 'on' : ''}">
            <div class="card-head">
              <span>
                <span class="dev-name">Device ${d.relay_index + 1}</span><br>
                ${d.node_id ? `<span class="dev-node">${d.node_id}</span>` : ''}
              </span>
              <span class="feedback-pill ${d.feedback_on === true ? 'active' : ''}">
                ${d.feedback_on === true ? 'INPUT ON' : d.feedback_on === false ? 'INPUT OFF' : 'INPUT N/A'}
              </span>
            </div>
            <button class="btn-toggle" onclick="toggleDevice('${d.node_id || ''}', ${d.relay_index}, ${!d.is_on})">
              ${d.is_on ? 'TURN OFF' : 'TURN ON'}
            </button>
          </div>
        `).join('');
      } catch (e) {
        console.error('Failed to fetch devices', e);
      }
    }

    async function toggleDevice(nodeId, index, targetState) {
      try {
        const url = nodeId
          ? `/api/node/${nodeId}/device/${index}/state`
          : `/api/device/${index}/state`;
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: targetState })
        });
        loadStatus();
      } catch (e) {
        alert('Failed to send command to ESP32');
      }
    }

    async function toggleAll(targetState) {
      try {
        await fetch(`/api/all/${targetState ? 'on' : 'off'}`, { method: 'POST' });
        loadStatus();
      } catch (e) {
        alert('Failed to send all command');
      }
    }

    loadStatus();
    setInterval(loadStatus, 3000);
  </script>
</body>
</html>
)rawliteral";

// ============================================================
//  EMBEDDED REST API SERVER SETUP
// ============================================================
void handleCORS() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, apikey");
  // Private Network Access (Chrome/Edge): requests made from a public
  // HTTPS site (the web dashboard) to this private-network device
  // require the server to opt-in, otherwise the browser blocks the
  // request and the /local page appears dead while the direct IP page
  // (same-origin) keeps working.
  server.sendHeader("Access-Control-Allow-Private-Network", "true");
  // Device identity shown in Chrome's local-network permission prompt.
  server.sendHeader("Private-Network-Access-Name", "smart-home-leader");
  server.sendHeader("Private-Network-Access-ID", "02:4C:A5:00:00:01");
}

void handleDeviceToggle(int rIndex) {
  handleCORS();
  if (rIndex < 0 || rIndex >= NUM_DEVICES) {
    server.send(400, "application/json", "{\"error\":\"Invalid device index\"}");
    return;
  }

  if (!server.hasArg("plain")) {
    server.send(400, "application/json", "{\"error\":\"Missing body\"}");
    return;
  }

  DynamicJsonDocument req(256);
  DeserializationError err = deserializeJson(req, server.arg("plain"));
  if (err || !req["state"].is<bool>()) {
    server.send(400, "application/json", "{\"error\":\"Invalid state payload\"}");
    return;
  }
  bool targetState = req["state"].as<bool>();

  enqueueOfflineUpdate(rIndex, targetState, false);
  setRelay(rIndex, targetState);

  // Notify the leader immediately (event-driven, NOT polling) so the
  // whole mesh + website see physical wall-switch changes instantly.
  if (localRole == ROLE_MEMBER) {
    HTTPClient http;
    http.begin("http://" + AP_IP.toString() + "/api/mesh/report");
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(800);
    String body = "{\"nodeId\":\"" + String(BOARD_IDENTIFIER) + "\",\"relay_index\":" + String(rIndex) +
                  ",\"is_on\":" + String(targetState ? "true" : "false") +
                  ",\"feedback_on\":" + String(confirmedInputState[rIndex] == LOW ? "true" : "false") + "}";
    http.POST(body);
    http.end();
  }

  // Always ACK local control immediately. Cloud persistence is handled by
  // cloudSyncTask, never by this HTTP request path.

  DynamicJsonDocument res(256);
  res["success"] = true;
  res["relay_index"] = rIndex;
  res["state"] = targetState;
  String out;
  serializeJson(res, out);
  server.send(200, "application/json", out);
}

// Proxy a toggle command to a member board (leader side).
bool proxyToggleToMember(const String& nodeId, int rIndex, bool targetState) {
  int idx = findMeshNode(nodeId);
  if (idx == -1) return false;

  HTTPClient http;
  http.begin("http://" + meshNodes[idx].ip + "/api/device/" + String(rIndex) + "/state");
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(1200);
  String body = "{\"state\":" + String(targetState ? "true" : "false") + "}";
  int code = http.POST(body);
  http.end();

  if (code == 200) {
    upsertMeshDeviceCache(nodeId, rIndex, targetState, false, false);
    return true;
  }
  return false;
}

// Fan-out "all on/off" across own relays + every reachable member
void handleToggleAllMesh(bool on) {
  handleCORS();
  for (int i = 0; i < NUM_DEVICES; i++) {
    enqueueOfflineUpdate(i, on, false);
    setRelay(i, on);
  }

  int reached = 0;
  if (localRole == ROLE_LEADER) {
    for (int i = 0; i < MAX_MESH_NODES; i++) {
      if (!meshNodes[i].active) continue;
      HTTPClient http;
      http.begin("http://" + meshNodes[i].ip + "/api/all/" + String(on ? "on" : "off"));
      http.addHeader("Content-Type", "application/json");
      http.setTimeout(1000);
      int code = http.POST("{}");
      http.end();
      if (code == 200) {
        reached++;
        for (int d = 0; d < NUM_DEVICES; d++) {
          upsertMeshDeviceCache(meshNodes[i].nodeId, d, on, false, false);
        }
      }
    }
  }

  String out = "{\"success\":true,\"action\":\"all_" + String(on ? "on" : "off") + "\",\"membersReached\":" + String(reached) + "}";
  server.send(200, "application/json", out);
}

void setupWebServer() {
  // CORS Preflight
  server.onNotFound([]() {
    if (server.method() == HTTP_OPTIONS) {
      handleCORS();
      server.send(204);
    } else {
      server.send(404, "text/plain", "Not Found");
    }
  });

  // Embedded Web Dashboard
  server.on("/", HTTP_GET, []() {
    server.send(200, "text/html", INDEX_HTML);
  });

  // REST API: GET Status & Node Information
  server.on("/api/status", HTTP_GET, []() {
    handleCORS();
    DynamicJsonDocument doc(512);
    doc["online"] = true;
    doc["status"] = "ok";
    doc["role"] = (localRole == ROLE_LEADER) ? "leader" : ((localRole == ROLE_MEMBER) ? "member" : "idle");
    doc["nodeId"] = BOARD_IDENTIFIER;
    doc["ip"] = getSelfIp();
    doc["ap_ip"] = WiFi.softAPIP().toString();
    doc["devicesCount"] = NUM_DEVICES;
    doc["meshNodes"] = (localRole == ROLE_LEADER) ? meshNodeCount : 0;
    doc["stationConnected"] = isHomeWifiConnected();
    doc["wifiConfigured"] = homeWifiSSID.length() > 0;
    doc["cloudConfigured"] = isCloudConfigured();
    doc["mode"] = isHomeWifiConnected() ? "online_wifi" :
                  (localRole == ROLE_LEADER ? "local_ap" : "offline_retrying");
    doc["apStations"] = WiFi.softAPgetStationNum();
    doc["uptimeMs"] = millis();

    String res;
    serializeJson(doc, res);
    server.send(200, "application/json", res);
  });

  // REST API: GET All Device States (aggregated across the mesh when leader)
  server.on("/api/devices", HTTP_GET, []() {
    handleCORS();
    // 8 member boards x 4 relays + this board can exceed 2 KB once every
    // device contains node, relay, and feedback fields. A truncated JSON
    // response makes the browser report that devices could not be loaded.
    DynamicJsonDocument doc(8192);
    JsonArray arr = doc.to<JsonArray>();
    buildDevicesPayload(arr, true);

    String res;
    serializeJson(arr, res);
    server.send(200, "application/json", res);
  });

  // REST API: Individual Device State Endpoints (own relays)
  server.on("/api/device/0/state", HTTP_POST, []() { handleDeviceToggle(0); });
  server.on("/api/device/1/state", HTTP_POST, []() { handleDeviceToggle(1); });
  server.on("/api/device/2/state", HTTP_POST, []() { handleDeviceToggle(2); });
  server.on("/api/device/3/state", HTTP_POST, []() { handleDeviceToggle(3); });

  // REST API: Proxied toggle for mesh member devices (leader side).
  // e.g. POST /api/node/bedroom_board/device/2/state
  server.on(Uri("^\\/api\\/node\\/([\\w\\-]+)\\/device\\/([0-3])\\/state$"), HTTP_POST,
    []() {
      String nodeId = server.pathArg(0);
      int rIndex = server.pathArg(1).toInt();

      // Own devices: handleDeviceToggle() already emits CORS headers.
      // Calling handleCORS() here too produced DUPLICATE
      // "Access-Control-Allow-Origin" headers, which browsers reject -
      // that made every toggle from the HTTPS dashboard fail with a
      // network error while GET /api/devices (single CORS call) worked.
      if (nodeId == String(BOARD_IDENTIFIER)) {
        handleDeviceToggle(rIndex);
        return;
      }

      handleCORS();
      DynamicJsonDocument req(256);
      if (!server.hasArg("plain") || deserializeJson(req, server.arg("plain")) || !req["state"].is<bool>()) {
        server.send(400, "application/json", "{\"error\":\"Invalid state payload\"}");
        return;
      }
      bool targetState = req["state"].as<bool>();

      if (proxyToggleToMember(nodeId, rIndex, targetState)) {
        String out = "{\"success\":true,\"node\":\"" + nodeId + "\",\"relay_index\":" + String(rIndex) +
                     ",\"state\":" + String(targetState ? "true" : "false") + "}";
        server.send(200, "application/json", out);
      } else {
        server.send(504, "application/json", "{\"error\":\"Member unreachable\"}");
      }
    },
    []() {}
  );

  // REST API: POST /api/all/on | /api/all/off (fans out across the mesh)
  server.on("/api/all/on",  HTTP_POST, []() { handleToggleAllMesh(true); });
  server.on("/api/all/off", HTTP_POST, []() { handleToggleAllMesh(false); });

  // ---- Mesh coordination endpoints ----

  // Member registration / periodic announce (carries device snapshot)
  server.on("/api/mesh/join", HTTP_POST, []() {
    handleCORS();
    if (localRole != ROLE_LEADER) {
      server.send(409, "application/json",
        String("{\"error\":\"Not leader\",\"role\":\"") +
        (localRole == ROLE_MEMBER ? "member" : "idle") + "\"}");
      return;
    }
    DynamicJsonDocument req(768);
    DeserializationError err = deserializeJson(req, server.arg("plain"));
    if (err) { server.send(400, "application/json", "{\"error\":\"Bad json\"}"); return; }

    String nodeId = req["nodeId"] | "";
    String ip = server.client().remoteIP().toString();
    if (nodeId == "") { server.send(400, "application/json", "{\"error\":\"Missing nodeId\"}"); return; }

    upsertMeshNode(nodeId, ip, NUM_DEVICES);

    JsonArray devs = req["devices"].as<JsonArray>();
    for (JsonObject d : devs) {
      upsertMeshDeviceCache(nodeId, d["relay_index"] | 0, d["is_on"] | false,
                            d["feedback_on"].is<bool>(), d["feedback_on"] | false);
    }

    // Respond with leader identity so members can resolve split-brain ties.
    DynamicJsonDocument res(256);
    res["success"] = true;
    res["leaderId"] = BOARD_IDENTIFIER;
    String out;
    serializeJson(res, out);
    server.send(200, "application/json", out);
  });

  // Instant state report from a member (e.g. physical switch flip)
  server.on("/api/mesh/report", HTTP_POST, []() {
    handleCORS();
    if (localRole != ROLE_LEADER) { server.send(409, "application/json", "{}"); return; }
    DynamicJsonDocument req(384);
    DeserializationError err = deserializeJson(req, server.arg("plain"));
    if (err) { server.send(400, "application/json", "{}"); return; }
    String nodeId = req["nodeId"] | "";
    String ip = server.client().remoteIP().toString();
    if (nodeId != "") {
      upsertMeshNode(nodeId, ip, NUM_DEVICES);
      upsertMeshDeviceCache(nodeId, req["relay_index"] | 0, req["is_on"] | false,
                            req["feedback_on"].is<bool>(), req["feedback_on"] | false);
    }
    server.send(200, "application/json", "{\"success\":true}");
  });

  // Mesh topology listing for the website
  server.on("/api/mesh/nodes", HTTP_GET, []() {
    handleCORS();
    DynamicJsonDocument doc(1024);
    JsonArray arr = doc.to<JsonArray>();
    JsonObject self = arr.createNestedObject();
    self["nodeId"] = BOARD_IDENTIFIER;
    self["ip"] = getSelfIp();
    self["role"] = "leader";
    self["devicesCount"] = NUM_DEVICES;
    for (int i = 0; i < MAX_MESH_NODES; i++) {
      if (!meshNodes[i].active) continue;
      JsonObject n = arr.createNestedObject();
      n["nodeId"] = meshNodes[i].nodeId;
      n["ip"] = meshNodes[i].ip;
      n["role"] = "member";
      n["devicesCount"] = meshNodes[i].devicesCount;
      n["lastSeenMs"] = (unsigned long)(millis() - meshNodes[i].lastSeen);
    }
    String res;
    serializeJson(arr, res);
    server.send(200, "application/json", res);
  });

  server.on("/api/wifi/config", HTTP_POST, []() {
    handleCORS();
    if (!server.hasArg("plain")) {
      server.send(400, "application/json", "{\"success\":false,\"error\":\"Missing request body\"}");
      return;
    }
    DynamicJsonDocument req(512);
    DeserializationError err = deserializeJson(req, server.arg("plain"));
    if (err || !req["ssid"].is<const char*>()) {
      server.send(400, "application/json", "{\"success\":false,\"error\":\"Invalid Wi-Fi configuration\"}");
      return;
    }
    String newSSID = req["ssid"].as<String>();
    String newPassword = req["password"] | "";
    newSSID.trim();
    if (newSSID.length() == 0 || newSSID.length() > 32 ||
        (newPassword.length() > 0 && newPassword.length() < 8) ||
        newPassword.length() > 63) {
      server.send(400, "application/json",
        "{\"success\":false,\"error\":\"SSID or password length is invalid\"}");
      return;
    }
    homeWifiSSID = newSSID;
    homeWifiPassword = newPassword;
    if (preferencesMutex) xSemaphoreTake(preferencesMutex, portMAX_DELAY);
    preferences.putString("wifi_ssid", homeWifiSSID);
    preferences.putString("wifi_pass", homeWifiPassword);
    if (preferencesMutex) xSemaphoreGive(preferencesMutex);

    wifiConfigPending = true;
    server.send(200, "application/json",
      "{\"success\":true,\"message\":\"Wi-Fi saved. Connecting in background; local control remains available.\"}");
  });

  server.begin();
  Serial.println("-> Local HTTP REST Server & Web Dashboard running on Port 80");
}

// Aggregated device list: own relays (+ node tag) + cached member snapshots.
// Member data comes from the announce cache - NO per-request network calls,
// so this endpoint stays sub-millisecond even with a full mesh.
void buildDevicesPayload(JsonArray& arr, bool includeMesh) {
  for (int i = 0; i < NUM_DEVICES; i++) {
    JsonObject dev = arr.createNestedObject();
    dev["id"] = String(BOARD_IDENTIFIER) + "_" + String(i);
    dev["relay_index"] = i;
    dev["is_on"] = isRelayOn[i];
    // Live feedback is the directly-read GPIO input associated with this channel.
    dev["feedback_on"] = (confirmedInputState[i] == LOW);
    dev["node_id"] = BOARD_IDENTIFIER;
    dev["node_role"] = (localRole == ROLE_LEADER) ? "leader" : ((localRole == ROLE_MEMBER) ? "member" : "idle");
  }

  if (includeMesh && localRole == ROLE_LEADER) {
    pruneStaleMeshNodes();
    for (int c = 0; c < meshCacheCount; c++) {
      if (!meshNodeActive(meshDeviceCache[c].nodeId)) continue;
      JsonObject dev = arr.createNestedObject();
      dev["id"] = meshDeviceCache[c].nodeId + "_" + String(meshDeviceCache[c].relayIndex);
      dev["relay_index"] = meshDeviceCache[c].relayIndex;
      dev["is_on"] = meshDeviceCache[c].isOn;
      if (meshDeviceCache[c].feedbackKnown) dev["feedback_on"] = meshDeviceCache[c].feedbackOn;
      else dev["feedback_on"] = nullptr;
      dev["node_id"] = meshDeviceCache[c].nodeId;
      dev["node_role"] = "member";
    }
  }
}

// ============================================================
//  MESH REGISTRY HELPERS
// ============================================================
int findMeshNode(const String& nodeId) {
  for (int i = 0; i < MAX_MESH_NODES; i++) {
    if (meshNodes[i].active && meshNodes[i].nodeId == nodeId) return i;
  }
  return -1;
}

bool meshNodeActive(const String& nodeId) {
  return findMeshNode(nodeId) != -1;
}

void upsertMeshNode(const String& nodeId, const String& ip, int devicesCount) {
  int slot = findMeshNode(nodeId);
  if (slot == -1) {
    for (int i = 0; i < MAX_MESH_NODES; i++) {
      if (!meshNodes[i].active) { slot = i; meshNodeCount++; break; }
    }
    if (slot == -1) return; // registry full
    meshNodes[slot].nodeId = nodeId;
    meshNodes[slot].active = true;
  }
  meshNodes[slot].ip = ip;
  meshNodes[slot].devicesCount = devicesCount;
  meshNodes[slot].lastSeen = millis();
}

void upsertMeshDeviceCache(const String& nodeId, int relayIndex, bool isOn, bool feedbackKnown, bool feedbackOn) {
  if (relayIndex < 0 || relayIndex >= NUM_DEVICES) return;
  for (int i = 0; i < meshCacheCount; i++) {
    if (meshDeviceCache[i].nodeId == nodeId && meshDeviceCache[i].relayIndex == relayIndex) {
      meshDeviceCache[i].isOn = isOn;
      // A relay command carries no new input sample. Preserve the last known
      // GPIO feedback until the member reports its current input state.
      if (feedbackKnown) {
        meshDeviceCache[i].feedbackKnown = true;
        meshDeviceCache[i].feedbackOn = feedbackOn;
      }
      return;
    }
  }
  if (meshCacheCount >= MAX_MESH_DEVICE_CACHE) return;
  meshDeviceCache[meshCacheCount].nodeId = nodeId;
  meshDeviceCache[meshCacheCount].relayIndex = relayIndex;
  meshDeviceCache[meshCacheCount].isOn = isOn;
  meshDeviceCache[meshCacheCount].feedbackKnown = feedbackKnown;
  meshDeviceCache[meshCacheCount].feedbackOn = feedbackOn;
  meshCacheCount++;
}

void pruneStaleMeshNodes() {
  const unsigned long STALE_MS = 90000; // ~3 missed announcements
  for (int i = 0; i < MAX_MESH_NODES; i++) {
    if (meshNodes[i].active && (millis() - meshNodes[i].lastSeen > STALE_MS)) {
      Serial.println("-> Mesh member timed out: " + meshNodes[i].nodeId);
      meshNodes[i].active = false;
      meshNodeCount--;
    }
  }
}

// ============================================================
//  ROLE MANAGEMENT (LEADER ELECTION & FAILOVER)
// ============================================================

// Try to find + join an existing leader's mesh network.
// Returns true if we successfully joined as a member.
bool tryJoinMeshLeader() {
  Serial.println("-> Scanning for existing mesh leader...");
  int n = WiFi.scanNetworks();
  bool found = false;
  // Never target our OWN SoftAP (same SSID). Compare BSSIDs so a board
  // that is already broadcasting MESH_SSID cannot try to join itself.
  String selfApBssid = WiFi.softAPmacAddress();
  selfApBssid.toUpperCase();
  for (int i = 0; i < n; i++) {
    String bssid = WiFi.BSSIDstr(i);
    bssid.toUpperCase();
    if (WiFi.SSID(i) == String(MESH_SSID) && bssid != selfApBssid) {
      found = true;
      break;
    }
  }
  WiFi.scanDelete();
  if (!found) return false;

  Serial.println("-> Leader detected. Joining as member...");
  WiFi.begin(MESH_SSID, MESH_PASS);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 8000) {
    delay(100);
    server.handleClient(); // keep serving local requests during join
  }
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.disconnect();
    return false;
  }

  Serial.print("-> Joined mesh. Member IP: ");
  Serial.println(WiFi.localIP());
  return true;
}

void becomeLeader() {
  if (localRole != ROLE_LEADER) {
    Serial.println("==> ROLE: LEADER (broadcasting " + String(MESH_SSID) + ")");
  }
  localRole = ROLE_LEADER;
  leaderUptimeMillis = millis();
  // Leave the leader's network if we had joined one
  if (WiFi.SSID() == String(MESH_SSID)) WiFi.disconnect(false);
  // Leader needs AP + STA: AP for the phone/members, STA to keep watching
  // for the home Wi-Fi to come back. Disable automatic STA reconnects here:
  // background STA scans/reconnects can interrupt SoftAP clients on the
  // ESP32's shared radio. The main loop retries explicitly only when no
  // phone/member is currently attached to this AP.
  WiFi.mode(WIFI_AP_STA);
  WiFi.setAutoReconnect(false);
  WiFi.disconnect(false, false);
  WiFi.softAPConfig(AP_IP, AP_GATEWAY, AP_SUBNET);
  bool apStarted = WiFi.softAP(MESH_SSID, (strlen(MESH_PASS) >= 8) ? MESH_PASS : NULL);
  if (!apStarted) {
    Serial.println("ERROR: SoftAP start failed; role will be retried.");
    localRole = ROLE_IDLE;
    return;
  }
  Serial.print("-> SoftAP active. IP: ");
  Serial.println(WiFi.softAPIP());
  if (homeWifiSSID.length() > 0) {
    WiFi.begin(homeWifiSSID.c_str(), homeWifiPassword.c_str());
    lastLeaderWifiTry = millis();
    Serial.println("-> Attempting home Wi-Fi in background; local AP remains enabled.");
  }
}

void becomeMember() {
  Serial.println("==> ROLE: MEMBER (joined leader at " + AP_IP.toString() + ")");
  localRole = ROLE_MEMBER;
  // Stop broadcasting our own SoftAP to avoid SSID/IP conflicts
  WiFi.softAPdisconnect(true);
  meshNodeCount = 0;
  meshCacheCount = 0;
}

// Periodic role evaluation. Runs at most every ROLE_EVAL_INTERVAL ms and
// only does real work when a role decision is actually needed.
// This replaces the old behaviour where SoftAP/leader mode was decided
// once at boot and never adapted to actual connectivity.
void evaluateLocalRole() {
  if (millis() - lastRoleEval < ROLE_EVAL_INTERVAL) return;
  lastRoleEval = millis();

  // Home Wi-Fi is the cloud plane, but do not tear down an active leader AP.
  // The browser may still be using 192.168.4.1 while the router reconnects;
  // removing the AP here caused a predictable website disconnect.
  if (isHomeWifiConnected()) {
    if (localRole == ROLE_LEADER) {
      return;
    }
    if (localRole == ROLE_MEMBER) {
      Serial.println("-> Home Wi-Fi active. Standing down local mesh.");
      localRole = ROLE_IDLE;
      WiFi.softAPdisconnect(true);
      WiFi.scanDelete();
      meshNodeCount = 0;
      meshCacheCount = 0;
    }
    return;
  }

  if (localRole == ROLE_MEMBER) {
    // Periodic announce to leader (carries full device snapshot).
    // Event-driven reports cover instant changes; this is only a liveness beat.
    if (millis() - lastMemberJoin >= MESH_JOIN_INTERVAL) {
      lastMemberJoin = millis();
      HTTPClient http;
      http.begin("http://" + AP_IP.toString() + "/api/mesh/join");
      http.addHeader("Content-Type", "application/json");
      http.setTimeout(1500);

      DynamicJsonDocument body(768);
      body["nodeId"] = BOARD_IDENTIFIER;
      JsonArray devs = body.createNestedArray("devices");
      for (int i = 0; i < NUM_DEVICES; i++) {
        JsonObject d = devs.createNestedObject();
        d["relay_index"] = i;
        d["is_on"] = isRelayOn[i];
        // Read each channel feedback directly from its ESP32 GPIO input.
        d["feedback_on"] = (confirmedInputState[i] == LOW);
      }
      String out;
      serializeJson(body, out);
      int code = http.POST(out);
      http.end();

      if (code != 200) {
        Serial.println("-> Leader unreachable. Will re-evaluate role.");
        localRole = ROLE_IDLE; // next cycle: rescan / take over as leader
      }
    }

    // Occasionally check whether home Wi-Fi returned (once a minute, cheap)
    if (millis() - lastHomeWifiProbe >= HOME_WIFI_PROBE_INTERVAL) {
      lastHomeWifiProbe = millis();
      WiFi.disconnect(false);
      delay(100);
      WiFi.begin(homeWifiSSID.c_str(), homeWifiPassword.c_str());
      unsigned long start = millis();
      while (WiFi.status() != WL_CONNECTED && millis() - start < 4000) { delay(50); server.handleClient(); }
      if (WiFi.status() != WL_CONNECTED) {
        // Home Wi-Fi still down - rejoin the leader mesh
        WiFi.begin(MESH_SSID, MESH_PASS);
        start = millis();
        while (WiFi.status() != WL_CONNECTED && millis() - start < 8000) { delay(50); server.handleClient(); }
        if (WiFi.status() != WL_CONNECTED) localRole = ROLE_IDLE;
      } else {
        Serial.println("-> Home Wi-Fi restored on member.");
      }
    }
    return;
  }

  if (localRole == ROLE_LEADER) {
    // Leader steady-state: nothing to do. Members announce themselves.
    // Failover: if all members vanished AND we were never joined by anyone,
    // we simply keep serving - the phone may be connected to us right now.
    return;
  }

  // ROLE_IDLE and home Wi-Fi is down -> decide: lead or follow?
  // Randomized per-board delay prevents simultaneous split-brain election.
  static unsigned long idleSince = 0;
  if (idleSince == 0) idleSince = millis();
  if (millis() - idleSince < nodeIdHashDelay()) return;
  idleSince = 0;

  if (tryJoinMeshLeader()) {
    becomeMember();
    lastMemberJoin = millis() - MESH_JOIN_INTERVAL; // force immediate announce
  } else {
    becomeLeader();
  }
}

// ============================================================
//  STORE AND FORWARD OFFLINE QUEUE
// ============================================================
void enqueueOfflineUpdate(int index, bool state, bool isFeedback) {
  // Offline buffering is only useful when a cloud endpoint/key is configured.
  // Local relay commands must continue to work when cloud sync is disabled.
  if (!isCloudConfigured()) return;
  if (offlineQueueMutex) xSemaphoreTake(offlineQueueMutex, portMAX_DELAY);

  // Keep only the latest value for each device/source pair. This prevents a
  // rapid switch sequence from exhausting the queue while offline.
  for (int i = 0; i < queueCount; i++) {
    if (offlineQueue[i].pending && offlineQueue[i].deviceIndex == index &&
        offlineQueue[i].isFeedback == isFeedback) {
      offlineQueue[i].state = state;
      saveOfflineQueue();
      if (offlineQueueMutex) xSemaphoreGive(offlineQueueMutex);
      return;
    }
  }

  if (queueCount < MAX_PENDING) {
    offlineQueue[queueCount].deviceIndex = index;
    offlineQueue[queueCount].state = state;
    offlineQueue[queueCount].isFeedback = isFeedback;
    offlineQueue[queueCount].pending = true;
    queueCount++;
    saveOfflineQueue();
    Serial.printf("Enqueued offline action: Dev [%d] State: %d (Queue: %d)\n", index, state, queueCount);
  } else {
    Serial.printf("Offline queue full; dropped update for device %d.\n", index);
  }
  if (offlineQueueMutex) xSemaphoreGive(offlineQueueMutex);
}

void saveOfflineQueue() {
  if (preferencesMutex) xSemaphoreTake(preferencesMutex, portMAX_DELAY);
  preferences.putUChar("q_count", (uint8_t)queueCount);
  // Persist only live entries. Writing 48 unused keys for every single
  // toggle made local command handling perform unnecessary flash work.
  for (int i = 0; i < queueCount; i++) {
    char key[8];
    sprintf(key, "q%d_i", i); preferences.putChar(key, offlineQueue[i].deviceIndex);
    sprintf(key, "q%d_s", i); preferences.putBool(key, offlineQueue[i].state);
    sprintf(key, "q%d_f", i); preferences.putBool(key, offlineQueue[i].isFeedback);
  }
  if (preferencesMutex) xSemaphoreGive(preferencesMutex);
}

void loadOfflineQueue() {
  queueCount = min((int)preferences.getUChar("q_count", 0), MAX_PENDING);
  for (int i = 0; i < queueCount; i++) {
    char key[8];
    sprintf(key, "q%d_i", i); offlineQueue[i].deviceIndex = preferences.getChar(key, -1);
    sprintf(key, "q%d_s", i); offlineQueue[i].state = preferences.getBool(key, false);
    sprintf(key, "q%d_f", i); offlineQueue[i].isFeedback = preferences.getBool(key, false);
    offlineQueue[i].pending = offlineQueue[i].deviceIndex >= 0 && offlineQueue[i].deviceIndex < NUM_DEVICES;
  }
  Serial.printf("Restored %d pending offline updates.\\n", queueCount);
}
bool flushOfflineQueue() {
  if (!isHomeWifiConnected() || boardUUID == "") return false;

  PendingUpdate work;
  bool found = false;
  if (offlineQueueMutex) xSemaphoreTake(offlineQueueMutex, portMAX_DELAY);
  for (int i = 0; i < queueCount; i++) {
    if (!offlineQueue[i].pending || offlineQueue[i].deviceIndex < 0 ||
        offlineQueue[i].deviceIndex >= NUM_DEVICES ||
        deviceUUIDs[offlineQueue[i].deviceIndex] == "") continue;
    work = offlineQueue[i];
    found = true;
    break;
  }
  if (offlineQueueMutex) xSemaphoreGive(offlineQueueMutex);
  if (!found) return true;

  bool delivered = work.isFeedback
    ? updateFeedbackInDB(work.deviceIndex, work.state)
    : updateDeviceInDB(work.deviceIndex, work.state);
  if (!delivered) {
    Serial.printf("Cloud update pending for device %d; will retry.\n", work.deviceIndex);
    return false;
  }

  // Remove only the exact value sent. If the user changed this device while
  // the cloud request was in flight, retain the newer queued value.
  if (offlineQueueMutex) xSemaphoreTake(offlineQueueMutex, portMAX_DELAY);
  for (int i = 0; i < queueCount; i++) {
    if (offlineQueue[i].pending && offlineQueue[i].deviceIndex == work.deviceIndex &&
        offlineQueue[i].isFeedback == work.isFeedback && offlineQueue[i].state == work.state) {
      for (int j = i; j < queueCount - 1; j++) offlineQueue[j] = offlineQueue[j + 1];
      queueCount--;
      offlineQueue[queueCount].pending = false;
      break;
    }
  }
  saveOfflineQueue();
  if (offlineQueueMutex) xSemaphoreGive(offlineQueueMutex);
  return true;
}

// ============================================================
//  SETUP
// ============================================================
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n===========================================");
  Serial.println("  ESP32 Dual-Plane Mesh Node (4 Devices)");
  Serial.println("===========================================");

  // Reduce dynamic power draw significantly with no practical
  // impact on WebServer/JSON workloads (big heat reduction).
  setCpuFrequencyMhz(160);

  preferencesMutex = xSemaphoreCreateMutex();
  offlineQueueMutex = xSemaphoreCreateMutex();
  if (!preferencesMutex || !offlineQueueMutex) {
    Serial.println("ERROR: Failed to create persistence/queue mutexes.");
  }

  preferences.begin("smart_home", false);
  loadHomeWifiCredentials();
  loadOfflineQueue();

  // Initialize GPIOs & restore saved relay states.
  for (int i = 0; i < NUM_DEVICES; i++) {
    char key[8];
    sprintf(key, "r_%d", i);
    bool savedState = preferences.getBool(key, false);
    // Relays are active-LOW. Preload the output latch before enabling OUTPUT
    // mode, avoiding a brief default-LOW pulse on startup.
    digitalWrite(RELAY_PINS[i], savedState ? LOW : HIGH);
    pinMode(RELAY_PINS[i], OUTPUT);
    setRelay(i, savedState, false);

    pinMode(INPUT_PINS[i], INPUT_PULLUP);
    confirmedInputState[i] = digitalRead(INPUT_PINS[i]);
    lastInputRead[i] = confirmedInputState[i];
  }
  Serial.println("-> Relay GPIOs & NVS States restored.");

  // Lower TX power = less RF heat, still plenty for in-home range.
  // (Must come after WiFi.mode so the radio stack is started.)
  WiFi.persistent(false);          // don't flash-write credentials each boot
  WiFi.setAutoReconnect(true);     // let the stack handle clean drops silently

  // FIX (EN-button issue): boot in STA mode FIRST.
  // 1. Lower boot-time current draw -> far less likely to brownout on weak
  //    power supplies right after a power cut (the old code brought up
  //    SoftAP + STA simultaneously at boot).
  // 2. Our own SoftAP is NOT broadcasting during the leader-election scan,
  //    so the board can never try to "join" its own HOME-AUTO-LEADER
  //    network and stall the home Wi-Fi connection.
  // SoftAP is started later by becomeLeader() ONLY when home Wi-Fi is down.
  WiFi.mode(WIFI_STA);

  if (homeWifiSSID.length() > 0) {
    wifiMulti.addAP(homeWifiSSID.c_str(), homeWifiPassword.c_str());
    Serial.print("-> Connecting to Home Wi-Fi: ");
    Serial.println(homeWifiSSID);

    // Initial bounded attempt so cloud can start immediately when available.
    unsigned long wifiStart = millis();
    while (wifiMulti.run() != WL_CONNECTED && millis() - wifiStart < 8000) {
      delay(250);
    }
    if (WiFi.status() == WL_CONNECTED) {
      Serial.print("-> Home Wi-Fi connected. IP: ");
      Serial.println(WiFi.localIP());
    } else {
      Serial.println("-> Home Wi-Fi unavailable; local AP will start.");
    }
  } else {
    Serial.println("-> No Home Wi-Fi credentials configured; skipping STA scans.");
  }
  WiFi.setTxPower(WIFI_POWER_15dBm);

  // mDNS responder (http://home-automation.local)
  if (MDNS.begin("home-automation")) {
    Serial.println("-> mDNS responder started: http://home-automation.local");
  }

  // Embedded REST server
  setupWebServer();

  // If home Wi-Fi is down at boot (power cut / router offline), start the
  // local mesh role election IMMEDIATELY instead of waiting for the first
  // throttled loop() evaluation. HOME-AUTO-LEADER appears within seconds -
  // no EN-button reset should ever be needed to bring the SoftAP online.
  if (!isHomeWifiConnected()) {
    Serial.println("-> Home Wi-Fi unavailable at boot. Starting local mode...");
    lastRoleEval = millis() - ROLE_EVAL_INTERVAL;
    evaluateLocalRole();
  }

  BaseType_t taskCreated = pdFAIL;
  if (preferencesMutex && offlineQueueMutex) {
    taskCreated = xTaskCreatePinnedToCore(
      cloudSyncTask,
      "cloud_sync",
      16384,
      nullptr,
      1,
      &cloudSyncTaskHandle,
      0
    );
  }
  if (taskCreated != pdPASS) {
    Serial.println("ERROR: Cloud sync task failed to start; local control remains active.");
  } else {
    BaseType_t pollTaskCreated = xTaskCreatePinnedToCore(
      cloudPollTask,
      "cloud_poll",
      12288,
      nullptr,
      1,
      &cloudPollTaskHandle,
      0
    );
    if (pollTaskCreated != pdPASS) {
      Serial.println("ERROR: Cloud poll task failed to start; cloud-to-relay sync is disabled.");
    }
  }

  Serial.println("===========================================\n");
}

// ============================================================
//  MAIN LOOP
// ============================================================
void applyPendingWifiConfiguration() {
  if (!wifiConfigPending) return;
  wifiConfigPending = false;

  // becomeLeader() retains the local AP and starts a station attempt itself.
  // Return afterward to avoid restarting that connection twice.
  if (!isHomeWifiConnected() && localRole != ROLE_LEADER) {
    becomeLeader();
    return;
  }

  if (homeWifiSSID.length() > 0) {
    WiFi.setAutoReconnect(localRole != ROLE_LEADER);
    WiFi.begin(homeWifiSSID.c_str(), homeWifiPassword.c_str());
    Serial.println("-> Home Wi-Fi connection started; local HTTP API remains enabled.");
  }
}

void loop() {
  // Handle local HTTP requests immediately (sub-100ms response)
  server.handleClient();
  applyPendingWifiConfiguration();

  // 1. Physical Switch Input Reading (Debounced)
  for (int i = 0; i < NUM_DEVICES; i++) {
    bool currentRead = digitalRead(INPUT_PINS[i]);

    if (currentRead != lastInputRead[i]) {
      lastDebounceTime[i] = millis();
    }

    if ((millis() - lastDebounceTime[i]) > DEBOUNCE_DELAY) {
      if (currentRead != confirmedInputState[i]) {
        confirmedInputState[i] = currentRead;

        bool isSwitchOn = (confirmedInputState[i] == LOW);
        Serial.printf("!! Physical Switch [%d] -> %s\n", i, isSwitchOn ? "CLOSED (ON)" : "OPEN (OFF)");

        if (localRole == ROLE_MEMBER) {
          // Instant event-driven report to leader (no polling involved)
          HTTPClient http;
          http.begin("http://" + AP_IP.toString() + "/api/mesh/report");
          http.addHeader("Content-Type", "application/json");
          http.setTimeout(800);
          String body = "{\"nodeId\":\"" + String(BOARD_IDENTIFIER) + "\",\"relay_index\":" + String(i) +
                        ",\"feedback_only\":true" +
                        ",\"is_on\":" + String(isRelayOn[i] ? "true" : "false") +
                        ",\"feedback_on\":" + String(isSwitchOn ? "true" : "false") + "}";
          http.POST(body);
          http.end();
        }

        enqueueOfflineUpdate(i, isSwitchOn, true);
      }
    }
    lastInputRead[i] = currentRead;
  }

  // 2. Role / connectivity management (throttled internally)
  evaluateLocalRole();

  // 3. Station reconnect attempts are throttled. WiFiMulti::run() is a
  // blocking scan, so it is only used while IDLE (no SoftAP). A LEADER uses
  // WiFi.begin() in the background at a slower interval to preserve local
  // control; STA scans/association may still briefly affect AP clients.
  // Members probe home Wi-Fi from evaluateLocalRole().
  if (!isHomeWifiConnected()) {
    if (localRole == ROLE_LEADER) {
      if (homeWifiSSID.length() > 0 && WiFi.status() != WL_CONNECTED &&
          millis() - lastLeaderWifiTry >= LEADER_WIFI_RETRY_INTERVAL) {
        lastLeaderWifiTry = millis();
        Serial.println("-> Retrying home Wi-Fi while preserving local AP...");
        WiFi.begin(homeWifiSSID.c_str(), homeWifiPassword.c_str());
      }
    } else if (localRole == ROLE_IDLE && homeWifiSSID.length() > 0 &&
               millis() - lastWifiRetry >= WIFI_RETRY_INTERVAL) {
      lastWifiRetry = millis();
      wifiMulti.run();
    }
  }

  // 4. Live Serial Monitor (slowed down - serial prints cost CPU time)
  if (millis() - lastSerialDumpTime >= SERIAL_DUMP_INTERVAL) {
    lastSerialDumpTime = millis();
    Serial.printf("\n--- NODE MONITOR | Role: %s | Home WiFi: %s | AP clients: %u | Free heap: %u ---\n",
      (localRole == ROLE_LEADER) ? "LEADER" : ((localRole == ROLE_MEMBER) ? "MEMBER" : "IDLE"),
      isHomeWifiConnected() ? "CONNECTED" : "OFFLINE",
      WiFi.softAPgetStationNum(), ESP.getFreeHeap()
    );
    for (int i = 0; i < NUM_DEVICES; i++) {
      Serial.printf("Device %d | Relay: %-3s | Switch: %-3s\n",
        i,
        isRelayOn[i] ? "ON" : "OFF",
        (confirmedInputState[i] == LOW) ? "ON" : "OFF"
      );
    }
    Serial.println("-----------------------------------------\n");
  }

  // Cloud traffic is intentionally isolated in cloudSyncTask. This loop
  // remains available to service local HTTP requests and physical inputs.
  delay(1); // yield to Wi-Fi/FreeRTOS tasks without delaying local polling
}

// ============================================================
//  SUPABASE CLOUD HTTP FUNCTIONS (unchanged cloud logic)
// ============================================================
void pollDatabase() {
  if (!isCloudConfigured() || boardUUID == "") return;

  HTTPClient http;
  http.begin(String(SUPABASE_BASE) + "/devices?board_id=eq." + boardUUID + "&select=id,relay_index,is_on");
  // This poll is the cloud-to-relay fallback latency budget. Local commands
  // still reach the ESP32 directly and do not wait for this interval.
  configureHttp(http, 2000, 2000);
  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));

  if (http.GET() == 200) {
    DynamicJsonDocument doc(1024);
    deserializeJson(doc, http.getString());

    for (int i = 0; i < doc.size(); i++) {
      String rowDeviceId = doc[i]["id"].as<String>();
      int rIndex = doc[i]["relay_index"];
      bool dbState = doc[i]["is_on"];

      // Only the exact device row linked during board resolution may control
      // this relay. Duplicate/stale rows for the same relay index are ignored.
      if (rIndex >= 0 && rIndex < NUM_DEVICES &&
          deviceUUIDs[rIndex] != "" && rowDeviceId == deviceUUIDs[rIndex]) {
        if (offlineQueueMutex) xSemaphoreTake(offlineQueueMutex, portMAX_DELAY);
        bool updatePending = false;
        for (int q = 0; q < queueCount; q++) {
          if (offlineQueue[q].pending && offlineQueue[q].deviceIndex == rIndex &&
              !offlineQueue[q].isFeedback) {
            updatePending = true;
            break;
          }
        }

        if (!updatePending && dbState != isRelayOn[rIndex]) {
          Serial.printf("Cloud Toggle Dev [%d] -> %s\n", rIndex, dbState ? "ON" : "OFF");
          setRelay(rIndex, dbState);
        }
        if (offlineQueueMutex) xSemaphoreGive(offlineQueueMutex);
      }
    }
  }
  http.end();
}

bool updateDeviceInDB(int index, bool state) {
  if (!isCloudConfigured() || index < 0 || index >= NUM_DEVICES || deviceUUIDs[index] == "") return false;

  HTTPClient http;
  http.begin(String(SUPABASE_BASE) + "/devices?id=eq." + deviceUUIDs[index]);
  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));
  http.addHeader("Content-Type", "application/json");
  configureHttp(http);
  int code = http.PATCH("{\"is_on\":" + String(state ? "true" : "false") + "}");
  http.end();
  return code == 200 || code == 204;
}

bool updateFeedbackInDB(int index, bool feedback) {
  if (!isCloudConfigured() || index < 0 || index >= NUM_DEVICES || deviceUUIDs[index] == "") return false;

  HTTPClient http;
  http.begin(String(SUPABASE_BASE) + "/devices?id=eq." + deviceUUIDs[index]);
  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));
  http.addHeader("Content-Type", "application/json");
  configureHttp(http);
  int code = http.PATCH("{\"feedback_on\":" + String(feedback ? "true" : "false") + "}");
  http.end();
  return code == 200 || code == 204;
}

bool resolveBoardAndDevices() {
  if (!isCloudConfigured() || strlen(BOARD_IDENTIFIER) == 0 ||
      String(BOARD_IDENTIFIER) == "esp32-unconfigured") return false;
  HTTPClient http;

  // 1. Find Board UUID
  http.begin(String(SUPABASE_BASE) + "/boards?board_identifier=eq." + BOARD_IDENTIFIER + "&select=id");
  configureHttp(http);
  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));

  if (http.GET() == 200) {
    DynamicJsonDocument doc(512); deserializeJson(doc, http.getString());
    if (doc.size() > 0) {
      boardUUID = doc[0]["id"].as<String>();
      Serial.println("  -> Found Board UUID: " + boardUUID);
    }
  }
  http.end();

  // 2. Find ALL Device UUIDs for this board
  bool foundAny = false;
  if (boardUUID != "") {
    http.begin(String(SUPABASE_BASE) + "/devices?board_id=eq." + boardUUID + "&select=id,relay_index");
    configureHttp(http);
    http.addHeader("apikey", SUPABASE_SERVICE_KEY);
    http.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));

    if (http.GET() == 200) {
      DynamicJsonDocument doc(2048); deserializeJson(doc, http.getString());
      for (int i = 0; i < doc.size(); i++) {
        int rIndex = doc[i]["relay_index"];
        if (rIndex >= 0 && rIndex < NUM_DEVICES) {
          deviceUUIDs[rIndex] = doc[i]["id"].as<String>();
          Serial.printf("  -> Linked Device [%d]\n", rIndex);
          foundAny = true;
        }
      }
    }
    http.end();
  }

  if (!foundAny) {
    boardUUID = "";
    for (int i = 0; i < NUM_DEVICES; i++) deviceUUIDs[i] = "";
  }
  return foundAny;
}

// Push current relay states to the cloud before enabling cloud-to-relay polling.
// feedback_on represents the directly-read GPIO input state; this function only
// reconciles commanded relay state and deliberately leaves feedback_on untouched.
// This prevents stale cloud relay values from changing outputs immediately after boot.
bool syncAllStatesToDB() {
  if (!isCloudConfigured() || boardUUID == "") return false;

  int syncedDevices = 0;
  bool allSynced = true;
  for (int i = 0; i < NUM_DEVICES; i++) {
    if (deviceUUIDs[i] == "") continue;

    HTTPClient http;
    http.begin(String(SUPABASE_BASE) + "/devices?id=eq." + deviceUUIDs[i]);
    configureHttp(http);
    http.addHeader("apikey", SUPABASE_SERVICE_KEY);
    http.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));
    http.addHeader("Content-Type", "application/json");

    String body = "{\"is_on\":" + String(isRelayOn[i] ? "true" : "false") +
                  ",\"last_changed\":\"" + getIsoTime() + "\"}";
    int code = http.PATCH(body);
    http.end();

    if (code == 200 || code == 204) {
      syncedDevices++;
    } else {
      allSynced = false;
      Serial.printf("-> Initial relay-state sync failed for device %d (HTTP %d).\n", i, code);
    }
  }

  if (syncedDevices == 0 || !allSynced) return false;
  Serial.println("-> Current relay states synced to cloud before polling.");
  return true;
}

void pollAlarms() {
  if (!isCloudConfigured() || boardUUID == "") return;
  String queryIds = "";
  for (int i = 0; i < NUM_DEVICES; i++) {
    if (deviceUUIDs[i] != "") {
      if (queryIds != "") queryIds += ",";
      queryIds += "%22" + deviceUUIDs[i] + "%22";
    }
  }
  if (queryIds == "") return;

  HTTPClient http;
  http.begin(String(SUPABASE_BASE) + "/alarms?device_id=in.(" + queryIds + ")&fired=eq.false&select=id,trigger_at,action,device_id");
  configureHttp(http);
  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));

  if (http.GET() == 200) {
    DynamicJsonDocument doc(2048);
    deserializeJson(doc, http.getString());

    for (int i = 0; i < MAX_ALARMS; i++) alarms[i].active = false;

    for (int i = 0; i < doc.size() && i < MAX_ALARMS; i++) {
      alarms[i].id = doc[i]["id"].as<String>();
      String t = doc[i]["trigger_at"].as<String>();
      alarms[i].triggerAt = t.substring(0, 19);
      alarms[i].action = doc[i]["action"].as<bool>();

      String aDevId = doc[i]["device_id"].as<String>();
      alarms[i].deviceIndex = -1;
      for (int d = 0; d < NUM_DEVICES; d++) {
        if (deviceUUIDs[d] == aDevId) {
          alarms[i].deviceIndex = d;
          break;
        }
      }
      alarms[i].active = (alarms[i].deviceIndex != -1);
    }
  }
  http.end();
}

void markAlarmFiredInDB(String alarmId) {
  if (!isCloudConfigured() || alarmId.length() == 0) return;
  HTTPClient http;
  http.begin(String(SUPABASE_BASE) + "/alarms?id=eq." + alarmId);
  configureHttp(http);
  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));
  http.addHeader("Content-Type", "application/json");
  http.PATCH("{\"fired\":true}");
  http.end();
  Serial.println("Alarm marked as fired in Supabase.");
}

void sendHeartbeat() {
  if (!isCloudConfigured() || boardUUID == "") return;

  String nowIso = getIsoTime();

  HTTPClient http;
  http.begin(String(SUPABASE_BASE) + "/boards?id=eq." + boardUUID);
  configureHttp(http);
  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));
  http.addHeader("Content-Type", "application/json");

  String payload = "{\"last_seen\":\"" + nowIso + "\"}";
  int httpCode = http.PATCH(payload);

  if (httpCode == 200 || httpCode == 204) {
    Serial.println("Heartbeat synced to Cloud.");
  }
  http.end();
}

// Run all potentially slow cloud traffic away from the local WebServer loop.
// Supabase DNS/TLS/API stalls can therefore never hold up phone-to-ESP32
// status reads or relay commands.
void cloudSyncTask(void* parameter) {
  (void)parameter;
  unsigned long lastNtpAttempt = 0;
  unsigned long lastResolveAttempt = 0;
  unsigned long lastCloudAlarmPoll = 0;
  unsigned long lastCloudHeartbeat = 0;
  unsigned long nextQueueAttempt = 0;
  unsigned long queueRetryDelay = 2000;

  for (;;) {
    if (!isHomeWifiConnected() || !isCloudConfigured()) {
      vTaskDelay(pdMS_TO_TICKS(1000));
      continue;
    }

    time_t currentNtpTime = time(nullptr);
    if (currentNtpTime < 100000 && millis() - lastNtpAttempt >= 30000) {
      Serial.println("-> Cloud worker syncing time with NTP...");
      configTime(0, 0, "pool.ntp.org");
      lastNtpAttempt = millis();
    }

    if (boardUUID == "" && millis() - lastResolveAttempt >= 10000) {
      lastResolveAttempt = millis();
      Serial.println("-> Cloud worker linking board/devices...");
      if (resolveBoardAndDevices()) {
        Serial.println("-> Board & devices linked; reconciling relay state before cloud polling.");
      }
    }

    // Keep cloud-to-relay polling disabled until the persisted physical state
    // has been written successfully. A failed sync must never apply stale
    // database values to the hardware.
    if (boardUUID != "" && !cloudDevicesReady) {
      if (syncAllStatesToDB()) {
        Serial.println("-> Cloud state reconciled; 10-second cloud polling enabled.");
        cloudDevicesReady = true;
      } else {
        Serial.println("-> Initial relay-state sync failed; cloud polling paused to prevent stale-state switching.");
        vTaskDelay(pdMS_TO_TICKS(3000));
        continue;
      }
    }

    if (boardUUID != "") {
      if ((long)(millis() - nextQueueAttempt) >= 0) {
        bool queueOk = flushOfflineQueue(); // one update per pass
        if (queueOk) {
          queueRetryDelay = 2000;
        } else {
          queueRetryDelay = min(queueRetryDelay * 2, (unsigned long)60000);
        }
        nextQueueAttempt = millis() + queueRetryDelay;
      }

      currentNtpTime = time(nullptr);
      if (currentNtpTime >= 100000) {
        if (millis() - lastCloudAlarmPoll >= ALARM_POLL_INTERVAL) {
          lastCloudAlarmPoll = millis();
          pollAlarms();
        }

        if (millis() - lastCloudHeartbeat >= HEARTBEAT_INTERVAL) {
          lastCloudHeartbeat = millis();
          sendHeartbeat();
        }

        String nowIso = getIsoTime();
        for (int i = 0; i < MAX_ALARMS; i++) {
          if (!alarms[i].active || nowIso < alarms[i].triggerAt) continue;

          Serial.println("ALARM FIRED! ID: " + alarms[i].id);
          alarms[i].active = false;
          int targetDev = alarms[i].deviceIndex;
          if (targetDev >= 0 && targetDev < NUM_DEVICES) {
            enqueueOfflineUpdate(targetDev, alarms[i].action, false);
            setRelay(targetDev, alarms[i].action);
          }
          markAlarmFiredInDB(alarms[i].id);
        }
      }
    }

    vTaskDelay(pdMS_TO_TICKS(250));
  }
}

// Poll Supabase independently from queue writes, alarms, and heartbeats.
// Cloud-originated relay changes may take up to POLL_INTERVAL to reach the board;
// local web/LAN commands are immediate and don't depend on this polling loop.
void cloudPollTask(void* parameter) {
  (void)parameter;
  TickType_t nextPoll = xTaskGetTickCount();

  for (;;) {
    if (!isHomeWifiConnected() || !cloudDevicesReady || !isCloudConfigured()) {
      nextPoll = xTaskGetTickCount();
      vTaskDelay(pdMS_TO_TICKS(500));
      continue;
    }

    pollDatabase();
    vTaskDelayUntil(&nextPoll, pdMS_TO_TICKS(POLL_INTERVAL));
  }
}
