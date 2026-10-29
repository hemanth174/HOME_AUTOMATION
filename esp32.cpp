#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <esp_arduino_version.h>
#include <ArduinoJson.h>
#include <WebSocketsClient.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <Preferences.h>
#include <time.h>
#include <esp_system.h>
#include <esp_task_wdt.h>
#include <mbedtls/md.h>
#include <mbedtls/base64.h>
#include <mbedtls/gcm.h>
#include <vector>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <freertos/semphr.h>
#include <esp_crt_bundle.h>

// Arduino-ESP32 3.3.x removed WiFiClientSecure::useBuiltinCACertBundle(),
// but the underlying secure client still exposes the certificate-bundle hook.
// Keep CA validation enabled without falling back to insecure TLS.
class VikaTechSecureClient : public WiFiClientSecure {
public:
  void useBuiltinCACertBundle() {
    _use_ca_bundle = true;
    sslclient->bundle_attach_cb = &esp_crt_bundle_attach;
  }
};

#define NUM_DEVICES 4
const int RELAY_PINS[NUM_DEVICES] = {32, 33, 25, 26};
const int INPUT_PINS[NUM_DEVICES] = {19, 18, 5, 17};
String homeWifiSSID = "";
String homeWifiPassword = "";
String homeWifiSecurity = "wpa2_psk";
bool mdnsActive = false;
volatile bool wifiConfigPending = false;
volatile bool remoteWifiUpdateInProgress = false;
const char* BOARD_IDENTIFIER = "esp32-unconfigured";
const char* SUPABASE_BASE = "";
const char* SUPABASE_SERVICE_KEY = "";
// The per-board token is injected by the one-time provisioning download.
// It authenticates only this device to the VikaTech device-management API;
// it is NOT a Supabase service-role key.
// Legacy PR #7 API credentials remain for already-provisioned boards only.
const char* DEVICE_API_BASE = "https://home-automation-mauve-one.vercel.app";
const char* DEVICE_AUTH_TOKEN = "";

// Current secure device-agent values are injected during one-time enrollment.
// These identifiers must exist in the generic source template so provisioning
// can replace them; never put a Supabase service-role key in this firmware.
const char* DEVICE_AGENT_URL = "";
const char* DEVICE_TOKEN = "";
String deviceAuthToken = "";
String deviceBootId = "";
String lastDeviceError = "";
uint32_t deviceConfigVersion = 1;

