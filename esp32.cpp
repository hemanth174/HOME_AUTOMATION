#include <WiFi.h>
#include <WiFiMulti.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>

// ============================================================
//  DIRECT GPIO SETUP (Expanded for 4 Devices)
// ============================================================
#define NUM_DEVICES 4

// OUTPUTS: Connect your Relay 'IN' pins directly to these GPIOs (Active LOW)
const int RELAY_PINS[NUM_DEVICES] = {32, 33, 25, 26}; 

// INPUTS: Connect physical switches between these GPIOs and GND 
const int INPUT_PINS[NUM_DEVICES] = {19, 18, 5, 17};  

// ============================================================
//  CREDENTIALS
// ============================================================
const char* ssid     = "NxtWave_Te@m";
const char* password = "Nxtwave@KKH2026";

const char* BOARD_IDENTIFIER = "kinda_meeda";
const char* SUPABASE_BASE = "https://ojuvphlkzbxwjhqzexbt.supabase.co/rest/v1";
const char* SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qdXZwaGxremJ4d2pocXpleGJ0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTg2Nzk2MiwiZXhwIjoyMDk3NDQzOTYyfQ.SN6g_bR4bpVEIGdIW-GLPTHRlqZBHF5YBUKjHDMWjLU"; 

// ============================================================
//  VARIABLES & STATE (Converted to Arrays for 4 Devices)
// ============================================================
String boardUUID = "";
String deviceUUIDs[NUM_DEVICES] = {"", "", "", ""};
bool isRelayOn[NUM_DEVICES] = {false, false, false, false};

// --- Switch Input State Tracking (with standard debounce) ---
bool lastInputRead[NUM_DEVICES] = {HIGH, HIGH, HIGH, HIGH}; 
bool confirmedInputState[NUM_DEVICES] = {HIGH, HIGH, HIGH, HIGH};
unsigned long lastDebounceTime[NUM_DEVICES] = {0, 0, 0, 0};
const unsigned long DEBOUNCE_DELAY = 50; 

// --- Live Serial Monitor ---
unsigned long lastSerialDumpTime = 0;
const unsigned long SERIAL_DUMP_INTERVAL = 5000; 

WiFiMulti wifiMulti;

// HTTP Polling
unsigned long lastPollTime = 0;
const unsigned long POLL_INTERVAL = 1000; 

// --- HEARTBEAT SYSTEM (NEW) ---
unsigned long lastHeartbeatTime = 0;
const unsigned long HEARTBEAT_INTERVAL = 20000; // Send heartbeat every 20 seconds (App expects < 45 seconds)

// Edge Cloud Alarms
struct Alarm { String id; String triggerAt; bool action; bool active; int deviceIndex; };
#define MAX_ALARMS 20 // Increased slightly to handle alarms for multiple devices
Alarm alarms[MAX_ALARMS];
unsigned long lastAlarmPoll = 0;
const unsigned long ALARM_POLL_INTERVAL = 30000; 

// Function Prototypes
void setRelay(int index, bool on);
void updateDeviceInDB(int index, bool state);
void updateFeedbackInDB(int index, bool feedback);
void markAlarmFiredInDB(String alarmId);
void pollDatabase();
void pollAlarms();
bool resolveBoardAndDevices();
void fetchInitialState();
void sendHeartbeat(); // New prototype

// ============================================================
//  setRelay – Direct GPIO Control
// ============================================================
void setRelay(int index, bool on) {
  if (index < 0 || index >= NUM_DEVICES) return;
  
  isRelayOn[index] = on;
  
  if (on) {
    digitalWrite(RELAY_PINS[index], LOW);  // Turn Relay ON (Active-LOW)
  } else {
    digitalWrite(RELAY_PINS[index], HIGH); // Turn Relay OFF
  }
  
  Serial.print(">> RELAY ["); Serial.print(index); Serial.print("] STATE CHANGED TO: ");
  Serial.println(on ? "ON" : "OFF");
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
//  SETUP
// ============================================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n\n===========================================");
  Serial.println("  ESP32 Cloud Relay (4 Devices)");
  Serial.println("===========================================\n");

  // --- Initialize GPIOs for all 4 devices ---
  for (int i = 0; i < NUM_DEVICES; i++) {
    pinMode(RELAY_PINS[i], OUTPUT);
    digitalWrite(RELAY_PINS[i], HIGH); // Start OFF (Active-LOW)
    
    pinMode(INPUT_PINS[i], INPUT_PULLUP);
    confirmedInputState[i] = digitalRead(INPUT_PINS[i]);
  }
  Serial.println("-> Relay & Switch GPIOs initialized");

  // --- Wi-Fi Setup ---
  Serial.print("-> Connecting to Wi-Fi: ");
  Serial.println(ssid);
  WiFi.mode(WIFI_STA);
  wifiMulti.addAP(ssid, password);
  
  Serial.println("-> Background Auto-Recovery initialized.");
  Serial.println("-> Physical switches are active IMMEDIATELY. Wi-Fi, Time, and Cloud will sync in the background.");
  Serial.println("===========================================\n");
}

