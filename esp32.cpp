#include <WiFi.h>
#include <WiFiMulti.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <WebServer.h>
#include <Preferences.h>
#include <time.h>
#include <esp_system.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <freertos/semphr.h>
#define NUM_DEVICES 4
const int RELAY_PINS[NUM_DEVICES] = {32, 33, 25, 26};
const int INPUT_PINS[NUM_DEVICES] = {19, 18, 5, 17};
String homeWifiSSID = "";
String homeWifiPassword = "";
String homeWifiSecurity = "wpa2_psk";
volatile bool wifiConfigPending = false;
const char* BOARD_IDENTIFIER = "esp32-unconfigured";
const char* SUPABASE_BASE = "";
const char* SUPABASE_SERVICE_KEY = "";
// The per-board token is injected by the one-time provisioning download.
// It authenticates only this device to the VikaTech device-management API;
// it is NOT a Supabase service-role key.
const char* DEVICE_API_BASE = "https://home-automation-mauve-one.vercel.app";
const char* DEVICE_AUTH_TOKEN = "";
String deviceAuthToken = "";
String deviceBootId = "";
String lastDeviceError = "";
uint32_t deviceConfigVersion = 1;
const char* MESH_SSID = "HOME-AUTO-LEADER";
const char* MESH_PASS = "CHANGE_ME_123"; // Replace locally before flashing; min 8 chars for WPA2
IPAddress AP_IP(192, 168, 4, 1);
IPAddress AP_GATEWAY(192, 168, 4, 1);
IPAddress AP_SUBNET(255, 255, 255, 0);
String boardUUID = "";
String boardUserUUID = "";
String deviceUUIDs[NUM_DEVICES] = {"", "", "", ""};
String deviceNames[NUM_DEVICES] = {"Device 1", "Device 2", "Device 3", "Device 4"};
bool isRelayOn[NUM_DEVICES] = {false, false, false, false};
bool lastInputRead[NUM_DEVICES] = {HIGH, HIGH, HIGH, HIGH};
bool confirmedInputState[NUM_DEVICES] = {HIGH, HIGH, HIGH, HIGH};
unsigned long lastDebounceTime[NUM_DEVICES] = {0, 0, 0, 0};
const unsigned long DEBOUNCE_DELAY = 50;
unsigned long lastSerialDumpTime = 0;
const unsigned long SERIAL_DUMP_INTERVAL = 60000;
WiFiMulti wifiMulti;
WebServer server(80);
Preferences preferences;
SemaphoreHandle_t preferencesMutex = nullptr;
SemaphoreHandle_t offlineQueueMutex = nullptr;
SemaphoreHandle_t relayMutex = nullptr;
TaskHandle_t cloudSyncTaskHandle = nullptr;
TaskHandle_t cloudPollTaskHandle = nullptr;
volatile bool cloudDevicesReady = false;
// Cloud polling is a fallback for commands issued while the browser is not
// connected to the local controller. Local REST commands remain immediate;
// keeping this at one second creates tens of thousands of Supabase requests.
const unsigned long POLL_INTERVAL = 30000;
const unsigned long HEARTBEAT_INTERVAL = 60000;
struct Alarm { String id; String triggerAt; bool action; bool active; int deviceIndex; };
#define MAX_ALARMS 20
Alarm alarms[MAX_ALARMS];
const unsigned long ALARM_POLL_INTERVAL = 60000;
struct Schedule { String id, deviceId, time, days, lastRunDate; bool action, enabled; int deviceIndex; };
#define MAX_SCHEDULES 32
Schedule schedules[MAX_SCHEDULES];
int scheduleCount = 0;
const unsigned long SCHEDULE_POLL_INTERVAL = 60000;
unsigned long lastSchedulePoll = 0;
bool scheduleCacheLoaded = false;
struct PendingUpdate {
  int deviceIndex;
  bool state;
  bool isFeedback;
  bool pending;
  String queuedAt;
  unsigned long queuedAtMillis;
};
#define MAX_PENDING 16
PendingUpdate offlineQueue[MAX_PENDING];
int queueCount = 0;
const unsigned long QUEUED_COMMAND_GRACE_MS = 30000;
const unsigned long RELAY_STARTUP_STAGGER_MS = 150;
enum NodeRole { ROLE_IDLE, ROLE_LEADER, ROLE_MEMBER };
NodeRole localRole = ROLE_IDLE;
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
unsigned long lastWifiRetry     = 0;  const unsigned long WIFI_RETRY_INTERVAL      = 3000;   // Station reconnect attempts (was: every loop!)
unsigned long lastLeaderWifiTry = 0;  const unsigned long LEADER_WIFI_RETRY_INTERVAL = 30000; // Leader home-Wi-Fi probes (non-blocking begin)
unsigned long lastRoleEval      = 0;  const unsigned long ROLE_EVAL_INTERVAL       = 5000;   // Role decision cadence
unsigned long lastMemberJoin    = 0;  const unsigned long MESH_JOIN_INTERVAL       = 25000;  // Member -> leader announce
unsigned long lastHomeWifiProbe = 0;  const unsigned long HOME_WIFI_PROBE_INTERVAL = 60000;  // Member checks if home Wi-Fi returned
unsigned long leaderUptimeMillis = 0;
void setRelay(int index, bool on, bool saveToNVS = true);
bool updateDeviceInDB(int index, bool state);
bool updateFeedbackInDB(int index, bool feedback);
bool markAlarmFiredInDB(String alarmId);
bool logActivityInDB(int index, bool state, const String& triggeredBy);
void pollDatabase();
void pollAlarms();
void pollSchedules();
void loadScheduleCache();
void saveScheduleCache();
void runLocalSchedules();
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
bool sendDeviceHeartbeat();
bool pollRemoteCommands();
bool postDeviceCommandResult(const String& commandId, const String& status, const String& message);
bool pollRemoteConfiguration(bool forceFetch = false, const String& commandId = "");
bool applyRemoteWifiConfiguration(const String& ssid, const String& security, const String& password, uint32_t configVersion, const String& commandId = "");
void logResetReason();
bool cloudStateSupersedesQueue(const PendingUpdate& queued, const String& cloudChangedAt);
bool getPendingRelayUpdate(int index, PendingUpdate& result);
bool discardPendingRelayUpdate(const PendingUpdate& expected);
bool isHomeWifiConnected() {
  return homeWifiSSID.length() > 0 && WiFi.status() == WL_CONNECTED &&
         WiFi.SSID() == homeWifiSSID;
}
bool isCloudConfigured() {
  return strlen(SUPABASE_BASE) > 0 && strlen(SUPABASE_SERVICE_KEY) > 0;
}
void logResetReason() {
  const esp_reset_reason_t reason = esp_reset_reason();
  Serial.printf("-> ESP32 reset reason code: %d\n", (int)reason);
  if (reason == ESP_RST_BROWNOUT) {
    Serial.println("!! Brownout reset detected. Check the external 5V supply, relay current, wiring, and decoupling.");
  }
}
void loadHomeWifiCredentials() {
  if (preferencesMutex) xSemaphoreTake(preferencesMutex, portMAX_DELAY);
  homeWifiSSID = preferences.getString("wifi_ssid", "");
  homeWifiPassword = preferences.getString("wifi_pass", "");
  homeWifiSecurity = preferences.getString("wifi_sec", "");
  if (homeWifiSecurity != "open" && homeWifiSecurity != "wpa2_psk") {
    homeWifiSecurity = homeWifiPassword.length() ? "wpa2_psk" : "open";
  }
  deviceConfigVersion = max((uint32_t)1, preferences.getUInt("cfg_ver", 1));
  deviceAuthToken = preferences.getString("device_token", "");
  if (deviceAuthToken.length() == 0 && strlen(DEVICE_AUTH_TOKEN) > 0) {
    deviceAuthToken = String(DEVICE_AUTH_TOKEN);
    preferences.putString("device_token", deviceAuthToken);
  }
  uint32_t bootCount = preferences.getUInt("boot_count", 0) + 1;
  preferences.putUInt("boot_count", bootCount);
  deviceBootId = String(BOARD_IDENTIFIER) + "-" + String(bootCount);
  if (preferencesMutex) xSemaphoreGive(preferencesMutex);
  Serial.printf("-> Home Wi-Fi credentials: %s\n",
                homeWifiSSID.length() ? "saved" : "not configured");
  Serial.printf("-> Device management API: %s\n",
                deviceAuthToken.length() ? "configured" : "not provisioned (remote management disabled)");
  Serial.printf("-> Supabase cloud sync: %s\n",
                isCloudConfigured() ? "configured" : "disabled (legacy cloud key not configured)");
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
unsigned long nodeIdHashDelay() {
  unsigned long h = 2166136261u;
  const char* p = BOARD_IDENTIFIER;
  while (*p) { h ^= (unsigned char)(*p++); h *= 16777619u; }
  return 1000 + (h % 3000); // 1s - 4s
}
void setRelay(int index, bool on, bool saveToNVS) {
  if (index < 0 || index >= NUM_DEVICES) return;
  if (relayMutex) xSemaphoreTake(relayMutex, portMAX_DELAY);
  const bool stateChanged = isRelayOn[index] != on;
  isRelayOn[index] = on;
  digitalWrite(RELAY_PINS[index], on ? LOW : HIGH); // Active-LOW relays
  if (saveToNVS && stateChanged) {
    char key[8];
    sprintf(key, "r_%d", index);
    if (preferencesMutex) xSemaphoreTake(preferencesMutex, portMAX_DELAY);
    preferences.putBool(key, on);
    if (preferencesMutex) xSemaphoreGive(preferencesMutex);
  }
  Serial.printf(">> RELAY [%d] -> %s\n", index, on ? "ON" : "OFF");
  if (relayMutex) xSemaphoreGive(relayMutex);
}
String getIsoTime() {
  time_t now; time(&now); struct tm timeinfo; gmtime_r(&now, &timeinfo);
  char buf[32];
  sprintf(buf, "%04d-%02d-%02dT%02d:%02d:%02d",
          timeinfo.tm_year + 1900, timeinfo.tm_mon + 1, timeinfo.tm_mday,
          timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec);
  return String(buf);
}
void handleCORS() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, apikey");
  server.sendHeader("Access-Control-Allow-Private-Network", "true");
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
  DynamicJsonDocument res(256);
  res["success"] = true;
  res["relay_index"] = rIndex;
  res["state"] = targetState;
  String out;
  serializeJson(res, out);
  server.send(200, "application/json", out);
}
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
  server.onNotFound([]() {
    if (server.method() == HTTP_OPTIONS) {
      handleCORS();
      server.send(204);
    } else {
      server.send(404, "text/plain", "Not Found");
    }
  });
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
    doc["wifiSecurity"] = homeWifiSecurity;
    doc["deviceManagementConfigured"] = deviceAuthToken.length() > 0;
    doc["configVersion"] = deviceConfigVersion;
    doc["cloudConfigured"] = isCloudConfigured();
    doc["mode"] = isHomeWifiConnected() ? "online_wifi" :
                  (localRole == ROLE_LEADER ? "local_ap" : "offline_retrying");
    doc["apStations"] = WiFi.softAPgetStationNum();
    doc["uptimeMs"] = millis();
    String res;
    serializeJson(doc, res);
    server.send(200, "application/json", res);
  });
  server.on("/api/devices", HTTP_GET, []() {
    handleCORS();
    DynamicJsonDocument doc(8192);
    JsonArray arr = doc.to<JsonArray>();
    buildDevicesPayload(arr, true);
    String res;
    serializeJson(arr, res);
    server.send(200, "application/json", res);
  });
  server.on("/api/device/0/state", HTTP_POST, []() { handleDeviceToggle(0); });
  server.on("/api/device/1/state", HTTP_POST, []() { handleDeviceToggle(1); });
  server.on("/api/device/2/state", HTTP_POST, []() { handleDeviceToggle(2); });
  server.on("/api/device/3/state", HTTP_POST, []() { handleDeviceToggle(3); });
  server.on(Uri("^\\/api\\/node\\/([\\w\\-]+)\\/device\\/([0-3])\\/state$"), HTTP_POST,
    []() {
      String nodeId = server.pathArg(0);
      int rIndex = server.pathArg(1).toInt();
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
  server.on("/api/all/on",  HTTP_POST, []() { handleToggleAllMesh(true); });
  server.on("/api/all/off", HTTP_POST, []() { handleToggleAllMesh(false); });
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
    DynamicJsonDocument res(256);
    res["success"] = true;
    res["leaderId"] = BOARD_IDENTIFIER;
    String out;
    serializeJson(res, out);
    server.send(200, "application/json", out);
  });
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
    String newSecurity = req["security"] | (newPassword.length() ? "wpa2_psk" : "open");
    newSSID.trim();
    if (newSSID.length() == 0 || newSSID.length() > 32 ||
        (newSecurity != "open" && newSecurity != "wpa2_psk") ||
        (newSecurity == "wpa2_psk" && (newPassword.length() < 8 || newPassword.length() > 63)) ||
        (newSecurity == "open" && newPassword.length() != 0)) {
      server.send(400, "application/json",
        "{\"success\":false,\"error\":\"SSID, security mode, or password is invalid\"}");
      return;
    }
    homeWifiSSID = newSSID;
    homeWifiPassword = newPassword;
    homeWifiSecurity = newSecurity;
    if (preferencesMutex) xSemaphoreTake(preferencesMutex, portMAX_DELAY);
    preferences.putString("wifi_ssid", homeWifiSSID);
    preferences.putString("wifi_pass", homeWifiPassword);
    preferences.putString("wifi_sec", homeWifiSecurity);
    if (preferencesMutex) xSemaphoreGive(preferencesMutex);
    wifiConfigPending = true;
    server.send(200, "application/json",
      "{\"success\":true,\"message\":\"Wi-Fi saved. Connecting in background; local control remains available.\"}");
  });
  server.begin();
  Serial.println("-> Local IP REST API enabled on Port 80 (no web dashboard).");
}
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
      if (meshDeviceCache[c].feedbackKnown) dev["feedback_on"] = meshDeviceCache[c].feedbackOn;
      else dev["feedback_on"] = nullptr;
      dev["node_id"] = meshDeviceCache[c].nodeId;
      dev["node_role"] = "member";
    }
  }
}
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
bool tryJoinMeshLeader() {
  Serial.println("-> Scanning for existing mesh leader...");
  int n = WiFi.scanNetworks();
  bool found = false;
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
  if (WiFi.SSID() == String(MESH_SSID)) WiFi.disconnect(false);
  WiFi.mode(WIFI_AP_STA);
  WiFi.setTxPower(WIFI_POWER_15dBm);
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
  WiFi.softAPdisconnect(true);
  meshNodeCount = 0;
  meshCacheCount = 0;
}
void evaluateLocalRole() {
  if (millis() - lastRoleEval < ROLE_EVAL_INTERVAL) return;
  lastRoleEval = millis();
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
    if (millis() - lastHomeWifiProbe >= HOME_WIFI_PROBE_INTERVAL) {
      lastHomeWifiProbe = millis();
      WiFi.disconnect(false);
      delay(100);
      WiFi.begin(homeWifiSSID.c_str(), homeWifiPassword.c_str());
      unsigned long start = millis();
      while (WiFi.status() != WL_CONNECTED && millis() - start < 4000) { delay(50); server.handleClient(); }
      if (WiFi.status() != WL_CONNECTED) {
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
    return;
  }
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
void enqueueOfflineUpdate(int index, bool state, bool isFeedback) {
  if (!isCloudConfigured()) return;
  if (offlineQueueMutex) xSemaphoreTake(offlineQueueMutex, portMAX_DELAY);
  for (int i = 0; i < queueCount; i++) {
    if (offlineQueue[i].pending && offlineQueue[i].deviceIndex == index &&
        offlineQueue[i].isFeedback == isFeedback) {
      offlineQueue[i].state = state;
      time_t now = time(nullptr);
      offlineQueue[i].queuedAt = now >= 100000 ? getIsoTime() : "";
      offlineQueue[i].queuedAtMillis = millis();
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
    time_t now = time(nullptr);
    offlineQueue[queueCount].queuedAt = now >= 100000 ? getIsoTime() : "";
    offlineQueue[queueCount].queuedAtMillis = millis();
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
  for (int i = 0; i < queueCount; i++) {
    char key[8];
    sprintf(key, "q%d_i", i); preferences.putChar(key, offlineQueue[i].deviceIndex);
    sprintf(key, "q%d_s", i); preferences.putBool(key, offlineQueue[i].state);
    sprintf(key, "q%d_f", i); preferences.putBool(key, offlineQueue[i].isFeedback);
    sprintf(key, "q%d_t", i); preferences.putString(key, offlineQueue[i].queuedAt);
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
    sprintf(key, "q%d_t", i); offlineQueue[i].queuedAt = preferences.getString(key, "");
    offlineQueue[i].queuedAtMillis = offlineQueue[i].queuedAt.length() ? millis() : 0;
    offlineQueue[i].pending = offlineQueue[i].deviceIndex >= 0 && offlineQueue[i].deviceIndex < NUM_DEVICES;
  }
  Serial.printf("Restored %d pending offline updates.\\n", queueCount);
}
bool cloudStateSupersedesQueue(const PendingUpdate& queued, const String& cloudChangedAt) {
  if (queued.queuedAt.length() >= 19 && cloudChangedAt.length() >= 19) {
    return cloudChangedAt.substring(0, 19) >= queued.queuedAt.substring(0, 19);
  }
  if (queued.queuedAt.length() == 0) {
    return queued.queuedAtMillis == 0 ||
           millis() - queued.queuedAtMillis >= QUEUED_COMMAND_GRACE_MS;
  }
  return false;
}
bool getPendingRelayUpdate(int index, PendingUpdate& result) {
  bool found = false;
  if (offlineQueueMutex) xSemaphoreTake(offlineQueueMutex, portMAX_DELAY);
  for (int i = 0; i < queueCount; i++) {
    if (offlineQueue[i].pending && offlineQueue[i].deviceIndex == index &&
        !offlineQueue[i].isFeedback) {
      result = offlineQueue[i];
      found = true;
      break;
    }
  }
  if (offlineQueueMutex) xSemaphoreGive(offlineQueueMutex);
  return found;
}
bool discardPendingRelayUpdate(const PendingUpdate& expected) {
  bool discarded = false;
  if (offlineQueueMutex) xSemaphoreTake(offlineQueueMutex, portMAX_DELAY);
  for (int i = 0; i < queueCount; i++) {
    if (offlineQueue[i].pending && offlineQueue[i].deviceIndex == expected.deviceIndex &&
        !offlineQueue[i].isFeedback && offlineQueue[i].state == expected.state &&
        offlineQueue[i].queuedAt == expected.queuedAt &&
        offlineQueue[i].queuedAtMillis == expected.queuedAtMillis) {
      for (int j = i; j < queueCount - 1; j++) offlineQueue[j] = offlineQueue[j + 1];
      queueCount--;
      offlineQueue[queueCount].pending = false;
      saveOfflineQueue();
      discarded = true;
      break;
    }
  }
  if (offlineQueueMutex) xSemaphoreGive(offlineQueueMutex);
  return discarded;
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
  if (!work.isFeedback) {
    HTTPClient stateHttp;
    stateHttp.begin(String(SUPABASE_BASE) + "/devices?id=eq." +
                    deviceUUIDs[work.deviceIndex] + "&select=is_on,last_changed");
    configureHttp(stateHttp, 2000, 2000);
    stateHttp.addHeader("apikey", SUPABASE_SERVICE_KEY);
    stateHttp.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));
    if (stateHttp.GET() == 200) {
      DynamicJsonDocument stateDoc(384);
      if (!deserializeJson(stateDoc, stateHttp.getString()) && stateDoc.size() > 0) {
        const bool cloudState = stateDoc[0]["is_on"] | false;
        const String cloudChangedAt = stateDoc[0]["last_changed"].as<String>();
        if (cloudState == work.state || cloudStateSupersedesQueue(work, cloudChangedAt)) {
          if (cloudState != isRelayOn[work.deviceIndex]) setRelay(work.deviceIndex, cloudState);
          if (discardPendingRelayUpdate(work)) {
            Serial.printf("Skipped obsolete queued state for device %d.\n", work.deviceIndex);
          }
          stateHttp.end();
          return true;
        }
      }
    }
    stateHttp.end();
  }
  bool delivered = work.isFeedback
    ? updateFeedbackInDB(work.deviceIndex, work.state)
    : updateDeviceInDB(work.deviceIndex, work.state);
  if (!delivered) {
    Serial.printf("Cloud update pending for device %d; will retry.\n", work.deviceIndex);
    return false;
  }
  if (offlineQueueMutex) xSemaphoreTake(offlineQueueMutex, portMAX_DELAY);
  for (int i = 0; i < queueCount; i++) {
    if (offlineQueue[i].pending && offlineQueue[i].deviceIndex == work.deviceIndex &&
        offlineQueue[i].isFeedback == work.isFeedback && offlineQueue[i].state == work.state &&
        offlineQueue[i].queuedAt == work.queuedAt &&
        offlineQueue[i].queuedAtMillis == work.queuedAtMillis) {
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
void setup() {
  Serial.begin(115200);
  delay(500);
  logResetReason();
  Serial.println("\n===========================================");
  Serial.println("  ESP32 Dual-Plane Mesh Node (4 Devices)");
  Serial.println("===========================================");
  setCpuFrequencyMhz(160);
  preferencesMutex = xSemaphoreCreateMutex();
  offlineQueueMutex = xSemaphoreCreateMutex();
  relayMutex = xSemaphoreCreateMutex();
  if (!preferencesMutex || !offlineQueueMutex || !relayMutex) {
    Serial.println("ERROR: Failed to create persistence/queue mutexes.");
  }
  preferences.begin("smart_home", false);
  loadHomeWifiCredentials();
  loadOfflineQueue();
  bool savedRelayStates[NUM_DEVICES];
  for (int i = 0; i < NUM_DEVICES; i++) {
    char key[8];
    sprintf(key, "r_%d", i);
    savedRelayStates[i] = preferences.getBool(key, false);
    digitalWrite(RELAY_PINS[i], HIGH);
    pinMode(RELAY_PINS[i], OUTPUT);
    setRelay(i, false, false);
    pinMode(INPUT_PINS[i], INPUT_PULLUP);
    confirmedInputState[i] = digitalRead(INPUT_PINS[i]);
    lastInputRead[i] = confirmedInputState[i];
  }
  for (int i = 0; i < NUM_DEVICES; i++) {
    if (!savedRelayStates[i]) continue;
    setRelay(i, true, false);
    delay(RELAY_STARTUP_STAGGER_MS);
  }
  Serial.println("-> Relay GPIOs & NVS States restored.");
  delay(500);
  WiFi.persistent(false);          // don't flash-write credentials each boot
  WiFi.setAutoReconnect(true);     // let the stack handle clean drops silently
  WiFi.mode(WIFI_STA);
  WiFi.setTxPower(WIFI_POWER_15dBm);
  if (homeWifiSSID.length() > 0) {
    wifiMulti.addAP(homeWifiSSID.c_str(), homeWifiPassword.c_str());
    Serial.print("-> Connecting to Home Wi-Fi: ");
    Serial.println(homeWifiSSID);
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
  setupWebServer();
  if (!isHomeWifiConnected()) {
    Serial.println("-> Home Wi-Fi unavailable at boot. Starting local mode...");
    lastRoleEval = millis() - ROLE_EVAL_INTERVAL;
    evaluateLocalRole();
  }
  BaseType_t taskCreated = pdFAIL;
  if (preferencesMutex && offlineQueueMutex && relayMutex) {
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
void applyPendingWifiConfiguration() {
  if (!wifiConfigPending) return;
  wifiConfigPending = false;
  if (!isHomeWifiConnected() && localRole != ROLE_LEADER) {
    becomeLeader();
    return;
  }
  if (homeWifiSSID.length() > 0) {
    WiFi.setAutoReconnect(localRole != ROLE_LEADER);
    WiFi.begin(homeWifiSSID.c_str(), homeWifiPassword.c_str());
    Serial.println("-> Home Wi-Fi connection started; local IP REST API remains enabled.");
  }
}
void loop() {
  server.handleClient();
  applyPendingWifiConfiguration();
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
  evaluateLocalRole();
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
  delay(1); // yield to Wi-Fi/FreeRTOS tasks without delaying local polling
}
void pollDatabase() {
  if (!isCloudConfigured() || boardUUID == "") return;
  HTTPClient http;
  http.begin(String(SUPABASE_BASE) + "/devices?board_id=eq." + boardUUID + "&select=id,relay_index,is_on,last_changed");
  configureHttp(http, 2000, 2000);
  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));
  if (http.GET() == 200) {
    DynamicJsonDocument doc(2048);
    deserializeJson(doc, http.getString());
    for (int i = 0; i < doc.size(); i++) {
      String rowDeviceId = doc[i]["id"].as<String>();
      int rIndex = doc[i]["relay_index"];
      bool dbState = doc[i]["is_on"];
      String cloudChangedAt = doc[i]["last_changed"].as<String>();
      if (rIndex >= 0 && rIndex < NUM_DEVICES &&
          deviceUUIDs[rIndex] != "" && rowDeviceId == deviceUUIDs[rIndex]) {
        PendingUpdate queued;
        bool updatePending = getPendingRelayUpdate(rIndex, queued);
        if (updatePending && dbState != queued.state &&
            cloudStateSupersedesQueue(queued, cloudChangedAt)) {
          if (discardPendingRelayUpdate(queued)) {
            Serial.printf("Discarded stale queued state for device %d; cloud state is newer.\n", rIndex);
          }
          updatePending = getPendingRelayUpdate(rIndex, queued);
        }
        bool relayState = isRelayOn[rIndex];
        if (!updatePending && dbState != relayState) {
          Serial.printf("Cloud Toggle Dev [%d] -> %s\n", rIndex, dbState ? "ON" : "OFF");
          setRelay(rIndex, dbState);
        }
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
  String body = "{\"is_on\":" + String(state ? "true" : "false");
  if (time(nullptr) >= 100000) body += ",\"last_changed\":\"" + getIsoTime() + "\"";
  body += "}";
  int code = http.PATCH(body);
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
  http.begin(String(SUPABASE_BASE) + "/boards?board_identifier=eq." + BOARD_IDENTIFIER + "&select=id,user_id");
  configureHttp(http);
  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));
  if (http.GET() == 200) {
    DynamicJsonDocument doc(512); deserializeJson(doc, http.getString());
    if (doc.size() > 0) {
      boardUUID = doc[0]["id"].as<String>();
      boardUserUUID = doc[0]["user_id"].as<String>();
      Serial.println("  -> Found Board UUID: " + boardUUID);
    }
  }
  http.end();
  bool foundAny = false;
  if (boardUUID != "") {
    http.begin(String(SUPABASE_BASE) + "/devices?board_id=eq." + boardUUID + "&select=id,relay_index,name");
    configureHttp(http);
    http.addHeader("apikey", SUPABASE_SERVICE_KEY);
    http.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));
    if (http.GET() == 200) {
      DynamicJsonDocument doc(2048); deserializeJson(doc, http.getString());
      for (int i = 0; i < doc.size(); i++) {
        int rIndex = doc[i]["relay_index"];
        if (rIndex >= 0 && rIndex < NUM_DEVICES) {
          deviceUUIDs[rIndex] = doc[i]["id"].as<String>();
          String resolvedName = doc[i]["name"].as<String>();
          deviceNames[rIndex] = resolvedName.length() ? resolvedName : "Device " + String(rIndex + 1);
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
bool syncAllStatesToDB() {
  if (!isCloudConfigured() || boardUUID == "") return false;
  HTTPClient http;
  http.begin(String(SUPABASE_BASE) + "/devices?board_id=eq." + boardUUID +
             "&select=id,relay_index,is_on,last_changed");
  configureHttp(http);
  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));
  int reconciledDevices = 0;
  bool allSynced = http.GET() == 200;
  DynamicJsonDocument doc(2048);
  if (allSynced && deserializeJson(doc, http.getString())) allSynced = false;
  http.end();
  if (!allSynced) {
    Serial.println("-> Initial relay-state read failed; cloud polling remains paused.");
    return false;
  }
  for (int i = 0; i < NUM_DEVICES; i++) {
    if (deviceUUIDs[i] == "") continue;
    bool rowFound = false;
    bool cloudState = false;
    String cloudChangedAt;
    for (JsonObject row : doc.as<JsonArray>()) {
      if (row["id"].as<String>() == deviceUUIDs[i]) {
        rowFound = true;
        cloudState = row["is_on"] | false;
        cloudChangedAt = row["last_changed"].as<String>();
        break;
      }
    }
    if (!rowFound) {
      allSynced = false;
      Serial.printf("-> Initial relay-state row missing for device %d.\n", i);
      continue;
    }
    PendingUpdate queued;
    bool updatePending = getPendingRelayUpdate(i, queued);
    if (updatePending && cloudState != queued.state &&
        cloudStateSupersedesQueue(queued, cloudChangedAt)) {
      if (discardPendingRelayUpdate(queued)) {
        Serial.printf("Discarded stale queued state for device %d during reconciliation.\n", i);
      }
      updatePending = getPendingRelayUpdate(i, queued);
    }
    const bool targetState = updatePending ? queued.state : cloudState;
    if (targetState != isRelayOn[i]) setRelay(i, targetState);
    reconciledDevices++;
  }
  if (reconciledDevices == 0 || !allSynced) {
    Serial.println("-> Initial relay-state reconciliation incomplete; cloud polling remains paused.");
    return false;
  }
  Serial.println("-> Relay states reconciled before cloud polling.");
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
void saveScheduleCache() {
  DynamicJsonDocument doc(8192);
  JsonArray arr = doc.to<JsonArray>();
  for (int i = 0; i < scheduleCount; ++i) {
    JsonObject o = arr.createNestedObject();
    o["id"] = schedules[i].id; o["device_id"] = schedules[i].deviceId;
    o["time"] = schedules[i].time; o["days"] = schedules[i].days;
    o["action"] = schedules[i].action; o["enabled"] = schedules[i].enabled;
    o["last_run"] = schedules[i].lastRunDate;
  }
  String payload; serializeJson(doc, payload);
  if (preferencesMutex) xSemaphoreTake(preferencesMutex, portMAX_DELAY);
  preferences.putString("sched_cache", payload);
  if (preferencesMutex) xSemaphoreGive(preferencesMutex);
}

void loadScheduleCache() {
  if (scheduleCacheLoaded) return;
  if (preferencesMutex) xSemaphoreTake(preferencesMutex, portMAX_DELAY);
  String payload = preferences.getString("sched_cache", "");
  if (preferencesMutex) xSemaphoreGive(preferencesMutex);
  DynamicJsonDocument doc(8192);
  if (!payload.isEmpty() && !deserializeJson(doc, payload) && doc.is<JsonArray>()) {
    for (JsonObject o : doc.as<JsonArray>()) {
      if (scheduleCount >= MAX_SCHEDULES) break;
      Schedule &s = schedules[scheduleCount++];
      s.id = o["id"] | ""; s.deviceId = o["device_id"] | "";
      s.time = o["time"] | "00:00:00"; s.days = "";
      if (o["days"].is<JsonArray>()) {
        for (JsonVariant d : o["days"].as<JsonArray>()) { if (s.days.length()) s.days += ","; s.days += d.as<String>(); }
      } else s.days = o["days"] | "";
      s.action = o["action"] | false; s.enabled = o["enabled"] | false;
      s.lastRunDate = o["last_run"] | ""; s.deviceIndex = -1;
      for (int d = 0; d < NUM_DEVICES; ++d) if (deviceUUIDs[d] == s.deviceId) s.deviceIndex = d;
    }
  }
  scheduleCacheLoaded = true;
  Serial.printf("Restored %d local schedules.\\n", scheduleCount);
}

void pollSchedules() {
  if (!isCloudConfigured() || boardUUID == "") return;
  String ids;
  for (int i = 0; i < NUM_DEVICES; ++i) if (deviceUUIDs[i].length()) {
    if (ids.length()) ids += ",";
    ids += "%22" + deviceUUIDs[i] + "%22";
  }
  if (!ids.length()) return;
  HTTPClient http;
  http.begin(String(SUPABASE_BASE) + "/schedules?device_id=in.(" + ids + ")&enabled=eq.true&select=id,device_id,action,time,days,enabled");
  configureHttp(http); http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));
  int code = http.GET(); String body = code == 200 ? http.getString() : ""; http.end();
  if (code != 200) { Serial.printf("Schedule refresh failed (HTTP %d); using saved schedules.\\n", code); return; }
  DynamicJsonDocument doc(8192);
  if (deserializeJson(doc, body) || !doc.is<JsonArray>()) { Serial.println("Invalid schedules response; keeping saved cache."); return; }
  Schedule updated[MAX_SCHEDULES]; int count = 0;
  for (JsonObject o : doc.as<JsonArray>()) {
    if (count >= MAX_SCHEDULES) break;
    Schedule &s = updated[count++];
    s.id = o["id"] | ""; s.deviceId = o["device_id"] | "";
    s.time = o["time"] | "00:00:00"; s.action = o["action"] | false;
    s.enabled = o["enabled"] | true; s.days = ""; s.lastRunDate = ""; s.deviceIndex = -1;
    if (o["days"].is<JsonArray>()) {
      for (JsonVariant d : o["days"].as<JsonArray>()) { if (s.days.length()) s.days += ","; s.days += d.as<String>(); }
    }
    for (int d = 0; d < NUM_DEVICES; ++d) if (deviceUUIDs[d] == s.deviceId) s.deviceIndex = d;
    for (int old = 0; old < scheduleCount; ++old) if (schedules[old].id == s.id) s.lastRunDate = schedules[old].lastRunDate;
  }
  scheduleCount = count;
  for (int i = 0; i < count; ++i) schedules[i] = updated[i];
  saveScheduleCache();
  Serial.printf("Synced %d schedules; cached for offline execution.\\n", scheduleCount);
}

void runLocalSchedules() {
  if (time(nullptr) < 100000) return; // never fire against an unset clock
  loadScheduleCache();
  time_t now = time(nullptr); struct tm t; localtime_r(&now, &t);
  char dateBuf[11], timeBuf[9];
  strftime(dateBuf, sizeof(dateBuf), "%Y-%m-%d", &t);
  strftime(timeBuf, sizeof(timeBuf), "%H:%M:%S", &t);
  String today = dateBuf, clockNow = timeBuf;
  String day = String(t.tm_wday);
  bool cacheChanged = false;
  for (int i = 0; i < scheduleCount; ++i) {
    Schedule &s = schedules[i];
    if (s.deviceIndex < 0) for (int d = 0; d < NUM_DEVICES; ++d) if (deviceUUIDs[d] == s.deviceId) s.deviceIndex = d;
    if (!s.enabled || s.deviceIndex < 0 || s.time.substring(0, 5) != clockNow.substring(0, 5) || s.lastRunDate == today) continue;
    bool dayMatch = false; int start = 0;
    while (start < s.days.length()) {
      int comma = s.days.indexOf(',', start); if (comma < 0) comma = s.days.length();
      if (s.days.substring(start, comma).toInt() == t.tm_wday) { dayMatch = true; break; }
      start = comma + 1;
    }
    if (!dayMatch) continue;
    // Record before actuation to avoid repeating this occurrence after a reboot.
    s.lastRunDate = today; cacheChanged = true;
    Serial.printf("LOCAL SCHEDULE %s -> device %d %s\\n", s.id.c_str(), s.deviceIndex, s.action ? "ON" : "OFF");
    setRelay(s.deviceIndex, s.action);
    enqueueOfflineUpdate(s.deviceIndex, s.action, false);
    logActivityInDB(s.deviceIndex, s.action, "Schedule (ESP32)");
  }
  if (cacheChanged) saveScheduleCache();
}

bool markAlarmFiredInDB(String alarmId) {
  if (!isCloudConfigured() || alarmId.length() == 0) return false;
  HTTPClient http;
  http.begin(String(SUPABASE_BASE) + "/alarms?id=eq." + alarmId + "&fired=eq.false&select=id");
  configureHttp(http);
  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Prefer", "return=representation");
  int code = http.PATCH("{\"fired\":true}");
  String responseBody = code == 200 ? http.getString() : "";
  http.end();
  DynamicJsonDocument doc(256);
  DeserializationError parseError = deserializeJson(doc, responseBody);
  const bool claimed = code == 200 && !parseError && doc.is<JsonArray>() && doc.size() > 0;
  if (claimed) {
    Serial.println("Alarm atomically claimed in Supabase.");
  } else {
    Serial.printf("Alarm not claimed (HTTP %d); another executor may have claimed it or cloud is unavailable.\n", code);
  }
  return claimed;
}
bool logActivityInDB(int index, bool state, const String& triggeredBy) {
  if (!isCloudConfigured() || index < 0 || index >= NUM_DEVICES ||
      deviceUUIDs[index] == "" || boardUserUUID == "") return false;
  DynamicJsonDocument doc(512);
  doc["user_id"] = boardUserUUID;
  doc["device_id"] = deviceUUIDs[index];
  doc["device_name"] = deviceNames[index];
  doc["action"] = state ? "turned ON" : "turned OFF";
  doc["triggered_by"] = triggeredBy;
  String payload;
  serializeJson(doc, payload);
  HTTPClient http;
  http.begin(String(SUPABASE_BASE) + "/activity_logs");
  configureHttp(http);
  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(payload);
  http.end();
  if (code == 201 || code == 200 || code == 204) return true;
  Serial.printf("Activity log insert failed for device %d (HTTP %d).\n", index, code);
  return false;
}
bool applyRemoteWifiConfiguration(const String& ssid, const String& security, const String& password, uint32_t configVersion, const String& commandId) {
  if (ssid.length() == 0 || ssid.length() > 32 ||
      (security != "open" && security != "wpa2_psk") ||
      (security == "wpa2_psk" && (password.length() < 8 || password.length() > 63)) ||
      (security == "open" && password.length() != 0)) {
    lastDeviceError = "Received invalid Wi-Fi configuration";
    return false;
  }

  if (ssid == homeWifiSSID && security == homeWifiSecurity && password == homeWifiPassword) {
    if (commandId.length()) {
      postDeviceCommandResult(commandId, "accepted", "Wi-Fi settings already match; confirming the current connection and cache.");
    }
    if (preferencesMutex) xSemaphoreTake(preferencesMutex, portMAX_DELAY);
    deviceConfigVersion = configVersion;
    preferences.putUInt("cfg_ver", deviceConfigVersion);
    if (preferencesMutex) xSemaphoreGive(preferencesMutex);
    lastDeviceError = "";
    return true;
  }

  const String previousSSID = homeWifiSSID;
  const String previousPassword = homeWifiPassword;
  const String previousSecurity = homeWifiSecurity;

  if (preferencesMutex) xSemaphoreTake(preferencesMutex, portMAX_DELAY);
  preferences.putString("p_ssid", ssid);
  preferences.putString("p_pass", password);
  preferences.putString("p_sec", security);
  preferences.putUInt("p_ver", configVersion);
  if (preferencesMutex) xSemaphoreGive(preferencesMutex);

  Serial.println("-> Testing staged Wi-Fi configuration before committing it.");
  WiFi.begin(ssid.c_str(), password.c_str());
  const unsigned long start = millis();
  while (millis() - start < 15000) {
    if (WiFi.status() == WL_CONNECTED && WiFi.SSID() == ssid) break;
    delay(250);
  }

  if (WiFi.status() == WL_CONNECTED && WiFi.SSID() == ssid) {
    if (commandId.length()) {
      postDeviceCommandResult(commandId, "accepted", "The ESP32 connected to the requested Wi-Fi network; saving the verified configuration.");
    }
    homeWifiSSID = ssid;
    homeWifiPassword = password;
    homeWifiSecurity = security;
    deviceConfigVersion = configVersion;
    if (preferencesMutex) xSemaphoreTake(preferencesMutex, portMAX_DELAY);
    preferences.putString("wifi_ssid", homeWifiSSID);
    preferences.putString("wifi_pass", homeWifiPassword);
    preferences.putString("wifi_sec", homeWifiSecurity);
    preferences.putUInt("cfg_ver", deviceConfigVersion);
    preferences.remove("p_ssid");
    preferences.remove("p_pass");
    preferences.remove("p_sec");
    preferences.remove("p_ver");
    if (preferencesMutex) xSemaphoreGive(preferencesMutex);
    wifiMulti.cleanAPlist();
    wifiMulti.addAP(homeWifiSSID.c_str(), homeWifiPassword.c_str());
    wifiConfigPending = false;
    lastDeviceError = "";
    Serial.println("-> New Wi-Fi connection verified; configuration committed.");
    return true;
  }

  Serial.println("-> New Wi-Fi configuration failed; restoring last known-good network.");
  WiFi.begin(previousSSID.c_str(), previousPassword.c_str());
  const unsigned long restoreStart = millis();
  while (millis() - restoreStart < 10000) {
    if (WiFi.status() == WL_CONNECTED && WiFi.SSID() == previousSSID) break;
    delay(250);
  }
  homeWifiSSID = previousSSID;
  homeWifiPassword = previousPassword;
  homeWifiSecurity = previousSecurity;
  if (preferencesMutex) xSemaphoreTake(preferencesMutex, portMAX_DELAY);
  preferences.remove("p_ssid");
  preferences.remove("p_pass");
  preferences.remove("p_sec");
  preferences.remove("p_ver");
  if (preferencesMutex) xSemaphoreGive(preferencesMutex);
  wifiMulti.cleanAPlist();
  if (homeWifiSSID.length()) wifiMulti.addAP(homeWifiSSID.c_str(), homeWifiPassword.c_str());
  lastDeviceError = "New Wi-Fi connection failed; previous configuration retained";
  return false;
}

bool pollRemoteConfiguration(bool forceFetch, const String& commandId) {
  if (!deviceAuthToken.length() || !isHomeWifiConnected()) return false;
  HTTPClient http;
  String url = String(DEVICE_API_BASE) + "/api/esp32/config?version=" + String(deviceConfigVersion);
  http.begin(url);
  configureHttp(http, 3000, 7000);
  http.addHeader("Authorization", "Bearer " + deviceAuthToken);
  http.addHeader("Accept", "application/json");
  const int code = http.GET();
  String response = code == 200 ? http.getString() : "";
  http.end();
  if (code != 200) {
    if (code != 409) Serial.printf("Device config check failed (HTTP %d).\n", code);
    return false;
  }

  DynamicJsonDocument doc(2048);
  if (deserializeJson(doc, response)) return false;
  if (!(doc["changed"] | false)) return true;
  JsonObject cfg = doc["configuration"].as<JsonObject>();
  if (cfg.isNull()) return false;
  String ssid = cfg["wifiSSID"] | "";
  String security = cfg["wifiSecurity"] | "wpa2_psk";
  String password = cfg["wifiPassword"] | "";
  uint32_t version = cfg["configVersion"] | 0;
  if (version <= deviceConfigVersion) return true;
  const bool applied = applyRemoteWifiConfiguration(ssid, security, password, version, commandId);
  if (!applied) Serial.println("-> Remote Wi-Fi config retained as pending; previous network remains configured.");
  return applied;
}

bool sendDeviceHeartbeat() {
  if (!deviceAuthToken.length() || !isHomeWifiConnected()) return false;
  DynamicJsonDocument doc(1024);
  doc["boardIdentifier"] = BOARD_IDENTIFIER;
  doc["wifiSSID"] = homeWifiSSID;
  doc["wifiSecurity"] = homeWifiSecurity;
  doc["configVersion"] = deviceConfigVersion;
  doc["bootId"] = deviceBootId;
  doc["uptimeMs"] = millis();
  doc["ip"] = WiFi.localIP().toString();
  if (lastDeviceError.length()) doc["lastError"] = lastDeviceError;
  // Only the initial authenticated registration sends the current passphrase.
  // Subsequent heartbeats never retransmit the Wi-Fi secret.
  bool registered = preferences.getBool("device_registered", false);
  if (!registered && homeWifiSecurity == "wpa2_psk") doc["wifiPassword"] = homeWifiPassword;

  String payload;
  serializeJson(doc, payload);
  HTTPClient http;
  http.begin(String(DEVICE_API_BASE) + "/api/esp32/heartbeat");
  configureHttp(http, 3000, 7000);
  http.addHeader("Authorization", "Bearer " + deviceAuthToken);
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(payload);
  String response = code == 200 ? http.getString() : "";
  http.end();
  if (code != 200) {
    Serial.printf("Device heartbeat failed (HTTP %d).\n", code);
    return false;
  }
  DynamicJsonDocument res(512);
  if (deserializeJson(res, response)) return false;
  if (res["registered"] | false) preferences.putBool("device_registered", true);
  if (res["configVersion"].is<uint32_t>()) {
    uint32_t desiredVersion = res["configVersion"].as<uint32_t>();
    if (desiredVersion > deviceConfigVersion) pollRemoteConfiguration(true);
  }
  return true;
}

bool postDeviceCommandResult(const String& commandId, const String& status, const String& message) {
  if (!deviceAuthToken.length()) return false;
  DynamicJsonDocument doc(512);
  doc["commandId"] = commandId;
  doc["status"] = status;
  doc["message"] = message;
  String payload;
  serializeJson(doc, payload);
  HTTPClient http;
  http.begin(String(DEVICE_API_BASE) + "/api/esp32/commands");
  configureHttp(http, 3000, 7000);
  http.addHeader("Authorization", "Bearer " + deviceAuthToken);
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(payload);
  http.end();
  return code == 200;
}

bool pollRemoteCommands() {
  if (!deviceAuthToken.length() || !isHomeWifiConnected()) return false;
  HTTPClient http;
  http.begin(String(DEVICE_API_BASE) + "/api/esp32/commands");
  configureHttp(http, 3000, 7000);
  http.addHeader("Authorization", "Bearer " + deviceAuthToken);
  http.addHeader("Accept", "application/json");
  int code = http.GET();
  String response = code == 200 ? http.getString() : "";
  http.end();
  if (code != 200) return false;

  DynamicJsonDocument doc(2048);
  if (deserializeJson(doc, response) || doc["command"].isNull()) return true;
  JsonObject command = doc["command"].as<JsonObject>();
  String commandId = command["id"] | "";
  String commandType = command["command_type"] | "";
  if (commandId.length() == 0) return false;

  if (commandType == "restart") {
    String previousRestartId = preferences.getString("last_restart_cmd", "");
    if (previousRestartId == commandId) return true;
    // Persist the ID before reboot so a delayed status update cannot create a reboot loop.
    preferences.putString("last_restart_cmd", commandId);
    Serial.println("-> Admin requested a remote ESP32 restart. Restarting this board only.");
    delay(250);
    ESP.restart();
    return true;
  }

  if (commandType == "apply_config") {
    const uint32_t currentVersion = preferences.getUInt("cfg_ver", 1);
    JsonObject payload = command["payload"].as<JsonObject>();
    const uint32_t requestedVersion = payload["config_version"] | 0;
    bool applied = false;
    postDeviceCommandResult(commandId, "accepted", "Configuration command received by the selected ESP32. Checking the new Wi-Fi settings.");
    if (requestedVersion > currentVersion) {
      applied = pollRemoteConfiguration(true, commandId);
    } else {
      applied = true; // Already applied: idempotently finish a redelivered command.
    }
    if (!applied) {
      postDeviceCommandResult(commandId, "failed", lastDeviceError.length() ? lastDeviceError : "Configuration update failed");
      return false;
    }
    postDeviceCommandResult(commandId, "completed", "Configuration applied and verified");
    sendDeviceHeartbeat();
    return true;
  }
  return false;
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
void cloudSyncTask(void* parameter) {
  (void)parameter;
  unsigned long lastNtpAttempt = 0;
  unsigned long lastResolveAttempt = 0;
  unsigned long lastCloudAlarmPoll = 0;
  unsigned long lastCloudHeartbeat = 0;
  unsigned long nextQueueAttempt = 0;
  unsigned long queueRetryDelay = 2000;
  unsigned long lastDeviceHeartbeatAttempt = 0;
  unsigned long lastDeviceCommandPoll = 0;
  unsigned long lastDeviceConfigPoll = 0;
  loadScheduleCache();
  for (;;) {
    runLocalSchedules();

    // Secure device-management APIs use a per-board credential and do not
    // require the legacy Supabase service-role key embedded by older builds.
    if (isHomeWifiConnected() && deviceAuthToken.length()) {
      if (millis() - lastDeviceHeartbeatAttempt >= 15000) {
        lastDeviceHeartbeatAttempt = millis();
        sendDeviceHeartbeat();
      }
      if (millis() - lastDeviceCommandPoll >= 5000) {
        lastDeviceCommandPoll = millis();
        pollRemoteCommands();
      }
      if (millis() - lastDeviceConfigPoll >= 30000) {
        lastDeviceConfigPoll = millis();
        pollRemoteConfiguration(false);
      }
    }

    if (!isHomeWifiConnected() || !isCloudConfigured()) {
      cloudDevicesReady = false;
      vTaskDelay(pdMS_TO_TICKS(1000));
      continue;
    }
    time_t currentNtpTime = time(nullptr);
    if (currentNtpTime < 100000 && millis() - lastNtpAttempt >= 30000) {
      Serial.println("-> Cloud worker syncing time with NTP...");
      setenv("TZ", "IST-5:30", 1); tzset();
      configTime(0, 0, "pool.ntp.org", "time.google.com");
      lastNtpAttempt = millis();
    }
    if (boardUUID == "" && millis() - lastResolveAttempt >= 10000) {
      lastResolveAttempt = millis();
      Serial.println("-> Cloud worker linking board/devices...");
      if (resolveBoardAndDevices()) {
        Serial.println("-> Board & devices linked; reconciling relay state before cloud polling.");
      }
    }
    if (boardUUID != "" && !cloudDevicesReady) {
      if (syncAllStatesToDB()) {
        Serial.println("-> Cloud state reconciled; 1-second cloud polling enabled.");
        cloudDevicesReady = true;
      } else {
        Serial.println("-> Initial relay-state reconciliation failed; cloud polling paused.");
        vTaskDelay(pdMS_TO_TICKS(3000));
        continue;
      }
    }
    if (boardUUID != "") {
      if (millis() - lastSchedulePoll >= SCHEDULE_POLL_INTERVAL) {
        lastSchedulePoll = millis();
        pollSchedules();
      }
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
          Serial.println("ALARM DUE. Claiming atomically: " + alarms[i].id);
          const String alarmId = alarms[i].id;
          const int targetDev = alarms[i].deviceIndex;
          const bool targetState = alarms[i].action;
          alarms[i].active = false;
          if (!markAlarmFiredInDB(alarmId)) continue;
          if (targetDev >= 0 && targetDev < NUM_DEVICES) {
            enqueueOfflineUpdate(targetDev, targetState, false);
            setRelay(targetDev, targetState);
            logActivityInDB(targetDev, targetState, "Alarm (ESP32)");
          }
        }
      }
    }
    vTaskDelay(pdMS_TO_TICKS(250));
  }
}
void cloudPollTask(void* parameter) {
  (void)parameter;
  for (;;) {
    if (!isHomeWifiConnected() || !cloudDevicesReady || !isCloudConfigured()) {
      vTaskDelay(pdMS_TO_TICKS(500));
      continue;
    }
    pollDatabase();
    vTaskDelay(pdMS_TO_TICKS(POLL_INTERVAL));
  }
}
