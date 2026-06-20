'use client';

import { usePathname } from 'next/navigation';

export default function PageTitle() {
  const pathname = usePathname();

  const getTitleFromPath = () => {
    const pathMap = {
      '/': 'Dashboard',
      '/presets': 'Presets',
      '/boards': 'Boards',
      '/schedules': 'Schedules',
      '/alarms': 'Alarms',
    };
    return pathMap[pathname] || 'Dashboard';
  };

  return (
    <h1 className="text-text text-2xl font-extrabold tracking-tight m-0 select-none">
      {getTitleFromPath()}
    </h1>
  );
}
