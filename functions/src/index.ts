import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as nodemailer from 'nodemailer';

admin.initializeApp();

const getConfigValue = (envKey: string, configKey?: string): string | undefined => {
  const fromEnv = process.env[envKey];
  if (fromEnv) {
    return fromEnv;
  }

  const fromConfig = configKey ? (functions.config()?.[configKey] as string | undefined) : undefined;
  return fromConfig;
};

const getConfiguredSender = (): string => {
  return getConfigValue('SMTP_FROM', 'smtp.from') || getConfigValue('OUTLOOK_EMAIL', 'outlook.email') || getConfigValue('SMTP_USER', 'smtp.user') || 'no-reply@localhost';
};

const createEmailTransporter = () => {
  const smtpHost = getConfigValue('SMTP_HOST', 'smtp.host');
  const smtpUser = getConfigValue('SMTP_USER', 'smtp.user');
  const smtpPass = getConfigValue('SMTP_PASS', 'smtp.pass');
  const outlookEmail = getConfigValue('OUTLOOK_EMAIL', 'outlook.email');
  const outlookPassword = getConfigValue('OUTLOOK_PASSWORD', 'outlook.password');

  if (smtpHost && smtpUser && smtpPass) {
    return nodemailer.createTransport({
      host: smtpHost,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });
  }

  if (outlookEmail && outlookPassword) {
    return nodemailer.createTransport({
      service: 'outlook',
      auth: {
        user: outlookEmail,
        pass: outlookPassword,
      },
    });
  }

  throw new Error('Email configuration is missing. Set SMTP_HOST/SMTP_USER/SMTP_PASS or OUTLOOK_EMAIL/OUTLOOK_PASSWORD');
};

const generateAssetEmailTemplate = (assetData: any): string => {
  return `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #2c3e50; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #ecf0f1; padding: 20px; }
          .field { margin: 10px 0; }
          .field-label { font-weight: bold; color: #2c3e50; }
          .field-value { color: #555; margin-left: 10px; }
          .footer { background-color: #34495e; color: white; padding: 10px; text-align: center; border-radius: 0 0 5px 5px; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>New Asset Added to System</h2>
          </div>
          <div class="content">
            <p>A new asset has been added to the Asset Management System:</p>

            <div class="field">
              <span class="field-label">Employee ID:</span>
              <span class="field-value">${assetData.employeeId || 'N/A'}</span>
            </div>

            <div class="field">
              <span class="field-label">Employee Name:</span>
              <span class="field-value">${assetData.employeeName || 'N/A'}</span>
            </div>

            <div class="field">
              <span class="field-label">Category:</span>
              <span class="field-value">${assetData.category || 'N/A'}</span>
            </div>

            <div class="field">
              <span class="field-label">Manufacturer:</span>
              <span class="field-value">${assetData.manufacturer || 'N/A'}</span>
            </div>

            <div class="field">
              <span class="field-label">Model:</span>
              <span class="field-value">${assetData.model || 'N/A'}</span>
            </div>

            <div class="field">
              <span class="field-label">Serial Number:</span>
              <span class="field-value">${assetData.serialNumber || 'N/A'}</span>
            </div>

            <div class="field">
              <span class="field-label">Department:</span>
              <span class="field-value">${assetData.department || 'N/A'}</span>
            </div>

            <div class="field">
              <span class="field-label">Status:</span>
              <span class="field-value">${assetData.status || 'N/A'}</span>
            </div>

            <div class="field">
              <span class="field-label">Condition:</span>
              <span class="field-value">${assetData.condition || 'N/A'}</span>
            </div>

            <div class="field">
              <span class="field-label">Asset Timestamp:</span>
              <span class="field-value">${new Date().toLocaleString()}</span>
            </div>
          </div>
          <div class="footer">
            <p>This is an automated notification from Asset Management System</p>
          </div>
        </div>
      </body>
    </html>
  `;
};

const sendEmail = async (to: string, subject: string, html: string) => {
  const transporter = createEmailTransporter();
  const from = getConfiguredSender();

  await transporter.sendMail({
    from,
    to,
    subject,
    html,
  });
};

// Cloud Function: Send email notification when asset is created (v2 API)
export const sendAssetNotification = functions.firestore
  .onDocumentCreated('assets/{assetId}', async (event: any) => {
    const assetData = event.data?.data();

    if (!assetData) {
      console.log('No asset data found');
      return;
    }

    const userEmail = assetData.userEmail;

    if (!userEmail || !userEmail.includes('@')) {
      console.log('Invalid or missing user email:', userEmail);
      return;
    }

    try {
      await sendEmail(
        userEmail,
        `New Asset Added - ${assetData.category || 'Asset'}: ${assetData.serialNumber || 'N/A'}`,
        generateAssetEmailTemplate(assetData),
      );
      console.log(`Email sent successfully to ${userEmail}`);
    } catch (error) {
      console.error('Error sending email:', error);
      throw new functions.https.HttpsError('internal', 'Failed to send notification email');
    }
  });
// Cloud Function: Send bulk notification to admin (v2 API)
export const sendAdminNotification = functions.firestore
  .onDocumentCreated('assets/{assetId}', async (event: any) => {
    const assetData = event.data?.data();

    if (!assetData) {
      console.log('No asset data found');
      return;
    }

    const adminEmail = process.env.ADMIN_EMAIL;

    if (!adminEmail) {
      console.log('Admin email not configured');
      return;
    }

    try {
      await sendEmail(
        adminEmail,
        `[ADMIN] New Asset Created by ${assetData.employeeName || 'Unknown'}`,
        generateAssetEmailTemplate(assetData),
      );
      console.log(`Admin notification sent to ${adminEmail}`);
    } catch (error) {
      console.error('Error sending admin notification:', error);
    }
  });

