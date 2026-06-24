#include <WiFi.h>
#include <WiFiMulti.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>

// ============================================================
//  DIRECT GPIO SETUP
// ============================================================
// OUTPUT: Connect your Relay's 'IN' pin directly to this GPIO
#define RELAY_PIN 32  

// INPUT: Connect your physical switch between this GPIO and GND
#define INPUT_PIN 19  

// INPUT: Connect your AC Detector's output to this GPIO
#define AC_DETECTOR_PIN 21 

// ============================================================
//  CREDENTIALS
// ============================================================
const char* ssid     = "NxtWave_Te@m";
const char* password = "Nxtwave@KKH2026";

const char* BOARD_IDENTIFIER = "my_board_1";
const char* SUPABASE_BASE = "https://ojuvphlkzbxwjhqzexbt.supabase.co/rest/v1";
const char* SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qdXZwaGxremJ4d2pocXpleGJ0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTg2Nzk2MiwiZXhwIjoyMDk3NDQzOTYyfQ.SN6g_bR4bpVEIGdIW-GLPTHRlqZBHF5YBUKjHDMWjLU"; 

// ============================================================
//  VARIABLES & STATE
// ============================================================
String boardUUID = "";
String deviceUUID = "";
bool isRelayOn = false;

// --- Switch Input State Tracking (with standard debounce) ---
bool lastInputRead = HIGH; 
bool confirmedInputState = HIGH;
unsigned long lastDebounceTime = 0;
const unsigned long DEBOUNCE_DELAY = 50; // 50ms debounce window

// --- AC Detector Input State Tracking (Pulse Detection) ---
unsigned long lastAcPulseTime = 0;
bool currentAcState = false;      // True = AC ON, False = AC OFF
bool lastReportedAcState = false; 
const unsigned long AC_TIMEOUT = 100; // 100ms without a pulse means AC is OFF

// --- Live Serial Monitor ---
unsigned long lastSerialDumpTime = 0;
const unsigned long SERIAL_DUMP_INTERVAL = 5000; // Print live state every 5 seconds

WiFiMulti wifiMulti;

// HTTP Polling
unsigned long lastPollTime = 0;
const unsigned long POLL_INTERVAL = 1000; 

// Edge Cloud Alarms
struct Alarm { String id; String triggerAt; bool action; bool active; };
#define MAX_ALARMS 10
Alarm alarms[MAX_ALARMS];
unsigned long lastAlarmPoll = 0;
const unsigned long ALARM_POLL_INTERVAL = 30000; 

// Function Prototypes
void setRelay(bool on);
void updateDeviceInDB(bool state);
void updateFeedbackInDB(bool feedback);
void updateACFeedbackInDB(bool feedback);
void markAlarmFiredInDB(String alarmId);
void pollDatabase();
void pollAlarms();
bool resolveBoardAndDevice();
void fetchInitialState();

// ============================================================
//  setRelay – Direct GPIO Control
// ============================================================
void setRelay(bool on) {
  isRelayOn = on;
  
  if (on) {
    digitalWrite(RELAY_PIN, LOW);  // Turn Relay ON
  } else {
    digitalWrite(RELAY_PIN, HIGH); // Turn Relay OFF
  }
  
  Serial.print(">> RELAY STATE CHANGED TO: ");
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
  Serial.println("  ESP32 Cloud Relay (GPIO + Switch + AC Detect)");
  Serial.println("===========================================\n");

  // --- Initialize Direct Relay Pin (Output) ---
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, HIGH); // Start with relay OFF (Active-LOW)
  Serial.println("-> Relay GPIO initialized (Relay OFF)");

  // --- Initialize Direct Input Pin (Feedback) ---
  pinMode(INPUT_PIN, INPUT_PULLUP);
  confirmedInputState = digitalRead(INPUT_PIN);
  Serial.println("-> Switch Input GPIO initialized");

  // --- Initialize AC Detector Pin (Feedback) ---
  pinMode(AC_DETECTOR_PIN, INPUT);
  Serial.println("-> AC Detector GPIO initialized");

  // --- Wi-Fi Setup ---
  Serial.print("-> Connecting to Wi-Fi: ");
  Serial.println(ssid);
  WiFi.mode(WIFI_STA);
  wifiMulti.addAP(ssid, password);
  
  while (wifiMulti.run() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n✅ Wi-Fi Connected! IP: " + WiFi.localIP().toString());

  // --- Time Sync ---
  Serial.print("-> Syncing Time with NTP...");
  configTime(0, 0, "pool.ntp.org");
  time_t now = time(nullptr);
  while (now < 100000) { delay(500); Serial.print("."); now = time(nullptr); }
  Serial.println("\n✅ Time Synced: " + getIsoTime());

  // --- Supabase Link ---
  Serial.println("-> Linking to Supabase Database...");
  if (resolveBoardAndDevice()) { 
    Serial.println("✅ Board and Device verified.");
    fetchInitialState(); 
    pollAlarms(); 
  } else {
    Serial.println("❌ FAILED to link Board/Device. Check Supabase 'boards' table.");
  }
  Serial.println("===========================================\n");
}

