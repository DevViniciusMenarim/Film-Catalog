import React, { useEffect, useState } from "react";
import "./Notification.css";

function Notification({ message, type, duration = 3000, onClose }) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      if (onClose) onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  if (!isVisible || !message) {
    return null;
  }

  return (
    <div className={`notification-container ${type}`}>
      <span>{message}</span>
      <button
        className="close-btn"
        onClick={() => {
          setIsVisible(false);
          if (onClose) onClose();
        }}
      >
        &times;
      </button>
    </div>
  );
}

export default Notification;