// The current device path is JSON over WSS through the custom MQTT backend.
// The ESP32 discovers the latest Cloudflare URL from the public discovery row;
// it never connects directly to Mosquitto and never receives broker credentials.
const char* DISCOVERY_SUPABASE_URL = "";
const char* DISCOVERY_SUPABASE_ANON_KEY = "";
const char* DISCOVERY_TABLE = "app_discovery";
const char* DEVICE_WS_PATH = "/device";
const char* DEVICE_WS_TOKEN = "";
// First-boot home Wi-Fi is injected during enrollment so the board can come
// online without a local setup page. NVS remains authoritative after boot,
// and a new enrollment token deliberately re-seeds these values.
const char* HOME_WIFI_SSID = "";
const char* HOME_WIFI_PASSWORD = "";
const char* HOME_WIFI_SECURITY = "wpa2_psk";
// Changes whenever Admin generates a new firmware file. This lets a deliberate
// re-enrollment replace stale Wi-Fi values already stored in NVS.
const char* HOME_WIFI_SEED = "";
// Mesh credentials are injected during one-time enrollment. An unprovisioned
// template must not start an open/default installation network.
const char* MESH_SSID = "";
const char* MESH_PASS = "";
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
WebSocketsClient deviceWebSocket;
WebServer server(80);
Preferences preferences;
SemaphoreHandle_t preferencesMutex = nullptr;
SemaphoreHandle_t offlineQueueMutex = nullptr;
SemaphoreHandle_t relayMutex = nullptr;
TaskHandle_t cloudSyncTaskHandle = nullptr;
TaskHandle_t cloudPollTaskHandle = nullptr;
TaskHandle_t deviceAgentTaskHandle = nullptr;
TaskHandle_t deviceGatewayTaskHandle = nullptr;
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
volatile bool pendingMeshRestart = false;
unsigned long pendingMeshRestartAt = 0;
String pendingMeshRestartCommand = "";
unsigned long lastWifiRetry     = 0;  const unsigned long WIFI_RETRY_INTERVAL      = 3000;   // Station reconnect attempts (was: every loop!)
unsigned long lastLeaderWifiTry = 0;  const unsigned long LEADER_WIFI_RETRY_INTERVAL = 30000; // Leader home-Wi-Fi probes (non-blocking begin)
unsigned long lastHomeWifiBegin = 0;
unsigned long homeWifiAttemptStartedAt = 0;
bool homeWifiAttemptInProgress = false;
const unsigned long HOME_WIFI_ATTEMPT_TIMEOUT = 12000;
const unsigned long HOME_WIFI_BEGIN_GUARD = 15000;
unsigned long lastRoleEval      = 0;  const unsigned long ROLE_EVAL_INTERVAL       = 5000;   // Role decision cadence
unsigned long lastMemberJoin    = 0;  const unsigned long MESH_JOIN_INTERVAL       = 25000;  // Member -> leader announce
unsigned long lastHomeWifiProbe = 0;  const unsigned long HOME_WIFI_PROBE_INTERVAL = 60000;  // Member checks if home Wi-Fi returned
unsigned long leaderUptimeMillis = 0;
String deviceGatewayHost = "";
uint16_t deviceGatewayPort = 443;
String deviceGatewayPath = "";
String deviceGatewayHeaders = "";
bool deviceGatewayTls = true;
volatile bool deviceGatewayConnected = false;
unsigned long lastDeviceGatewayDiscovery = 0;
const unsigned long DEVICE_GATEWAY_DISCOVERY_INTERVAL = 300000;
const unsigned long DEVICE_GATEWAY_OFFLINE_RECONNECT_INTERVAL = 1000;
const unsigned long DEVICE_GATEWAY_CONNECTED_RECONNECT_INTERVAL = 5000;
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
void maintainMdns();
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
bool isDeviceGatewayConfigured();
bool fetchDeviceGatewayUrl(String& backendUrl);
bool parseDeviceGatewayUrl(const String& backendUrl, String& host, uint16_t& port, bool& tls);
void handleDeviceGatewayEvent(WStype_t type, uint8_t* payload, size_t length);
void handleDeviceGatewayMessage(uint8_t* payload, size_t length);
bool applyDeviceGatewayCommand(const String& topic, const String& payload);
void startDeviceGateway(const String& backendUrl);
void deviceGatewayTask(void* parameter);
bool isCloudConfigured();
bool isDirectCloudConfigured();
bool isDeviceAgentConfigured();
bool requestDeviceAgentSnapshot(DynamicJsonDocument& response);
bool sendDeviceAgentAction(DynamicJsonDocument& requestDoc, DynamicJsonDocument& response);
void applyDeviceSnapshot(JsonDocument& response, bool applyRelayStates);
void applyAlarmSnapshot(JsonDocument& response);
void applyScheduleSnapshot(JsonDocument& response);
void loadHomeWifiCredentials();
void beginHomeWifiConnection(const char* reason = nullptr);
void diagnoseHomeWifiFailure();
void applyPendingWifiConfiguration();
bool sendDeviceHeartbeat();
bool pollRemoteCommands();
bool postDeviceCommandResult(const String& commandId, const String& status, const String& message);
bool pollRemoteConfiguration(bool forceFetch = false, const String& commandId = "");
bool applyRemoteWifiConfiguration(const String& ssid, const String& security, const String& password, uint32_t configVersion, const String& commandId = "");
void logResetReason();
void deviceAgentTask(void* parameter);
bool deviceAgentPost(const String& payload, DynamicJsonDocument& response);
bool reportDeviceConfigStatus(int version, const String& status, const String& error = "");
bool acknowledgeDeviceCommand(const String& commandId, const String& status, const String& error = "", const String& targetBoardIdentifier = "");
bool applyRemoteWifiConfiguration(JsonObject configuration);
String meshRestartSignature(const String& commandId, const String& targetBoardIdentifier);
bool meshRestartSignatureMatches(const String& supplied, const String& expected);
bool meshRestartQueued(const String& commandId);
bool meshRestartForwarded(const String& commandId);
bool markMeshRestartForwarded(const String& commandId);
bool storePendingMeshRestart(const String& commandId, const String& targetBoardIdentifier, uint32_t expiresAtEpoch);
bool setPendingMeshRestartAccepted(const String& commandId);
bool removePendingMeshRestart(const String& commandId);
void processPendingMeshRestartAcks();
bool forwardMeshRestart(const String& commandId, const String& targetBoardIdentifier, uint32_t expiresAtEpoch = 0);
bool decryptDeviceConfigEnvelope(JsonObject envelope, uint32_t expectedVersion, DynamicJsonDocument& decrypted);
void processDeviceAgentResponse(JsonDocument& response);
bool cloudStateSupersedesQueue(const PendingUpdate& queued, const String& cloudChangedAt);
bool getPendingRelayUpdate(int index, PendingUpdate& result);
bool discardPendingRelayUpdate(const PendingUpdate& expected);
bool isHomeWifiConnected() {
  const bool connected = homeWifiSSID.length() > 0 && WiFi.status() == WL_CONNECTED &&
                         WiFi.SSID() == homeWifiSSID;
  if (connected) homeWifiAttemptInProgress = false;
  return connected;
}
void maintainMdns() {
  const bool shouldAdvertise = isHomeWifiConnected();
  if (shouldAdvertise && !mdnsActive) {
    if (MDNS.begin("home-automation")) {
      MDNS.addService("http", "tcp", 80);
      mdnsActive = true;
      Serial.println("-> Local discovery active at http://home-automation.local");
    } else {
      Serial.println("WARNING: mDNS startup failed; use the ESP32 local IP from the serial log.");
    }
  } else if (!shouldAdvertise && mdnsActive) {
    MDNS.end();
    mdnsActive = false;
  }
}
bool isDirectCloudConfigured() {
  return strlen(SUPABASE_BASE) > 0 && strlen(SUPABASE_SERVICE_KEY) > 0;
}
bool isDeviceAgentConfigured() {
  return strlen(DEVICE_AGENT_URL) > 0 && deviceAuthToken.length() >= 32 &&
         String(BOARD_IDENTIFIER) != "esp32-unconfigured";
}
bool isCloudConfigured() {
  // New generic firmware uses a per-device token through the Edge Function.
  // Legacy builds may still use the old direct REST settings during migration.
  return isDirectCloudConfigured() || isDeviceAgentConfigured();
}
void logResetReason() {
  const esp_reset_reason_t reason = esp_reset_reason();
  Serial.printf("-> ESP32 reset reason code: %d\n", (int)reason);
  if (reason == ESP_RST_BROWNOUT) {
    Serial.println("!! Brownout reset detected. Check the external 5V supply, relay current, wiring, and decoupling.");
  }
}
void configureTaskWatchdogForTls() {
  // CA-validated TLS can spend several seconds in mbedTLS elliptic-curve
  // arithmetic without yielding. Keep the watchdog as a safety net, but give
  // the cloud worker enough time to finish a bounded HTTPS handshake.
  esp_task_wdt_config_t config = {};
  config.timeout_ms = 120000;
  config.idle_core_mask = 0x3;
  config.trigger_panic = true;
  esp_err_t result = esp_task_wdt_reconfigure(&config);
  if (result == ESP_ERR_INVALID_STATE) result = esp_task_wdt_init(&config);
  if (result != ESP_OK && result != ESP_ERR_INVALID_STATE) {
    Serial.printf("WARNING: Could not extend TLS watchdog window (error %d).\n", (int)result);
  }
}
void loadHomeWifiCredentials() {
  bool loadedFromEnrollmentFirmware = false;
  if (preferencesMutex) xSemaphoreTake(preferencesMutex, portMAX_DELAY);
  homeWifiSSID = preferences.getString("wifi_ssid", "");
  homeWifiPassword = preferences.getString("wifi_pass", "");
  // The security mode is explicit. Never treat an empty passphrase as proof
  // that the network is open; older boards must be migrated deliberately.
  homeWifiSecurity = preferences.getString("wifi_sec", "wpa2_psk");
  if (homeWifiSecurity != "open" && homeWifiSecurity != "wpa2_psk") {
    homeWifiSecurity = "wpa2_psk";
  }
  const String bakedWifiSSID = String(HOME_WIFI_SSID);
  const String bakedWifiSecurity = String(HOME_WIFI_SECURITY) == "open" ? "open" : "wpa2_psk";
  const String wifiSeedToken = preferences.getString("wifi_seed", "");
  const bool seedBakedWifi = strlen(HOME_WIFI_SSID) > 0 &&
    (homeWifiSSID.length() == 0 || homeWifiSSID != bakedWifiSSID ||
     (strlen(HOME_WIFI_SEED) > 0 && wifiSeedToken != String(HOME_WIFI_SEED)));
  if (seedBakedWifi) {
    loadedFromEnrollmentFirmware = true;
    homeWifiSSID = bakedWifiSSID;
    homeWifiPassword = bakedWifiSecurity == "open" ? "" : String(HOME_WIFI_PASSWORD);
    homeWifiSecurity = bakedWifiSecurity;
    preferences.putString("wifi_ssid", homeWifiSSID);
    preferences.putString("wifi_pass", homeWifiPassword);
    preferences.putString("wifi_sec", homeWifiSecurity);
    if (strlen(HOME_WIFI_SEED) > 0) preferences.putString("wifi_seed", String(HOME_WIFI_SEED));
  }
  const uint32_t savedConfigVersion = preferences.getUInt("cfg_ver", 1);
  deviceConfigVersion = savedConfigVersion < 1 ? 1 : savedConfigVersion;
  // An interrupted configuration attempt must not override active settings.
  // Staged values are re-fetched from the server after reconnect.
  preferences.remove("p_ssid");
  preferences.remove("p_pass");
  preferences.remove("p_sec");
  preferences.remove("p_ver");
  deviceAuthToken = preferences.getString("device_token", "");
  if (strlen(DEVICE_TOKEN) > 0 && String(DEVICE_TOKEN) != deviceAuthToken) {
    // A controlled credential rotation is delivered in replacement firmware.
    // Reset only the registration marker; the active Wi-Fi cache remains usable.
    deviceAuthToken = String(DEVICE_TOKEN);
    preferences.putString("device_token", deviceAuthToken);
    preferences.putBool("wifi_registered", false);
    preferences.putBool("device_registered", false);
    deviceConfigVersion = 1;
    preferences.putUInt("cfg_ver", deviceConfigVersion);
  } else if (deviceAuthToken.length() == 0 && strlen(DEVICE_AUTH_TOKEN) > 0) {
    deviceAuthToken = String(DEVICE_AUTH_TOKEN);
    preferences.putString("device_token", deviceAuthToken);
  }
  uint32_t bootCount = preferences.getUInt("boot_count", 0) + 1;
  preferences.putUInt("boot_count", bootCount);
  deviceBootId = String(BOARD_IDENTIFIER) + "-" + String(bootCount);

  // Make an accepted mesh restart survive power loss during the short window
  // between the signed HTTP acknowledgement and ESP.restart().
  String savedMeshRestart = preferences.getString("mesh_rst_pending", "");
  uint32_t requestedOnBoot = preferences.getUInt("mesh_rst_boot", bootCount);
  if (savedMeshRestart.length() > 0) {
    if (bootCount > requestedOnBoot) {
      // A reboot occurred after acceptance; do not reboot again if the leader retries.
      preferences.remove("mesh_rst_pending");
      preferences.remove("mesh_rst_boot");
      pendingMeshRestart = false;
      pendingMeshRestartCommand = "";
    } else {
      pendingMeshRestartCommand = savedMeshRestart;
      pendingMeshRestartAt = millis();
      pendingMeshRestart = true;
    }
  }
  if (preferencesMutex) xSemaphoreGive(preferencesMutex);
  if (loadedFromEnrollmentFirmware) {
    Serial.printf("-> Home Wi-Fi source: generated enrollment firmware (%s)\n", homeWifiSSID.c_str());
  } else if (homeWifiSSID.length()) {
    Serial.printf("-> Home Wi-Fi source: saved NVS credentials (%s)\n", homeWifiSSID.c_str());
  } else {
    Serial.println("-> Home Wi-Fi source: none");
  }
  Serial.printf("-> Home Wi-Fi credentials: %s\n",
                homeWifiSSID.length() ? "saved" : "not configured");
  Serial.printf("-> Device management API: %s\n",
                deviceAuthToken.length() ? "configured" : "not provisioned (remote management disabled)");
  Serial.printf("-> Supabase cloud sync: %s\n",
                isCloudConfigured() ? "configured" : "disabled (legacy cloud key not configured)");
}
void beginHomeWifiConnection(const char* reason) {
  if (!homeWifiSSID.length() || isHomeWifiConnected()) return;
  const unsigned long now = millis();
  if (homeWifiAttemptInProgress) {
    if (now - homeWifiAttemptStartedAt < HOME_WIFI_ATTEMPT_TIMEOUT) return;
    Serial.println("-> Previous home Wi-Fi attempt timed out; releasing the station before retrying.");
    WiFi.disconnect(false, false);
    homeWifiAttemptInProgress = false;
  }
  if (lastHomeWifiBegin != 0 && now - lastHomeWifiBegin < HOME_WIFI_BEGIN_GUARD) return;
  if (reason && strlen(reason)) {
    Serial.printf("-> Home Wi-Fi attempt (%s): %s\n", reason, homeWifiSSID.c_str());
  }
  if (homeWifiSecurity == "open") WiFi.begin(homeWifiSSID.c_str());
  else WiFi.begin(homeWifiSSID.c_str(), homeWifiPassword.c_str());
  lastHomeWifiBegin = now;
  homeWifiAttemptStartedAt = now;
  homeWifiAttemptInProgress = true;
}
void diagnoseHomeWifiFailure() {
  if (!homeWifiSSID.length()) return;
  homeWifiAttemptInProgress = false;
  const wl_status_t status = WiFi.status();
  Serial.printf("!! Home Wi-Fi did not connect. status=%d, configured SSID=%s\n",
                (int)status, homeWifiSSID.c_str());
  Serial.println("-> Scanning the ESP32-visible 2.4 GHz networks for the configured SSID...");
  const int count = WiFi.scanNetworks(false, true);
  bool found = false;
  for (int i = 0; i < count; ++i) {
    if (WiFi.SSID(i) != homeWifiSSID) continue;
    found = true;
    Serial.printf("-> Configured SSID is visible: RSSI=%d dBm, channel=%d, auth=%d\n",
                  WiFi.RSSI(i), WiFi.channel(i), (int)WiFi.encryptionType(i));
  }
  WiFi.scanDelete();
  if (!found) {
    Serial.println("!! Configured SSID is not visible to the ESP32. Use the router's 2.4 GHz SSID; ESP32 does not support a 5 GHz-only network.");
  } else {
    Serial.println("!! Configured SSID is visible. Check the WPA2 password/security mode and ensure the router permits 2.4 GHz clients.");
  }
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
bool isDeviceGatewayConfigured() {
  return strlen(DISCOVERY_SUPABASE_URL) > 0 &&
         strlen(DISCOVERY_SUPABASE_ANON_KEY) > 0 &&
         strlen(DEVICE_WS_TOKEN) > 0 &&
         String(BOARD_IDENTIFIER) != "esp32-unconfigured";
}
bool parseDeviceGatewayUrl(const String& backendUrl, String& host, uint16_t& port, bool& tls) {
  String url = backendUrl;
  url.trim();
  tls = false;
  if (url.startsWith("https://")) {
    tls = true;
    url.remove(0, 8);
    port = 443;
  } else if (url.startsWith("http://")) {
    url.remove(0, 7);
    port = 80;
  } else {
    return false;
  }

  const int pathStart = url.indexOf('/');
  String authority = pathStart >= 0 ? url.substring(0, pathStart) : url;
  authority.trim();
  if (!authority.length()) return false;

  const int colon = authority.lastIndexOf(':');
  if (colon > 0 && authority.indexOf(']') < 0) {
    const String portText = authority.substring(colon + 1);
    for (size_t i = 0; i < portText.length(); ++i) {
      if (!isDigit(portText[i])) return false;
    }
    const int parsedPort = portText.toInt();
    if (parsedPort < 1 || parsedPort > 65535) return false;
    port = (uint16_t)parsedPort;
    authority = authority.substring(0, colon);
  }
  host = authority;
  return host.length() > 0;
}
bool fetchDeviceGatewayUrl(String& backendUrl) {
  backendUrl = "";
  if (!isDeviceGatewayConfigured() || WiFi.status() != WL_CONNECTED) return false;

  String discoveryBase = String(DISCOVERY_SUPABASE_URL);
  while (discoveryBase.endsWith("/")) discoveryBase.remove(discoveryBase.length() - 1);
  String url = discoveryBase + "/rest/v1/" + String(DISCOVERY_TABLE) +
               "?id=eq.true&select=backend_url&limit=1";

  VikaTechSecureClient secureClient;
  secureClient.useBuiltinCACertBundle();
  secureClient.setHandshakeTimeout(8);
  HTTPClient http;
  if (!http.begin(secureClient, url)) return false;
  configureHttp(http, 3500, 6500);
  http.addHeader("apikey", DISCOVERY_SUPABASE_ANON_KEY);
  http.addHeader("Authorization", "Bearer " + String(DISCOVERY_SUPABASE_ANON_KEY));
  http.addHeader("Accept", "application/json");
  const int code = http.GET();
  String body = (code >= 200 && code < 300) ? http.getString() : "";
  http.end();
  secureClient.stop();
  if (code < 200 || code >= 300 || !body.length()) return false;

  DynamicJsonDocument response(1536);
  if (deserializeJson(response, body)) return false;
  JsonArray rows = response.as<JsonArray>();
  if (rows.isNull() || rows.size() == 0) return false;
  const char* discovered = rows[0]["backend_url"] | "";
  if (!discovered || !strlen(discovered)) return false;
  String candidate = String(discovered);
  candidate.trim();
  String ignoredHost;
  uint16_t ignoredPort = 0;
  bool ignoredTls = false;
  if (!parseDeviceGatewayUrl(candidate, ignoredHost, ignoredPort, ignoredTls)) return false;
  backendUrl = candidate;
  return true;
}
void startDeviceGateway(const String& backendUrl) {
  String host;
  uint16_t port = 443;
  bool tls = true;
  if (!parseDeviceGatewayUrl(backendUrl, host, port, tls)) return;

  if (deviceWebSocket.isConnected()) deviceWebSocket.disconnect();
  deviceGatewayHost = host;
  deviceGatewayPort = port;
  deviceGatewayTls = tls;
  deviceGatewayPath = String(DEVICE_WS_PATH) + "?board=" + String(BOARD_IDENTIFIER);
  // WebSocketsClient appends the final CRLF itself. Do not include a trailing
  // CRLF here or the HTTP upgrade ends before the library's User-Agent header.
  deviceGatewayHeaders = String("X-Device-Token: ") + String(DEVICE_WS_TOKEN);
  deviceWebSocket.setExtraHeaders(deviceGatewayHeaders.c_str());
  // Retry quickly while the gateway is unavailable. Once connected, the
  // normal 5-second interval is restored for any later disconnect.
  deviceWebSocket.setReconnectInterval(DEVICE_GATEWAY_OFFLINE_RECONNECT_INTERVAL);
  // The backend sends JSON heartbeat messages. The library heartbeat is not
  // used because overlapping heartbeat/send frames can corrupt JSON gateways.
  deviceWebSocket.disableHeartbeat();
  if (deviceGatewayTls) {
    // The backend uses Cloudflare's public certificate. beginSSL() is the
    // Links2004/arduinoWebSockets API used by its known-good ESP32 example.
    deviceWebSocket.beginSSL(deviceGatewayHost.c_str(), deviceGatewayPort,
                             deviceGatewayPath.c_str(), "", "arduino");
  } else {
    deviceWebSocket.begin(deviceGatewayHost.c_str(), deviceGatewayPort,
                          deviceGatewayPath.c_str(), "arduino");
  }
  Serial.printf("-> Device gateway starting: %s://%s:%u%s\n",
                deviceGatewayTls ? "wss" : "ws", deviceGatewayHost.c_str(),
                deviceGatewayPort, deviceGatewayPath.c_str());
}
bool applyDeviceGatewayCommand(const String& topic, const String& payload) {
  const String prefix = String("home/") + BOARD_IDENTIFIER + "/device/";
  const String suffix = "/set";
  if (!topic.startsWith(prefix) || !topic.endsWith(suffix)) return false;

  const String relayText = topic.substring(prefix.length(), topic.length() - suffix.length());
  if (!relayText.length()) return false;
  for (size_t i = 0; i < relayText.length(); i++) {
    if (!isDigit(relayText[i])) return false;
  }
  const int relayIndex = relayText.toInt();
  if (relayIndex < 0 || relayIndex >= NUM_DEVICES) {
    Serial.printf("!! WSS command rejected: invalid relay index %d\n", relayIndex);
    return false;
  }

  DynamicJsonDocument doc(768);
  DeserializationError error = deserializeJson(doc, payload);
  if (error || !doc["state"].is<bool>()) {
    Serial.println("!! WSS command rejected: invalid JSON/state payload");
    return false;
  }
  const bool targetState = doc["state"].as<bool>();
  const String commandId = doc["command_id"].as<String>();
  Serial.printf("<< WSS command | relay=%d | state=%s | id=%s\n",
                relayIndex, targetState ? "ON" : "OFF", commandId.c_str());
  bool currentState;
  if (relayMutex) xSemaphoreTake(relayMutex, portMAX_DELAY);
  currentState = isRelayOn[relayIndex];
  if (relayMutex) xSemaphoreGive(relayMutex);
  if (currentState == targetState) {
    Serial.printf("-> WSS command already applied | relay=%d\n", relayIndex);
    return true;
  }
  // Mirror the local REST path: queue the state so the cloud worker converges
  // even when a retained MQTT command arrives after a reconnect.
  enqueueOfflineUpdate(relayIndex, targetState, false);
  setRelay(relayIndex, targetState);
  Serial.printf("-> WSS command applied | relay=%d | state=%s\n",
                relayIndex, targetState ? "ON" : "OFF");
  return true;
}
void handleDeviceGatewayMessage(uint8_t* payload, size_t length) {
  DynamicJsonDocument message(4096);
  if (deserializeJson(message, payload, length)) {
    Serial.println("!! WSS message rejected: invalid JSON");
    return;
  }
  const String type = message["type"].as<String>();
  if (type == "heartbeat") {
    String pong = "{\"type\":\"pong\"}";
    if (!deviceWebSocket.sendTXT(pong)) Serial.println("!! WSS pong send failed");
    return;
  }
  if (type != "mqtt") return;
  const String topic = message["topic"].as<String>();
  const String commandPayload = message["payload"].as<String>();
  applyDeviceGatewayCommand(topic, commandPayload);
}
void handleDeviceGatewayEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      deviceGatewayConnected = true;
      deviceWebSocket.setReconnectInterval(DEVICE_GATEWAY_CONNECTED_RECONNECT_INTERVAL);
      Serial.printf("-> WSS device gateway connected: %s\n", deviceWebSocket.getUrl().c_str());
      break;
    case WStype_DISCONNECTED:
      deviceGatewayConnected = false;
      deviceWebSocket.setReconnectInterval(DEVICE_GATEWAY_OFFLINE_RECONNECT_INTERVAL);
      // A Quick Tunnel hostname may change when the tunnel restarts. Refresh
      // discovery immediately instead of retrying the stale hostname for 5m.
      lastDeviceGatewayDiscovery = millis() - DEVICE_GATEWAY_DISCOVERY_INTERVAL;
      Serial.println("-> WSS device gateway disconnected; reconnecting.");
      break;
    case WStype_TEXT:
      handleDeviceGatewayMessage(payload, length);
      break;
    case WStype_ERROR:
      deviceGatewayConnected = false;
      deviceWebSocket.setReconnectInterval(DEVICE_GATEWAY_OFFLINE_RECONNECT_INTERVAL);
      lastDeviceGatewayDiscovery = millis() - DEVICE_GATEWAY_DISCOVERY_INTERVAL;
      Serial.println("!! WSS device gateway error.");
      break;
    default:
      break;
  }
}
void deviceGatewayTask(void* parameter) {
  (void)parameter;
  bool ntpRequested = false;
  for (;;) {
    if (!isDeviceGatewayConfigured() || !isHomeWifiConnected()) {
      if (deviceGatewayConnected) deviceWebSocket.disconnect();
      vTaskDelay(pdMS_TO_TICKS(1000));
      continue;
    }
    if (time(nullptr) < 100000) {
      if (!ntpRequested) {
        configTime(0, 0, "pool.ntp.org", "time.google.com");
        ntpRequested = true;
      }
      vTaskDelay(pdMS_TO_TICKS(1000));
      continue;
    }

    const bool discoveryDue = deviceGatewayHost.length() == 0 ||
      millis() - lastDeviceGatewayDiscovery >= DEVICE_GATEWAY_DISCOVERY_INTERVAL;
    if (discoveryDue) {
      lastDeviceGatewayDiscovery = millis();
      String discoveredUrl;
      if (fetchDeviceGatewayUrl(discoveredUrl)) {
        String discoveredHost;
        uint16_t discoveredPort = 443;
        bool discoveredTls = true;
        parseDeviceGatewayUrl(discoveredUrl, discoveredHost, discoveredPort, discoveredTls);
        if (discoveredHost != deviceGatewayHost || discoveredPort != deviceGatewayPort ||
            discoveredTls != deviceGatewayTls || !deviceGatewayPath.length()) {
          startDeviceGateway(discoveredUrl);
        }
      }
    }
    if (deviceGatewayHost.length()) deviceWebSocket.loop();
    vTaskDelay(pdMS_TO_TICKS(10));
  }
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
String meshRestartSignature(const String& commandId, const String& targetBoardIdentifier) {
  if (strlen(MESH_PASS) < 8 || commandId.length() == 0 || targetBoardIdentifier.length() == 0) return "";
  const String message = commandId + "|" + targetBoardIdentifier;
  const mbedtls_md_info_t* mdInfo = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  if (!mdInfo) return "";
  unsigned char digest[32];
  if (mbedtls_md_hmac(mdInfo,
      reinterpret_cast<const unsigned char*>(MESH_PASS), strlen(MESH_PASS),
      reinterpret_cast<const unsigned char*>(message.c_str()), message.length(), digest) != 0) return "";
  char hexDigest[65];
  for (size_t i = 0; i < sizeof(digest); ++i) sprintf(hexDigest + (i * 2), "%02x", digest[i]);
  hexDigest[64] = '\0';
  return String(hexDigest);
}

bool meshRestartSignatureMatches(const String& supplied, const String& expected) {
  if (supplied.length() != 64 || expected.length() != 64) return false;
  unsigned char diff = 0;
  for (size_t i = 0; i < 64; ++i) diff |= static_cast<unsigned char>(supplied[i] ^ expected[i]);
  return diff == 0;
}

String readPendingMeshRestartQueue() {
  if (preferencesMutex) xSemaphoreTake(preferencesMutex, portMAX_DELAY);
  String value = preferences.getString("mesh_rst_q", "[]");
  if (preferencesMutex) xSemaphoreGive(preferencesMutex);
  return value;
}

bool meshRestartQueued(const String& commandId) {
  DynamicJsonDocument doc(2048);
  if (deserializeJson(doc, readPendingMeshRestartQueue()) || !doc.is<JsonArray>()) return false;
  for (JsonObject item : doc.as<JsonArray>()) {
    if (String(item["id"] | "") == commandId) return true;
  }
  return false;
}

bool meshRestartForwarded(const String& commandId) {
  DynamicJsonDocument doc(2048);
  if (deserializeJson(doc, readPendingMeshRestartQueue()) || !doc.is<JsonArray>()) return false;
  for (JsonObject item : doc.as<JsonArray>()) {
    if (String(item["id"] | "") == commandId) return item["forwarded"] | false;
  }
  return false;
}

bool markMeshRestartForwarded(const String& commandId) {
  DynamicJsonDocument doc(2048);
  if (deserializeJson(doc, readPendingMeshRestartQueue()) || !doc.is<JsonArray>()) return false;
  bool found = false;
  for (JsonObject item : doc.as<JsonArray>()) {
    if (String(item["id"] | "") == commandId) {
      item["forwarded"] = true;
      found = true;
    }
  }
  if (!found) return false;
  String serialized;
  if (serializeJson(doc, serialized) == 0) return false;
  if (preferencesMutex) xSemaphoreTake(preferencesMutex, portMAX_DELAY);
  size_t written = preferences.putString("mesh_rst_q", serialized);
  if (preferencesMutex) xSemaphoreGive(preferencesMutex);
  return written > 0;
}

bool storePendingMeshRestart(const String& commandId, const String& targetBoardIdentifier, uint32_t expiresAtEpoch) {
  DynamicJsonDocument doc(2048);
  String raw = readPendingMeshRestartQueue();
  if (deserializeJson(doc, raw) || !doc.is<JsonArray>()) {
    doc.clear();
    doc.to<JsonArray>();
  }
  JsonArray rows = doc.as<JsonArray>();
  for (JsonObject item : rows) {
    if (String(item["id"] | "") == commandId) return true;
  }
  if (rows.size() >= MAX_MESH_NODES) return false;
  JsonObject item = rows.createNestedObject();
  item["id"] = commandId;
  item["target_board_identifier"] = targetBoardIdentifier;
  item["forwarded"] = false;
  item["accepted_acknowledged"] = false;
  item["expires_at_epoch"] = expiresAtEpoch;
  String serialized;
  if (serializeJson(doc, serialized) == 0) return false;
  if (preferencesMutex) xSemaphoreTake(preferencesMutex, portMAX_DELAY);
  size_t written = preferences.putString("mesh_rst_q", serialized);
  if (preferencesMutex) xSemaphoreGive(preferencesMutex);
  return written > 0;
}

bool setPendingMeshRestartAccepted(const String& commandId) {
  DynamicJsonDocument doc(2048);
  if (deserializeJson(doc, readPendingMeshRestartQueue()) || !doc.is<JsonArray>()) return false;
  bool found = false;
  for (JsonObject item : doc.as<JsonArray>()) {
    if (String(item["id"] | "") == commandId) {
      item["accepted_acknowledged"] = true;
      found = true;
    }
  }
  if (!found) return false;
  String serialized;
  if (serializeJson(doc, serialized) == 0) return false;
  if (preferencesMutex) xSemaphoreTake(preferencesMutex, portMAX_DELAY);
  size_t written = preferences.putString("mesh_rst_q", serialized);
  if (preferencesMutex) xSemaphoreGive(preferencesMutex);
  return written > 0;
}

bool removePendingMeshRestart(const String& commandId) {
  DynamicJsonDocument source(2048);
  if (deserializeJson(source, readPendingMeshRestartQueue()) || !source.is<JsonArray>()) return false;
  DynamicJsonDocument next(2048);
  JsonArray remaining = next.to<JsonArray>();
  bool removed = false;
  for (JsonObject item : source.as<JsonArray>()) {
    if (String(item["id"] | "") == commandId) { removed = true; continue; }
    JsonObject copy = remaining.createNestedObject();
    copy.set(item);
  }
  if (!removed) return true;
  String serialized;
  if (serializeJson(next, serialized) == 0) return false;
  if (preferencesMutex) xSemaphoreTake(preferencesMutex, portMAX_DELAY);
  size_t written = preferences.putString("mesh_rst_q", serialized);
  if (preferencesMutex) xSemaphoreGive(preferencesMutex);
  return written > 0;
}

void processPendingMeshRestartAcks() {
  DynamicJsonDocument doc(2048);
  if (deserializeJson(doc, readPendingMeshRestartQueue()) || !doc.is<JsonArray>()) return;
  struct PendingMeshItem { String id; String target; uint32_t expiresAtEpoch; bool forwarded; bool accepted; };
  PendingMeshItem pending[MAX_MESH_NODES];
  int count = 0;
  for (JsonObject item : doc.as<JsonArray>()) {
    if (count >= MAX_MESH_NODES) break;
    pending[count].id = item["id"] | "";
    pending[count].target = item["target_board_identifier"] | "";
    pending[count].expiresAtEpoch = item["expires_at_epoch"] | 0;
    pending[count].forwarded = item["forwarded"] | false;
    pending[count].accepted = item["accepted_acknowledged"] | false;
    if (pending[count].id.length() && pending[count].target.length()) count++;
  }
  const time_t nowEpoch = time(nullptr);
  for (int i = 0; i < count; ++i) {
    if (pending[i].expiresAtEpoch > 0 && nowEpoch > 100000 &&
        static_cast<uint32_t>(nowEpoch) >= pending[i].expiresAtEpoch) {
      Serial.println("-> Removing expired mesh restart from the durable queue: " + pending[i].id);
      removePendingMeshRestart(pending[i].id);
      continue;
    }
    if (!pending[i].forwarded) {
      // A power cut may have happened after persisting but before dispatch.
      // Try delivery again only for an entry not confirmed by the member.
      forwardMeshRestart(pending[i].id, pending[i].target, pending[i].expiresAtEpoch);
      continue;
    }
    if (!pending[i].accepted) {
      if (acknowledgeDeviceCommand(pending[i].id, "accepted",
            "Restart request was accepted by the authenticated mesh member.",
            pending[i].target)) {
        setPendingMeshRestartAccepted(pending[i].id);
        pending[i].accepted = true;
      }
    }
    // The forwarder marks the node inactive at acceptance. It becomes active
    // again only after the member sends a fresh join/report after reboot.
    if (pending[i].accepted && meshNodeActive(pending[i].target)) {
      if (acknowledgeDeviceCommand(pending[i].id, "completed",
            "The selected mesh member rejoined after its restart.",
            pending[i].target)) {
        removePendingMeshRestart(pending[i].id);
        Serial.println("-> Mesh member restart completed: " + pending[i].target);
      }
    }
  }
}

bool forwardMeshRestart(const String& commandId, const String& targetBoardIdentifier, uint32_t expiresAtEpoch) {
  if (!commandId.length() || !targetBoardIdentifier.length() ||
      targetBoardIdentifier == String(BOARD_IDENTIFIER) || localRole != ROLE_LEADER) return false;
  const bool alreadyQueued = meshRestartQueued(commandId);
  if (alreadyQueued && meshRestartForwarded(commandId)) return true;

  const int slot = findMeshNode(targetBoardIdentifier);
  if (slot < 0 || millis() - meshNodes[slot].lastSeen > 45000) return false;
  if (!alreadyQueued && !storePendingMeshRestart(commandId, targetBoardIdentifier, expiresAtEpoch)) {
    Serial.println("-> Could not persist mesh restart state; refusing to restart member.");
    return false;
  }

  DynamicJsonDocument requestDoc(512);
  requestDoc["command_id"] = commandId;
  requestDoc["board_identifier"] = targetBoardIdentifier;
  requestDoc["signature"] = meshRestartSignature(commandId, targetBoardIdentifier);
  String payload;
  serializeJson(requestDoc, payload);

  HTTPClient http;
  http.begin("http://" + meshNodes[slot].ip + "/api/mesh/restart");
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(1800);
  const int code = http.POST(payload);
  const String responseBody = code >= 200 && code < 300 ? http.getString() : "";
  http.end();

  DynamicJsonDocument result(256);
  const bool accepted = (code == 202 || code == 200) &&
    !deserializeJson(result, responseBody) && (result["success"] | false);
  if (!accepted) {
    removePendingMeshRestart(commandId);
    Serial.printf("-> Mesh restart forward failed for %s (HTTP %d).\\n",
                  targetBoardIdentifier.c_str(), code);
    return false;
  }

  // Record successful HTTP acceptance before the cloud acknowledgement. If the
  // gateway reboots now, it must not reissue a new restart to this member.
  if (!markMeshRestartForwarded(commandId)) {
    Serial.println("-> Member accepted the restart, but delivery state could not be persisted; duplicate-safe retry will continue.");
  }

  // Mark inactive before making the cloud acknowledgement call, so a member
  // rejoin during that HTTPS call cannot be mistaken for pre-restart presence.
  const int currentSlot = findMeshNode(targetBoardIdentifier);
  if (currentSlot >= 0) {
    meshNodes[currentSlot].active = false;
    if (meshNodeCount > 0) meshNodeCount--;
  }
  if (acknowledgeDeviceCommand(commandId, "accepted",
        "Restart request was forwarded to the exact mesh member.",
        targetBoardIdentifier)) {
    setPendingMeshRestartAccepted(commandId);
  }
  Serial.println("-> Signed restart command forwarded to mesh member " + targetBoardIdentifier);
  return true;
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
  server.on("/", HTTP_GET, []() {
    handleCORS();
    server.send(200, "application/json",
      "{\"service\":\"VikaTech ESP32\",\"status\":\"ok\",\"setup\":\"managed from the admin panel\"}");
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

  server.on("/api/mesh/restart", HTTP_POST, []() {
    handleCORS();
    if (localRole != ROLE_MEMBER) {
      server.send(409, "application/json", "{\"success\":false,\"error\":\"Target is not a mesh member\"}");
      return;
    }
    DynamicJsonDocument req(512);
    if (!server.hasArg("plain") || deserializeJson(req, server.arg("plain"))) {
      server.send(400, "application/json", "{\"success\":false,\"error\":\"Invalid restart payload\"}");
      return;
    }
    const String commandId = req["command_id"] | "";
    const String targetBoardIdentifier = req["board_identifier"] | "";
    const String suppliedSignature = req["signature"] | "";
    bool validCommandId = commandId.length() == 36;
    for (int i = 0; i < 36 && validCommandId; ++i) {
      const char ch = commandId[i];
      const bool dashPosition = (i == 8 || i == 13 || i == 18 || i == 23);
      const bool isHex = (ch >= '0' && ch <= '9') ||
        (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F');
      if (dashPosition ? ch != '-' : !isHex) validCommandId = false;
    }
    if (!validCommandId || targetBoardIdentifier != String(BOARD_IDENTIFIER)) {
      server.send(403, "application/json", "{\"success\":false,\"error\":\"Command target does not match this board\"}");
      return;
    }
    const String expectedSignature = meshRestartSignature(commandId, targetBoardIdentifier);
    if (!meshRestartSignatureMatches(suppliedSignature, expectedSignature)) {
      server.send(401, "application/json", "{\"success\":false,\"error\":\"Invalid mesh command signature\"}");
      return;
    }

    String lastCommand;
    String pendingCommand;
    if (preferencesMutex) xSemaphoreTake(preferencesMutex, portMAX_DELAY);
    lastCommand = preferences.getString("mesh_rst_last", "");
    pendingCommand = preferences.getString("mesh_rst_pending", "");
    if (pendingCommand == commandId) {
      // The same accepted request is still queued in this boot; resume execution.
      pendingMeshRestartCommand = commandId;
      pendingMeshRestartAt = millis();
      pendingMeshRestart = true;
      if (preferencesMutex) xSemaphoreGive(preferencesMutex);
      server.send(202, "application/json", "{\"success\":true,\"duplicate\":true,\"pending\":true}");
      return;
    }
    if (lastCommand == commandId) {
      if (preferencesMutex) xSemaphoreGive(preferencesMutex);
      server.send(202, "application/json", "{\"success\":true,\"duplicate\":true}");
      return;
    }
    const uint32_t currentBoot = preferences.getUInt("boot_count", 0);
    preferences.putString("mesh_rst_last", commandId);
    preferences.putString("mesh_rst_pending", commandId);
    preferences.putUInt("mesh_rst_boot", currentBoot);
    if (preferencesMutex) xSemaphoreGive(preferencesMutex);

    pendingMeshRestartCommand = commandId;
    pendingMeshRestartAt = millis();
    pendingMeshRestart = true;
    server.send(202, "application/json", "{\"success\":true,\"accepted\":true}");
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
  if (strlen(MESH_SSID) == 0 || strlen(MESH_PASS) < 8) return false;
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
  if (strlen(MESH_SSID) == 0 || strlen(MESH_PASS) < 8) {
    localRole = ROLE_IDLE;
    Serial.println("-> Mesh is not provisioned; refusing to start a default or open AP.");
    return;
  }
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
    beginHomeWifiConnection("leader AP");
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
      if (homeWifiSecurity == "open") WiFi.begin(homeWifiSSID.c_str()); else WiFi.begin(homeWifiSSID.c_str(), homeWifiPassword.c_str());
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
    bool gotCloudState = false;
    bool cloudState = false;
    String cloudChangedAt;

    if (isDeviceAgentConfigured()) {
      DynamicJsonDocument requestDoc(512), response(512);
      requestDoc["action"] = "read_relay";
      requestDoc["relay_index"] = work.deviceIndex;
      if (sendDeviceAgentAction(requestDoc, response)) {
        gotCloudState = true;
        cloudState = response["is_on"] | false;
        cloudChangedAt = response["last_changed"] | "";
      }
    } else if (isDirectCloudConfigured()) {
      HTTPClient stateHttp;
      stateHttp.begin(String(SUPABASE_BASE) + "/devices?id=eq." +
                      deviceUUIDs[work.deviceIndex] + "&select=is_on,last_changed");
      configureHttp(stateHttp, 2000, 2000);
      stateHttp.addHeader("apikey", SUPABASE_SERVICE_KEY);
      stateHttp.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));
      if (stateHttp.GET() == 200) {
        DynamicJsonDocument stateDoc(384);
        if (!deserializeJson(stateDoc, stateHttp.getString()) && stateDoc.size() > 0) {
          gotCloudState = true;
          cloudState = stateDoc[0]["is_on"] | false;
          cloudChangedAt = stateDoc[0]["last_changed"].as<String>();
        }
      }
      stateHttp.end();
    }

    if (gotCloudState &&
        (cloudState == work.state || cloudStateSupersedesQueue(work, cloudChangedAt))) {
      if (cloudState != isRelayOn[work.deviceIndex]) setRelay(work.deviceIndex, cloudState);
      if (discardPendingRelayUpdate(work)) {
        Serial.printf("Skipped obsolete queued state for device %d.\\n", work.deviceIndex);
      }
      return true;
    }
  }

  const bool delivered = work.isFeedback
    ? updateFeedbackInDB(work.deviceIndex, work.state)
    : updateDeviceInDB(work.deviceIndex, work.state);
  if (!delivered) {
    Serial.printf("Cloud update pending for device %d; will retry.\\n", work.deviceIndex);
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
  configureTaskWatchdogForTls();
  logResetReason();
  Serial.println("\n===========================================");
  Serial.println("  ESP32 Dual-Plane Mesh Node (4 Devices)");
  Serial.println("===========================================");
  // CA-validated HTTPS handshakes are CPU-heavy on the ESP32. Keep the
  // standard 240 MHz clock so the device-agent task can finish TLS work
  // without starving the task watchdog.
  setCpuFrequencyMhz(240);
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
  deviceWebSocket.onEvent(handleDeviceGatewayEvent);
  if (homeWifiSSID.length() > 0) {
    Serial.print("-> Connecting to Home Wi-Fi: ");
    Serial.println(homeWifiSSID);
    beginHomeWifiConnection("boot");

    unsigned long wifiStart = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - wifiStart < 8000) {
      delay(250);
    }
    if (WiFi.status() == WL_CONNECTED) {
      Serial.print("-> Home Wi-Fi connected. IP: ");
      Serial.println(WiFi.localIP());
    } else {
      Serial.println("-> Home Wi-Fi unavailable; local AP will start.");
      diagnoseHomeWifiFailure();
    }
  } else {
    Serial.println("-> No Home Wi-Fi credentials configured; skipping STA scans.");
  }
  setupWebServer();
  maintainMdns();
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

  if (isDeviceAgentConfigured()) {
    BaseType_t agentTaskCreated = xTaskCreatePinnedToCore(
      deviceAgentTask,
      "device_agent",
      12288,
      nullptr,
      1,
      &deviceAgentTaskHandle,
      0
    );
    if (agentTaskCreated != pdPASS) {
      Serial.println("ERROR: Device agent task failed to start; remote restart/config updates are unavailable.");
    } else {
      Serial.println("-> Authenticated device-agent task started (remote config/restart).");
    }
  } else {
    Serial.println("-> Device agent not provisioned; remote config/restart unavailable until enrollment firmware is flashed.");
  }

  if (isDeviceGatewayConfigured()) {
    BaseType_t gatewayTaskCreated = xTaskCreatePinnedToCore(
      deviceGatewayTask,
      "device_gateway",
      12288,
      nullptr,
      1,
      &deviceGatewayTaskHandle,
      0
    );
    if (gatewayTaskCreated != pdPASS) {
      Serial.println("ERROR: WSS device gateway task failed to start; remote relay control is disabled.");
    } else {
      Serial.println("-> WSS device gateway task started; MQTT credentials are not used on the ESP32.");
    }
  } else {
    Serial.println("-> WSS device gateway not provisioned; discovery/token settings are missing.");
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
    if (homeWifiSecurity == "open") WiFi.begin(homeWifiSSID.c_str()); else WiFi.begin(homeWifiSSID.c_str(), homeWifiPassword.c_str());
    Serial.println("-> Home Wi-Fi connection started; local IP REST API remains enabled.");
  }
}
void loop() {
  server.handleClient();
  maintainMdns();
  if (pendingMeshRestart && millis() - pendingMeshRestartAt >= 650) {
    Serial.println("-> Signed remote mesh restart executing now.");
    ESP.restart();
  }
  if (!remoteWifiUpdateInProgress) applyPendingWifiConfiguration();
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
  if (!remoteWifiUpdateInProgress) evaluateLocalRole();
  if (!remoteWifiUpdateInProgress && !isHomeWifiConnected()) {
    if (localRole == ROLE_LEADER) {
      if (homeWifiSSID.length() > 0 && WiFi.status() != WL_CONNECTED &&
          millis() - lastLeaderWifiTry >= LEADER_WIFI_RETRY_INTERVAL) {
        lastLeaderWifiTry = millis();
        Serial.println("-> Retrying home Wi-Fi while preserving local AP...");
        beginHomeWifiConnection("leader retry");
      }
    } else if (localRole == ROLE_IDLE && homeWifiSSID.length() > 0 &&
               millis() - lastWifiRetry >= WIFI_RETRY_INTERVAL) {
      lastWifiRetry = millis();
      beginHomeWifiConnection("retry");
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
  if (isDeviceAgentConfigured()) {
    DynamicJsonDocument response(16384);
    if (requestDeviceAgentSnapshot(response)) applyDeviceSnapshot(response, true);
    return;
  }

  if (!isDirectCloudConfigured()) return;
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
        if (!updatePending && dbState != isRelayOn[rIndex]) {
          Serial.printf("Cloud desired state [%d] -> %s\n", rIndex, dbState ? "ON" : "OFF");
          setRelay(rIndex, dbState);
        }
      }
    }
  }
  http.end();
}
bool updateDeviceInDB(int index, bool state) {
  if (!isCloudConfigured() || index < 0 || index >= NUM_DEVICES || deviceUUIDs[index] == "") return false;
  if (isDeviceAgentConfigured()) {
    DynamicJsonDocument requestDoc(512), response(512);
    requestDoc["action"] = "set_relay";
    requestDoc["relay_index"] = index;
    requestDoc["state"] = state;
    return sendDeviceAgentAction(requestDoc, response) && (response["ok"] | false);
  }
  if (!isDirectCloudConfigured()) return false;

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
  if (isDeviceAgentConfigured()) {
    DynamicJsonDocument requestDoc(512), response(512);
    requestDoc["action"] = "set_feedback";
    requestDoc["relay_index"] = index;
    requestDoc["state"] = feedback;
    return sendDeviceAgentAction(requestDoc, response) && (response["ok"] | false);
  }
  if (!isDirectCloudConfigured()) return false;

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

  if (isDeviceAgentConfigured()) {
    DynamicJsonDocument response(16384);
    if (!requestDeviceAgentSnapshot(response)) return false;
    applyDeviceSnapshot(response, true);
    bool foundAny = false;
    for (int i = 0; i < NUM_DEVICES; ++i) if (deviceUUIDs[i].length()) foundAny = true;
    return boardUUID.length() > 0 && foundAny;
  }
  if (!isDirectCloudConfigured()) return false;

  HTTPClient http;
  http.begin(String(SUPABASE_BASE) + "/boards?board_identifier=eq." + BOARD_IDENTIFIER + "&select=id,user_id");
  configureHttp(http);
  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));
  if (http.GET() == 200) {
    DynamicJsonDocument doc(512);
    deserializeJson(doc, http.getString());
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
      DynamicJsonDocument doc(2048);
      deserializeJson(doc, http.getString());
      for (int i = 0; i < doc.size(); i++) {
        int rIndex = doc[i]["relay_index"];
        if (rIndex >= 0 && rIndex < NUM_DEVICES) {
          deviceUUIDs[rIndex] = doc[i]["id"].as<String>();
          String resolvedName = doc[i]["name"].as<String>();
          deviceNames[rIndex] = resolvedName.length() ? resolvedName : "Device " + String(rIndex + 1);
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
  if (!isCloudConfigured()) return false;
  if (isDeviceAgentConfigured()) {
    DynamicJsonDocument response(16384);
    if (!requestDeviceAgentSnapshot(response)) return false;
    applyDeviceSnapshot(response, true);
    int count = 0;
    for (int i = 0; i < NUM_DEVICES; ++i) if (deviceUUIDs[i].length()) count++;
    if (count == 0 || boardUUID.length() == 0) {
      Serial.println("-> Initial device-agent reconciliation returned no linked relay rows.");
      return false;
    }
    Serial.printf("-> Device-agent reconciled %d relay channels.\\n", count);
    return true;
  }
  if (!isDirectCloudConfigured() || boardUUID == "") return false;

  HTTPClient http;
  http.begin(String(SUPABASE_BASE) + "/devices?board_id=eq." + boardUUID + "&select=id,relay_index,is_on,last_changed");
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
    bool rowFound = false, cloudState = false;
    String cloudChangedAt;
    for (JsonObject row : doc.as<JsonArray>()) {
      if (row["id"].as<String>() == deviceUUIDs[i]) {
        rowFound = true;
        cloudState = row["is_on"] | false;
        cloudChangedAt = row["last_changed"].as<String>();
        break;
      }
    }
    if (!rowFound) { allSynced = false; continue; }

    PendingUpdate queued;
    bool updatePending = getPendingRelayUpdate(i, queued);
    if (updatePending && cloudState != queued.state && cloudStateSupersedesQueue(queued, cloudChangedAt)) {
      if (discardPendingRelayUpdate(queued)) Serial.printf("Discarded stale queued state for device %d during reconciliation.\\n", i);
      updatePending = getPendingRelayUpdate(i, queued);
    }
    const bool targetState = updatePending ? queued.state : cloudState;
    if (targetState != isRelayOn[i]) setRelay(i, targetState);
    reconciledDevices++;
  }
  return reconciledDevices > 0 && allSynced;
}
void pollAlarms() {
  if (!isCloudConfigured() || boardUUID == "") return;
  if (isDeviceAgentConfigured()) {
    DynamicJsonDocument requestDoc(512), response(8192);
    requestDoc["action"] = "poll_alarms";
    if (sendDeviceAgentAction(requestDoc, response)) applyAlarmSnapshot(response);
    return;
  }
  if (!isDirectCloudConfigured()) return;

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
    applyAlarmSnapshot(doc);
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
  if (isDeviceAgentConfigured()) {
    DynamicJsonDocument requestDoc(512), response(8192);
    requestDoc["action"] = "poll_schedules";
    if (sendDeviceAgentAction(requestDoc, response)) applyScheduleSnapshot(response);
    return;
  }
  if (!isDirectCloudConfigured()) return;

  String ids;
  for (int i = 0; i < NUM_DEVICES; ++i) if (deviceUUIDs[i].length()) {
    if (ids.length()) ids += ",";
    ids += "%22" + deviceUUIDs[i] + "%22";
  }
  if (!ids.length()) return;
  HTTPClient http;
  http.begin(String(SUPABASE_BASE) + "/schedules?device_id=in.(" + ids + ")&enabled=eq.true&select=id,device_id,action,time,days,enabled");
  configureHttp(http);
  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));
  int code = http.GET();
  String body = code == 200 ? http.getString() : "";
  http.end();
  if (code != 200) {
    Serial.printf("Schedule refresh failed (HTTP %d); using saved schedules.\\n", code);
    return;
  }
  DynamicJsonDocument doc(8192);
  if (deserializeJson(doc, body) || !doc.is<JsonArray>()) {
    Serial.println("Invalid schedules response; keeping saved cache.");
    return;
  }
  applyScheduleSnapshot(doc);
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
  if (isDeviceAgentConfigured()) {
    DynamicJsonDocument requestDoc(512), response(512);
    requestDoc["action"] = "claim_alarm";
    requestDoc["alarm_id"] = alarmId;
    if (!sendDeviceAgentAction(requestDoc, response)) return false;
    const bool claimed = response["claimed"] | false;
    if (claimed) Serial.println("Alarm atomically claimed through device agent.");
    return claimed;
  }
  if (!isDirectCloudConfigured()) return false;

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
  if (!claimed) Serial.printf("Alarm not claimed (HTTP %d); another executor may have claimed it or cloud is unavailable.\\n", code);
  return claimed;
}
bool logActivityInDB(int index, bool state, const String& triggeredBy) {
  if (!isCloudConfigured() || index < 0 || index >= NUM_DEVICES ||
      deviceUUIDs[index] == "") return false;
  if (isDeviceAgentConfigured()) {
    DynamicJsonDocument requestDoc(512), response(512);
    requestDoc["action"] = "log_activity";
    requestDoc["relay_index"] = index;
    requestDoc["state"] = state;
    requestDoc["triggered_by"] = triggeredBy;
    return sendDeviceAgentAction(requestDoc, response) && (response["ok"] | false);
  }
  if (!isDirectCloudConfigured() || boardUserUUID == "") return false;

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
  Serial.printf("Activity log insert failed for device %d (HTTP %d).\\n", index, code);
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
    if (security == "open") WiFi.begin(ssid.c_str());
    else WiFi.begin(ssid.c_str(), password.c_str());
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
  if (isDeviceAgentConfigured()) {
    // The agent snapshot refreshes last_seen automatically; this explicit action
    // also supports installations whose snapshot task is temporarily paused.
    DynamicJsonDocument requestDoc(256), response(512);
    requestDoc["action"] = "heartbeat";
    sendDeviceAgentAction(requestDoc, response);
    return;
  }
  if (!isDirectCloudConfigured()) return;

  String nowIso = getIsoTime();
  HTTPClient http;
  http.begin(String(SUPABASE_BASE) + "/boards?id=eq." + boardUUID);
  configureHttp(http);
  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));
  http.addHeader("Content-Type", "application/json");
  String payload = "{\"last_seen\":\"" + nowIso + "\"}";
  int httpCode = http.PATCH(payload);
  if (httpCode == 200 || httpCode == 204) Serial.println("Heartbeat synced to Cloud.");
  http.end();
}
bool deviceAgentPost(const String& payload, DynamicJsonDocument& response) {
  if (WiFi.status() != WL_CONNECTED || strlen(DEVICE_AGENT_URL) == 0 ||
      deviceAuthToken.length() < 32 || String(BOARD_IDENTIFIER) == "esp32-unconfigured") return false;

  // CA validation rejects certificates while the ESP32 clock is still near
  // the Unix epoch. The device-agent task starts NTP independently, but the
  // cloud worker can reach this function first; wait for a valid clock rather
  // than producing a misleading HTTP -1/TLS failure.
  static unsigned long lastNtpWaitLog = 0;
  if (time(nullptr) < 100000) {
    if (millis() - lastNtpWaitLog >= 30000) {
      lastNtpWaitLog = millis();
      Serial.println("-> Device-agent HTTPS waiting for NTP time before certificate verification.");
      configTime(0, 0, "pool.ntp.org", "time.google.com");
    }
    return false;
  }

  // Never use HTTPClient.begin(url) without a CA: Arduino-ESP32's convenience
  // overload can create an insecure TLS client. Require the core's trusted CA bundle.
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
  VikaTechSecureClient secureClient;
  secureClient.useBuiltinCACertBundle();
  secureClient.setHandshakeTimeout(8);
  HTTPClient http;
  if (!http.begin(secureClient, String(DEVICE_AGENT_URL))) {
    Serial.println("Device-agent HTTPS setup failed.");
    return false;
  }
  configureHttp(http, 3500, 6500);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", "Bearer " + deviceAuthToken);
  int code = http.POST(payload);
  String body = (code >= 200 && code < 300) ? http.getString() : "";
  char transportError[160] = {0};
  const int transportErrorCode = code < 0
    ? secureClient.lastError(transportError, sizeof(transportError))
    : 0;
  http.end();
  secureClient.stop();

  if (code < 200 || code >= 300) {
    Serial.printf("Device-agent HTTPS request failed (HTTP %d, transport %d: %s).\n",
                  code, transportErrorCode,
                  transportError[0] ? transportError : "no transport detail");
    return false;
  }
  DeserializationError err = deserializeJson(response, body);
  if (err) {
    Serial.println("Device-agent returned invalid JSON.");
    return false;
  }
  return true;
#else
  Serial.println("Device-agent disabled: update to Arduino-ESP32 core 3.x for validated HTTPS CA-bundle support.");
  return false;
#endif
}

