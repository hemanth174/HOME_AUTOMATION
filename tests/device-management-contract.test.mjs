import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(resolve(root, path), "utf8");

test("Edge Function encrypts configuration rather than returning a plaintext config object", async () => {
  const edge = await read("supabase/functions/device-agent/index.ts");
  const helper = await read("supabase/functions/_shared/device-config-crypto.mjs");
  assert.match(edge, /encryptDeviceConfigEnvelope/);
  assert.match(edge, /configuration_envelope:\s*configurationEnvelope/);
  assert.doesNotMatch(edge, /config:\s*configuration,/);
  assert.match(helper, /AES-GCM/);
  assert.match(helper, /VikaTech-ESP32-Config-v1/);
});

test("ESP32 verifies the board-bound AES-GCM envelope before applying Wi-Fi settings", async () => {
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
  const responseHandler = firmware.slice(processStart, processEnd);
  assert.doesNotMatch(responseHandler, /response\["config"\]/);
});

test("firmware uses CA-validated HTTPS for device-agent requests", async () => {
  const firmware = await read("esp32.cpp");
  assert.match(firmware, /secureClient\.useBuiltinCACertBundle\(\)/);
  assert.doesNotMatch(firmware, /\.setInsecure\s*\(/);
});

test("database restricts device snapshot RPC to server role", async () => {
  const sql = await read("supabase/device_management.sql");
  assert.match(sql, /create or replace function public\.device_agent_snapshot/);
  assert.match(sql, /security definer/i);
  assert.match(sql, /revoke all on function public\.device_agent_snapshot\(text, text\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.device_agent_snapshot\(text, text\) to service_role/i);
  assert.match(sql, /device_commands_one_active_restart_idx/);
});

test("admin fleet and update tracker remain mobile responsive with safe status behavior", async () => {
  const fleet = await read("src/app/admin/DeviceFleet.jsx");
  const tracker = await read("src/app/admin/devices/[boardId]/update/page.jsx");
  const restart = await read("src/app/api/admin/devices/[boardId]/restart/route.js");
  const configuration = await read("src/app/api/admin/devices/[boardId]/configuration/route.js");
  assert.match(fleet, /sm:grid-cols/);
  assert.match(fleet, /Back to VikaTech site/);
  assert.match(fleet, /directOnline/);
  assert.match(fleet, /restart/);
  assert.match(tracker, /checking_wifi/);
  assert.match(tracker, /configuration|config_version/i);
  assert.match(tracker, /sm:flex-row|sm:grid-cols/);
  assert.match(restart, /DEVICE_NOT_DIRECTLY_CONNECTED/);
  assert.match(configuration, /wifiSsid/);
  assert.match(configuration, /encrypted_wifi_password/);
});
