import cors from 'cors';
import express from 'express';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (admin.apps.length === 0) {
  admin.initializeApp(serviceAccountJson
    ? { credential: admin.credential.cert(JSON.parse(serviceAccountJson)) }
    : { projectId: process.env.FIREBASE_PROJECT_ID });
}

const app = express();
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean));

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin is not allowed'));
  },
  allowedHeaders: ['Authorization', 'Content-Type'],
  methods: ['GET', 'POST', 'OPTIONS'],
}));
app.use(express.json({ limit: '32kb' }));

const getMicrosoftAccessToken = async () => {
  const tenantId = process.env.MICROSOFT_DIRECTORY_ID;
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Microsoft Graph credentials are not configured');
  }

  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });

  if (!response.ok) {
    throw new Error(`Microsoft token request failed with status ${response.status}`);
  }

  const token = await response.json();
  if (!token.access_token) {
    throw new Error('Microsoft token response did not contain an access token');
  }
  return token.access_token;
};

const sendIncidentEmail = async (incident, action, recipients) => {
  const senderEmail = process.env.MICROSOFT_SENDER_EMAIL;
  if (!senderEmail) {
    throw new Error('MICROSOFT_SENDER_EMAIL is not configured');
  }

  const accessToken = await getMicrosoftAccessToken();
  const incidentNumber = incident.incidentNumber || 'Unknown';
  const title = incident.title || 'Incident report';
  const actionLabel = action === 'created' ? 'New ticket raised' : action === 'commented' ? 'Ticket comment added' : 'Ticket updated';
  const latestComment = Array.isArray(incident.comments) ? incident.comments.at(-1)?.text : '';
  const body = [
    `${actionLabel}: ${title}`,
    `Ticket: #${incidentNumber}`,
    `Status: ${incident.status || 'N/A'}`,
    `Reporter: ${incident.reporterName || 'N/A'} (${incident.reporterEmail || 'N/A'})`,
    `Department: ${incident.reporterDepartment || 'N/A'}`,
    `Category: ${incident.category || 'N/A'}`,
    `Severity: ${incident.severity || 'N/A'}`,
    `Asset: ${incident.assetName || incident.assetId || 'N/A'}`,
    '',
    'Description:',
    incident.description || 'N/A',
    ...(incident.adminNotes ? ['', 'Admin notes:', incident.adminNotes] : []),
    ...(latestComment ? ['', 'Latest comment:', latestComment] : []),
  ].join('\n');

  const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderEmail)}/sendMail`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        subject: `[INCIDENT][${action.toUpperCase()}] #${incidentNumber}: ${title}`,
        body: { contentType: 'Text', content: body },
        toRecipients: recipients.map((address) => ({ emailAddress: { address } })),
      },
      saveToSentItems: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Microsoft Graph sendMail failed with status ${response.status}`);
  }
};

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.post('/api/incidents/:incidentId/notify', async (req, res) => {
  const action = req.body?.action;
  if (!['created', 'updated', 'commented'].includes(action)) {
    res.status(400).json({ error: 'Invalid incident notification action' });
    return;
  }

  const authorization = req.get('authorization') || '';
  const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(tokenMatch[1]);
    const incidentSnapshot = await admin.firestore().collection('incidents').doc(req.params.incidentId).get();
    if (!incidentSnapshot.exists) {
      res.status(404).json({ error: 'Incident not found' });
      return;
    }

    const incident = incidentSnapshot.data();
    const actorEmail = (decodedToken.email || '').toLowerCase();
    const adminEmail = (process.env.ADMIN_EMAIL || 'murthy@topin.co.in').trim().toLowerCase();
    const isAdmin = actorEmail === adminEmail;
    const isReporter = incident.reporterId === decodedToken.uid;
    if (!isAdmin && !isReporter) {
      res.status(403).json({ error: 'Not authorized to notify for this incident' });
      return;
    }

    const configuredAdminEmail = (process.env.INCIDENT_NOTIFICATION_EMAIL || adminEmail).trim();
    const recipientMap = new Map([configuredAdminEmail, incident.reporterEmail]
      .filter((email) => typeof email === 'string' && email.includes('@'))
      .map((email) => [email.toLowerCase(), email.trim()]));
    const recipients = [...recipientMap.values()];

    await sendIncidentEmail(incident, action, recipients);
    res.status(200).json({ status: 'sent', recipientCount: recipients.length });
  } catch (error) {
    console.error('Incident email notification failed:', error);
    res.status(502).json({ error: 'Incident email notification failed' });
  }
});

app.listen(process.env.PORT || 3001, () => {
  console.log(`Notification API listening on port ${process.env.PORT || 3001}`);
});