// ============================================================
//  MAIN LOOP
// ============================================================
void loop() {
  // ----------------------------------------------------------
  // 1. PHYSICAL SWITCH INPUT READING (Debounced for all 4)
  // ----------------------------------------------------------
  for (int i = 0; i < NUM_DEVICES; i++) {
    bool currentRead = digitalRead(INPUT_PINS[i]);

    if (currentRead != lastInputRead[i]) {
      lastDebounceTime[i] = millis();
    }

    if ((millis() - lastDebounceTime[i]) > DEBOUNCE_DELAY) {
      if (currentRead != confirmedInputState[i]) {
        confirmedInputState[i] = currentRead;
        
        bool isSwitchOn = (confirmedInputState[i] == LOW);
        Serial.print("!! PHYSICAL INPUT ["); Serial.print(i); Serial.print("] CHANGED: ");
        Serial.println(isSwitchOn ? "ON (Switch Closed)" : "OFF (Switch Open)");
        
        updateFeedbackInDB(i, isSwitchOn);
      }
    }
    lastInputRead[i] = currentRead;
  }

  // ----------------------------------------------------------
  // 2. LIVE SERIAL MONITORING
  // ----------------------------------------------------------
  if (millis() - lastSerialDumpTime >= SERIAL_DUMP_INTERVAL) {
    lastSerialDumpTime = millis();
    Serial.println("\n--- 📡 LIVE STATE MONITOR ---");
    for (int i = 0; i < NUM_DEVICES; i++) {
      Serial.printf("Device %d | Relay: %-3s | Switch: %-3s\n", 
        i, 
        isRelayOn[i] ? "ON" : "OFF", 
        (confirmedInputState[i] == LOW) ? "ON" : "OFF"
      );
    }
    Serial.println("-----------------------------\n");
  }

  // ----------------------------------------------------------
  // 3. AUTO-RECOVERY (Wi-Fi, Time, Database)
  // ----------------------------------------------------------
  static unsigned long lastRecoveryAttempt = 0;
  
  if (wifiMulti.run() != WL_CONNECTED) {
    return; // Skip cloud operations if offline, but keep loop running for physical switches
  }

  time_t currentNtpTime = time(nullptr);
  if (currentNtpTime < 100000) {
    if (millis() - lastRecoveryAttempt > 5000) {
      Serial.println("-> Re-Syncing Time with NTP...");
      configTime(0, 0, "pool.ntp.org");
      lastRecoveryAttempt = millis();
    }
    return; // Can't process alarms/cloud without accurate time
  }

  if (boardUUID == "") {
    if (millis() - lastRecoveryAttempt > 5000) {
      Serial.println("-> Attempting to Link to Supabase Database...");
      if (resolveBoardAndDevices()) { 
        Serial.println("✅ Board and Devices verified.");
        fetchInitialState(); 
        for (int i = 0; i < NUM_DEVICES; i++) {
          if(deviceUUIDs[i] != "") updateFeedbackInDB(i, confirmedInputState[i] == LOW);
        }
        sendHeartbeat();
        pollAlarms(); 
      } else {
        Serial.println("❌ FAILED to link Board/Devices. Retrying...");
      }
      lastRecoveryAttempt = millis();
    }
    return; // Can't poll cloud without board UUID
  }

  // ----------------------------------------------------------
  // 4. HTTP POLLING & EDGE ALARMS
  // ----------------------------------------------------------
  if (millis() - lastPollTime >= POLL_INTERVAL) {
    lastPollTime = millis();
    pollDatabase(); 
  }

  if (millis() - lastAlarmPoll >= ALARM_POLL_INTERVAL) {
    lastAlarmPoll = millis();
    pollAlarms();
  }

  // ----------------------------------------------------------
  // 4. HEARTBEAT SYSTEM (NEW)
  // ----------------------------------------------------------
  if (millis() - lastHeartbeatTime >= HEARTBEAT_INTERVAL) {
    lastHeartbeatTime = millis();
    sendHeartbeat();
  }

  String nowIso = getIsoTime();
  for (int i = 0; i < MAX_ALARMS; i++) {
    if (alarms[i].active && nowIso >= alarms[i].triggerAt) {
      Serial.println("⏰ ALARM FIRED! ID: " + alarms[i].id);
      
      alarms[i].active = false;
      int targetDev = alarms[i].deviceIndex;
      
      if(targetDev >= 0 && targetDev < NUM_DEVICES) {
        setRelay(targetDev, alarms[i].action);          
        updateDeviceInDB(targetDev, alarms[i].action);
      }
      markAlarmFiredInDB(alarms[i].id);
    }
  }
}

