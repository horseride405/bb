"use client";

import { useMemo, useState } from "react";

const templates = [
  {
    id: "momentum",
    name: "Momentum",
    description: "Follow sustained price movement with trend confirmation.",
    signal: "EMA crossover + RSI filter",
  },
  {
    id: "mean-reversion",
    name: "Mean reversion",
    description: "Look for oversold and overbought moves back toward equilibrium.",
    signal: "Bollinger Bands + RSI",
  },
  {
    id: "breakout",
    name: "Breakout",
    description: "Enter when price clears a defined range with volume support.",
    signal: "Donchian channel + volume",
  },
];

type Mode = "paper" | "backtest";

export default function StrategyBuilder() {
  const [templateId, setTemplateId] = useState("momentum");
  const [mode, setMode] = useState<Mode>("paper");
  const [name, setName] = useState("BTC Momentum");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [leverage, setLeverage] = useState("3");
  const [saved, setSaved] = useState(false);

  const template = useMemo(
    () => templates.find((candidate) => candidate.id === templateId) ?? templates[0],
    [templateId],
  );

  function chooseTemplate(id: string, templateName: string) {
    setTemplateId(id);
    setName(`${symbol.replace("USDT", "")} ${templateName}`);
    setSaved(false);
  }

  return (
    <div className="builder-layout">
      <div>
        <section className="builder-card">
          <div className="builder-heading">
            <div>
              <p className="eyebrow">Step 1</p>
              <h2>Choose a strategy template</h2>
            </div>
            <span className="step-count">1 / 3</span>
          </div>
          <div className="template-grid">
            {templates.map((candidate) => (
              <button
                className={`template-card ${candidate.id === templateId ? "selected" : ""}`}
                key={candidate.id}
                onClick={() => chooseTemplate(candidate.id, candidate.name)}
                type="button"
              >
                <span className="template-icon">{candidate.id === "momentum" ? "↗" : candidate.id === "mean-reversion" ? "∿" : "⌁"}</span>
                <strong>{candidate.name}</strong>
                <span>{candidate.description}</span>
                <small>{candidate.signal}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="builder-card">
          <div className="builder-heading">
            <div>
              <p className="eyebrow">Step 2</p>
              <h2>Set parameters</h2>
            </div>
            <span className="step-count">2 / 3</span>
          </div>
          <div className="form-grid">
            <label>
              Strategy name
              <input value={name} onChange={(event) => { setName(event.target.value); setSaved(false); }} />
            </label>
            <label>
              Market
              <select value={symbol} onChange={(event) => setSymbol(event.target.value)}>
                <option>BTCUSDT</option>
                <option>ETHUSDT</option>
                <option>SOLUSDT</option>
              </select>
            </label>
            <label>
              Timeframe
              <select defaultValue="15m">
                <option>5m</option>
                <option>15m</option>
                <option>1h</option>
                <option>4h</option>
              </select>
            </label>
            <label>
              Maximum leverage
              <select value={leverage} onChange={(event) => setLeverage(event.target.value)}>
                <option value="1">1x</option>
                <option value="3">3x</option>
                <option value="5">5x</option>
                <option value="10">10x</option>
              </select>
            </label>
          </div>
          <div className="selected-signal">
            <span className="template-icon">✦</span>
            <div><strong>{template.name} signal</strong><p>{template.signal} · configurable after creation</p></div>
          </div>
        </section>
      </div>

      <aside className="builder-aside">
        <section className="builder-card mode-card">
          <div className="builder-heading">
            <div>
              <p className="eyebrow">Step 3</p>
              <h2>Choose validation mode</h2>
            </div>
            <span className="step-count">3 / 3</span>
          </div>
          <div className="mode-options">
            <button className={mode === "paper" ? "mode-option selected" : "mode-option"} onClick={() => setMode("paper")} type="button">
              <span className="mode-radio" />
              <span><strong>Paper trading</strong><small>Live market data, no real orders</small></span>
            </button>
            <button className={mode === "backtest" ? "mode-option selected" : "mode-option"} onClick={() => setMode("backtest")} type="button">
              <span className="mode-radio" />
              <span><strong>Historical backtest</strong><small>Validate against stored candle data</small></span>
            </button>
          </div>
          <div className="safe-callout">
            <span>!</span>
            <p><strong>Live trading is locked</strong> until this strategy passes validation and workspace risk checks.</p>
          </div>
          <button className="primary-button wide-button" onClick={() => setSaved(true)} type="button">
            {saved ? "Draft saved locally" : `Save ${mode} draft`}
          </button>
        </section>

        <section className="builder-card summary-card">
          <p className="eyebrow">Draft summary</p>
          <div className="summary-row"><span>Template</span><strong>{template.name}</strong></div>
          <div className="summary-row"><span>Market</span><strong>{symbol} Perpetual</strong></div>
          <div className="summary-row"><span>Leverage cap</span><strong>{leverage}x</strong></div>
          <div className="summary-row"><span>Execution</span><strong className="summary-green">{mode === "paper" ? "Paper only" : "Backtest only"}</strong></div>
        </section>
      </aside>
    </div>
  );
}
