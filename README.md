# SMS Dashboard — Python Only

Free local web dashboard: Python/FastAPI + SQLite + HTML/CSS/JS + WebSocket.
No Bluehost or paid hosting required.

## Run on Windows

```powershell
cd sms-dashboard-python
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Edit `.env` and set:

```text
API_TOKEN=your-long-random-secret
```

Start:

```powershell
uvicorn app:app --host 0.0.0.0 --port 8000
```

Open:

```text
http://localhost:8000
```

Test:

```powershell
python send_test.py
```

The dashboard is ready. The Samsung A54 still needs a small Android notification bridge because a browser/Python server cannot directly read Android SMS. The bridge will POST each message to `/api/messages` with `Authorization: Bearer YOUR_API_TOKEN`.

For a free local setup, keep phone and laptop on the same Wi-Fi. Do not expose port 8000 directly to the public internet.
