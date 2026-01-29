import React from 'react';
import Toast from './Toast';
import './Toast.css';

/**
 * Container component that renders all active toasts
 *
 * @param {Object} props
 * @param {Array} props.toasts - Array of toast objects
 * @param {function} props.onClose - Callback to close a specific toast
 */
const ToastContainer = ({ toasts, onClose }) => {
  if (!toasts || toasts.length === 0) {
    return null;
  }

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          onClose={() => onClose(toast.id)}
        />
      ))}
    </div>
  );
};

export default ToastContainer;
