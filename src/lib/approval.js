export const APPROVAL_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  REVOKED: 'revoked',
};

export const ORDER_APPROVAL_STATUSES = {
  ACCOUNT: 'awaiting_account_approval',
  SECOND_ADMIN: 'awaiting_second_admin',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

export const APPROVAL_ADMINS = [
  'lrvkausthubh@gmail.com',
  'ramasaiahemanth@gmail.com',
];

export function isApprovalAdmin(email) {
  return APPROVAL_ADMINS.includes((email || '').trim().toLowerCase());
}
