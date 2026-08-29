export const ADMIN_EMAILS = [
  'lrvkausthubh@gmail.com',
  'ramasaiahemanth@gmail.com',
];

export function isAdminEmail(email) {
  return ADMIN_EMAILS.includes((email || '').trim().toLowerCase());
}