// ============================================================
//  SUPABASE HTTP FUNCTIONS
// ============================================================
void pollDatabase() {
  if(boardUUID == "") return;
  
  HTTPClient http;
  // Fetch states for all devices on this board in one go
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
          Serial.print("☁️ CLOUD COMMAND: Turn Device ["); Serial.print(rIndex); Serial.print("] ");
          Serial.println(dbState ? "ON" : "OFF");
          setRelay(rIndex, dbState);        
        }
      }
    }
  }
  http.end();
}

void updateDeviceInDB(int index, bool state) {
  if(deviceUUIDs[index] == "") return;
  Serial.print("☁️ Pushing Relay ["); Serial.print(index); Serial.print("] State to Cloud: ");
  Serial.println(state ? "ON" : "OFF");

  HTTPClient http;
  http.begin(String(SUPABASE_BASE) + "/devices?id=eq." + deviceUUIDs[index]);
  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));
  http.addHeader("Content-Type", "application/json");
  http.PATCH("{\"is_on\":" + String(state ? "true" : "false") + "}");
  http.end();
}

void updateFeedbackInDB(int index, bool feedback) {
  if(deviceUUIDs[index] == "") return;
  Serial.print("☁️ Pushing Switch Feedback ["); Serial.print(index); Serial.print("] to Cloud: ");
  Serial.println(feedback ? "ON" : "OFF");

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
  if(boardUUID != "") {
    http.begin(String(SUPABASE_BASE) + "/devices?board_id=eq." + boardUUID + "&select=id,relay_index");
    http.addHeader("apikey", SUPABASE_SERVICE_KEY);
    http.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));
    
    if (http.GET() == 200) {
      DynamicJsonDocument doc(2048); deserializeJson(doc, http.getString());
      for (int i = 0; i < doc.size(); i++) {
        int rIndex = doc[i]["relay_index"];
        if (rIndex >= 0 && rIndex < NUM_DEVICES) {
          deviceUUIDs[rIndex] = doc[i]["id"].as<String>();
          Serial.print("  -> Linked Device ["); Serial.print(rIndex); Serial.println("] UUID.");
          foundAny = true;
        }
      }
    }
    http.end();
  }
  
  return foundAny;
}

void fetchInitialState() {
  if(boardUUID == "") return;
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
        Serial.print("  -> Initial State ["); Serial.print(rIndex); Serial.print("] from Cloud: ");
        Serial.println(initState ? "ON" : "OFF");
        setRelay(rIndex, initState);          
      }
    }
  }
  http.end();
}

void pollAlarms() {
  // Build a query for all active device UUIDs on this board
  String queryIds = "";
  for(int i = 0; i < NUM_DEVICES; i++) {
    if(deviceUUIDs[i] != "") {
      if(queryIds != "") queryIds += ",";
      queryIds += "%22" + deviceUUIDs[i] + "%22"; // Wrap ID in quotes (URL encoded as %22)
    }
  }
  if(queryIds == "") return;

  HTTPClient http;
  // Use 'in' filter to get alarms for ANY of the 4 devices
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
      
      // Match the alarm's device_id back to our deviceIndex
      String aDevId = doc[i]["device_id"].as<String>();
      alarms[i].deviceIndex = -1;
      for(int d = 0; d < NUM_DEVICES; d++) {
        if(deviceUUIDs[d] == aDevId) {
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
  Serial.println("☁️ Alarm marked as fired in database.");
}

// ============================================================
//  HEARTBEAT IMPLEMENTATION (NEW)
// ============================================================
void sendHeartbeat() {
  if (boardUUID == "") return; // Don't send heartbeat if we haven't resolved the board ID
  
  String nowIso = getIsoTime();
  
  HTTPClient http;
  http.begin(String(SUPABASE_BASE) + "/boards?id=eq." + boardUUID);
  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));
  http.addHeader("Content-Type", "application/json");
  
  // Patch the last_seen column with the current ISO timestamp
  String payload = "{\"last_seen\":\"" + nowIso + "\"}";
  int httpCode = http.PATCH(payload);
  
  if(httpCode == 200 || httpCode == 204) {
     Serial.println("💓 Heartbeat sent to Cloud.");
  } else {
     Serial.print("⚠️ Heartbeat failed with code: ");
     Serial.println(httpCode);
  }
  http.end();
}