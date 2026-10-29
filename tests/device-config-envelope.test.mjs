import test from "node:test";
import assert from "node:assert/strict";
import { createDecipheriv, createHash, webcrypto } from "node:crypto";
import { encryptDeviceConfigEnvelope } from "../supabase/functions/_shared/device-config-crypto.mjs";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const token = "device-token-for-test-only-0123456789abcdef";
const boardId = "pg-board-001";
const version = 7;
const configuration = {
  version,
  wifi_ssid: "PG Guest WiFi",
  wifi_security: "wpa2_psk",
  wifi_password: "not-a-real-password-123",
};

function decodeBase64Url(value) {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function decryptEnvelope(envelope, selectedBoard = boardId, selectedVersion = version, selectedToken = token) {
  assert.equal(envelope.scheme, "A256GCM");
  assert.equal(envelope.schema_version, 1);
  assert.equal(envelope.config_version, version);
  const key = createHash("sha256")
    .update("vikatech-device-config-v1:" + selectedToken)
    .digest();
  const iv = decodeBase64Url(envelope.iv);
  const ciphertextAndTag = decodeBase64Url(envelope.ciphertext);
  assert.equal(iv.length, 12);
  assert.ok(ciphertextAndTag.length > 16);
  const ciphertext = ciphertextAndTag.subarray(0, ciphertextAndTag.length - 16);
  const tag = ciphertextAndTag.subarray(ciphertextAndTag.length - 16);
  const aad = Buffer.from(
    "VikaTech-ESP32-Config-v1|" + selectedBoard + "|" + selectedVersion,
    "utf8",
  );
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8"));
}

test("configuration envelope encrypts the Wi-Fi password and round-trips", async () => {
  const envelope = await encryptDeviceConfigEnvelope(token, boardId, version, configuration);
  assert.equal(JSON.stringify(envelope).includes(configuration.wifi_password), false);
  assert.deepEqual(decryptEnvelope(envelope), configuration);
});

test("configuration envelope is bound to its board, version and device token", async () => {
  const envelope = await encryptDeviceConfigEnvelope(token, boardId, version, configuration);
  assert.throws(() => decryptEnvelope(envelope, "another-board", version));
  assert.throws(() => decryptEnvelope(envelope, boardId, version + 1));
  assert.throws(() => decryptEnvelope(envelope, boardId, version, "another-device-token-0123456789abcdef"));
});

test("tampered ciphertext fails AES-GCM authentication", async () => {
  const envelope = await encryptDeviceConfigEnvelope(token, boardId, version, configuration);
  const decoded = decodeBase64Url(envelope.ciphertext);
  decoded[0] ^= 0x01;
  envelope.ciphertext = decoded.toString("base64url");
  assert.throws(() => decryptEnvelope(envelope));
});
