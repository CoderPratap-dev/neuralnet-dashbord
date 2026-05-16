# NeuralNet Dashboard

> Real-time ML model monitoring platform with streaming metrics, anomaly detection, and automated alerting.

![Python](https://img.shields.io/badge/Python-3.11+-blue?style=flat-square)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=flat-square)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square)
![WebSocket](https://img.shields.io/badge/WebSocket-Live-00f5ff?style=flat-square)

---

## Features

- **Live WebSocket streaming** — metrics pushed every 2 seconds, no polling
- **Anomaly detection** — z-score analysis over rolling 60-point windows
- **Multi-model monitoring** — track latency, RPS, accuracy, error rate, CPU/memory
- **Alert system** — REST API to create threshold-based alerts
- **Model management** — update status and versions via PATCH endpoints
- **Docker-ready** — single `docker compose up` to run everything

---

## Quick Start

### Option A — Docker (recommended)

```bash
# Clone and start
git clone https://github.com/YOUR_USERNAME/neuralnet-dashboard.git
cd neuralnet-dashboard
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000)

---

### Option B — Manual

**Backend (FastAPI)**

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Frontend (React)**

```bash
cd frontend
npm install
npm start
```

Frontend → [http://localhost:3000](http://localhost:3000)  
API docs → [http://localhost:8000/docs](http://localhost:8000/docs)

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/models` | List all models |
| `GET` | `/api/models/{id}` | Get model details |
| `PATCH` | `/api/models/{id}` | Update model status/version |
| `GET` | `/api/models/{id}/history` | Get last 60 metric snapshots |
| `GET` | `/api/alerts` | List alerts |
| `POST` | `/api/alerts` | Create an alert |
| `DELETE` | `/api/alerts/{id}` | Delete an alert |
| `WS` | `/ws/metrics` | Live metrics stream |

---

## Project Structure

```
neuralnet-dashboard/
├── backend/
│   ├── main.py            # FastAPI app + WebSocket streaming
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.js         # Main dashboard component
│   │   └── index.js
│   ├── public/
│   │   └── index.html
│   └── package.json
├── docker-compose.yml
└── README.md
```

---

## Customization

**Add a real model** — replace the `_simulate_metric()` function in `backend/main.py` with calls to your actual inference endpoint.

**Persist metrics** — swap the in-memory `deque` for a PostgreSQL/TimescaleDB table using `asyncpg`.

**Add Slack alerts** — hook into `_check_anomaly()` to POST to a Slack webhook when anomalies are detected.

---

## License

MIT
