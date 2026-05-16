import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area,
} from "recharts";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";
const WS  = API.replace("http", "ws");

// ── Palette ──────────────────────────────────────────────────────────────────
const C = {
  cyan:    "#00f5ff",
  magenta: "#ff00aa",
  yellow:  "#f5ff00",
  green:   "#00ff88",
  red:     "#ff3355",
  dark:    "#020010",
  panel:   "rgba(0,245,255,0.04)",
  border:  "rgba(0,245,255,0.15)",
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const statusColor = (s) =>
  s === "running" ? C.green : s === "degraded" ? C.yellow : C.red;

const fmt = (n, d = 2) => typeof n === "number" ? n.toFixed(d) : "—";

// ── Sub-components ───────────────────────────────────────────────────────────

function Panel({ children, style = {} }) {
  return (
    <div style={{
      background: C.panel,
      border: `1px solid ${C.border}`,
      borderRadius: 2,
      padding: 20,
      ...style,
    }}>
      {children}
    </div>
  );
}

function Badge({ label, color }) {
  return (
    <span style={{
      fontFamily: "monospace", fontSize: 11,
      letterSpacing: "0.1em", textTransform: "uppercase",
      padding: "3px 10px",
      border: `1px solid ${color}30`,
      color, background: `${color}10`,
      borderRadius: 1,
    }}>
      {label}
    </span>
  );
}

function MetricTile({ label, value, unit = "", color = C.cyan, alert = false }) {
  return (
    <div style={{
      background: C.panel, border: `1px solid ${alert ? C.red : C.border}`,
      padding: "16px 18px", position: "relative",
      boxShadow: alert ? `0 0 12px ${C.red}33` : "none",
      transition: "box-shadow 0.4s",
    }}>
      {alert && (
        <div style={{
          position: "absolute", top: 8, right: 10,
          width: 6, height: 6, borderRadius: "50%",
          background: C.red, boxShadow: `0 0 6px ${C.red}`,
          animation: "pulse 1s infinite",
        }} />
      )}
      <div style={{ fontFamily: "monospace", fontSize: 10, letterSpacing: "0.2em", color: "rgba(200,232,255,0.45)", textTransform: "uppercase", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontFamily: "monospace", fontSize: 22, color, fontWeight: 700 }}>
        {value}<span style={{ fontSize: 12, marginLeft: 4, opacity: 0.6 }}>{unit}</span>
      </div>
    </div>
  );
}

function ModelCard({ model, metrics, selected, onClick }) {
  const sc = statusColor(model.status);
  const hasAnomaly = metrics?.anomaly;
  return (
    <div
      onClick={onClick}
      style={{
        background: selected ? "rgba(0,245,255,0.07)" : C.panel,
        border: `1px solid ${selected ? C.cyan : hasAnomaly ? C.red : C.border}`,
        padding: "18px 20px", cursor: "pointer",
        transition: "all 0.25s",
        boxShadow: selected ? `0 0 16px ${C.cyan}22` : "none",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ fontFamily: "monospace", fontSize: 13, color: "#fff", fontWeight: 700 }}>{model.name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: sc, boxShadow: `0 0 6px ${sc}` }} />
          <span style={{ fontFamily: "monospace", fontSize: 10, color: sc, textTransform: "uppercase", letterSpacing: "0.1em" }}>{model.status}</span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: "rgba(200,232,255,0.4)", marginBottom: 2 }}>LATENCY</div>
          <div style={{ fontFamily: "monospace", fontSize: 14, color: hasAnomaly ? C.red : C.cyan }}>{fmt(metrics?.latency_ms)} ms</div>
        </div>
        <div>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: "rgba(200,232,255,0.4)", marginBottom: 2 }}>ACCURACY</div>
          <div style={{ fontFamily: "monospace", fontSize: 14, color: C.green }}>{metrics ? (metrics.accuracy * 100).toFixed(1) : "—"}%</div>
        </div>
      </div>
      {hasAnomaly && (
        <div style={{ marginTop: 10, fontFamily: "monospace", fontSize: 10, color: C.red, letterSpacing: "0.05em" }}>
          ⚠ {metrics.anomaly}
        </div>
      )}
    </div>
  );
}

