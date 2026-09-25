# SMS Dashboard

A centralized internal SMS management dashboard that collects SMS messages from multiple Android devices and displays them in a single web interface.

The system was built to solve the operational problem of employees having to physically access shared company phones whenever an OTP or important SMS was received.

---

## Overview

The SMS Dashboard connects Android phones to a cloud-based backend.

When an SMS arrives on a registered phone:

1. The Android Bridge detects the incoming SMS.
2. The message is sent to the FastAPI backend through HTTPS.
3. The backend stores the message in PostgreSQL.
4. The dashboard retrieves and displays the message.
5. New messages can appear automatically without manually refreshing the dashboard.

The system currently supports:

- Samsung devices
- Poco/Xiaomi devices
- Multiple devices
- OTP messages
- Banking messages
- Delivery/order messages
- Other SMS messages

---

## Architecture

```text
                 ┌─────────────────────┐
                 │   Samsung Phone     │
                 │   SMS Bridge App    │
                 └──────────┬──────────┘
                            │
                            │ HTTPS
                            ▼
                 ┌─────────────────────┐
                 │    Poco Phone       │
                 │   SMS Bridge App    │
                 └──────────┬──────────┘
                            │
                            │ HTTPS
                            ▼
                 ┌─────────────────────┐
                 │   FastAPI Backend   │
                 │       Vercel        │
                 └──────────┬──────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │  Neon PostgreSQL    │
                 │      Database       │
                 └──────────┬──────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │   Web Dashboard     │
                 │       Vercel        │
                 └─────────────────────┘
