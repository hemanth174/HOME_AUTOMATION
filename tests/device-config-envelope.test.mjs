import test from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, createHash, webcrypto } from "node:crypto";
import { encryptDeviceConfigEnvelope } from "../supabase/functions/_shared/device-config-crypto.mjs";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const token = "device-token-for-test-only-0123456789abcdef";
const boardId = "pg-board-001";
const version = 7;
const config = {
  version,
  wifi_ssid: "PG Guest WiFi",
  wifi_security: "wpa2_psk",
  wifi_password: "not-a-real-password-123",
};

function decodeBase64Url(value) {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function decryptEnvelope(envelope, selectedBoard = boardId, selectedVersion = version) {
  assert.equal(envelope.scheme, "A256GCM");
  assert.equal(envelope.schema_version, 1);
  assert.equal(envelope.config_version, version);
  const key = createHash("sha256")
    .update("vikatech-device-config-v1:" + token)
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
  const clear = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(clear.toString("utf8"));
}

test("device configuration is encrypted and round-trips for its intended board", async () => {
  const envelope = await encryptDeviceConfigEnvelope(token, boardId, version, config);
  assert.equal(envelope.config_version, version);
  assert.equal(JSON.stringify(envelope).includes(config.wifi_password), false);
  assert.deepEqual(decryptEnvelope(envelope), config);
});

test("configuration envelope cannot be moved to another board or version", async () => {
  const envelope = await encryptDeviceConfigEnvelope(token, boardId, version, config);
  assert.throws(() => decryptEnvelope(envelope, "different-board", version));
  assert.throws(() => decryptEnvelope(envelope, boardId, version + 1));
});

test("tampering with encrypted configuration is rejected", async () => {
  const envelope = await encryptDeviceConfigEnvelope(token, boardId, version, config);
  const decoded = decodeBase64Url(envelope.ciphertext);
  decoded[0] ^= 0x01;
  envelope.ciphertext = decoded.toString("base64url");
  assert.throws(() => decryptEnvelope(envelope));
});
