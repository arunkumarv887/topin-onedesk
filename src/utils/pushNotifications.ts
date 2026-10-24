import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { collection, doc, setDoc, getDoc, getDocs, query, where } from 'firebase/firestore';
import app, { db } from '../config/firebase';
import { ADMIN_EMAIL } from '../config/admin';

const TARGET_EMAIL = import.meta.env.VITE_NOTIFICATION_TARGET_EMAIL || ADMIN_EMAIL;

const isAdminEmail = (email?: string | null) => {
  return !!email && email.toLowerCase() === TARGET_EMAIL.toLowerCase();
};

const buildPayload = ({
  type,
  title,
  body,
  data,
}: {
  type: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}) => ({
  notification: { title, body },
  data: {
    type,
    ...(data || {}),
  },
});

export const sendAdminPushNotification = async ({
  type,
  title,
  body,
  data,
}: {
  type: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const tokensSnapshot = await getDocs(query(collection(db, 'notificationTokens'), where('email', '==', TARGET_EMAIL)));
    const tokens = tokensSnapshot.docs.map((snap) => snap.data().token).filter(Boolean) as string[];

    if (tokens.length === 0) {
      return;
    }

    const payload = buildPayload({ type, title, body, data });

    const notificationEndpoint = import.meta.env.VITE_NOTIFICATION_FUNCTION_URL || '/api/notifications/admin';

    await fetch(notificationEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error('Failed to send admin push notification:', error);
  }
};

export const registerAdminPushNotifications = async (uid?: string, email?: string | null) => {
  if (typeof window === 'undefined') {
    return;
  }

  if (!uid || !isAdminEmail(email)) {
    return;
  }

  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications');
    return;
  }

  if (!('serviceWorker' in navigator)) {
    console.warn('This browser does not support service workers');
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const messaging = getMessaging(app);
    const tokenOptions = {
      serviceWorkerRegistration: registration,
      ...(import.meta.env.VITE_FIREBASE_VAPID_KEY ? { vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY } : {}),
    };
    const currentToken = await getToken(messaging, tokenOptions);

    if (!currentToken) {
      return;
    }

    const tokenRef = doc(db, 'notificationTokens', uid);
    const existingSnap = await getDoc(tokenRef);
    const currentValue = existingSnap.exists() ? existingSnap.data()?.token : null;

    if (currentValue !== currentToken) {
      await setDoc(tokenRef, {
        uid,
        email,
        token: currentToken,
        createdAt: new Date(),
      }, { merge: true });
    }

    onMessage(messaging, (payload) => {
      const title = payload.notification?.title || 'New request received';
      const body = payload.notification?.body || 'A new request was submitted';
      new Notification(title, {
        body,
        icon: '/favicon.ico',
        tag: payload.data?.type || 'tsitsm-notification',
        requireInteraction: true,
      });
    });
  } catch (error) {
    console.error('Push notification registration failed:', error);
  }
};
