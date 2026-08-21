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
// ============================================================
<<<<<<< HEAD
const char* ssid     = "";
const char* password = "";

const char* BOARD_IDENTIFIER = "test_1_board";
const char* SUPABASE_BASE = "YOu_url_here";
const char* SUPABASE_SERVICE_KEY = "you_key_here"; 

// SoftAP Configuration for Offline Autonomous Control
const char* AP_SSID = "HOME-AUTO-LEADER";
const char* AP_PASS = "12345678"; // Min 8 chars for WPA2
IPAddress AP_IP(192, 168, 4, 1);
IPAddress AP_GATEWAY(192, 168, 4, 1);
IPAddress AP_SUBNET(255, 255, 255, 0);
=======
const char* ssid     = "You-wifi_anme";
const char* password = "you_Password";

const char* BOARD_IDENTIFIER = "you_board_identifier";
const char* SUPABASE_BASE = "you_api_key_here";
const char* SUPABASE_SERVICE_KEY = "you_key_here"; 
>>>>>>> 21b6d4f91f39143be1c452e38bd4eb943f7a0728

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
const unsigned long SERIAL_DUMP_INTERVAL = 5000; 

WiFiMulti wifiMulti;
WebServer server(80);
Preferences preferences;

// HTTP Cloud Polling
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

// Function Prototypes
void setRelay(int index, bool on, bool saveToNVS = true);
void updateDeviceInDB(int index, bool state);
void updateFeedbackInDB(int index, bool feedback);
void markAlarmFiredInDB(String alarmId);
void pollDatabase();
void pollAlarms();
void sendHeartbeat();
bool resolveBoardAndDevices();
void fetchInitialState();
void setupWebServer();
void handleDeviceToggle(int rIndex);
void enqueueOfflineUpdate(int index, bool state, bool isFeedback);
void flushOfflineQueue();
String getIsoTime();

