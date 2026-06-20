#include <WiFi.h>
#include <WiFiMulti.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ============================================================
//  PINS & DISPLAY SETUP
// ============================================================

// --- Rotary Encoder & PIR ---
#define CLK_PIN   25
#define DT_PIN    26
#define SW_PIN    27
#define PIR_PIN   13

// --- SHARED CLOCK PIN ---
#define SHARED_CLK 33   // Clock shared by both 595 (SHCP) and 165 (CLK)

// --- 74HC595 – Serial-In Parallel-Out (relay OUTPUT shift register) ---
#define SH_DS    32   // Serial data in   (SER / DS)
#define SH_STCP  18   // Storage/latch    (RCLK  / STCP)

// --- 74HC165 – Parallel-In Serial-Out (feedback INPUT shift register) ---
#define LD_PIN   19   // Parallel load   (PL / SH-LD, active-LOW)
#define QH_PIN   22   // Serial data out (Q7 / QH)

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// ============================================================
//  CREDENTIALS
// ============================================================
const char* ssid     = "NxtWave_Te@m";
const char* password = "Nxtwave@KKH2026";
const char* BOARD_IDENTIFIER = "board_1";
const char* SUPABASE_BASE = "https://ojuvphlkzbxwjhqzexbt.supabase.co";
const char* SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qdXZwaGxremJ4d2pocXpleGJ0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTg2Nzk2MiwiZXhwIjoyMDk3NDQzOTYyfQ.SN6g_bR4bpVEIGdIW-GLPTHRlqZBHF5YBUKjHDMWjLU"; 

// ============================================================
//  VARIABLES & STATE
// ============================================================
String boardUUID = "";
String deviceUUID = "";
bool isRelayOn = false;

// Current byte sent to 74HC595 (bit 0 = relay 0, active-LOW)
byte shiftOutState = 0xFF;  // All outputs HIGH (all relays OFF) at startup

WiFiMulti wifiMulti;

// 74HC165 Feedback Filters
int lastAcState = -1;
unsigned long lastAcCheck = 0;
bool acDetectedThisWindow = false;
unsigned long acStateChangeTime = 0; 

// HTTP Polling
unsigned long lastPollTime = 0;
const unsigned long POLL_INTERVAL = 1000; 

// Edge Cloud Alarms
struct Alarm { String id; String triggerAt; bool action; bool active; };
#define MAX_ALARMS 10
Alarm alarms[MAX_ALARMS];
unsigned long lastAlarmPoll = 0;
const unsigned long ALARM_POLL_INTERVAL = 30000; 

// Offline Local Timers & Motion
bool motionEnabled = false;
unsigned long lastMotionTrigger = 0;
const unsigned long MOTION_COOLDOWN = 4000; 

bool localTimerActive = false;
bool localTimerAction = false;
unsigned long localTimerStart = 0;
unsigned long localTimerDuration = 0;

// OLED Menu & Encoder State
int page = 0; 
int cursor = 0;
volatile bool encoderMoved = false;
volatile int encoderDir = 0;
volatile unsigned long lastEncoderISRTime = 0;

volatile bool buttonPressed = false;
volatile unsigned long lastButtonISRTime = 0;

String mainMenu[] = {"Lights & Devices", "Motion Sensor"}; 
int mainItems = 2;
String lightsMenu[] = {"Toggle ON/OFF", "10 Min Timer", "5 Min Timer", "< Back"}; 
int lightsItems = 4;
String motionMenu[] = {"Enable Sensor", "Disable Sensor", "< Back"}; 
int motionItems = 3;

// ============================================================
//  BULLETPROOF INTERRUPTS (EMI FILTERED)
// ============================================================
void IRAM_ATTR encoderISR() {
  unsigned long now = millis();
  if (now - lastEncoderISRTime > 80) { 
    if (digitalRead(CLK_PIN) == LOW) { 
      if (digitalRead(DT_PIN) == HIGH) encoderDir = 1;
      else encoderDir = -1;
      encoderMoved = true;
      lastEncoderISRTime = now;
    }
  }
}

void IRAM_ATTR buttonISR() {
  unsigned long now = millis();
  if (now - lastButtonISRTime > 300) { 
    if (digitalRead(SW_PIN) == LOW) {
      buttonPressed = true;
      lastButtonISRTime = now;
    }
  }
}

// Function Prototypes
void writeShiftOut(byte value);
byte readShiftIn(); 
void setRelay(bool on);
void updateDeviceInDB(bool state);
void updateFeedbackInDB(bool feedback);
void markAlarmFiredInDB(String alarmId);
void pollDatabase();
void pollAlarms();
bool resolveBoardAndDevice();
void fetchInitialState();
void drawMenu();
void executeAction();
void showOLED(String msg);

