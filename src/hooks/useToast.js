import { useState, useCallback } from 'react';

/**
 * Hook for managing toast notifications
 *
 * @returns {Object} - { toasts, showToast, hideToast }
 */
export const useToast = () => {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = Date.now() + Math.random();
    const toast = { id, message, type, duration };

    setToasts((prev) => [...prev, toast]);

    return id;
  }, []);

  const hideToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return { toasts, showToast, hideToast };
};

/**
 * Convenience methods for specific toast types
 */
export const createToastHelpers = (showToast) => ({
  success: (message, duration) => showToast(message, 'success', duration),
  error: (message, duration = 5000) => showToast(message, 'error', duration),
  warning: (message, duration) => showToast(message, 'warning', duration),
  info: (message, duration) => showToast(message, 'info', duration),
});
