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


load_dotenv()

BASE = Path(__file__).resolve().parent

DATABASE_URL = os.getenv("DATABASE_URL")
TOKEN = os.getenv("API_TOKEN", "change-me")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not configured")


app = FastAPI(title="Private SMS Dashboard")

clients = set()


class SMSIn(BaseModel):
    sender: str
    body: str
    timestamp: Optional[str] = None


def db():
    return psycopg.connect(
        DATABASE_URL,
        row_factory=dict_row,
    )


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
                is_read BOOLEAN NOT NULL DEFAULT FALSE
            )
            """
        )
        conn.commit()


init_db()


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


def auth(a):
    if a != f"Bearer {TOKEN}":
        raise HTTPException(401, "Invalid API token")


async def broadcast(data):
    dead = []

    for ws in list(clients):
        try:
            await ws.send_json(data)
        except Exception:
            dead.append(ws)

    for ws in dead:
        clients.discard(ws)


@app.get("/", response_class=HTMLResponse)
def home():
    return (BASE / "templates" / "dashboard.html").read_text(
        encoding="utf-8"
    )


@app.get("/api/health")
def health():
    return {"status": "online"}


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
                is_read
            FROM messages
            ORDER BY id DESC
            LIMIT 500
            """
        ).fetchall()

    return rows


@app.post("/api/messages")
async def add(
    m: SMSIn,
    authorization: Optional[str] = Header(None),
):
    auth(authorization)

    ts = m.timestamp or datetime.now(timezone.utc).isoformat()
    cat = classify(m.sender, m.body)

    with db() as conn:
        row = conn.execute(
            """
            INSERT INTO messages
                (sender, body, category, timestamp, is_read)
            VALUES
                (%s, %s, %s, %s, FALSE)
            RETURNING id
            """,
            (
                m.sender,
                m.body,
                cat,
                ts,
            ),
        ).fetchone()

        conn.commit()

    mid = row["id"]

    out = {
        "id": mid,
        "sender": m.sender,
        "body": m.body,
        "category": cat,
        "timestamp": ts,
        "is_read": False,
    }

    await broadcast(
        {
            "type": "new_message",
            "message": out,
        }
    )

    return out


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

    return {"ok": True}


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

    return {"ok": True}


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


app.mount(
    "/static",
    StaticFiles(directory=BASE / "static"),
    name="static",
)