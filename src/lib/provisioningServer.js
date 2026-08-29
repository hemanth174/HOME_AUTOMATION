import crypto from 'crypto';

function key() {
  return crypto.createHash('sha256').update(process.env.PROVISIONING_ENCRYPTION_KEY || 'change-this-provisioning-key').digest();
}

export function encryptProvisioningValue(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptProvisioningValue(value) {
  const [iv, tag, encrypted] = value.split('.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
}

export function hashProvisioningToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createProvisioningToken() {
  return crypto.randomBytes(32).toString('base64url');
}