bool reportDeviceConfigStatus(int version, const String& status, const String& error) {
  if (status == "failed") {
    if (preferencesMutex) xSemaphoreTake(preferencesMutex, portMAX_DELAY);
    preferences.putInt("failed_cfg_ver", version);
    preferences.putString("failed_cfg_msg", error);
    if (preferencesMutex) xSemaphoreGive(preferencesMutex);
  }

  DynamicJsonDocument requestDoc(768);
  requestDoc["action"] = "config_status";
  requestDoc["board_identifier"] = BOARD_IDENTIFIER;
  requestDoc["version"] = version;
  requestDoc["status"] = status;
  if (error.length()) requestDoc["error"] = error;
  String payload;
  serializeJson(requestDoc, payload);
  DynamicJsonDocument response(512);
  const bool reported = deviceAgentPost(payload, response) && (response["ok"] | false);

  // Preserve failed status locally when Wi-Fi is lost during a rollback. Retry
  // the report after the board regains connectivity, unless a newer config won.
  if (reported && status == "failed") {
    if (preferencesMutex) xSemaphoreTake(preferencesMutex, portMAX_DELAY);
    if (preferences.getInt("failed_cfg_ver", 0) == version) {
      preferences.remove("failed_cfg_ver");
      preferences.remove("failed_cfg_msg");
    }
    if (preferencesMutex) xSemaphoreGive(preferencesMutex);
  }
  return reported;
}

