#include <WiFi.h>
#include <WiFiMulti.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <Preferences.h>
#include <time.h>

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
const char* ssid     = "";
const char* password = "";

const char* BOARD_IDENTIFIER = "test_1_board";
const char* SUPABASE_BASE = "YOu_url_here";
const char* SUPABASE_SERVICE_KEY = "you_key_here";

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
const unsigned long SERIAL_DUMP_INTERVAL = 10000;

WiFiMulti wifiMulti;
WebServer server(80);
Preferences preferences;

// HTTP Cloud Polling (unchanged behaviour when internet available)
unsigned long lastPollTime = 0;
const unsigned long POLL_INTERVAL = 1000;

// Heartbeat
unsigned long lastHeartbeatTime = 0;
const unsigned long HEARTBEAT_INTERVAL = 20000;

// Edge Cloud Alarms
struct Alarm { String id; String triggerAt; bool action; bool active; int deviceIndex; };
#define MAX_ALARMS 20
Alarm alarms[MAX_ALARMS];
unsigned long lastAlarmPoll = 0;
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
  bool feedbackOn;
};
#define MAX_MESH_DEVICE_CACHE (MAX_MESH_NODES * NUM_DEVICES)
MeshDeviceCache meshDeviceCache[MAX_MESH_DEVICE_CACHE];
int meshCacheCount = 0;

// Timers - deliberately SLOW. No aggressive polling anywhere.
unsigned long lastWifiRetry     = 0;  const unsigned long WIFI_RETRY_INTERVAL      = 3000;   // Station reconnect attempts (was: every loop!)
unsigned long lastRoleEval      = 0;  const unsigned long ROLE_EVAL_INTERVAL       = 5000;   // Role decision cadence
unsigned long lastMemberJoin    = 0;  const unsigned long MESH_JOIN_INTERVAL       = 25000;  // Member -> leader announce
unsigned long lastHomeWifiProbe = 0;  const unsigned long HOME_WIFI_PROBE_INTERVAL = 60000;  // Member checks if home Wi-Fi returned
unsigned long leaderUptimeMillis = 0;

// Function Prototypes
void setRelay(int index, bool on, bool saveToNVS = true);
void updateDeviceInDB(int index, bool state);
void updateFeedbackInDB(int index, bool feedback);
void markAlarmFiredInDB(String alarmId);
void pollDatabase();
void pollAlarms();
void sendHeartbeat();
bool resolveBoardAndDevices();
void setupWebServer();
void handleDeviceToggle(int rIndex);
void enqueueOfflineUpdate(int index, bool state, bool isFeedback);
void flushOfflineQueue();
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
void upsertMeshDeviceCache(const String& nodeId, int relayIndex, bool isOn, bool feedbackOn);
void pruneStaleMeshNodes();
void buildDevicesPayload(JsonArray& arr, bool includeMesh);
void handleToggleAllMesh(bool on);
void syncAllStatesToDB();

// ============================================================
//  SMALL HELPERS
// ============================================================
bool isHomeWifiConnected() {
  return WiFi.status() == WL_CONNECTED && WiFi.SSID() == String(ssid);
}

String getSelfIp() {
  if (localRole == ROLE_LEADER) return WiFi.softAPIP().toString();
  if (WiFi.status() == WL_CONNECTED) return WiFi.localIP().toString();
  return WiFi.softAPIP().toString();
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
    preferences.putBool(key, on);
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
              <span class="feedback-pill ${d.feedback_on ? 'active' : ''}">
                ${d.feedback_on ? 'AC ON' : 'AC OFF'}
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
  deserializeJson(req, server.arg("plain"));
  bool targetState = req["state"].as<bool>();

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

  if (isHomeWifiConnected() && boardUUID != "") {
    updateDeviceInDB(rIndex, targetState);
  } else {
    enqueueOfflineUpdate(rIndex, targetState, false);
  }

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
    upsertMeshDeviceCache(nodeId, rIndex, targetState, false);
    return true;
  }
  return false;
}

