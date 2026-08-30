import { useContext } from 'react';
import { SocketContext } from '../contexts/SocketContext';

export function usePaladioSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('usePaladioSocket must be used within a SocketProvider');
  }
  return context;
}

export type { SocketStatus, PaladioEvent } from '../contexts/SocketContext';