// ============================================================
//  74HC595 – SHIFT OUT (relay control using SHARED_CLK)
// ============================================================
void writeShiftOut(byte value) {
  shiftOutState = value;
  digitalWrite(SH_STCP, LOW);        // Ensure latch is low while shifting
  
  // Shift out data using the shared clock
  shiftOut(SH_DS, SHARED_CLK, MSBFIRST, value);
  
  digitalWrite(SH_STCP, HIGH);       // Latch: push data to outputs
  digitalWrite(SH_STCP, LOW);        // Return latch low (ready for next)
}

// ============================================================
//  74HC165 – SHIFT IN (feedback read using SHARED_CLK)
// ============================================================
byte readShiftIn() {
  // Pulse PL LOW to latch all physical parallel inputs into the register
  digitalWrite(LD_PIN, LOW);
  delayMicroseconds(5);
  digitalWrite(LD_PIN, HIGH);

  byte result = 0;
  for (int i = 7; i >= 0; i--) {
    result |= (digitalRead(QH_PIN) << i);
    
    // Toggle the shared clock to shift to the next bit
    digitalWrite(SHARED_CLK, HIGH);
    delayMicroseconds(2);
    digitalWrite(SHARED_CLK, LOW);
    delayMicroseconds(2);
  }
  return result;
}

// ============================================================
//  setRelay – convenient wrapper for relay 0
// ============================================================
void setRelay(bool on) {
  byte val = shiftOutState;
  if (on) val &= ~(1 << 0);  // Clear bit 0 → relay ON
  else    val |=  (1 << 0);  // Set   bit 0 → relay OFF
  writeShiftOut(val);
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

  // --- Shift Register Pins ---
  pinMode(SHARED_CLK, OUTPUT); // Shared by both 595 and 165
  pinMode(SH_DS,      OUTPUT);
  pinMode(SH_STCP,    OUTPUT);
  pinMode(LD_PIN,     OUTPUT);
  pinMode(QH_PIN,     INPUT);

  // Initial Shift Register States
  digitalWrite(SHARED_CLK, LOW);
  digitalWrite(SH_STCP,    LOW);
  digitalWrite(LD_PIN,     HIGH);  // Hold HIGH; pulse LOW to latch 165 inputs

  writeShiftOut(0xFF);  // All outputs HIGH → all relays OFF (active-LOW)

  // --- Encoder, button, PIR ---
  pinMode(CLK_PIN, INPUT_PULLUP);
  pinMode(DT_PIN,  INPUT_PULLUP);
  pinMode(SW_PIN,  INPUT_PULLUP);
  pinMode(PIR_PIN, INPUT);
  attachInterrupt(digitalPinToInterrupt(CLK_PIN), encoderISR, FALLING);
  attachInterrupt(digitalPinToInterrupt(SW_PIN),  buttonISR,  FALLING);

  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) { Serial.println(F("OLED failed")); }
  display.setTextSize(1); display.setTextColor(SSD1306_WHITE);
  showOLED("Connecting Wi-Fi...");

  WiFi.mode(WIFI_STA);
  wifiMulti.addAP(ssid, password);
  while (wifiMulti.run() != WL_CONNECTED) delay(500);

  showOLED("Syncing Time...");
  configTime(0, 0, "pool.ntp.org");
  time_t now = time(nullptr);
  while (now < 100000) { delay(500); now = time(nullptr); }

  showOLED("Linking Cloud...");
  if (resolveBoardAndDevice()) { fetchInitialState(); pollAlarms(); }

  drawMenu();
}

// ============================================================
//  MAIN LOOP
// ============================================================
void loop() {
  // ----------------------------------------------------------
  // 1. OLED MENU NAVIGATION
  // ----------------------------------------------------------
  if (encoderMoved) {
    encoderMoved = false;
    int maxItems = (page == 0) ? mainItems : ((page == 1) ? lightsItems : motionItems);
    cursor += encoderDir;
    
    if (cursor < 0) cursor = 0;
    if (cursor >= maxItems) cursor = maxItems - 1;
    
    drawMenu();
  }

  if (buttonPressed) {
    buttonPressed = false;
    executeAction();
  }

  // ----------------------------------------------------------
  // 2. FEEDBACK READ via 74HC165 (250ms Anti-Spam Window)
  // ----------------------------------------------------------
  {
    byte inputs = readShiftIn();
    bool feedbackBitLow = !(inputs & 0x01); 
    if (feedbackBitLow) acDetectedThisWindow = true; 
  }

  if (millis() - lastAcCheck >= 250) {
    bool currentAcPresent = acDetectedThisWindow;
    acDetectedThisWindow = false;
    lastAcCheck = millis();

    if (lastAcState == -1 || currentAcPresent != (lastAcState == 1)) {
      lastAcState = currentAcPresent ? 1 : 0;
      acStateChangeTime = millis(); 
      updateFeedbackInDB(currentAcPresent);
    }
  }

  // ----------------------------------------------------------
  // 3. MOTION SENSOR AUTOMATION (Filtered)
  // ----------------------------------------------------------
  if (motionEnabled && digitalRead(PIR_PIN) == HIGH) {
    if (millis() - acStateChangeTime > 2500) {
      if (millis() - lastMotionTrigger > MOTION_COOLDOWN) {
        delay(50); 
        if (digitalRead(PIR_PIN) == HIGH) {
          lastMotionTrigger = millis();
          if (!isRelayOn) {
            isRelayOn = true;
            setRelay(true);          
            updateDeviceInDB(true);
            showOLED("Motion Triggered!");
            delay(1000);
            drawMenu();
          }
        }
      }
    }
  }

  // ----------------------------------------------------------
  // 4. OFFLINE LOCAL TIMERS
  // ----------------------------------------------------------
  if (localTimerActive && (millis() - localTimerStart >= localTimerDuration)) {
    localTimerActive = false;
    isRelayOn = localTimerAction;
    setRelay(isRelayOn);             
    updateDeviceInDB(isRelayOn);
  }

  // ----------------------------------------------------------
  // 5. HTTP POLLING & EDGE ALARMS
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
      alarms[i].active = false;
      isRelayOn = alarms[i].action;
      setRelay(isRelayOn);           
      updateDeviceInDB(isRelayOn);
      markAlarmFiredInDB(alarms[i].id);
    }
  }
}

