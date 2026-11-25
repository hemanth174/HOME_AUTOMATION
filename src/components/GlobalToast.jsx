'use client';

import { useState, useEffect } from 'react';
import Toast from './Toast';

export default function GlobalToast() {
  const [toast, setToast] = useState({ message: '', id: 0 });

  useEffect(() => {
    const handleGlobalToast = (e) => {
      if (e.detail && typeof e.detail === 'string') {
        setToast((current) => ({ message: e.detail, id: current.id + 1 }));
      }
    };

    window.addEventListener('show-global-toast', handleGlobalToast);
    return () => window.removeEventListener('show-global-toast', handleGlobalToast);
  }, []);

  return <Toast key={toast.id} message={toast.message} onClose={() => setToast((current) => ({ ...current, message: '' }))} />;
}