// ============================================================
//  MAIN LOOP
// ============================================================
void loop() {
  // ----------------------------------------------------------
  // 1. PHYSICAL SWITCH INPUT READING (Debounced)
  // ----------------------------------------------------------
  bool currentRead = digitalRead(INPUT_PIN);

  if (currentRead != lastInputRead) {
    lastDebounceTime = millis();
  }

  if ((millis() - lastDebounceTime) > DEBOUNCE_DELAY) {
    if (currentRead != confirmedInputState) {
      confirmedInputState = currentRead;
      
      bool isSwitchOn = (confirmedInputState == LOW);
      Serial.print("!! PHYSICAL INPUT CHANGED: ");
      Serial.println(isSwitchOn ? "ON (Switch Closed)" : "OFF (Switch Open)");
      
      updateFeedbackInDB(isSwitchOn);
    }
  }
  lastInputRead = currentRead;

  // ----------------------------------------------------------
  // 2. AC DETECTOR MODULE READING (Missing Pulse Logic)
  // ----------------------------------------------------------
  bool rawAcRead = digitalRead(AC_DETECTOR_PIN);

  // If the optocoupler pulls the pin LOW, we register a pulse
  if (rawAcRead == LOW) {
    lastAcPulseTime = millis();
    currentAcState = true; // AC is present
  }

  // If 100ms has passed without a single LOW pulse, AC is off
  if (millis() - lastAcPulseTime > AC_TIMEOUT) {
    currentAcState = false; // No AC detected
  }

  // If the confirmed state changed, push the update
  if (currentAcState != lastReportedAcState) {
    lastReportedAcState = currentAcState;
    
    Serial.print("!! AC DETECTOR CHANGED: ");
    Serial.println(currentAcState ? "ON (AC Present)" : "OFF (No AC Detected)");
    
    updateACFeedbackInDB(currentAcState);
  }

  // ----------------------------------------------------------
  // 3. LIVE SERIAL MONITORING (Prints every 5 seconds)
  // ----------------------------------------------------------
  if (millis() - lastSerialDumpTime >= SERIAL_DUMP_INTERVAL) {
    lastSerialDumpTime = millis();
    Serial.println("\n--- 📡 LIVE STATE MONITOR ---");
    Serial.print("🔹 Relay State : "); Serial.println(isRelayOn ? "ON" : "OFF");
    Serial.print("🔹 Switch State: "); Serial.println(confirmedInputState == LOW ? "ON" : "OFF");
    Serial.print("🔹 AC Detector : "); Serial.println(currentAcState ? "DETECTED" : "NO CURRENT");
    Serial.println("-----------------------------\n");
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

  String nowIso = getIsoTime();
  for (int i = 0; i < MAX_ALARMS; i++) {
    if (alarms[i].active && nowIso >= alarms[i].triggerAt) {
      Serial.println("⏰ ALARM FIRED! ID: " + alarms[i].id);
      
      alarms[i].active = false;
      isRelayOn = alarms[i].action;
      
      setRelay(isRelayOn);          
      updateDeviceInDB(isRelayOn);
      markAlarmFiredInDB(alarms[i].id);
    }
  }
}

// ============================================================
//  SUPABASE HTTP FUNCTIONS
// ============================================================
void pollDatabase() {
  if(deviceUUID == "") return;
  
  HTTPClient http;
  http.begin(String(SUPABASE_BASE) + "/devices?id=eq." + deviceUUID + "&select=is_on");
  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));

  if (http.GET() == 200) {
    DynamicJsonDocument doc(512);
    deserializeJson(doc, http.getString());
    if (doc.size() > 0) {
      bool dbState = doc[0]["is_on"];
      
      if (dbState != isRelayOn) {
        Serial.print("☁️ CLOUD COMMAND RECEIVED: Turn ");
        Serial.println(dbState ? "ON" : "OFF");
        setRelay(dbState);        
      }
    }
  }
  http.end();
}