// Fan-out "all on/off" across own relays + every reachable member
void handleToggleAllMesh(bool on) {
  handleCORS();
  for (int i = 0; i < NUM_DEVICES; i++) {
    setRelay(i, on);
    if (isHomeWifiConnected() && boardUUID != "") {
      updateDeviceInDB(i, on);
    } else {
      enqueueOfflineUpdate(i, on, false);
    }
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
          upsertMeshDeviceCache(meshNodes[i].nodeId, d, on, false);
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

    String res;
    serializeJson(doc, res);
    server.send(200, "application/json", res);
  });

  // REST API: GET All Device States (aggregated across the mesh when leader)
  server.on("/api/devices", HTTP_GET, []() {
    handleCORS();
    DynamicJsonDocument doc(2048);
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
      handleCORS();
      String nodeId = server.pathArg(0);
      int rIndex = server.pathArg(1).toInt();

      if (nodeId == String(BOARD_IDENTIFIER)) {
        handleDeviceToggle(rIndex);
        return;
      }

      DynamicJsonDocument req(256);
      if (server.hasArg("plain")) deserializeJson(req, server.arg("plain"));
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
      upsertMeshDeviceCache(nodeId, d["relay_index"] | 0, d["is_on"] | false, d["feedback_on"] | false);
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
      upsertMeshDeviceCache(nodeId, req["relay_index"] | 0, req["is_on"] | false, req["feedback_on"] | false);
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
      dev["feedback_on"] = meshDeviceCache[c].feedbackOn;
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

void upsertMeshDeviceCache(const String& nodeId, int relayIndex, bool isOn, bool feedbackOn) {
  if (relayIndex < 0 || relayIndex >= NUM_DEVICES) return;
  for (int i = 0; i < meshCacheCount; i++) {
    if (meshDeviceCache[i].nodeId == nodeId && meshDeviceCache[i].relayIndex == relayIndex) {
      meshDeviceCache[i].isOn = isOn;
      meshDeviceCache[i].feedbackOn = feedbackOn;
      return;
    }
  }
  if (meshCacheCount >= MAX_MESH_DEVICE_CACHE) return;
  meshDeviceCache[meshCacheCount].nodeId = nodeId;
  meshDeviceCache[meshCacheCount].relayIndex = relayIndex;
  meshDeviceCache[meshCacheCount].isOn = isOn;
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
  // for the home Wi-Fi to come back.
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAPConfig(AP_IP, AP_GATEWAY, AP_SUBNET);
  WiFi.softAP(MESH_SSID, (strlen(MESH_PASS) >= 8) ? MESH_PASS : NULL);
  Serial.print("-> SoftAP active. IP: ");
  Serial.println(WiFi.softAPIP());
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

  // Home Wi-Fi available -> cloud plane handles everything.
  // Stand down from mesh duty to save power (less RF activity = less heat).
  if (isHomeWifiConnected()) {
    if (localRole != ROLE_IDLE) {
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
      WiFi.begin(ssid, password);
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
  if (queueCount < MAX_PENDING) {
    offlineQueue[queueCount].deviceIndex = index;
    offlineQueue[queueCount].state = state;
    offlineQueue[queueCount].isFeedback = isFeedback;
    offlineQueue[queueCount].pending = true;
    queueCount++;
    Serial.printf("Enqueued offline action: Dev [%d] State: %d (Queue: %d)\n", index, state, queueCount);
  }
}

void flushOfflineQueue() {
  if (queueCount == 0 || !isHomeWifiConnected() || boardUUID == "") return;

  Serial.printf("Flushing %d offline updates to Supabase Cloud...\n", queueCount);
  for (int i = 0; i < queueCount; i++) {
    if (offlineQueue[i].pending) {
      if (offlineQueue[i].isFeedback) {
        updateFeedbackInDB(offlineQueue[i].deviceIndex, offlineQueue[i].state);
      } else {
        updateDeviceInDB(offlineQueue[i].deviceIndex, offlineQueue[i].state);
      }
      offlineQueue[i].pending = false;
    }
  }
  queueCount = 0;
  Serial.println("Offline queue completely flushed.");
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

  preferences.begin("smart_home", false);

  // Initialize GPIOs & restore saved relay states
  for (int i = 0; i < NUM_DEVICES; i++) {
    pinMode(RELAY_PINS[i], OUTPUT);
    char key[8];
    sprintf(key, "r_%d", i);
    bool savedState = preferences.getBool(key, false);
    setRelay(i, savedState, false);

    pinMode(INPUT_PINS[i], INPUT_PULLUP);
    confirmedInputState[i] = digitalRead(INPUT_PINS[i]);
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

  wifiMulti.addAP(ssid, password);
  Serial.print("-> Connecting to Home Wi-Fi: ");
  Serial.println(ssid);

  // Initial blocking attempt so the cloud plane links immediately after
  // power-on. If the router itself is still booting (whole-house power
  // restore), the throttled retry in loop() connects as soon as it is up.
  unsigned long wifiStart = millis();
  while (wifiMulti.run() != WL_CONNECTED && millis() - wifiStart < 8000) {
    delay(250);
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("-> Home Wi-Fi connected. IP: ");
    Serial.println(WiFi.localIP());
    WiFi.setTxPower(WIFI_POWER_15dBm);
  } else {
    Serial.println("-> Home Wi-Fi not up yet (router may still be booting). Will keep retrying quietly.");
    WiFi.setTxPower(WIFI_POWER_15dBm);
  }

  // mDNS responder (http://home-automation.local)
  if (MDNS.begin("home-automation")) {
    Serial.println("-> mDNS responder started: http://home-automation.local");
  }

  // Embedded REST server
  setupWebServer();

  Serial.println("===========================================\n");
}

// ============================================================
//  MAIN LOOP
// ============================================================
void loop() {
  // Handle local HTTP requests immediately (sub-100ms response)
  server.handleClient();

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

        if (isHomeWifiConnected() && boardUUID != "") {
          updateFeedbackInDB(i, isSwitchOn);
        } else {
          enqueueOfflineUpdate(i, isSwitchOn, true);
        }
      }
    }
    lastInputRead[i] = currentRead;
  }

  // 2. Role / connectivity management (throttled internally)
  evaluateLocalRole();

  // 3. Station reconnect attempts - THROTTLED.
  // The old code called wifiMulti.run() every single loop iteration which
  // caused constant reconnect storms when offline: high CPU, high RF
  // activity, heat, and interference with our own SoftAP (slow local page).
  if (!isHomeWifiConnected() && millis() - lastWifiRetry >= WIFI_RETRY_INTERVAL) {
    lastWifiRetry = millis();
    wifiMulti.run();
  }

  // 4. Live Serial Monitor (slowed down - serial prints cost CPU time)
  if (millis() - lastSerialDumpTime >= SERIAL_DUMP_INTERVAL) {
    lastSerialDumpTime = millis();
    Serial.printf("\n--- NODE MONITOR | Role: %s | Home WiFi: %s ---\n",
      (localRole == ROLE_LEADER) ? "LEADER" : ((localRole == ROLE_MEMBER) ? "MEMBER" : "IDLE"),
      isHomeWifiConnected() ? "CONNECTED" : "OFFLINE"
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

  // ---- Everything below requires the cloud plane (home Wi-Fi + NTP) ----
  if (!isHomeWifiConnected()) return;

  static unsigned long lastNtpAttempt = 0;
  time_t currentNtpTime = time(nullptr);
  if (currentNtpTime < 100000) {
    if (millis() - lastNtpAttempt > 30000) { // was 5s - way too aggressive
      Serial.println("-> Syncing Time with NTP...");
      configTime(0, 0, "pool.ntp.org");
      lastNtpAttempt = millis();
    }
    return;
  }

  if (boardUUID == "") {
    static unsigned long lastResolveAttempt = 0;
    if (millis() - lastResolveAttempt > 5000) {
      Serial.println("-> Linking Board to Supabase Database...");
      if (resolveBoardAndDevices()) {
        Serial.println("Board & Devices verified.");
        // FIX (offline-state preservation): the DEVICE is the source of
        // truth right after reconnecting. Push current relay + feedback
        // states to the cloud FIRST, so anything the user toggled while
        // offline stays exactly as it is (the old code called
        // fetchInitialState() here, which reverted relays to stale cloud
        // state and disrupted offline-toggled devices).
        syncAllStatesToDB();
        sendHeartbeat();
        pollAlarms();
        // Queue carries every toggle made while offline -> cloud catches up.
        flushOfflineQueue();
      } else {
        Serial.println("FAILED to link Board/Devices. Retrying...");
      }
      lastResolveAttempt = millis();
    }
    return;
  }

  // 5. Cloud Polling, Alarms & Heartbeat (unchanged cloud behaviour)
  if (millis() - lastPollTime >= POLL_INTERVAL) {
    lastPollTime = millis();
    pollDatabase();
  }

  if (millis() - lastAlarmPoll >= ALARM_POLL_INTERVAL) {
    lastAlarmPoll = millis();
    pollAlarms();
  }

  if (millis() - lastHeartbeatTime >= HEARTBEAT_INTERVAL) {
    lastHeartbeatTime = millis();
    sendHeartbeat();
  }

  flushOfflineQueue();

  // Edge Alarms
  String nowIso = getIsoTime();
  for (int i = 0; i < MAX_ALARMS; i++) {
    if (alarms[i].active && nowIso >= alarms[i].triggerAt) {
      Serial.println("ALARM FIRED! ID: " + alarms[i].id);
      alarms[i].active = false;
      int targetDev = alarms[i].deviceIndex;

      if (targetDev >= 0 && targetDev < NUM_DEVICES) {
        setRelay(targetDev, alarms[i].action);
        updateDeviceInDB(targetDev, alarms[i].action);
      }
      markAlarmFiredInDB(alarms[i].id);
    }
  }
}

// ============================================================
//  SUPABASE CLOUD HTTP FUNCTIONS (unchanged cloud logic)
// ============================================================
void pollDatabase() {
  if (boardUUID == "") return;

  HTTPClient http;
  http.begin(String(SUPABASE_BASE) + "/devices?board_id=eq." + boardUUID + "&select=relay_index,is_on");
  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));

  if (http.GET() == 200) {
    DynamicJsonDocument doc(1024);
    deserializeJson(doc, http.getString());

    for (int i = 0; i < doc.size(); i++) {
      int rIndex = doc[i]["relay_index"];
      bool dbState = doc[i]["is_on"];

      if (rIndex >= 0 && rIndex < NUM_DEVICES) {
        if (dbState != isRelayOn[rIndex]) {
          Serial.printf("Cloud Toggle Dev [%d] -> %s\n", rIndex, dbState ? "ON" : "OFF");
          setRelay(rIndex, dbState);
        }
      }
    }
  }
  http.end();
}

void updateDeviceInDB(int index, bool state) {
  if (deviceUUIDs[index] == "") return;

  HTTPClient http;
  http.begin(String(SUPABASE_BASE) + "/devices?id=eq." + deviceUUIDs[index]);
  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));
  http.addHeader("Content-Type", "application/json");
  http.PATCH("{\"is_on\":" + String(state ? "true" : "false") + "}");
  http.end();
}

