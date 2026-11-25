export function showAdminToast(message, kind = 'info') {
  if (typeof window === 'undefined' || !message) return;
  const prefix = kind === 'success' ? '✅ ' : kind === 'error' ? '❌ ' : '';
  window.dispatchEvent(new CustomEvent('show-global-toast', { detail: `${prefix}${message}` }));
}
