'use client';

import { useState, useEffect } from 'react';
import Toast from './Toast';

export default function GlobalToast() {
  const [toastMessage, setToastMessage] = useState('');

  useEffect(() => {
    const handleGlobalToast = (e) => {
      if (e.detail && typeof e.detail === 'string') {
        setToastMessage(e.detail);
      }
    };

    window.addEventListener('show-global-toast', handleGlobalToast);
    return () => window.removeEventListener('show-global-toast', handleGlobalToast);
  }, []);

  return <Toast message={toastMessage} onClose={() => setToastMessage('')} />;
}