bool acknowledgeDeviceCommand(const String& commandId, const String& status, const String& error, const String& targetBoardIdentifier) {
  if (!commandId.length()) return false;
  DynamicJsonDocument requestDoc(768);
  requestDoc["action"] = "ack";
  requestDoc["board_identifier"] = BOARD_IDENTIFIER;
  requestDoc["command_id"] = commandId;
  requestDoc["status"] = status;
  if (error.length()) {
    requestDoc["error"] = error;
    requestDoc["message"] = error;
  }
  if (targetBoardIdentifier.length()) requestDoc["target_board_identifier"] = targetBoardIdentifier;
  String payload;
  serializeJson(requestDoc, payload);
  DynamicJsonDocument response(512);
  return deviceAgentPost(payload, response) && (response["ok"] | false);
}

bool applyRemoteWifiConfiguration(JsonObject configuration) {
  const int newVersion = configuration["version"] | 0;
  String newSSID = configuration["wifi_ssid"] | "";
  String newSecurity = configuration["wifi_security"] | "";
  String newPassword = configuration["wifi_password"] | "";
  newSSID.trim();

  int appliedVersion = 0;
  if (preferencesMutex) xSemaphoreTake(preferencesMutex, portMAX_DELAY);
  appliedVersion = preferences.getInt("cfg_ver", 0);
  if (preferencesMutex) xSemaphoreGive(preferencesMutex);
  if (newVersion <= appliedVersion) return true;
  if (newVersion <= 0 || newSSID.length() == 0 || newSSID.length() > 32 ||
      (newSecurity != "open" && newSecurity != "wpa2_psk") ||
      (newSecurity == "wpa2_psk" && (newPassword.length() < 8 || newPassword.length() > 63)) ||
      (newSecurity == "open" && newPassword.length() > 0)) {
    reportDeviceConfigStatus(newVersion, "failed", "Configuration fields failed validation.");
    return false;
  }

  remoteWifiUpdateInProgress = true;
  reportDeviceConfigStatus(newVersion, "checking_wifi");
  Serial.printf("-> Checking configured network '%s' before applying version %d.\\n",
                newSSID.c_str(), newVersion);

  // Check visibility before leaving the currently working network.
  // Hidden SSIDs are not supported in this initial update flow.
  int networkCount = WiFi.scanNetworks(false, true);
  bool ssidFound = false;
  for (int i = 0; i < networkCount; ++i) {
    if (WiFi.SSID(i) == newSSID) { ssidFound = true; break; }
  }
  WiFi.scanDelete();
  if (!ssidFound) {
    reportDeviceConfigStatus(newVersion, "failed", "Requested Wi-Fi network was not found by the ESP32 scan.");
    remoteWifiUpdateInProgress = false;
    return false;
  }

  const String oldSSID = homeWifiSSID;
  const String oldPassword = homeWifiPassword;
  const String oldSecurity = homeWifiSecurity;

  reportDeviceConfigStatus(newVersion, "applying");
  WiFi.disconnect(false, false);
  delay(250);
  if (newSecurity == "open") WiFi.begin(newSSID.c_str());
  else WiFi.begin(newSSID.c_str(), newPassword.c_str());

  const unsigned long connectStart = millis();
  bool connectedToNew = false;
  while (millis() - connectStart < 18000) {
    if (WiFi.status() == WL_CONNECTED && WiFi.SSID() == newSSID) {
      connectedToNew = true;
      break;
    }
    vTaskDelay(pdMS_TO_TICKS(250));
  }

  if (!connectedToNew) {
    Serial.println("-> New Wi-Fi failed; attempting rollback to last known-good network.");
    WiFi.disconnect(false, false);
    delay(250);
    if (oldSSID.length()) {
      if (oldSecurity == "open") WiFi.begin(oldSSID.c_str());
      else WiFi.begin(oldSSID.c_str(), oldPassword.c_str());
      const unsigned long rollbackStart = millis();
      while (millis() - rollbackStart < 15000) {
        if (WiFi.status() == WL_CONNECTED && WiFi.SSID() == oldSSID) break;
        vTaskDelay(pdMS_TO_TICKS(250));
      }
    }

    const bool oldNetworkRestored =
      oldSSID.length() && WiFi.status() == WL_CONNECTED && WiFi.SSID() == oldSSID;
    const String failureMessage = oldNetworkRestored
      ? "New Wi-Fi failed; previous network restored."
      : "New Wi-Fi failed and the previous network could not be restored; manual re-enrollment may be required.";

    // reportDeviceConfigStatus stores the failure in NVS before attempting the
    // HTTPS report. If rollback also failed, this marker survives until the
    // device regains connectivity, preventing the admin tracker from remaining
    // indefinitely at "applying".
    reportDeviceConfigStatus(newVersion, "failed", failureMessage);
    if (!oldNetworkRestored) {
      Serial.println("!! Could not restore Wi-Fi. Previous settings remain cached; local AP recovery may be required.");
    }
    remoteWifiUpdateInProgress = false;
    return false;
  }

  if (preferencesMutex) xSemaphoreTake(preferencesMutex, portMAX_DELAY);
  homeWifiSSID = newSSID;
  homeWifiPassword = newPassword;
  homeWifiSecurity = newSecurity;
  preferences.putString("wifi_ssid", homeWifiSSID);
  preferences.putString("wifi_pass", homeWifiPassword);
  preferences.putString("wifi_sec", homeWifiSecurity);
  preferences.putInt("cfg_ver", newVersion);
  preferences.putBool("wifi_registered", true);
  if (preferencesMutex) xSemaphoreGive(preferencesMutex);

  Serial.printf("-> Wi-Fi connected; configuration version %d saved to NVS.\\n", newVersion);
  reportDeviceConfigStatus(newVersion, "applied");
  remoteWifiUpdateInProgress = false;
  return true;
}

