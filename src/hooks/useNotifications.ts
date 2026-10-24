import { useEffect, useRef, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ADMIN_EMAIL } from '../config/admin';

export interface AppNotification {
  id: string;
  recipientId: string;
  recipientEmail: string;
  type: string;
  title: string;
  body: string;
  incidentId: string;
  incidentNumber: number;
  read: boolean;
  createdAt: Date;
}

const notificationStorageKey = (userId: string) => `tsitsm-notifications-${userId}`;

const loadNotifications = (userId?: string): AppNotification[] => {
  if (!userId || typeof window === 'undefined') {
    return [];
  }

  try {
    const storedNotifications = window.localStorage.getItem(notificationStorageKey(userId));
    if (!storedNotifications) {
      return [];
    }

    return (JSON.parse(storedNotifications) as Array<Omit<AppNotification, 'createdAt'> & { createdAt: string }>)
      .map((notification) => ({
        ...notification,
        createdAt: new Date(notification.createdAt),
      }));
  } catch (error) {
    console.warn('Unable to restore notifications:', error);
    return [];
  }
};

export const useNotifications = (userId?: string, isAdmin = false) => {
  const [notifications, setNotifications] = useState<AppNotification[]>(() => loadNotifications(userId));
  const [loading, setLoading] = useState(Boolean(userId && isAdmin));
  const initializedRef = useRef(false);
  const previousIncidentsRef = useRef<Map<string, Record<string, unknown>>>(new Map());

  useEffect(() => {
    if (!userId || typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(notificationStorageKey(userId), JSON.stringify(notifications));
  }, [notifications, userId]);

  useEffect(() => {
    initializedRef.current = false;
    previousIncidentsRef.current = new Map();

    if (!userId) {
      return;
    }

    const incidentsQuery = isAdmin
      ? query(collection(db, 'incidents'))
      : query(collection(db, 'incidents'), where('reporterId', '==', userId));

    return onSnapshot(
      incidentsQuery,
      (snapshot) => {
        if (!initializedRef.current) {
          snapshot.docs.forEach((incidentDoc) => {
            previousIncidentsRef.current.set(incidentDoc.id, incidentDoc.data());
          });
          initializedRef.current = true;
          setLoading(false);
          return;
        }

        const newNotifications: AppNotification[] = [];
        snapshot.docChanges().forEach((change) => {
          if (change.type !== 'added' && change.type !== 'modified') {
            return;
          }

          const data = change.doc.data();
          const previousData = previousIncidentsRef.current.get(change.doc.id);
          const isNewIncident = change.type === 'added';
          const statusChanged = previousData?.status !== data.status;
          const adminNotesChanged = previousData?.adminNotes !== data.adminNotes;
          const previousComments = Array.isArray(previousData?.comments) ? previousData.comments : [];
          const currentComments = Array.isArray(data.comments) ? data.comments : [];
          const newComment = currentComments.length > previousComments.length
            ? currentComments[currentComments.length - 1] as Record<string, unknown>
            : null;
          const adminCommentAdded = newComment?.authorRole === 'admin'
            || (typeof newComment?.authorEmail === 'string'
              && newComment.authorEmail.toLowerCase() === ADMIN_EMAIL);
          const shouldNotify = isAdmin
            ? isNewIncident || statusChanged || adminNotesChanged || Boolean(newComment)
            : statusChanged || adminNotesChanged || adminCommentAdded;

          if (shouldNotify) {
            const incidentNumber = Number(data.incidentNumber) || Number(change.doc.id) || 0;
            const updateDescription = statusChanged
              ? `Status changed to ${data.status}`
              : adminNotesChanged
                ? 'Admin notes were updated'
                : 'A new comment was added';
            newNotifications.push({
              id: `${change.doc.id}-${Date.now()}`,
              recipientId: userId,
              recipientEmail: '',
              type: isNewIncident ? 'incident-created' : 'incident-updated',
              title: isNewIncident ? 'New incident raised' : 'Incident updated',
              body: `Incident #${incidentNumber}: ${isNewIncident ? data.title || 'New incident report' : updateDescription}`,
              incidentId: change.doc.id,
              incidentNumber,
              read: false,
              createdAt: new Date(),
            });
          }

          previousIncidentsRef.current.set(change.doc.id, data);
        });

        if (newNotifications.length > 0) {
          setNotifications((current) => [...newNotifications, ...current].slice(0, 50));
        }

        setLoading(false);
      },
      (error) => {
        console.error('Failed to load notifications:', error);
        setLoading(false);
      },
    );
  }, [userId, isAdmin]);

  const markAllAsRead = () => {
    setNotifications((current) => current.map((notification) => ({ ...notification, read: true })));
  };

  const clearNotifications = () => {
    setNotifications([]);
    if (userId && typeof window !== 'undefined') {
      window.localStorage.removeItem(notificationStorageKey(userId));
    }
  };

  return {
    notifications,
    unreadCount: notifications.filter((notification) => !notification.read).length,
    loading,
    markAllAsRead,
    clearNotifications,
  };
};
