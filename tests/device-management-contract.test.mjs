import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(resolve(root, path), "utf8");

test("device-agent encrypts config for the intended board instead of returning plaintext", async () => {
  const edge = await read("supabase/functions/device-agent/index.ts");
  const helper = await read("supabase/functions/_shared/device-config-crypto.mjs");
  assert.match(edge, /encryptDeviceConfigEnvelope/);
  assert.match(edge, /configuration_envelope:\s*configurationEnvelope/);
  assert.doesNotMatch(edge, /config:\s*configuration,/);
  assert.match(helper, /AES-GCM/);
  assert.match(helper, /VikaTech-ESP32-Config-v1/);
});

test("ESP32 authenticates the board-bound config envelope before applying Wi-Fi", async () => {
  const firmware = await read("esp32.cpp");
  assert.match(firmware, /#include <mbedtls\/gcm\.h>/);
  assert.match(firmware, /mbedtls_gcm_auth_decrypt/);
  assert.match(firmware, /response\["configuration_envelope"\]/);
  assert.match(firmware, /vikatech-device-config-v1:/);
  assert.match(firmware, /VikaTech-ESP32-Config-v1\|/);
  const processStart = firmware.indexOf("void processDeviceAgentResponse(JsonDocument& response) {");
  assert.notEqual(processStart, -1);
  const processEnd = firmware.indexOf("\nbool sendDeviceAgentAction(", processStart);
  assert.notEqual(processEnd, -1);
  assert.doesNotMatch(firmware.slice(processStart, processEnd), /response\["config"\]/);
});

test("device-agent HTTPS uses certificate validation without disabling TLS checks", async () => {
  const firmware = await read("esp32.cpp");
  assert.match(firmware, /useBuiltinCACertBundle\s*\(/);
  assert.doesNotMatch(firmware, /\.setInsecure\s*\(/);
});

test("device snapshot RPC is server-role-only and protects restart command ownership", async () => {
  const sql = await read("supabase/device_management.sql");
  assert.match(sql, /create or replace function public\.device_agent_snapshot/);
  assert.match(sql, /security definer/i);
  assert.match(sql, /revoke all on function public\.device_agent_snapshot\(text, text\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.device_agent_snapshot\(text, text\) to service_role/i);
  assert.match(sql, /device_commands_one_active_restart_idx/);
  assert.match(sql, /gateway_board_id/);
});

test("Admin hardware cards open a dedicated tracker for the exact queued restart", async () => {
  const fleet = await read("src/app/admin/DeviceFleet.jsx");
  const tracker = await read("src/app/admin/devices/[boardId]/restart/page.jsx");
  const restartApi = await read("src/app/api/admin/devices/[boardId]/restart/route.js");
  assert.match(fleet, /router\.push\(/);
  assert.match(fleet, /\/restart\?commandId=/);
  assert.match(fleet, /\/update/);
  assert.match(fleet, /deliveryMode/);
  assert.match(tracker, /requestedCommandId/);
  assert.match(tracker, /commandId/);
  assert.match(tracker, /status === "completed"/);
  assert.match(tracker, /deliveryMode === "mesh_gateway"/);
  assert.match(tracker, /meshOnline/);
  assert.match(tracker, /directOnline/);
  assert.match(tracker, /Back to VikaTech site/);
  assert.match(tracker, /sm:flex-row|sm:grid-cols/);
  assert.match(restartApi, /deliveryMode: directOnline \? 'direct' : 'mesh_gateway'/);
  assert.match(restartApi, /DEVICE_OFFLINE/);
});

test("existing Wi-Fi tracker remains responsive and requires explicit open/WPA2 security", async () => {
  const fleet = await read("src/app/admin/DeviceFleet.jsx");
  const tracker = await read("src/app/admin/devices/[boardId]/update/page.jsx");
  const configuration = await read("src/app/api/admin/devices/[boardId]/configuration/route.js");
  assert.match(fleet, /sm:grid-cols/);
  assert.match(fleet, /Back to VikaTech site/);
  assert.match(tracker, /wifiSecurity/);
  assert.match(tracker, /None — Open Network/);
  assert.match(tracker, /WPA2-PSK/);
  assert.match(tracker, /checking_wifi/);
  assert.match(tracker, /sm:flex-row|sm:grid-cols/);
  assert.match(configuration, /encrypted_wifi_password/);
  assert.match(configuration, /requiresProvisioning/);
  assert.match(configuration, /status: 409/);
});

test("Wi-Fi configuration writes use compare-and-set to avoid concurrent admin races", async () => {
  const configuration = await read("src/app/api/admin/devices/[boardId]/configuration/route.js");
  assert.match(configuration, /\.eq\('config_version', currentVersion\)/);
  assert.match(configuration, /\.eq\('user_id', loaded\.board\.user_id\)/);
  assert.match(configuration, /\.is\('revoked_at', null\)/);
  assert.match(configuration, /CONFIGURATION_CHANGED/);
  assert.match(configuration, /\.maybeSingle\(\)/);
});

test("device-agent config expiry and delivery claims are version-guarded", async () => {
  const edge = await read("supabase/functions/device-agent/index.ts");
  assert.match(edge, /config_version=eq\." \+ encodeURIComponent\(String\(currentVersion\)\)/);
  assert.match(edge, /config_update_status=in\.\(pending,sending,checking_wifi,applying\)/);
  assert.match(edge, /config_update_status=eq\.pending&revoked_at=is\.null/);
  assert.match(edge, /configuration_changed_during_expiry_check/);
  assert.match(edge, /configuration_changed_during_delivery_claim/);
});

test("late configuration acknowledgements cannot overwrite a newer or terminal status", async () => {
  const edge = await read("supabase/functions/device-agent/index.ts");
  assert.match(edge, /config_update_status=eq\." \+ encodeURIComponent\(currentStatus\)/);
  assert.match(edge, /configuration_status_changed_during_ack/);
  assert.match(edge, /terminal_status_won_race/);
});

