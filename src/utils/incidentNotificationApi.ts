import { auth } from '../config/firebase';

const getNotificationApiUrl = () => {
  const configuredUrl = import.meta.env.VITE_NOTIFICATION_API_URL;
  const apiUrl = configuredUrl || (import.meta.env.DEV ? 'http://localhost:3001' : '');
  return apiUrl.replace(/\/$/, '');
};

export const sendIncidentNotification = async (incidentId: string, action: 'created' | 'updated' | 'commented') => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Sign in is required to send a ticket notification');
  }

  const apiUrl = getNotificationApiUrl();
  if (!apiUrl) {
    throw new Error('VITE_NOTIFICATION_API_URL is not configured');
  }

  const response = await fetch(`${apiUrl}/api/incidents/${encodeURIComponent(incidentId)}/notify`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action }),
  });

  const result = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) {
    throw new Error(result?.error || `Notification API returned ${response.status}`);
  }
};
