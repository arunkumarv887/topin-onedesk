# Outlook incident notifications

Incident emails are sent by the standalone Express API in `notification-api/` after the app successfully creates, changes, or comments on a ticket. Firestore writes do not trigger incident emails. The API verifies the user's Firebase ID token and confirms the user is the ticket reporter or admin before sending to both the admin and reporter.

## Microsoft configuration

The app registration requires Microsoft Graph **Mail.Send** application permission with admin consent. Its client ID, directory ID, sender mailbox, and admin recipient are configured on the API server. Store `MICROSOFT_CLIENT_SECRET` in the API host's secret manager, never in the frontend `.env` or source control. The sender mailbox must exist in the Microsoft tenant.

The project admin address defaults to `murthy@topin.co.in`. The `.env.example` in `notification-api/` lists the API environment variables.

## Run locally

```powershell
cd notification-api
npm install
npm start
```

Set the API environment variables from `.env.example` in the local process environment. For Firestore reads, the local process also needs Google Application Default Credentials for the project. Do not put a service account private key in the frontend environment.

## Deploy the API

Deploy `notification-api/` as a separate Cloud Run service. For example:

```powershell
gcloud run deploy itsm-notification-api --source notification-api --project topin-onedesk --region YOUR_REGION --allow-unauthenticated
```

In Cloud Run, configure these environment variables:

- `FIREBASE_PROJECT_ID=topin-onedesk`
- `ADMIN_EMAIL=murthy@topin.co.in`
- `INCIDENT_NOTIFICATION_EMAIL=murthy@topin.co.in`
- `MICROSOFT_CLIENT_ID` and `MICROSOFT_DIRECTORY_ID`
- `MICROSOFT_SENDER_EMAIL=murthy@topin.co.in`
- `ALLOWED_ORIGINS` with the app's production origin(s)
- `MICROSOFT_CLIENT_SECRET` from Google Secret Manager

Grant the Cloud Run runtime service account Firestore read access and Secret Manager Secret Accessor for the client secret. The API can be publicly reachable at the network layer because each notification request requires a verified Firebase ID token and ticket authorization.

After deploying the API, set its URL as `VITE_NOTIFICATION_API_URL` in the frontend build environment, then rebuild and deploy the frontend (`npm run build` followed by `npx firebase deploy --only hosting`). Local development defaults to `http://localhost:3001`.

## Remove old Firestore triggers

If the previous incident email functions were already deployed, remove only those triggers so they cannot send duplicate emails:

```powershell
npx firebase functions:delete sendIncidentNotification sendIncidentUpdateNotification --region us-central1 --project topin-onedesk --force
```

This requires Cloud Functions permissions on the project. It does not remove the separate asset email functions.

## Verify

Create a ticket, update its status, and add a comment. The admin and reporter should each receive an email; if their addresses match, they receive one message. Check the Cloud Run logs if delivery fails. Asset email notifications in Firebase Functions are separate and unchanged.
