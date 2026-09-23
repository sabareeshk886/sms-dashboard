import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import psycopg
from psycopg.rows import dict_row
from dotenv import load_dotenv

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
TOKEN = os.getenv("API_TOKEN", "change-me")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not configured")


# ============================================================
# FASTAPI APP
# ============================================================

app = FastAPI(title="Private SMS Dashboard")

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

        # Create table if it doesn't exist
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

        # Add device_id to the existing table if the table
        # was created before multi-device support.
        conn.execute(
            """
            ALTER TABLE messages
            ADD COLUMN IF NOT EXISTS device_id
            TEXT NOT NULL DEFAULT 'samsung'
            """
        )

        conn.commit()


# Initialize database when application starts
init_db()


# ============================================================
# MESSAGE CLASSIFICATION
# ============================================================

def classify(sender, body):

    t = f"{sender} {body}".lower()

    if any(
        x in t
        for x in (
            "otp",
            "one time password",
            "verification code",
            "verify code",
        )
    ):
        return "OTP"

    if any(
        x in t
        for x in (
            "bank",
            "debited",
            "credited",
            "transaction",
            "upi",
            "card",
            "account",
        )
    ):
        return "Banking"

    if any(
        x in t
        for x in (
            "delivery",
            "delivered",
            "package",
            "shipment",
            "order",
        )
    ):
        return "Delivery"

    if any(
        x in t
        for x in (
            "meeting",
            "office",
            "interview",
            "work",
            "hr",
            "company",
        )
    ):
        return "Work"

    return "Other"


# ============================================================
# API AUTHENTICATION
# ============================================================

def auth(authorization):

    if authorization != f"Bearer {TOKEN}":
        raise HTTPException(
            status_code=401,
            detail="Invalid API token",
        )


# ============================================================
# WEBSOCKET BROADCAST
# ============================================================

async def broadcast(data):

    dead = []

    for ws in list(clients):

        try:
            await ws.send_json(data)

        except Exception:
            dead.append(ws)

    for ws in dead:
        clients.discard(ws)


# ============================================================
# DASHBOARD
# ============================================================

@app.get("/", response_class=HTMLResponse)
def home():

    return (
        BASE / "templates" / "dashboard.html"
    ).read_text(
        encoding="utf-8"
    )


# ============================================================
# HEALTH CHECK
# ============================================================

@app.get("/api/health")
def health():

    return {
        "status": "online"
    }


# ============================================================
# GET MESSAGES
# ============================================================

@app.get("/api/messages")
def messages():

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

    # Authenticate Android bridge
    auth(authorization)

    # Timestamp
    ts = (
        m.timestamp
        or datetime.now(timezone.utc).isoformat()
    )

    # Category
    cat = classify(
        m.sender,
        m.body,
    )

    # Normalize device ID
    device_id = (
        m.device_id.strip().lower()
        if m.device_id
        else "samsung"
    )

    # Only allow our known devices
    if device_id not in ("samsung", "poco"):

        raise HTTPException(
            status_code=400,
            detail="Invalid device_id. Use 'samsung' or 'poco'.",
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
                cat,
                ts,
                device_id,
            ),
        ).fetchone()

        conn.commit()

    mid = row["id"]

    # Response object
    out = {
        "id": mid,
        "sender": m.sender,
        "body": m.body,
        "category": cat,
        "timestamp": ts,
        "is_read": False,
        "device_id": device_id,
    }

    # Send live update to dashboard
    await broadcast(
        {
            "type": "new_message",
            "message": out,
        }
    )

    return out


# ============================================================
# MARK MESSAGE AS READ
# ============================================================

@app.patch("/api/messages/{mid}/read")
def read(mid: int):

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

@app.delete("/api/messages/{mid}")
def delete(
    mid: int,
    authorization: Optional[str] = Header(None),
):

    auth(authorization)

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
async def ws(websocket: WebSocket):

    await websocket.accept()

    clients.add(websocket)

    try:

        while True:

            await websocket.receive_text()

    except WebSocketDisconnect:

        clients.discard(websocket)

    except Exception:

        clients.discard(websocket)


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