bool decodeDeviceBase64Url(const String& value, std::vector<uint8_t>& output) {
  if (value.length() == 0 || value.length() > 8192) return false;
  String normalized = value;
  normalized.replace('-', '+');
  normalized.replace('_', '/');
  while ((normalized.length() % 4) != 0) normalized += '=';

  const size_t capacity = (normalized.length() * 3) / 4 + 4;
  std::vector<uint8_t> decoded(capacity);
  size_t decodedLength = 0;
  int result = mbedtls_base64_decode(
    decoded.data(), decoded.size(), &decodedLength,
    reinterpret_cast<const unsigned char*>(normalized.c_str()),
    normalized.length()
  );
  if (result != 0 || decodedLength == 0) return false;
  decoded.resize(decodedLength);
  output.swap(decoded);
  return true;
}

bool decryptDeviceConfigEnvelope(
  JsonObject envelope,
  uint32_t expectedVersion,
  DynamicJsonDocument& decrypted
) {
  const String scheme = envelope["scheme"] | "";
  const int schemaVersion = envelope["schema_version"] | 0;
  const uint32_t envelopeVersion = envelope["config_version"] | 0;
  const String ivText = envelope["iv"] | "";
  const String ciphertextText = envelope["ciphertext"] | "";

  if (scheme != "A256GCM" || schemaVersion != 1 ||
      expectedVersion == 0 || envelopeVersion != expectedVersion ||
      String(BOARD_IDENTIFIER) == "esp32-unconfigured" ||
      deviceAuthToken.length() < 32 || ivText.length() == 0 || ciphertextText.length() == 0) {
    Serial.println("-> Configuration envelope metadata did not match this board or version.");
    return false;
  }

  std::vector<uint8_t> iv;
  std::vector<uint8_t> ciphertextAndTag;
  if (!decodeDeviceBase64Url(ivText, iv) ||
      !decodeDeviceBase64Url(ciphertextText, ciphertextAndTag) ||
      iv.size() != 12 || ciphertextAndTag.size() <= 16) {
    Serial.println("-> Configuration envelope encoding is invalid.");
    return false;
  }

  // This derivation and AAD must match supabase/functions/_shared/device-config-crypto.mjs.
  const String keyMaterial = "vikatech-device-config-v1:" + deviceAuthToken;
  uint8_t key[32] = {0};
  const mbedtls_md_info_t* sha256 = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  if (!sha256 || mbedtls_md(
        sha256,
        reinterpret_cast<const unsigned char*>(keyMaterial.c_str()),
        keyMaterial.length(),
        key
      ) != 0) {
    Serial.println("-> Could not derive device-specific configuration key.");
    return false;
  }

  const String additionalData = "VikaTech-ESP32-Config-v1|" +
    String(BOARD_IDENTIFIER) + "|" + String(expectedVersion);
  const size_t tagLength = 16;
  const size_t ciphertextLength = ciphertextAndTag.size() - tagLength;
  const uint8_t* tag = ciphertextAndTag.data() + ciphertextLength;
  std::vector<uint8_t> plaintext(ciphertextLength + 1, 0);

  mbedtls_gcm_context context;
  mbedtls_gcm_init(&context);
  int result = mbedtls_gcm_setkey(&context, MBEDTLS_CIPHER_ID_AES, key, 256);
  if (result == 0) {
    result = mbedtls_gcm_auth_decrypt(
      &context,
      ciphertextLength,
      iv.data(), iv.size(),
      reinterpret_cast<const unsigned char*>(additionalData.c_str()),
      additionalData.length(),
      tag, tagLength,
      ciphertextAndTag.data(),
      plaintext.data()
    );
  }
  mbedtls_gcm_free(&context);
  memset(key, 0, sizeof(key));

  if (result != 0) {
    Serial.println("-> Configuration envelope authentication failed; settings were not applied.");
    return false;
  }

  plaintext[ciphertextLength] = 0;
  DeserializationError parseError = deserializeJson(decrypted, plaintext.data(), ciphertextLength);
  if (parseError || !decrypted.is<JsonObject>() ||
      (decrypted["version"] | 0) != expectedVersion) {
    decrypted.clear();
    Serial.println("-> Decrypted configuration JSON or version is invalid.");
    return false;
  }
  return true;
}

