import { useEffect } from "react";
import "./Notification.css";

function Notification({ id, message, type, duration = 3000, onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => onClose(id), duration);
    return () => clearTimeout(timer);
  }, [duration, id, onClose]);

  return (
    <div
      className={`notification-container ${type}`}
      role={type === "error" ? "alert" : "status"}
      aria-live={type === "error" ? "assertive" : "polite"}
    >
      <span>{message}</span>
      <button
        type="button"
        className="close-btn"
        aria-label="Fechar notificação"
        onClick={() => onClose(id)}
      >
        &times;
      </button>
    </div>
  );
}

export default Notification;
