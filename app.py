import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import psycopg
from psycopg.rows import dict_row
from dotenv import load_dotenv

from google.auth import exceptions as google_auth_exceptions
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from fastapi import (
    FastAPI,
    Header,
    HTTPException,
    WebSocket,
    WebSocketDisconnect,
)

from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel


# ============================================================
# CONFIGURATION
# ============================================================

load_dotenv(override=True)

BASE = Path(__file__).resolve().parent

DATABASE_URL = os.getenv("DATABASE_URL")
API_TOKEN = os.getenv("API_TOKEN")
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID")


if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL environment variable is required"
    )


if not API_TOKEN:
    raise RuntimeError(
        "API_TOKEN environment variable is required"
    )


if not FIREBASE_PROJECT_ID:
    raise RuntimeError(
        "FIREBASE_PROJECT_ID environment variable is required"
    )


# Google authentication request object
firebase_request = google_requests.Request()


# Firebase token issuer
FIREBASE_ISSUER = (
    f"https://securetoken.google.com/{FIREBASE_PROJECT_ID}"
)


# ============================================================
# FASTAPI APP
# ============================================================

app = FastAPI(
    title="Private SMS Dashboard"
)

clients = set()


# ============================================================
# SMS MODEL
# ============================================================

class SMSIn(BaseModel):

    sender: str

    body: str

    timestamp: Optional[str] = None

    # Device sending the SMS
    # Existing Samsung devices default to "samsung"
    device_id: str = "samsung"


# ============================================================
# DATABASE CONNECTION
# ============================================================

def db():

    return psycopg.connect(
        DATABASE_URL,
        row_factory=dict_row,
    )


# ============================================================
# DATABASE INITIALIZATION
# ============================================================