void processDeviceAgentResponse(JsonDocument& response) {
  // Report a configuration failure saved locally during an outage/failed rollback.
  // A newer server version supersedes the old failure marker.
  int failedVersion = 0;
  String failedMessage;
  if (preferencesMutex) xSemaphoreTake(preferencesMutex, portMAX_DELAY);
  failedVersion = preferences.getInt("failed_cfg_ver", 0);
  failedMessage = preferences.getString("failed_cfg_msg", "The ESP32 could not apply the Wi-Fi configuration.");
  if (preferencesMutex) xSemaphoreGive(preferencesMutex);
  const int serverConfigVersion = response["server_config_version"] | 0;
  if (failedVersion > 0 && serverConfigVersion > failedVersion) {
    if (preferencesMutex) xSemaphoreTake(preferencesMutex, portMAX_DELAY);
    preferences.remove("failed_cfg_ver");
    preferences.remove("failed_cfg_msg");
    if (preferencesMutex) xSemaphoreGive(preferencesMutex);
    failedVersion = 0;
  }
  if (failedVersion > 0 && failedVersion == serverConfigVersion) {
    reportDeviceConfigStatus(failedVersion, "failed", failedMessage);
  }

  applyDeviceSnapshot(response, true);
  applyAlarmSnapshot(response);
  applyScheduleSnapshot(response);
  // A restart requested before the previous reboot is acknowledged only after boot.
  String pendingRestart = "";
  String completedRestartId = "";
  String lastRestartId = "";
  if (preferencesMutex) xSemaphoreTake(preferencesMutex, portMAX_DELAY);
  pendingRestart = preferences.getString("pending_restart", "");
  lastRestartId = preferences.getString("last_restart_cmd", "");
  if (preferencesMutex) xSemaphoreGive(preferencesMutex);
  if (pendingRestart.length() && acknowledgeDeviceCommand(pendingRestart, "completed")) {
    // The snapshot was read before the acknowledgement, so it may still carry
    // this command. Do not execute the just-completed restart a second time.
    completedRestartId = pendingRestart;
    if (preferencesMutex) xSemaphoreTake(preferencesMutex, portMAX_DELAY);
    preferences.remove("pending_restart");
    if (preferencesMutex) xSemaphoreGive(preferencesMutex);
    Serial.println("-> Remote restart acknowledged after boot.");
    pendingRestart = "";
  }

  // The device-agent returns an AES-GCM envelope bound to this board and
  // configuration version. Authenticate/decrypt it before applying any secret.
  int localConfigVersionForEnvelope = 0;
  if (preferencesMutex) xSemaphoreTake(preferencesMutex, portMAX_DELAY);
  localConfigVersionForEnvelope = preferences.getInt("cfg_ver", 0);
  if (preferencesMutex) xSemaphoreGive(preferencesMutex);

  bool configurationEnvelopeFailed = false;
  JsonObject configurationEnvelope = response["configuration_envelope"].as<JsonObject>();
  if (!configurationEnvelope.isNull()) {
    DynamicJsonDocument decryptedConfiguration(2048);
    if (decryptDeviceConfigEnvelope(
          configurationEnvelope,
          static_cast<uint32_t>(serverConfigVersion),
          decryptedConfiguration
        )) {
      applyRemoteWifiConfiguration(decryptedConfiguration.as<JsonObject>());
    } else {
      configurationEnvelopeFailed = true;
      lastDeviceError = "Encrypted Wi-Fi configuration could not be authenticated.";
      if (serverConfigVersion > 0) {
        reportDeviceConfigStatus(serverConfigVersion, "failed", lastDeviceError);
      }
      Serial.println("-> Refused Wi-Fi update because its encrypted envelope was invalid.");
    }
  } else if (serverConfigVersion > 0 &&
             serverConfigVersion > localConfigVersionForEnvelope &&
             (response["server_config_status"] == "pending" ||
              response["server_config_status"] == "sending" ||
              response["server_config_status"] == "checking_wifi" ||
              response["server_config_status"] == "applying")) {
    configurationEnvelopeFailed = true;
    lastDeviceError = "Device-agent marked a Wi-Fi update pending but returned no encrypted configuration.";
    reportDeviceConfigStatus(serverConfigVersion, "failed", lastDeviceError);
    Serial.println("-> Refused an incomplete device-agent configuration response.");
  }

  int cachedConfigVersion = 0;
  if (preferencesMutex) xSemaphoreTake(preferencesMutex, portMAX_DELAY);
  cachedConfigVersion = preferences.getInt("cfg_ver", 0);
  if (preferencesMutex) xSemaphoreGive(preferencesMutex);
  const String serverConfigStatus = response["server_config_status"] | "";
  if (!configurationEnvelopeFailed && serverConfigVersion > 0 &&
      cachedConfigVersion == serverConfigVersion &&
      (serverConfigStatus == "pending" || serverConfigStatus == "sending" ||
       serverConfigStatus == "checking_wifi" || serverConfigStatus == "applying")) {
    reportDeviceConfigStatus(serverConfigVersion, "applied", "");
  }

  if (localRole == ROLE_LEADER) processPendingMeshRestartAcks();

  JsonArray commands = response["commands"].as<JsonArray>();
  for (JsonObject command : commands) {
    String commandId = command["id"] | "";
    String type = command["command_type"] | "";
    String targetBoard = command["board_identifier"] | "";
    if (targetBoard.length() == 0 || commandId.length() == 0 || type != "restart") {
      Serial.println("-> Ignoring malformed remote command.");
      continue;
    }
    if (targetBoard != String(BOARD_IDENTIFIER)) {
      if (localRole == ROLE_LEADER) {
        const uint32_t expiresAtEpoch = command["expires_at_epoch"] | 0;
        forwardMeshRestart(commandId, targetBoard, expiresAtEpoch);
      } else {
        Serial.println("-> Ignoring command addressed to another mesh board.");
      }
      continue;
    }
    if (commandId == pendingRestart || commandId == completedRestartId || commandId == lastRestartId) continue;

    Serial.println("-> Remote restart command received; confirming before reboot.");
    if (preferencesMutex) xSemaphoreTake(preferencesMutex, portMAX_DELAY);
    preferences.putString("pending_restart", commandId);
    if (preferencesMutex) xSemaphoreGive(preferencesMutex);

    if (!acknowledgeDeviceCommand(commandId, "accepted")) {
      if (preferencesMutex) xSemaphoreTake(preferencesMutex, portMAX_DELAY);
      preferences.remove("pending_restart");
      if (preferencesMutex) xSemaphoreGive(preferencesMutex);
      Serial.println("Remote restart acknowledgement failed; command will be retried.");
      continue;
    }
    if (preferencesMutex) xSemaphoreTake(preferencesMutex, portMAX_DELAY);
    preferences.putString("last_restart_cmd", commandId);
    if (preferencesMutex) xSemaphoreGive(preferencesMutex);
    delay(350);
    ESP.restart();
    return;
  }
}


