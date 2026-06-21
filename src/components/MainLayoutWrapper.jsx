'use client';

import { usePathname } from 'next/navigation';
import AlarmExecutor from './AlarmExecutor';
import GlobalToast from './GlobalToast';

export default function MainLayoutWrapper({ children }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';

  return (
    <div className={isLoginPage ? "w-full min-h-screen" : "w-full min-h-screen md:pl-64 pb-20 md:pb-8 transition-all duration-300"}>
      {children}
      {!isLoginPage && (
        <>
          <AlarmExecutor />
          <GlobalToast />
        </>
      )}
    </div>
  );
}
