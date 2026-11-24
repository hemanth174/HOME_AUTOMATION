export const ADMIN_EMAILS = [
  'lrvkausthubh@gmail.com',
  'ramasaiahemanth@gmail.com',
];

// Navigation hint only. Server authorization reads admin_staff for these accounts.
export const INITIAL_SUB_ADMIN_EMAILS = [
  'peacefulguy2005@gmail.com',
  'akschayra@gmail.com',
];

export function isAdminEmail(email) {
  return ADMIN_EMAILS.includes((email || '').trim().toLowerCase());
}

export function hasAdminNavigation(email) {
  const normalized = (email || '').trim().toLowerCase();
  return isAdminEmail(normalized) || INITIAL_SUB_ADMIN_EMAILS.includes(normalized);
}