def init_db():

    with db() as conn:

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                sender TEXT NOT NULL,
                body TEXT NOT NULL,
                category TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                is_read BOOLEAN NOT NULL DEFAULT FALSE,
                device_id TEXT NOT NULL DEFAULT 'samsung'
            )
            """
        )

        conn.execute(
            """
            ALTER TABLE messages
            ADD COLUMN IF NOT EXISTS device_id
            TEXT NOT NULL DEFAULT 'samsung'
            """
        )

        conn.commit()


# Initialize database
init_db()


# ============================================================
# MESSAGE CLASSIFICATION
# ============================================================

def classify(sender, body):

    text = (
        f"{sender} {body}"
    ).lower()


    # OTP
    if any(
        keyword in text
        for keyword in (
            "otp",
            "one time password",
            "verification code",
            "verify code",
            "passcode",
            "login code",
            "authentication",
            "security code",
        )
    ):
        return "OTP"


    # Delivery
    if any(
        keyword in text
        for keyword in (
            "delivery",
            "delivered",
            "shipment",
            "order",
            "package",
            "parcel",
            "out for delivery",
            "tracking",
            "track your",
        )
    ):
        return "Delivery"


    # Banking
    if any(
        keyword in text
        for keyword in (
            "bank",
            "credited",
            "debited",
            "transaction",
            "upi",
            "payment",
            "withdrawal",
            "balance",
            "transfer",
            "card",
            "credit card",
            "debit card",
            "loan",
            "emi",
        )
    ):
        return "Banking"


    return "Other"


# ============================================================
# PHONE API AUTHENTICATION
# ============================================================

def auth(authorization):

    if authorization != f"Bearer {API_TOKEN}":

        raise HTTPException(
            status_code=401,
            detail="Invalid API token",
        )


# ============================================================
# FIREBASE TOKEN VERIFICATION
# ============================================================

def verify_firebase_token(token):

    try:

        # Verify Firebase ID token using Google's
        # public Firebase signing certificates.
        decoded = id_token.verify_firebase_token(
            token,
            firebase_request,
            audience=FIREBASE_PROJECT_ID,
        )


        # Verify Firebase issuer.
        if decoded.get("iss") != FIREBASE_ISSUER:

            raise ValueError(
                "Invalid Firebase issuer"
            )


        # Firebase user ID must exist.
        if not decoded.get("sub"):

            raise ValueError(
                "Missing Firebase user ID"
            )


        # Email must be verified.
        if decoded.get("email_verified") is not True:

            raise ValueError(
                "Email is not verified"
            )


        # Get authenticated email.
        email = (
            decoded.get("email") or ""
        ).strip().lower()


        if not email:

            raise ValueError(
                "Email not present"
            )


        # Only allow faff company accounts.
        if not email.endswith("@usefaff.com"):

            raise ValueError(
                "Unauthorized email domain"
            )


        return decoded


    except (
        ValueError,
        google_auth_exceptions.GoogleAuthError,
    ) as error:

        raise HTTPException(
            status_code=401,
            detail="Invalid Firebase authentication",
        ) from error


# ============================================================
# DASHBOARD AUTHENTICATION
# ============================================================

def verify_dashboard_user(
    authorization
):

    if not authorization:

        raise HTTPException(
            status_code=401,
            detail="Authentication required",
        )


    if not authorization.startswith(
        "Bearer "
    ):

        raise HTTPException(
            status_code=401,
            detail="Invalid authorization header",
        )


    token = (
        authorization[7:]
        .strip()
    )


    if not token:

        raise HTTPException(
            status_code=401,
            detail="Authentication token missing",
        )


    return verify_firebase_token(
        token
    )


# ============================================================
# WEBSOCKET AUTHENTICATION
# ============================================================

def verify_websocket_token(token):

    if not token:

        raise HTTPException(
            status_code=401,
            detail="WebSocket authentication required",
        )


    return verify_firebase_token(
        token
    )


# ============================================================
# WEBSOCKET BROADCAST
# ============================================================

async def broadcast(data):

    dead = []


    for websocket in list(clients):

        try:

            await websocket.send_json(
                data
            )

        except Exception:

            dead.append(
                websocket
            )


    for websocket in dead:

        clients.discard(
            websocket
        )


# ============================================================
# DASHBOARD
# ============================================================

@app.get(
    "/",
    response_class=HTMLResponse,
)
def home():

    return (
        BASE
        / "templates"
        / "dashboard.html"
    ).read_text(
        encoding="utf-8"
    )


# ============================================================
# HEALTH CHECK
# ============================================================

@app.get("/api/health")
def health(
    authorization: Optional[str] = Header(None),
):

    verify_dashboard_user(
        authorization
    )

    return {
        "status": "online"
    }


# ============================================================
# GET MESSAGES
# ============================================================

@app.get("/api/messages")
def messages(
    authorization: Optional[str] = Header(None),
):

    # Dashboard users must authenticate.
    verify_dashboard_user(
        authorization
    )


    with db() as conn:

        rows = conn.execute(
            """
            SELECT
                id,
                sender,
                body,
                category,
                timestamp,
                is_read,
                device_id
            FROM messages
            ORDER BY id DESC
            LIMIT 500
            """
        ).fetchall()


    return rows


# ============================================================
# ADD MESSAGE
# ============================================================

@app.post("/api/messages")
async def add(
    m: SMSIn,
    authorization: Optional[str] = Header(None),
):

    # Android phones continue using the
    # private API token.
    auth(
        authorization
    )


    # Timestamp
    ts = (
        m.timestamp
        or datetime.now(
            timezone.utc
        ).isoformat()
    )


    # Category
    category = classify(
        m.sender,
        m.body,
    )


    # Normalize device ID
    device_id = (
        m.device_id.strip().lower()
        if m.device_id
        else "samsung"
    )


    # Only allow known devices
    if device_id not in (
        "samsung",
        "poco",
    ):

        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid device_id. "
                "Use 'samsung' or 'poco'."
            ),
        )


    # Store in PostgreSQL
    with db() as conn:

        row = conn.execute(
            """
            INSERT INTO messages
                (
                    sender,
                    body,
                    category,
                    timestamp,
                    is_read,
                    device_id
                )
            VALUES
                (
                    %s,
                    %s,
                    %s,
                    %s,
                    FALSE,
                    %s
                )
            RETURNING id
            """,
            (
                m.sender,
                m.body,
                category,
                ts,
                device_id,
            ),
        ).fetchone()


        conn.commit()


    message_id = row["id"]


    # Response object
    output = {

        "id": message_id,

        "sender": m.sender,

        "body": m.body,

        "category": category,

        "timestamp": ts,

        "is_read": False,

        "device_id": device_id,
    }


    # Send live update to dashboard
    await broadcast(
        {
            "type": "new_message",
            "message": output,
        }
    )


    return output


# ============================================================
# MARK MESSAGE AS READ
# ============================================================

@app.patch(
    "/api/messages/{mid}/read"
)
def read(
    mid: int,
    authorization: Optional[str] = Header(None),
):

    # Dashboard users must authenticate.
    verify_dashboard_user(
        authorization
    )


    with db() as conn:

        conn.execute(
            """
            UPDATE messages
            SET is_read = TRUE
            WHERE id = %s
            """,
            (mid,),
        )


        conn.commit()


    return {
        "ok": True
    }


# ============================================================
# DELETE MESSAGE
# ============================================================

@app.delete(
    "/api/messages/{mid}"
)
def delete(
    mid: int,
    authorization: Optional[str] = Header(None),
):

    # Dashboard users must authenticate.
    verify_dashboard_user(
        authorization
    )


    with db() as conn:

        conn.execute(
            """
            DELETE FROM messages
            WHERE id = %s
            """,
            (mid,),
        )


        conn.commit()


    return {
        "ok": True
    }


# ============================================================
# WEBSOCKET
# ============================================================

@app.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket
):

    token = (
        websocket.query_params.get(
            "token"
        )
    )


    try:

        verify_websocket_token(
            token
        )


    except HTTPException:

        await websocket.close(
            code=1008
        )

        return


    # Only accept after authentication.
    await websocket.accept()


    clients.add(
        websocket
    )


    try:

        while True:

            await websocket.receive_text()


    except WebSocketDisconnect:

        clients.discard(
            websocket
        )


    except Exception:

        clients.discard(
            websocket
        )


# ============================================================
# STATIC FILES
# ============================================================

app.mount(
    "/static",
    StaticFiles(
        directory=BASE / "static"
    ),
    name="static",
)