void updateDeviceInDB(bool state) {
  if(deviceUUID == "") return;
  Serial.print("☁️ Pushing Relay State to Cloud: ");
  Serial.println(state ? "ON" : "OFF");

  HTTPClient http;
  http.begin(String(SUPABASE_BASE) + "/devices?id=eq." + deviceUUID);
  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));
  http.addHeader("Content-Type", "application/json");
  http.PATCH("{\"is_on\":" + String(state ? "true" : "false") + "}");
  http.end();
}

void updateFeedbackInDB(bool feedback) {
  if(deviceUUID == "") return;
  Serial.print("☁️ Pushing Switch Feedback to Cloud: ");
  Serial.println(feedback ? "ON" : "OFF");

  HTTPClient http;
  http.begin(String(SUPABASE_BASE) + "/devices?id=eq." + deviceUUID);
  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));
  http.addHeader("Content-Type", "application/json");
  
  http.PATCH("{\"feedback_on\":" + String(feedback ? "true" : "false") + "}");
  http.end();
}

void updateACFeedbackInDB(bool feedback) {
  if(deviceUUID == "") return;
  Serial.print("☁️ Pushing AC Feedback to Cloud: ");
  Serial.println(feedback ? "DETECTED" : "NONE");

  HTTPClient http;
  http.begin(String(SUPABASE_BASE) + "/devices?id=eq." + deviceUUID);
  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));
  http.addHeader("Content-Type", "application/json");
  
  // Update the 'feedback_on' column in the Supabase 'devices' table
  http.PATCH("{\"feedback_on\":" + String(feedback ? "true" : "false") + "}");
  http.end();
}

bool resolveBoardAndDevice() {
  HTTPClient http;
  
  // 1. Find Board UUID
  http.begin(String(SUPABASE_BASE) + "/boards?board_identifier=eq." + BOARD_IDENTIFIER + "&select=id");
  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));
  
  if (http.GET() == 200) {
    DynamicJsonDocument doc(1024); deserializeJson(doc, http.getString());
    if (doc.size() > 0) {
      boardUUID = doc[0]["id"].as<String>();
      Serial.println("  -> Found Board UUID: " + boardUUID);
    }
  }
  http.end();

  // 2. Find Device UUID
  if(boardUUID != "") {
    http.begin(String(SUPABASE_BASE) + "/devices?board_id=eq." + boardUUID + "&relay_index=eq.0&select=id");
    http.addHeader("apikey", SUPABASE_SERVICE_KEY);
    http.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));
    
    if (http.GET() == 200) {
      DynamicJsonDocument doc(1024); deserializeJson(doc, http.getString());
      if (doc.size() > 0) {
        deviceUUID = doc[0]["id"].as<String>();
        Serial.println("  -> Found Device UUID: " + deviceUUID);
      }
    }
    http.end();
  }
  
  return (deviceUUID != "");
}

void fetchInitialState() {
  HTTPClient http;
  http.begin(String(SUPABASE_BASE) + "/devices?id=eq." + deviceUUID + "&select=is_on");
  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));
  
  if (http.GET() == 200) {
    DynamicJsonDocument doc(512); deserializeJson(doc, http.getString());
    if (doc.size() > 0) {
      bool initState = doc[0]["is_on"];
      Serial.print("  -> Initial State from Cloud: ");
      Serial.println(initState ? "ON" : "OFF");
      setRelay(initState);          
    }
  }
  http.end();
}

void pollAlarms() {
  if(deviceUUID == "") return;
  HTTPClient http;
  http.begin(String(SUPABASE_BASE) + "/alarms?device_id=eq." + deviceUUID + "&fired=eq.false&select=id,trigger_at,action");
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
      alarms[i].active = true;
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