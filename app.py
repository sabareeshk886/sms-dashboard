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
API_TOKEN = os.getenv("API_TOKEN")

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL environment variable is required"
    )

if not API_TOKEN:
    raise RuntimeError(
        "API_TOKEN environment variable is required"
    )


# ============================================================
# FASTAPI
# ============================================================

app = FastAPI(
    title="Private SMS + WhatsApp Dashboard"
)

clients = set()


# ============================================================
# MESSAGE MODEL
# ============================================================

class MessageIn(BaseModel):

    sender: str
    body: str

    timestamp: Optional[str] = None

    device_id: str = "samsung"

    source: str = "whatsapp"


# ============================================================
# DATABASE
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
            CREATE TABLE IF NOT EXISTS unified_messages (

                id SERIAL PRIMARY KEY,

                sender TEXT NOT NULL,

                body TEXT NOT NULL,

                category TEXT NOT NULL,

                timestamp TEXT NOT NULL,

                is_read BOOLEAN NOT NULL DEFAULT FALSE,

                device_id TEXT NOT NULL DEFAULT 'samsung',

                source TEXT NOT NULL DEFAULT 'sms',

                legacy_id INTEGER
            )
            """
        )

        conn.execute(
            """
            ALTER TABLE unified_messages
            ADD COLUMN IF NOT EXISTS device_id
            TEXT NOT NULL DEFAULT 'samsung'
            """
        )

        conn.execute(
            """
            ALTER TABLE unified_messages
            ADD COLUMN IF NOT EXISTS source
            TEXT NOT NULL DEFAULT 'sms'
            """
        )

        conn.execute(
            """
            ALTER TABLE unified_messages
            ADD COLUMN IF NOT EXISTS legacy_id
            INTEGER
            """
        )

        # Migrate existing WhatsApp messages
        # from the old WhatsApp-only table.

        try:

            conn.execute(
                """
                INSERT INTO unified_messages
                (
                    sender,
                    body,
                    category,
                    timestamp,
                    is_read,
                    device_id,
                    source,
                    legacy_id
                )

                SELECT
                    w.sender,
                    w.body,
                    w.category,
                    w.timestamp,
                    w.is_read,
                    COALESCE(w.device_id, 'samsung'),
                    'whatsapp',
                    w.id

                FROM whatsapp_messages w

                WHERE NOT EXISTS (

                    SELECT 1

                    FROM unified_messages u

                    WHERE u.source = 'whatsapp'

                    AND u.legacy_id = w.id
                )
                """
            )

        except Exception as error:

            print(
                "WhatsApp migration skipped:",
                error
            )

        conn.commit()


init_db()


# ============================================================
# CLASSIFICATION
# ============================================================

def classify(sender: str, body: str):

    text = (
        f"{sender} {body}"
    ).lower()

    if any(
        keyword in text
        for keyword in (
            "otp",
            "one time password",
            "one-time password",
            "verification code",
            "verify code",
            "passcode",
            "login code",
            "authentication",
            "security code",
            "verification",
        )
    ):
        return "OTP"

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
# ANDROID AUTHENTICATION
# ============================================================

def auth(authorization):

    if authorization != f"Bearer {API_TOKEN}":

        raise HTTPException(
            status_code=401,
            detail="Invalid API token",
        )


# ============================================================
# WEBSOCKET BROADCAST
# ============================================================

async def broadcast(data):

    dead = []

    for websocket in list(clients):

        try:

            await websocket.send_json(data)

        except Exception:

            dead.append(websocket)

    for websocket in dead:

        clients.discard(websocket)


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
# HEALTH
# ============================================================

@app.get("/api/health")
def health():

    return {
        "status": "online",
        "service": "unified-sms-whatsapp-dashboard",
    }


# ============================================================
# GET ALL MESSAGES
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
                device_id,
                source

            FROM unified_messages

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
    m: MessageIn,
    authorization: Optional[str] = Header(None),
):

    auth(authorization)

    ts = (
        m.timestamp
        or datetime.now(
            timezone.utc
        ).isoformat()
    )

    category = classify(
        m.sender,
        m.body,
    )

    device_id = (
        m.device_id.strip().lower()
        if m.device_id
        else "samsung"
    )

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

    source = (
        m.source.strip().lower()
        if m.source
        else "whatsapp"
    )

    if source not in (
        "sms",
        "whatsapp",
    ):

        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid source. "
                "Use 'sms' or 'whatsapp'."
            ),
        )

    with db() as conn:

        row = conn.execute(
            """
            INSERT INTO unified_messages
            (
                sender,
                body,
                category,
                timestamp,
                is_read,
                device_id,
                source
            )

            VALUES
            (
                %s,
                %s,
                %s,
                %s,
                FALSE,
                %s,
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
                source,
            ),
        ).fetchone()

        conn.commit()

    message_id = row["id"]

    output = {

        "id": message_id,

        "sender": m.sender,

        "body": m.body,

        "category": category,

        "timestamp": ts,

        "is_read": False,

        "device_id": device_id,

        "source": source,
    }

    await broadcast(
        {
            "type": "new_message",
            "message": output,
        }
    )

    return output


# ============================================================
# SMS ENDPOINT
# ============================================================

@app.post("/api/sms")
async def add_sms(
    m: MessageIn,
    authorization: Optional[str] = Header(None),
):

    m.source = "sms"

    return await add(
        m,
        authorization,
    )


# ============================================================
# WHATSAPP ENDPOINT
# ============================================================

@app.post("/api/whatsapp")
async def add_whatsapp(
    m: MessageIn,
    authorization: Optional[str] = Header(None),
):

    m.source = "whatsapp"

    return await add(
        m,
        authorization,
    )


# ============================================================
# MARK AS READ
# ============================================================

@app.patch(
    "/api/messages/{mid}/read"
)
def read(mid: int):

    with db() as conn:

        conn.execute(
            """
            UPDATE unified_messages

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
def delete(mid: int):

    with db() as conn:

        conn.execute(
            """
            DELETE FROM unified_messages

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
    websocket: WebSocket,
):

    await websocket.accept()

    clients.add(
        websocket
    )

    print(
        "Dashboard WebSocket connected"
    )

    try:

        while True:

            await websocket.receive_text()

    except WebSocketDisconnect:

        clients.discard(
            websocket
        )

        print(
            "Dashboard WebSocket disconnected"
        )

    except Exception as error:

        clients.discard(
            websocket
        )

        print(
            "WebSocket error:",
            error
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