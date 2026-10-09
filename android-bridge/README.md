# Android SMS Dashboard Bridge

Android app that forwards incoming SMS and business/OTP WhatsApp messages from a phone to the SMS dashboard API.

## Build

Open this folder in Android Studio and Run it on the phone (Samsung or Poco).

## Phone setup

1. Server URL: defaults to `https://sms-dashboard-gamma.vercel.app` (or your own server, e.g. `http://<laptop-ip>:8000` on the same Wi-Fi).
2. API token: the same `API_TOKEN` as the dashboard server's `.env`.
3. Tap **Save connection** and allow the SMS permissions.
4. Tap **Open Notification Access** and enable **WhatsApp OTP Listener** (needed for WhatsApp forwarding).
5. Tap **Send test SMS** to check the connection, then send a real SMS to the phone.

## How it works

- **SMS:** `SmsInboxMonitor` reads the SMS inbox and uploads every message newer than the last uploaded one to `/api/sms`. Existing messages are not uploaded on first run. Failed uploads are retried.
- **WhatsApp:** `WhatsAppNotificationListener` reads WhatsApp / WhatsApp Business notifications and forwards only OTPs and likely business/service messages to `/api/whatsapp`. Personal and group chats are ignored.
