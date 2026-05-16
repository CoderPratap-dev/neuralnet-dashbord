"""
NeuralNet Dashboard — Backend API
FastAPI + WebSocket for real-time ML model monitoring
"""

import asyncio
import json
import math
import random
import time
from collections import deque
from datetime import datetime
from typing import Dict, List, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

app = FastAPI(
    title="NeuralNet Dashboard API",
    description="Real-time ML model monitoring platform",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── In-memory state ──────────────────────────────────────────────────────────

MODELS: Dict[str, dict] = {
    "model-alpha": {
        "id": "model-alpha",
        "name": "Alpha Classifier",
        "type": "classification",
        "status": "running",
        "version": "2.3.1",
        "framework": "PyTorch",
        "created_at": "2024-01-15",
        "accuracy": 0.942,
        "latency_ms": 12.4,
        "requests_total": 1_042_811,
        "errors_total": 312,
    },
    "model-beta": {
        "id": "model-beta",
        "name": "Beta Regressor",
        "type": "regression",
        "status": "running",
        "version": "1.1.4",
        "framework": "TensorFlow",
        "created_at": "2024-03-02",
        "accuracy": 0.887,
        "latency_ms": 8.1,
        "requests_total": 538_204,
        "errors_total": 95,
    },
    "model-gamma": {
        "id": "model-gamma",
        "name": "Gamma Detector",
        "type": "anomaly_detection",
        "status": "degraded",
        "version": "3.0.0",
        "framework": "Scikit-learn",
        "created_at": "2024-05-10",
        "accuracy": 0.791,
        "latency_ms": 34.7,
        "requests_total": 204_019,
        "errors_total": 2_104,
    },
}

# Rolling windows (last 60 data points per model)
METRICS_HISTORY: Dict[str, deque] = {
    mid: deque(maxlen=60) for mid in MODELS
}

ALERTS: List[dict] = []
alert_id_counter = 0

connected_clients: List[WebSocket] = []

# ── Pydantic models ──────────────────────────────────────────────────────────

class AlertCreate(BaseModel):
    model_id: str
    metric: str
    threshold: float
    condition: str  # "above" | "below"


class ModelUpdate(BaseModel):
    status: Optional[str] = None
    version: Optional[str] = None


# ── Metric simulation ────────────────────────────────────────────────────────

def _simulate_metric(model_id: str, ts: float) -> dict:
    """Produce a realistic-looking metric snapshot."""
    model = MODELS[model_id]
    degraded = model["status"] == "degraded"

    # Base latency with sinusoidal drift + noise
    base_lat = model["latency_ms"]
    latency = base_lat + math.sin(ts / 30) * 3 + random.gauss(0, 1.5)
    if degraded:
        latency *= random.uniform(1.8, 2.5)
    latency = max(1.0, round(latency, 2))

    # RPS with daily-cycle pattern
    base_rps = 800 if model_id == "model-alpha" else 420 if model_id == "model-beta" else 180
    rps = base_rps + math.sin(ts / 60) * 120 + random.gauss(0, 30)
    if degraded:
        rps *= random.uniform(0.4, 0.7)
    rps = max(0, int(rps))

    # Accuracy drift
    acc = model["accuracy"] + random.gauss(0, 0.004)
    if degraded:
        acc -= random.uniform(0.02, 0.06)
    acc = round(min(1.0, max(0.5, acc)), 4)

    # Error rate
    error_rate = round(random.uniform(0.001, 0.005), 4)
    if degraded:
        error_rate += random.uniform(0.04, 0.12)

    # CPU / Memory
    cpu = round(random.uniform(20, 70) + (30 if degraded else 0), 1)
    memory = round(random.uniform(40, 75) + (20 if degraded else 0), 1)
    cpu = min(100, cpu)
    memory = min(100, memory)

    return {
        "timestamp": datetime.utcnow().isoformat(),
        "model_id": model_id,
        "latency_ms": latency,
        "rps": rps,
        "accuracy": acc,
        "error_rate": error_rate,
        "cpu_pct": cpu,
        "memory_pct": memory,
    }


def _check_anomaly(model_id: str, metric: dict) -> Optional[str]:
    """Simple z-score anomaly detection over the rolling window."""
    history = METRICS_HISTORY[model_id]
    if len(history) < 10:
        return None

    latencies = [m["latency_ms"] for m in history]
    mean = sum(latencies) / len(latencies)
    std = math.sqrt(sum((x - mean) ** 2 for x in latencies) / len(latencies)) or 1

    z = (metric["latency_ms"] - mean) / std
    if abs(z) > 2.8:
        return f"Latency anomaly detected: {metric['latency_ms']}ms (z={z:.2f})"

    if metric["error_rate"] > 0.05:
        return f"High error rate: {metric['error_rate']*100:.1f}%"

    return None


# ── REST endpoints ───────────────────────────────────────────────────────────

@app.get("/api/models")
async def list_models():
    return list(MODELS.values())


@app.get("/api/models/{model_id}")
async def get_model(model_id: str):
    if model_id not in MODELS:
        raise HTTPException(404, "Model not found")
    return MODELS[model_id]


@app.patch("/api/models/{model_id}")
async def update_model(model_id: str, body: ModelUpdate):
    if model_id not in MODELS:
        raise HTTPException(404, "Model not found")
    if body.status:
        MODELS[model_id]["status"] = body.status
    if body.version:
        MODELS[model_id]["version"] = body.version
    return MODELS[model_id]


@app.get("/api/models/{model_id}/history")
async def get_history(model_id: str):
    if model_id not in MODELS:
        raise HTTPException(404, "Model not found")
    return list(METRICS_HISTORY[model_id])


@app.get("/api/alerts")
async def list_alerts():
    return ALERTS


@app.post("/api/alerts")
async def create_alert(body: AlertCreate):
    global alert_id_counter
    if body.model_id not in MODELS:
        raise HTTPException(404, "Model not found")
    alert_id_counter += 1
    alert = {
        "id": alert_id_counter,
        **body.dict(),
        "triggered": False,
        "created_at": datetime.utcnow().isoformat(),
    }
    ALERTS.append(alert)
    return alert


@app.delete("/api/alerts/{alert_id}")
async def delete_alert(alert_id: int):
    global ALERTS
    ALERTS = [a for a in ALERTS if a["id"] != alert_id]
    return {"deleted": alert_id}


@app.get("/api/health")
async def health():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


# ── WebSocket streaming ──────────────────────────────────────────────────────

@app.websocket("/ws/metrics")
async def metrics_stream(ws: WebSocket):
    await ws.accept()
    connected_clients.append(ws)
    try:
        while True:
            ts = time.time()
            payload = {}
            for model_id in MODELS:
                metric = _simulate_metric(model_id, ts)
                METRICS_HISTORY[model_id].append(metric)
                anomaly = _check_anomaly(model_id, metric)
                metric["anomaly"] = anomaly
                payload[model_id] = metric

                # Update aggregate counters
                MODELS[model_id]["requests_total"] += metric["rps"]
                MODELS[model_id]["latency_ms"] = metric["latency_ms"]

            await ws.send_text(json.dumps(payload))
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        connected_clients.remove(ws)
    except Exception:
        if ws in connected_clients:
            connected_clients.remove(ws)
