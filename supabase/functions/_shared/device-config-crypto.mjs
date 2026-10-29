const encoder = new TextEncoder();

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function encryptDeviceConfigEnvelope(
  deviceToken,
  boardIdentifier,
  configVersion,
  configuration,
) {
  if (typeof deviceToken !== "string" || deviceToken.length < 32) {
    throw new Error("A valid per-device token is required to encrypt the configuration");
  }
  if (typeof boardIdentifier !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(boardIdentifier)) {
    throw new Error("Invalid board identifier for configuration encryption");
  }
  if (!Number.isInteger(configVersion) || configVersion < 1) {
    throw new Error("Invalid configuration version for encryption");
  }

  // Derive a per-board encryption key from the board's unique bearer token.
  // TLS is still required; this envelope adds at-rest-to-device protection.
  const keyMaterial = encoder.encode("vikatech-device-config-v1:" + deviceToken);
  const keyBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", keyMaterial));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const additionalData = encoder.encode(
    "VikaTech-ESP32-Config-v1|" + boardIdentifier + "|" + configVersion,
  );
  const plaintext = encoder.encode(JSON.stringify(configuration));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData, tagLength: 128 },
    key,
    plaintext,
  ));

  return {
    scheme: "A256GCM",
    schema_version: 1,
    config_version: configVersion,
    iv: base64Url(iv),
    // WebCrypto returns ciphertext followed by the 16-byte GCM tag.
    ciphertext: base64Url(ciphertext),
  };
}