function MiniChart({ data, dataKey, color, height = 60 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5}
          fill={`url(#grad-${dataKey})`} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [models, setModels]     = useState([]);
  const [selected, setSelected] = useState(null);
  const [liveMetrics, setLiveMetrics] = useState({});
  const [history, setHistory]   = useState({});
  const [connected, setConnected] = useState(false);
  const [alerts, setAlerts]     = useState([]);
  const wsRef = useRef(null);

  // ── Fetch models ──
  useEffect(() => {
    fetch(`${API}/api/models`)
      .then(r => r.json())
      .then(data => {
        setModels(data);
        if (data.length) setSelected(data[0].id);
      })
      .catch(console.error);

    fetch(`${API}/api/alerts`)
      .then(r => r.json())
      .then(setAlerts)
      .catch(console.error);
  }, []);

  // ── WebSocket ──
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(`${WS}/ws/metrics`);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => { setConnected(false); setTimeout(connect, 3000); };
      ws.onerror = () => ws.close();

      ws.onmessage = (e) => {
        const payload = JSON.parse(e.data);
        setLiveMetrics(payload);
        setHistory(prev => {
          const next = { ...prev };
          Object.entries(payload).forEach(([mid, m]) => {
            const existing = prev[mid] || [];
            const ts = new Date(m.timestamp).toLocaleTimeString("en-US", { hour12: false });
            next[mid] = [...existing.slice(-59), { ...m, ts }];
          });
          return next;
        });
      };
    };
    connect();
    return () => wsRef.current?.close();
  }, []);

  const sel = selected;
  const selModel   = models.find(m => m.id === sel);
  const selMetrics = liveMetrics[sel];
  const selHistory = history[sel] || [];

  return (
    <div style={{
      minHeight: "100vh", background: C.dark,
      color: "#c8e8ff", fontFamily: "system-ui, sans-serif",
    }}>
      <style>{`
        * { box-sizing: border-box; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        ::-webkit-scrollbar { width: 4px; } 
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(0,245,255,0.3); border-radius:2px; }
      `}</style>

      {/* ── NAV ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 28px",
        borderBottom: `1px solid ${C.border}`,
        background: "rgba(2,0,16,0.9)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: C.cyan, letterSpacing: "0.15em" }}>
            NEURALNET <span style={{ color: "rgba(200,232,255,0.4)" }}>DASHBOARD</span>
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            fontFamily: "monospace", fontSize: 11, color: connected ? C.green : C.red,
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%",
              background: connected ? C.green : C.red,
              boxShadow: `0 0 6px ${connected ? C.green : C.red}`,
              animation: connected ? "pulse 2s infinite" : "none",
            }} />
            {connected ? "LIVE" : "RECONNECTING..."}
          </div>
        </div>
        <div style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(200,232,255,0.35)", letterSpacing: "0.1em" }}>
          {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "calc(100vh - 57px)" }}>

        {/* ── SIDEBAR ── */}
        <div style={{ borderRight: `1px solid ${C.border}`, padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontFamily: "monospace", fontSize: 10, letterSpacing: "0.25em", color: "rgba(200,232,255,0.35)", textTransform: "uppercase", padding: "8px 4px" }}>
            Models ({models.length})
          </div>
          {models.map(m => (
            <ModelCard
              key={m.id} model={m}
              metrics={liveMetrics[m.id]}
              selected={sel === m.id}
              onClick={() => setSelected(m.id)}
            />
          ))}

          <div style={{ marginTop: 16, fontFamily: "monospace", fontSize: 10, letterSpacing: "0.25em", color: "rgba(200,232,255,0.35)", textTransform: "uppercase", padding: "8px 4px" }}>
            Alerts ({alerts.length})
          </div>
          {alerts.length === 0 && (
            <div style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(200,232,255,0.3)", padding: "8px 4px" }}>
              No alerts configured
            </div>
          )}
          {alerts.map(a => (
            <div key={a.id} style={{ background: C.panel, border: `1px solid ${C.border}`, padding: "10px 14px" }}>
              <div style={{ fontFamily: "monospace", fontSize: 11, color: C.yellow }}>{a.model_id}</div>
              <div style={{ fontFamily: "monospace", fontSize: 10, color: "rgba(200,232,255,0.5)", marginTop: 4 }}>
                {a.metric} {a.condition} {a.threshold}
              </div>
            </div>
          ))}
        </div>

        {/* ── MAIN ── */}
        <div style={{ padding: 24, overflowY: "auto" }}>
          {selModel ? (
            <>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
                <div>
                  <div style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 700, color: "#fff" }}>{selModel.name}</div>
                  <div style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(200,232,255,0.4)", marginTop: 4, letterSpacing: "0.1em" }}>
                    {selModel.framework} &nbsp;·&nbsp; v{selModel.version} &nbsp;·&nbsp; {selModel.type}
                  </div>
                </div>
                <Badge label={selModel.status} color={statusColor(selModel.status)} />
              </div>

              {/* KPI row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 2, marginBottom: 2 }}>
                <MetricTile label="Latency" value={fmt(selMetrics?.latency_ms)} unit="ms"
                  color={selMetrics?.latency_ms > 50 ? C.red : C.cyan}
                  alert={selMetrics?.latency_ms > 50} />
                <MetricTile label="Throughput" value={selMetrics?.rps ?? "—"} unit="rps" color={C.cyan} />
                <MetricTile label="Accuracy" value={selMetrics ? (selMetrics.accuracy * 100).toFixed(1) : "—"} unit="%" color={C.green} />
                <MetricTile label="Error Rate" value={selMetrics ? (selMetrics.error_rate * 100).toFixed(2) : "—"} unit="%"
                  color={selMetrics?.error_rate > 0.05 ? C.red : C.magenta}
                  alert={selMetrics?.error_rate > 0.05} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 2, marginBottom: 24 }}>
                <MetricTile label="CPU" value={fmt(selMetrics?.cpu_pct, 1)} unit="%" color={selMetrics?.cpu_pct > 85 ? C.red : C.yellow} />
                <MetricTile label="Memory" value={fmt(selMetrics?.memory_pct, 1)} unit="%" color={C.yellow} />
                <MetricTile label="Total Requests" value={(selModel.requests_total / 1e6).toFixed(2)} unit="M" color={C.cyan} />
                <MetricTile label="Total Errors" value={selModel.errors_total} color={C.red} />
              </div>

              {/* Charts */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, marginBottom: 2 }}>
                <Panel>
                  <div style={{ fontFamily: "monospace", fontSize: 11, color: C.cyan, letterSpacing: "0.15em", marginBottom: 14 }}>LATENCY (ms)</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={selHistory}>
                      <CartesianGrid strokeDasharray="2 4" stroke="rgba(0,245,255,0.06)" />
                      <XAxis dataKey="ts" hide />
                      <YAxis tick={{ fontFamily: "monospace", fontSize: 10, fill: "rgba(200,232,255,0.4)" }} />
                      <Tooltip contentStyle={{ background: "#05001a", border: `1px solid ${C.border}`, fontFamily: "monospace", fontSize: 11 }} />
                      <Line type="monotone" dataKey="latency_ms" stroke={C.cyan} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </Panel>

                <Panel>
                  <div style={{ fontFamily: "monospace", fontSize: 11, color: C.magenta, letterSpacing: "0.15em", marginBottom: 14 }}>THROUGHPUT (rps)</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <AreaChart data={selHistory}>
                      <defs>
                        <linearGradient id="gradRps" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={C.magenta} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={C.magenta} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="2 4" stroke="rgba(0,245,255,0.06)" />
                      <XAxis dataKey="ts" hide />
                      <YAxis tick={{ fontFamily: "monospace", fontSize: 10, fill: "rgba(200,232,255,0.4)" }} />
                      <Tooltip contentStyle={{ background: "#05001a", border: `1px solid ${C.border}`, fontFamily: "monospace", fontSize: 11 }} />
                      <Area type="monotone" dataKey="rps" stroke={C.magenta} strokeWidth={1.5} fill="url(#gradRps)" dot={false} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </Panel>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
                <Panel>
                  <div style={{ fontFamily: "monospace", fontSize: 11, color: C.green, letterSpacing: "0.15em", marginBottom: 14 }}>ACCURACY</div>
                  <MiniChart data={selHistory} dataKey="accuracy" color={C.green} height={100} />
                </Panel>
                <Panel>
                  <div style={{ fontFamily: "monospace", fontSize: 11, color: C.red, letterSpacing: "0.15em", marginBottom: 14 }}>ERROR RATE</div>
                  <MiniChart data={selHistory} dataKey="error_rate" color={C.red} height={100} />
                </Panel>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", fontFamily: "monospace", color: "rgba(200,232,255,0.3)" }}>
              Select a model to view metrics
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