// ============================================================
//  setRelay – Direct GPIO & NVS Control
// ============================================================
void setRelay(int index, bool on, bool saveToNVS) {
  if (index < 0 || index >= NUM_DEVICES) return;
  
  isRelayOn[index] = on;
  
  if (on) {
    digitalWrite(RELAY_PINS[index], LOW);  // Active-LOW ON
  } else {
    digitalWrite(RELAY_PINS[index], HIGH); // OFF
  }
  
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
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
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
      <p class="sub">SoftAP Leader: 192.168.4.1 &bull; Sub-100ms Response</p>
    </header>

    <div class="quick-bar">
      <button class="btn-quick" onclick="toggleAll(true)">⚡ Turn All ON</button>
      <button class="btn-quick" onclick="toggleAll(false)">🌑 Turn All OFF</button>
    </div>

    <div class="grid" id="devices-grid">
      <!-- Dynamic Devices -->
    </div>

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
              <span class="dev-name">Device ${d.relay_index + 1}</span>
              <span class="feedback-pill ${d.feedback_on ? 'active' : ''}">
                ${d.feedback_on ? 'AC ON' : 'AC OFF'}
              </span>
            </div>
            <button class="btn-toggle" onclick="toggleDevice(${d.relay_index}, ${!d.is_on})">
              ${d.is_on ? 'TURN OFF' : 'TURN ON'}
            </button>
          </div>
        `).join('');
      } catch (e) {
        console.error('Failed to fetch devices', e);
      }
    }

    async function toggleDevice(index, targetState) {
      try {
        await fetch(`/api/device/${index}/state`, {
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
    setInterval(loadStatus, 2000);
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

  if (WiFi.status() == WL_CONNECTED && boardUUID != "") {
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
    DynamicJsonDocument doc(256);
    doc["online"] = true;
    doc["status"] = "ok";
    doc["role"] = "leader";
    doc["nodeId"] = BOARD_IDENTIFIER;
    doc["ip"] = WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : WiFi.softAPIP().toString();
    doc["ap_ip"] = WiFi.softAPIP().toString();
    doc["devicesCount"] = NUM_DEVICES;
    doc["stationConnected"] = (WiFi.status() == WL_CONNECTED);
    
    String res;
    serializeJson(doc, res);
    server.send(200, "application/json", res);
  });

  // REST API: GET All Device States
  server.on("/api/devices", HTTP_GET, []() {
    handleCORS();
    DynamicJsonDocument doc(1024);
    JsonArray arr = doc.to<JsonArray>();
    
    for (int i = 0; i < NUM_DEVICES; i++) {
      JsonObject dev = arr.createNestedObject();
      dev["id"] = i;
      dev["relay_index"] = i;
      dev["is_on"] = isRelayOn[i];
      dev["feedback_on"] = (confirmedInputState[i] == LOW);
    }
    
    String res;
    serializeJson(arr, res);
    server.send(200, "application/json", res);
  });

  // REST API: Individual Device State Endpoints (Works on all ESP32 Core versions without UriRegex)
  server.on("/api/device/0/state", HTTP_POST, []() { handleDeviceToggle(0); });
  server.on("/api/device/1/state", HTTP_POST, []() { handleDeviceToggle(1); });
  server.on("/api/device/2/state", HTTP_POST, []() { handleDeviceToggle(2); });
  server.on("/api/device/3/state", HTTP_POST, []() { handleDeviceToggle(3); });

  // REST API: POST /api/all/on or /api/all/off
  server.on("/api/all/on", HTTP_POST, []() {
    handleCORS();
    for (int i = 0; i < NUM_DEVICES; i++) {
      setRelay(i, true);
      if (WiFi.status() == WL_CONNECTED && boardUUID != "") {
        updateDeviceInDB(i, true);
      } else {
        enqueueOfflineUpdate(i, true, false);
      }
    }
    server.send(200, "application/json", "{\"success\":true,\"action\":\"all_on\"}");
  });

  server.on("/api/all/off", HTTP_POST, []() {
    handleCORS();
    for (int i = 0; i < NUM_DEVICES; i++) {
      setRelay(i, false);
      if (WiFi.status() == WL_CONNECTED && boardUUID != "") {
        updateDeviceInDB(i, false);
      } else {
        enqueueOfflineUpdate(i, false, false);
      }
    }
    server.send(200, "application/json", "{\"success\":true,\"action\":\"all_off\"}");
  });

  server.begin();
  Serial.println("-> Local HTTP REST Server & Web Dashboard running on Port 80");
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
    Serial.printf("📦 Enqueued offline action: Dev [%d] State: %d (Queue: %d)\n", index, state, queueCount);
  }
}

void flushOfflineQueue() {
  if (queueCount == 0 || WiFi.status() != WL_CONNECTED || boardUUID == "") return;
  
  Serial.printf("🚀 Flushing %d offline updates to Supabase Cloud...\n", queueCount);
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
  Serial.println("✅ Offline queue completely flushed.");
}

// ============================================================
//  SETUP
// ============================================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n\n===========================================");
  Serial.println("  ESP32 Dual-Plane Leader Node (4 Devices) ");
  Serial.println("===========================================\n");

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
  Serial.println("-> Physical wall switches active immediately.");

  // Configure Dual-Plane Network (Concurrent AP + Station Mode)
  WiFi.mode(WIFI_AP_STA);
  
  // 1. SoftAP Setup (Guarantees local control even if router/internet is dead)
  WiFi.softAPConfig(AP_IP, AP_GATEWAY, AP_SUBNET);
  WiFi.softAP(AP_SSID, (strlen(AP_PASS) >= 8) ? AP_PASS : NULL);
  Serial.print("-> Broadcasting SoftAP: ");
  Serial.print(AP_SSID);
  Serial.print(" | IP: ");
  Serial.println(WiFi.softAPIP());

  // 2. Station Setup (Connects to Home Wi-Fi for Supabase Cloud Sync)
  wifiMulti.addAP(ssid, password);
  Serial.print("-> Connecting to Home Wi-Fi: ");
  Serial.println(ssid);

  // 3. mDNS Setup (Accessible via http://home-automation.local)
  if (MDNS.begin("home-automation")) {
    Serial.println("-> mDNS responder started: http://home-automation.local");
  }

  // 4. Start Embedded REST Web Server
  setupWebServer();
  
  Serial.println("===========================================\n");
}

// ============================================================
//  MAIN LOOP
// ============================================================
void loop() {
  // Handle local HTTP requests immediately (Sub-100ms response)
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
        
        if (WiFi.status() == WL_CONNECTED && boardUUID != "") {
          updateFeedbackInDB(i, isSwitchOn);
        } else {
          enqueueOfflineUpdate(i, isSwitchOn, true);
        }
      }
    }
    lastInputRead[i] = currentRead;
  }

  // 2. Live Serial Monitor
  if (millis() - lastSerialDumpTime >= SERIAL_DUMP_INTERVAL) {
    lastSerialDumpTime = millis();
    Serial.printf("\n--- 📡 DUAL-PLANE MONITOR | Wi-Fi: %s ---\n", 
      (WiFi.status() == WL_CONNECTED) ? "ONLINE (Cloud Active)" : "OFFLINE (SoftAP Autonomous)"
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

  // 3. Background Cloud Sync & Recovery
  static unsigned long lastRecoveryAttempt = 0;
  
  if (wifiMulti.run() != WL_CONNECTED) {
    return; // Keep looping for physical switches and SoftAP WebServer
  }

  time_t currentNtpTime = time(nullptr);
  if (currentNtpTime < 100000) {
    if (millis() - lastRecoveryAttempt > 5000) {
      Serial.println("-> Syncing Time with NTP...");
      configTime(0, 0, "pool.ntp.org");
      lastRecoveryAttempt = millis();
    }
    return;
  }

  if (boardUUID == "") {
    if (millis() - lastRecoveryAttempt > 5000) {
      Serial.println("-> Linking Board to Supabase Database...");
      if (resolveBoardAndDevices()) { 
        Serial.println("✅ Board & Devices verified.");
        fetchInitialState(); 
        sendHeartbeat();
        pollAlarms(); 
        flushOfflineQueue();
      } else {
        Serial.println("❌ FAILED to link Board/Devices. Retrying...");
      }
      lastRecoveryAttempt = millis();
    }
    return;
  }

  // 4. Cloud Polling, Alarms & Heartbeat
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

  // Edge Alarms
  String nowIso = getIsoTime();
  for (int i = 0; i < MAX_ALARMS; i++) {
    if (alarms[i].active && nowIso >= alarms[i].triggerAt) {
      Serial.println("⏰ ALARM FIRED! ID: " + alarms[i].id);
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
//  SUPABASE CLOUD HTTP FUNCTIONS
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
          Serial.printf("☁️ Cloud Toggle Dev [%d] -> %s\n", rIndex, dbState ? "ON" : "OFF");
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
          Serial.printf("  -> Linked Device [%d] UUID: %s\n", rIndex, deviceUUIDs[rIndex].c_str());
          foundAny = true;
        }
      }
    }
    http.end();
  }
  
  return foundAny;
}

void fetchInitialState() {
  if (boardUUID == "") return;
  HTTPClient http;
  http.begin(String(SUPABASE_BASE) + "/devices?board_id=eq." + boardUUID + "&select=relay_index,is_on");
  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));
  
  if (http.GET() == 200) {
    DynamicJsonDocument doc(1024); deserializeJson(doc, http.getString());
    for (int i = 0; i < doc.size(); i++) {
      int rIndex = doc[i]["relay_index"];
      if (rIndex >= 0 && rIndex < NUM_DEVICES) {
        bool initState = doc[i]["is_on"];
        setRelay(rIndex, initState);          
      }
    }
  }
  http.end();
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
  Serial.println("☁️ Alarm marked as fired in Supabase.");
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
    Serial.println("💓 Heartbeat synced to Cloud.");
  }
  http.end();
}
