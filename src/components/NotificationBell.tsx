import React, { useEffect, useRef, useState } from 'react';
import { useNotifications } from '../hooks/useNotifications';
import './NotificationBell.css';

interface NotificationBellProps {
  userId?: string;
  isAdmin?: boolean;
  onNotificationClick?: (incidentId: string) => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ userId, isAdmin, onNotificationClick }) => {
  const [isOpen, setIsOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount, loading, markAllAsRead, clearNotifications } = useNotifications(userId, isAdmin);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const formatTime = (createdAt: Date) => createdAt.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className="notification-center" ref={bellRef}>
      <button
        className="notification-bell"
        type="button"
        aria-label="Notifications"
        aria-expanded={isOpen}
        title="Notifications"
        onClick={() => setIsOpen((open) => !open)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>
        {unreadCount > 0 && <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>

      {isOpen && (
        <div className="notification-dropdown" role="dialog" aria-label="Notifications">
          <div className="notification-dropdown-header">
            <div>
              <h2>Notifications</h2>
              <span>{unreadCount} unread</span>
            </div>
            {unreadCount > 0 && (
              <button type="button" className="mark-read-btn" onClick={() => void markAllAsRead()}>
                Mark all read
              </button>
            )}
            {notifications.length > 0 && (
              <button type="button" className="clear-notifications-btn" onClick={clearNotifications}>
                Clear notifications
              </button>
            )}
          </div>

          <div className="notification-list">
            {loading ? (
              <p className="notification-empty">Loading notifications...</p>
            ) : notifications.length === 0 ? (
              <p className="notification-empty">You are all caught up.</p>
            ) : (
              notifications.slice(0, 20).map((notification) => (
                <button
                  type="button"
                  className={`notification-item ${notification.read ? '' : 'unread'}`}
                  key={notification.id}
                  onClick={() => {
                    onNotificationClick?.(notification.incidentId);
                    setIsOpen(false);
                  }}
                >
                  <span className="notification-item-dot" aria-hidden="true" />
                  <div>
                    <strong>{notification.title}</strong>
                    <p>{notification.body}</p>
                    <time dateTime={notification.createdAt.toISOString()}>{formatTime(notification.createdAt)}</time>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};