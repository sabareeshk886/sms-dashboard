import os, sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

load_dotenv()
BASE=Path(__file__).resolve().parent
DB=BASE/'sms.db'
TOKEN=os.getenv('API_TOKEN','change-me')
app=FastAPI(title='Private SMS Dashboard')
clients=set()
class SMSIn(BaseModel):
    sender:str
    body:str
    timestamp:Optional[str]=None

def db():
    c=sqlite3.connect(DB); c.row_factory=sqlite3.Row; return c
with db() as c:
    c.execute('''CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT,sender TEXT NOT NULL,body TEXT NOT NULL,category TEXT NOT NULL,timestamp TEXT NOT NULL,is_read INTEGER NOT NULL DEFAULT 0)''')

def classify(sender,body):
    t=f'{sender} {body}'.lower()
    if any(x in t for x in ('otp','one time password','verification code','verify code')): return 'OTP'
    if any(x in t for x in ('bank','debited','credited','transaction','upi','card','account')): return 'Banking'
    if any(x in t for x in ('delivery','delivered','package','shipment','order')): return 'Delivery'
    if any(x in t for x in ('meeting','office','interview','work','hr','company')): return 'Work'
    return 'Other'

def auth(a):
    if a != f'Bearer {TOKEN}': raise HTTPException(401,'Invalid API token')

async def broadcast(data):
    dead=[]
    for ws in list(clients):
        try: await ws.send_json(data)
        except: dead.append(ws)
    for ws in dead: clients.discard(ws)

@app.get('/',response_class=HTMLResponse)
def home(): return (BASE/'templates'/'dashboard.html').read_text()
@app.get('/api/health')
def health(): return {'status':'online'}
@app.get('/api/messages')
def messages():
    with db() as c: rows=c.execute('SELECT * FROM messages ORDER BY id DESC LIMIT 500').fetchall()
    return [dict(r) for r in rows]
@app.post('/api/messages')
async def add(m:SMSIn,authorization:Optional[str]=Header(None)):
    auth(authorization); ts=m.timestamp or datetime.now(timezone.utc).isoformat(); cat=classify(m.sender,m.body)
    with db() as c:
        cur=c.execute('INSERT INTO messages(sender,body,category,timestamp,is_read) VALUES(?,?,?,?,0)',(m.sender,m.body,cat,ts)); c.commit(); mid=cur.lastrowid
    out={'id':mid,'sender':m.sender,'body':m.body,'category':cat,'timestamp':ts,'is_read':0}
    await broadcast({'type':'new_message','message':out}); return out
@app.patch('/api/messages/{mid}/read')
def read(mid:int):
    with db() as c: c.execute('UPDATE messages SET is_read=1 WHERE id=?',(mid,)); c.commit()
    return {'ok':True}
@app.delete('/api/messages/{mid}')
def delete(mid:int,authorization:Optional[str]=Header(None)):
    auth(authorization)
    with db() as c: c.execute('DELETE FROM messages WHERE id=?',(mid,)); c.commit()
    return {'ok':True}
@app.websocket('/ws')
async def ws(ws:WebSocket):
    await ws.accept(); clients.add(ws)
    try:
        while True: await ws.receive_text()
    except: clients.discard(ws)
app.mount('/static',StaticFiles(directory=BASE/'static'),name='static')
