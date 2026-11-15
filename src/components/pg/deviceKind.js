import { Lightbulb, Fan, PlugZap } from 'lucide-react';
import { getDeviceWattage } from '@/app/analytics/helpers';
import { isBoardOnline } from '@/lib/boardPresence';

/**
 * Device categorization by name keywords. Only drives icon + restrained
 * tint — never capability: every device exposes exactly the ON/OFF relay
 * control the backend supports (no brightness / fan-speed UI, which the
 * relay hardware does not offer).
 */
export function getDeviceKind(name = '') {
  const n = String(name).toLowerCase();
  if (n.includes('fan')) {
    return {
      key: 'climate',
      label: 'Fan',
      Icon: Fan,
      tile: 'bg-(--pg-faint) text-(--pg-brand)',
    };
  }
  if (
    n.includes('light') ||
    n.includes('lamp') ||
    n.includes('bulb') ||
    n.includes('tube')
  ) {
    return {
      key: 'lighting',
      label: 'Lighting',
      Icon: Lightbulb,
      tile: 'bg-(--pg-faint) text-(--pg-brand)',
    };
  }
  return {
    key: 'appliance',
    label: 'Appliance',
    Icon: PlugZap,
    tile: 'bg-(--pg-faint) text-(--pg-brand)',
  };
}

export { getDeviceWattage, isBoardOnline };

export function getGreeting(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
