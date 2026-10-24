import { useState, useEffect, useRef } from 'react';
import { collection, query, where, getDocs, updateDoc, doc, arrayUnion, serverTimestamp, runTransaction } from 'firebase/firestore';
import { db } from '../config/firebase';
import { sendIncidentNotification } from '../utils/incidentNotificationApi';
import { ADMIN_EMAIL } from '../config/admin';
import type { Incident } from '../types/asset';
import { logActivityEvent } from '../utils/activityLogs';

const notifyIncident = async (incidentId: string, action: 'created' | 'updated' | 'commented') => {
  try {
    await sendIncidentNotification(incidentId, action);
    return true;
  } catch (error) {
    console.error('Ticket was saved, but Outlook notification failed:', error);
    return false;
  }
};

export const useIncidents = (userId?: string, isAdmin?: boolean) => {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const notificationStateRef = useRef<Map<string, { firstNotified: boolean; reminderNotified: boolean }>>(new Map());
  const hasInitializedRef = useRef(false);

  const requestNotificationPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }

    if (Notification.permission === 'default') {
      return Notification.requestPermission();
    }

    return Notification.permission;
  };

  const showIncidentNotification = async (incident: Incident, title: string) => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return;
    }

    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      return;
    }

    const body = incident.title || `Incident #${incident.incidentNumber}`;
    new Notification(title, {
      body,
      icon: '/favicon.ico',
      requireInteraction: true,
    });
  };

  const getIncidentKey = (incident: Incident) => incident.id || `${incident.incidentNumber}`;

  const handleIncidentNotifications = async (incidentList: Incident[]) => {
    if (!hasInitializedRef.current) {
      incidentList.forEach((incident) => {
        notificationStateRef.current.set(getIncidentKey(incident), {
          firstNotified: true,
          reminderNotified: false,
        });
      });
      hasInitializedRef.current = true;
      return;
    }

    incidentList.forEach((incident) => {
      const key = getIncidentKey(incident);
      const state = notificationStateRef.current.get(key) || { firstNotified: false, reminderNotified: false };

      if (!state.firstNotified) {
        void showIncidentNotification(incident, 'New incident raised');
        notificationStateRef.current.set(key, { firstNotified: true, reminderNotified: false });
        return;
      }

      const createdAt = incident.createdAt instanceof Date
        ? incident.createdAt
        : new Date(incident.createdAt);
      const isOpen = incident.status === 'open';
      const isPastReminderWindow = isOpen && Date.now() - createdAt.getTime() > 30 * 60 * 1000;

      if (isPastReminderWindow && !state.reminderNotified) {
        void showIncidentNotification(incident, 'Incident still open');
        notificationStateRef.current.set(key, { firstNotified: true, reminderNotified: true });
      }
    });
  };

  const fetchIncidents = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }

      const incidentsCollection = collection(db, 'incidents');
      let q;

      if (isAdmin) {
        q = query(incidentsCollection);
      } else if (userId) {
        q = query(incidentsCollection, where('reporterId', '==', userId));
      } else {
        setIncidents([]);
        if (showLoading) {
          setLoading(false);
        }
        return;
      }

      const snapshot = await getDocs(q);
      const incidentsList = snapshot.docs
        .map((incidentDoc) => {
          const data = incidentDoc.data() as any;
          return {
            ...data,
            id: incidentDoc.id,
            incidentNumber: typeof data.incidentNumber === 'number'
              ? data.incidentNumber
              : Number(incidentDoc.id) || 0,
            createdAt: data.createdAt?.toDate?.() || new Date(),
            updatedAt: data.updatedAt?.toDate?.() || new Date(),
            comments: data.comments?.map((comment: any) => ({
              ...comment,
              createdAt: comment.createdAt?.toDate?.() || new Date(),
            })) || [],
          } as Incident;
        })
        .sort((a, b) => {
          const statusOrder: Record<Incident['status'], number> = {
            open: 0,
            'work in progress': 1,
            monitoring: 2,
            resolved: 3,
          };

          const aStatusOrder = statusOrder[a.status] ?? 4;
          const bStatusOrder = statusOrder[b.status] ?? 4;

          if (aStatusOrder !== bStatusOrder) {
            return aStatusOrder - bStatusOrder;
          }

          const aTime = a.createdAt?.getTime?.() ?? 0;
          const bTime = b.createdAt?.getTime?.() ?? 0;
          return bTime - aTime || b.incidentNumber - a.incidentNumber;
        });

      await handleIncidentNotifications(incidentsList);

      setIncidents(incidentsList);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch incidents');
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!userId && !isAdmin) {
      setIncidents([]);
      setLoading(false);
      return;
    }

    fetchIncidents(true);
  }, [userId, isAdmin]);

  useEffect(() => {
    if (!userId && !isAdmin) {
      return;
    }

    const intervalId = window.setInterval(() => {
      fetchIncidents(false);
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [userId, isAdmin]);

  const refetch = () => fetchIncidents(false);

  const createIncident = async (incidentData: Omit<Incident, 'id' | 'createdAt' | 'updatedAt' | 'incidentNumber'>) => {
    try {
      if (!incidentData.reporterId) {
        throw new Error('Missing authenticated reporter');
      }

      const counterRef = doc(db, 'counters', 'incidents');
      const incidentId = await runTransaction(db, async (transaction) => {
        const counterSnap = await transaction.get(counterRef);
        const currentCounter = counterSnap.exists() ? (counterSnap.data().value as number) : 0;
        const nextIncidentNumber = currentCounter + 1;
        transaction.set(counterRef, { value: nextIncidentNumber }, { merge: true });

        const incidentRef = doc(db, 'incidents', `${nextIncidentNumber}`);
        transaction.set(incidentRef, {
          ...incidentData,
          incidentNumber: nextIncidentNumber,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return incidentRef.id;
      });

      await logActivityEvent({
        module: 'incident',
        action: 'created',
        description: `Raised incident ${incidentData.title}`,
        performedBy: incidentData.reporterName || incidentData.reporterEmail || 'User',
        performedByEmail: incidentData.reporterEmail || '',
        targetName: incidentData.title,
        targetId: `${incidentData.title}`,
      });

      const notificationSent = await notifyIncident(incidentId, 'created');
      refetch();
      return notificationSent;
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to create incident');
    }
  };

  const updateIncidentStatus = async (incidentId: string, status: Incident['status'], adminNotes?: string) => {
    try {
      const incidentRef = doc(db, 'incidents', incidentId);
      const updateData: Record<string, unknown> = {
        status,
        updatedAt: serverTimestamp(),
      };

      if (adminNotes) {
        updateData.adminNotes = adminNotes;
      }

      await updateDoc(incidentRef, updateData);
      await logActivityEvent({
        module: 'incident',
        action: 'updated',
        description: `Updated incident status to ${status}`,
        performedBy: 'IT Admin',
        performedByEmail: ADMIN_EMAIL,
        targetName: incidentId,
        targetId: incidentId,
      });
      const notificationSent = await notifyIncident(incidentId, 'updated');
      refetch();
      return notificationSent;
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to update incident');
    }
  };

  const addComment = async (incidentId: string, comment: Omit<Incident['comments'][0], 'createdAt'>) => {
    try {
      const incidentRef = doc(db, 'incidents', incidentId);
      await updateDoc(incidentRef, {
        comments: arrayUnion({
          ...comment,
          createdAt: new Date(),
        }),
        updatedAt: serverTimestamp(),
      });
      await logActivityEvent({
        module: 'incident',
        action: 'commented',
        description: `Added comment to incident ${incidentId}`,
        performedBy: comment.authorName || comment.authorEmail || 'User',
        performedByEmail: comment.authorEmail || '',
        targetName: incidentId,
        targetId: incidentId,
      });
      const notificationSent = await notifyIncident(incidentId, 'commented');
      refetch();
      return notificationSent;
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to add comment');
    }
  };

  return { incidents, loading, error, refetch, createIncident, updateIncidentStatus, addComment };
};