bool sendDeviceAgentAction(DynamicJsonDocument& requestDoc, DynamicJsonDocument& response) {
  if (!isDeviceAgentConfigured()) return false;
  requestDoc["board_identifier"] = BOARD_IDENTIFIER;
  String payload;
  serializeJson(requestDoc, payload);
  return deviceAgentPost(payload, response) && (response["ok"] | false);
}

bool requestDeviceAgentSnapshot(DynamicJsonDocument& response) {
  DynamicJsonDocument requestDoc(1536);
  requestDoc["action"] = "poll";
  requestDoc["board_identifier"] = BOARD_IDENTIFIER;

  // The first authenticated poll may include the current passphrase so the
  // server can register an existing installation. Later polls include only
  // non-secret network and boot metadata.
  bool wifiRegistered = false;
  int appliedVersion = 0;
  String currentWifiSSID;
  String currentWifiPassword;
  String currentWifiSecurity;
  if (preferencesMutex) xSemaphoreTake(preferencesMutex, portMAX_DELAY);
  wifiRegistered = preferences.getBool("wifi_registered", false);
  appliedVersion = preferences.getInt("cfg_ver", 0);
  currentWifiSSID = homeWifiSSID;
  currentWifiPassword = homeWifiPassword;
  currentWifiSecurity = homeWifiSecurity;
  if (preferencesMutex) xSemaphoreGive(preferencesMutex);
  if (currentWifiSSID.length()) {
    requestDoc["current_wifi_ssid"] = currentWifiSSID;
    requestDoc["current_wifi_security"] = currentWifiSecurity;
    if (!wifiRegistered && currentWifiSecurity == "wpa2_psk") requestDoc["current_wifi_password"] = currentWifiPassword;
  }
  requestDoc["applied_config_version"] = appliedVersion;
  requestDoc["boot_id"] = deviceBootId;
  requestDoc["uptime_ms"] = millis();
  requestDoc["ip"] = WiFi.localIP().toString();
  requestDoc["mesh_gateway"] = localRole == ROLE_LEADER;

  if (localRole == ROLE_LEADER) {
    JsonArray nodes = requestDoc.createNestedArray("mesh_nodes");
    for (int i = 0; i < MAX_MESH_NODES; ++i) {
      if (!meshNodes[i].active) continue;
      const unsigned long lastSeenMs = millis() - meshNodes[i].lastSeen;
      if (lastSeenMs > 45000) continue;
      JsonObject node = nodes.createNestedObject();
      node["node_id"] = meshNodes[i].nodeId;
      node["last_seen_ms"] = lastSeenMs;
    }
  }

  String payload;
  serializeJson(requestDoc, payload);
  const bool ok = deviceAgentPost(payload, response) && (response["ok"] | false);
  if (ok && (response["wifi_config_registered"] | false)) {
    if (preferencesMutex) xSemaphoreTake(preferencesMutex, portMAX_DELAY);
    preferences.putBool("wifi_registered", true);
    if (preferencesMutex) xSemaphoreGive(preferencesMutex);
  }
  return ok;
}

