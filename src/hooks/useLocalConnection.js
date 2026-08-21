'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchLocalStatus, getLocalBaseUrl } from '@/lib/localApi';

export default function useLocalConnection() {
  const [isLocalConnected, setIsLocalConnected] = useState(false);
  const [leaderNode, setLeaderNode] = useState(null);
  const [isProbing, setIsProbing] = useState(false);
  const [lastChecked, setLastChecked] = useState(null);
  const consecutiveFailures = useRef(0);

  const checkConnection = useCallback(async () => {
    try {
      setIsProbing(true);
      const data = await fetchLocalStatus();
      if (data && (data.online || data.status === 'ok' || data.nodeId || data.role === 'leader')) {
        setIsLocalConnected(true);
        setLeaderNode(data);
        consecutiveFailures.current = 0;
      } else {
        throw new Error('Invalid status payload');
      }
    } catch {
      consecutiveFailures.current += 1;
      // Require 2 consecutive failures before flipping to disconnected to prevent jitter
      if (consecutiveFailures.current >= 2) {
        setIsLocalConnected(false);
        setLeaderNode(null);
      }
    } finally {
      setIsProbing(false);
      setLastChecked(Date.now());
    }
  }, []);

  useEffect(() => {
<<<<<<< HEAD
    checkConnection();
    const interval = setInterval(checkConnection, 5000);
=======
    // Initial probe
    checkConnection();

    // Probe every 6 seconds in background
    const interval = setInterval(checkConnection, 6000);
>>>>>>> 21b6d4f91f39143be1c452e38bd4eb943f7a0728
    return () => clearInterval(interval);
  }, [checkConnection]);

  return {
    isLocalConnected,
    leaderNode,
    localUrl: getLocalBaseUrl(),
    isProbing,
    lastChecked,
    checkConnection
  };
}