// ============================================================
//  OLED MENU FUNCTIONS
// ============================================================
void showOLED(String msg) {
  display.clearDisplay(); display.setCursor(10, 25); display.println(msg); display.display();
}

void drawMenu() {
  display.clearDisplay();
  String title = (page == 0) ? "-- MAIN MENU --" : ((page == 1) ? "-- DEVICE 1 --" : "-- SENSOR --");
  String* currentMenu = (page == 0) ? mainMenu : ((page == 1) ? lightsMenu : motionMenu);
  int items = (page == 0) ? mainItems : ((page == 1) ? lightsItems : motionItems);

  display.setCursor(10, 0); display.println(title); display.drawLine(0, 10, 128, 10, SSD1306_WHITE);
  int startY = 18; int lineSpacing = 14;

  for (int i = 0; i < items; i++) {
    int yPos = startY + (i * lineSpacing);
    display.setCursor(0, yPos);
    if (i == cursor) display.print("> "); else display.print("  ");
    display.println(currentMenu[i]);
  }
  display.display();
}

void executeAction() {
  if (page == 0) {
    if (cursor == 0) page = 1; else if (cursor == 1) page = 2; cursor = 0;
  }
  else if (page == 1) {
    if (cursor == 0) {
      isRelayOn = !isRelayOn;
      setRelay(isRelayOn);           
      updateDeviceInDB(isRelayOn);
      showOLED(isRelayOn ? "Light ON" : "Light OFF");
      delay(800);
    }
    else if (cursor == 1) {
      localTimerActive = true; localTimerStart = millis(); localTimerDuration = 10 * 60 * 1000;
      localTimerAction = !isRelayOn; showOLED("10 Min Timer Set!"); delay(800);
    }
    else if (cursor == 2) {
      localTimerActive = true; localTimerStart = millis(); localTimerDuration = 5 * 60 * 1000;
      localTimerAction = !isRelayOn; showOLED("5 Min Timer Set!"); delay(800);
    }
    else if (cursor == 3) { page = 0; cursor = 0; }
  }
  else if (page == 2) {
    if (cursor == 0) { motionEnabled = true;  showOLED("Sensor Active!");   delay(800); }
    else if (cursor == 1) { motionEnabled = false; showOLED("Sensor Disabled"); delay(800); }
    else if (cursor == 2) { page = 0; cursor = 0; }
  }
  drawMenu();
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
        isRelayOn = dbState;
        setRelay(isRelayOn);         
      }
    }
  }
  http.end();
}

void updateDeviceInDB(bool state) {
  if(deviceUUID == "") return;
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
  HTTPClient http;
  http.begin(String(SUPABASE_BASE) + "/devices?id=eq." + deviceUUID);
  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));
  http.addHeader("Content-Type", "application/json");
  http.PATCH("{\"feedback_on\":" + String(feedback ? "true" : "false") + "}");
  http.end();
}

bool resolveBoardAndDevice() {
  HTTPClient http;
  http.begin(String(SUPABASE_BASE) + "/boards?board_identifier=eq." + BOARD_IDENTIFIER + "&select=id");
  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));
  if (http.GET() == 200) {
    DynamicJsonDocument doc(1024); deserializeJson(doc, http.getString());
    if (doc.size() > 0) boardUUID = doc[0]["id"].as<String>();
  }
  http.end();

  http.begin(String(SUPABASE_BASE) + "/devices?board_id=eq." + boardUUID + "&relay_index=eq.0&select=id");
  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_SERVICE_KEY));
  if (http.GET() == 200) {
    DynamicJsonDocument doc(1024); deserializeJson(doc, http.getString());
    if (doc.size() > 0) deviceUUID = doc[0]["id"].as<String>();
  }
  http.end();
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
      isRelayOn = doc[0]["is_on"];
      setRelay(isRelayOn);           
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
}