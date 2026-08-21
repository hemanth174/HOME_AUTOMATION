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
    checkConnection();
    const interval = setInterval(checkConnection, 5000);
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