void applyDeviceSnapshot(JsonDocument& response, bool applyRelayStates) {
  const String incomingBoardId = response["board_id"] | "";
  const String incomingUserId = response["user_id"] | "";
  if (incomingBoardId.length()) boardUUID = incomingBoardId;
  if (incomingUserId.length()) boardUserUUID = incomingUserId;

  JsonArray rows = response["devices"].as<JsonArray>();
  if (rows.isNull()) return;

  String nextIds[NUM_DEVICES] = {"", "", "", ""};
  String nextNames[NUM_DEVICES] = {"Device 1", "Device 2", "Device 3", "Device 4"};
  bool nextStates[NUM_DEVICES] = {false, false, false, false};
  String changedAt[NUM_DEVICES] = {"", "", "", ""};

  for (JsonObject row : rows) {
    const int relayIndex = row["relay_index"] | -1;
    const String id = row["id"] | "";
    if (relayIndex < 0 || relayIndex >= NUM_DEVICES || id.length() == 0) continue;
    nextIds[relayIndex] = id;
    const String name = row["name"] | "";
    nextNames[relayIndex] = name.length() ? name : "Device " + String(relayIndex + 1);
    nextStates[relayIndex] = row["is_on"] | false;
    changedAt[relayIndex] = row["last_changed"] | "";
  }

  bool foundAny = false;
  for (int i = 0; i < NUM_DEVICES; ++i) {
    deviceUUIDs[i] = nextIds[i];
    deviceNames[i] = nextNames[i];
    if (deviceUUIDs[i].length()) foundAny = true;
  }
  if (!boardUUID.length() || !foundAny) {
    cloudDevicesReady = false;
    return;
  }

  if (applyRelayStates) {
    for (int i = 0; i < NUM_DEVICES; ++i) {
      if (deviceUUIDs[i].length() == 0) continue;
      PendingUpdate queued;
      bool updatePending = getPendingRelayUpdate(i, queued);
      if (updatePending && nextStates[i] != queued.state &&
          cloudStateSupersedesQueue(queued, changedAt[i])) {
        if (discardPendingRelayUpdate(queued)) {
          Serial.printf("Discarded obsolete queued relay state for device %d; server state is newer.\\n", i);
        }
        updatePending = getPendingRelayUpdate(i, queued);
      }
      const bool targetState = updatePending ? queued.state : nextStates[i];
      if (targetState != isRelayOn[i]) {
        Serial.printf("Device-agent desired state [%d] -> %s\\n", i, targetState ? "ON" : "OFF");
        setRelay(i, targetState);
      }
    }
  }
  cloudDevicesReady = true;
}

void applyAlarmSnapshot(JsonDocument& response) {
  JsonArray rows = response["alarms"].as<JsonArray>();
  if (rows.isNull()) return;
  for (int i = 0; i < MAX_ALARMS; ++i) alarms[i].active = false;
  int count = 0;
  for (JsonObject row : rows) {
    if (count >= MAX_ALARMS) break;
    const String alarmId = row["id"] | "";
    const String deviceId = row["device_id"] | "";
    const String trigger = row["trigger_at"] | "";
    if (!alarmId.length() || !deviceId.length() || trigger.length() < 19) continue;
    int deviceIndex = -1;
    for (int d = 0; d < NUM_DEVICES; ++d) {
      if (deviceUUIDs[d] == deviceId) { deviceIndex = d; break; }
    }
    if (deviceIndex < 0) continue;
    alarms[count].id = alarmId;
    alarms[count].triggerAt = trigger.substring(0, 19);
    alarms[count].action = row["action"] | false;
    alarms[count].deviceIndex = deviceIndex;
    alarms[count].active = !(row["fired"] | false);
    ++count;
  }
}

void applyScheduleSnapshot(JsonDocument& response) {
  JsonArray rows = response["schedules"].as<JsonArray>();
  if (rows.isNull()) return;

  Schedule updated[MAX_SCHEDULES];
  int count = 0;
  bool changed = false;
  for (JsonObject row : rows) {
    if (count >= MAX_SCHEDULES) break;
    const String scheduleId = row["id"] | "";
    const String deviceId = row["device_id"] | "";
    if (!scheduleId.length() || !deviceId.length()) continue;

    Schedule& item = updated[count++];
    item.id = scheduleId;
    item.deviceId = deviceId;
    item.time = row["time"] | "00:00:00";
    item.action = row["action"] | false;
    item.enabled = row["enabled"] | true;
    item.days = "";
    item.lastRunDate = "";
    item.deviceIndex = -1;
    if (row["days"].is<JsonArray>()) {
      for (JsonVariant day : row["days"].as<JsonArray>()) {
        if (item.days.length()) item.days += ",";
        item.days += day.as<String>();
      }
    } else {
      item.days = row["days"] | "";
    }

    for (int d = 0; d < NUM_DEVICES; ++d) {
      if (deviceUUIDs[d] == item.deviceId) { item.deviceIndex = d; break; }
    }

    bool matchedExisting = false;
    for (int old = 0; old < scheduleCount; ++old) {
      if (schedules[old].id != item.id) continue;
      matchedExisting = true;
      item.lastRunDate = schedules[old].lastRunDate;
      if (schedules[old].deviceId != item.deviceId ||
          schedules[old].time != item.time ||
          schedules[old].days != item.days ||
          schedules[old].action != item.action ||
          schedules[old].enabled != item.enabled ||
          schedules[old].deviceIndex != item.deviceIndex) {
        changed = true;
      }
      break;
    }
    if (!matchedExisting) changed = true;
  }

  if (count != scheduleCount) changed = true;
  for (int old = 0; old < scheduleCount; ++old) {
    bool stillExists = false;
    for (int i = 0; i < count; ++i) {
      if (updated[i].id == schedules[old].id) { stillExists = true; break; }
    }
    if (!stillExists) { changed = true; break; }
  }

  scheduleCount = count;
  for (int i = 0; i < count; ++i) schedules[i] = updated[i];
  // Device snapshots arrive every 10 seconds; write NVS only if the schedule
  // definition actually changed to avoid unnecessary flash wear.
  if (changed) saveScheduleCache();
}
void deviceAgentTask(void* parameter) {
  (void)parameter;
  unsigned long lastAttempt = 0;
  bool deviceAgentNtpRequested = false;
  for (;;) {
    if (WiFi.status() != WL_CONNECTED || String(BOARD_IDENTIFIER) == "esp32-unconfigured" ||
        !isDeviceAgentConfigured()) {
      vTaskDelay(pdMS_TO_TICKS(1000));
      continue;
    }
    // CA-validated HTTPS needs a sensible clock to check certificate dates.
    // Start NTP here rather than waiting for the legacy cloud worker's 30s cadence.
    if (time(nullptr) < 100000) {
      if (!deviceAgentNtpRequested) {
        setenv("TZ", "IST-5:30", 1);
        tzset();
        configTime(0, 0, "pool.ntp.org", "time.google.com");
        deviceAgentNtpRequested = true;
      }
      vTaskDelay(pdMS_TO_TICKS(1000));
      continue;
    }
    if (millis() - lastAttempt >= 10000) {
      lastAttempt = millis();
      DynamicJsonDocument response(16384);
      if (requestDeviceAgentSnapshot(response)) {
        processDeviceAgentResponse(response);
      }
    }
    vTaskDelay(pdMS_TO_TICKS(250));
  }
}


void cloudSyncTask(void* parameter) {
  (void)parameter;
  unsigned long lastNtpAttempt = 0;
  unsigned long lastResolveAttempt = 0;
  unsigned long lastCloudAlarmPoll = 0;
  unsigned long lastCloudHeartbeat = 0;
  unsigned long nextQueueAttempt = 0;
  unsigned long queueRetryDelay = 2000;
  unsigned long lastDeviceHeartbeatAttempt = millis() - 15000;
  unsigned long lastDeviceCommandPoll = millis() - 5000;
  unsigned long lastDeviceConfigPoll = millis() - 30000;
  loadScheduleCache();
  for (;;) {
    runLocalSchedules();

    // Secure device-management APIs use a per-board credential and do not
    // require the legacy Supabase service-role key embedded by older builds.
    // Run the older PR #7 API path only on legacy firmware. Newly enrolled
    // boards use the device-agent path above and must not execute two command
    // pipelines in parallel.
    if (!isDeviceAgentConfigured() && isHomeWifiConnected() && deviceAuthToken.length()) {
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
        Serial.println(isDeviceAgentConfigured()
          ? "-> Device-agent snapshots active; legacy direct polling is disabled."
          : "-> Cloud state reconciled; cloud polling enabled.");
        cloudDevicesReady = true;
      } else {
        Serial.println("-> Initial relay-state reconciliation failed; cloud polling paused.");
        vTaskDelay(pdMS_TO_TICKS(3000));
        continue;
      }
    }
    if (boardUUID != "") {
      if (!isDeviceAgentConfigured() && millis() - lastSchedulePoll >= SCHEDULE_POLL_INTERVAL) {
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
        if (!isDeviceAgentConfigured() && millis() - lastCloudAlarmPoll >= ALARM_POLL_INTERVAL) {
          lastCloudAlarmPoll = millis();
          pollAlarms();
        }
        if (!isDeviceAgentConfigured() && millis() - lastCloudHeartbeat >= HEARTBEAT_INTERVAL) {
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
    if (!isDeviceAgentConfigured()) pollDatabase();
    vTaskDelay(pdMS_TO_TICKS(POLL_INTERVAL));
  }
}