void updateFeedbackInDB(int index, bool feedback) {
  if (deviceUUIDs[index] == "") return;

  HTTPClient http;
  http.begin(String(SUPABASE_BASE) + "/devices?id=eq." + deviceUUIDs[index]);
  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));
  http.addHeader("Content-Type", "application/json");
  http.PATCH("{\"feedback_on\":" + String(feedback ? "true" : "false") + "}");
  http.end();
}

bool resolveBoardAndDevices() {
  HTTPClient http;

  // 1. Find Board UUID
  http.begin(String(SUPABASE_BASE) + "/boards?board_identifier=eq." + BOARD_IDENTIFIER + "&select=id");
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

  return foundAny;
}

// Push the CURRENT relay & feedback states to the cloud.
// Called right after (re)connecting, so the database is updated to match
// the physical device state - offline toggles are preserved and the cloud
// simply catches up with what the user actually did. This is the opposite
// of the old fetchInitialState(), which reverted the relays to stale
// cloud state and disrupted offline-toggled devices.
void syncAllStatesToDB() {
  if (boardUUID == "") return;
  for (int i = 0; i < NUM_DEVICES; i++) {
    if (deviceUUIDs[i] == "") continue;

    HTTPClient http;
    http.begin(String(SUPABASE_BASE) + "/devices?id=eq." + deviceUUIDs[i]);
    http.addHeader("apikey", SUPABASE_SERVICE_KEY);
    http.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));
    http.addHeader("Content-Type", "application/json");

    String body = "{\"is_on\":" + String(isRelayOn[i] ? "true" : "false") +
                  ",\"feedback_on\":" + String((confirmedInputState[i] == LOW) ? "true" : "false") +
                  ",\"last_changed\":\"" + getIsoTime() + "\"}";
    http.PATCH(body);
    http.end();
  }
  Serial.println("-> Current device states synced to cloud (offline states preserved).");
}

void pollAlarms() {
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
  HTTPClient http;
  http.begin(String(SUPABASE_BASE) + "/alarms?id=eq." + alarmId);
  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));
  http.addHeader("Content-Type", "application/json");
  http.PATCH("{\"fired\":true}");
  http.end();
  Serial.println("Alarm marked as fired in Supabase.");
}

void sendHeartbeat() {
  if (boardUUID == "") return;

  String nowIso = getIsoTime();

  HTTPClient http;
  http.begin(String(SUPABASE_BASE) + "/boards?id=eq." + boardUUID);
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
