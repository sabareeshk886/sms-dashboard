# Android SMS Dashboard Bridge

Open this folder in Android Studio and Run it on the Samsung A54.

Phone setup:
1. Server URL: http://192.168.80.132:8000
2. API token: use the same API_TOKEN from the Python server's .env
3. Save connection
4. Open Notification Access
5. Enable SMS Dashboard Bridge
6. Send a test SMS to the Samsung.

The laptop and phone must stay on the same Wi-Fi for this local version. The bridge watches Samsung Messages and Google Messages notifications and forwards their visible sender/message text to the Python API.
