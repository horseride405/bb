"use client";

import { useEffect, useMemo, useState } from "react";

import type { BinanceMarket } from "@/lib/market-data/binance";

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
type PositionMode = "bidirectional" | "long-only" | "short-only";
type StrategyType = "template" | "custom";
type RuleValue = "price" | "volume" | "sma" | "ema" | "rsi";
type Rule = { left: RuleValue; period: string; operator: "greater_than" | "less_than" | "crosses_above" | "crosses_below"; right: string };
type RuleSide = "longEntry" | "shortEntry" | "longExit" | "shortExit";

const emptyRule = (): Rule => ({ left: "price", period: "20", operator: "crosses_above", right: "100" });

export default function StrategyBuilder() {
  const [templateId, setTemplateId] = useState("momentum");
  const [strategyType, setStrategyType] = useState<StrategyType>("template");
  const [mode, setMode] = useState<Mode>("paper");
  const [name, setName] = useState("BTC Momentum");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [interval, setInterval] = useState("15m");
  const [leverage, setLeverage] = useState("3");
  const [positionMode, setPositionMode] = useState<PositionMode>("bidirectional");
  const [trailingStopLossPct, setTrailingStopLossPct] = useState("2");
  const [trailingTakeProfitPct, setTrailingTakeProfitPct] = useState("1");
  const [trailingTakeProfitActivationPct, setTrailingTakeProfitActivationPct] = useState("1.5");
  const [workspaceId, setWorkspaceId] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [markets, setMarkets] = useState<BinanceMarket[]>([]);
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [strategyId, setStrategyId] = useState("");
  const [queueing, setQueueing] = useState(false);
  const [queueMessage, setQueueMessage] = useState("");
  const [rules, setRules] = useState<Record<RuleSide, Rule[]>>({
    longEntry: [{ left: "price", period: "20", operator: "crosses_above", right: "100" }],
    shortEntry: [{ left: "price", period: "20", operator: "crosses_below", right: "100" }],
    longExit: [{ left: "price", period: "20", operator: "crosses_below", right: "100" }],
    shortExit: [{ left: "price", period: "20", operator: "crosses_above", right: "100" }],
  });

  const template = useMemo(
    () => templates.find((candidate) => candidate.id === templateId) ?? templates[0],
    [templateId],
  );

  useEffect(() => {
    let active = true;
    fetch("/api/workspaces")
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load workspaces");
        return (await response.json()) as { workspaces?: Array<{ id: string; name: string }> };
      })
      .then((payload) => {
        const workspace = payload.workspaces?.[0];
        if (active && workspace) {
          setWorkspaceId(workspace.id);
          setWorkspaceName(workspace.name);
        }
      })
      .catch((error: unknown) => {
        if (active) setSaveError(error instanceof Error ? error.message : "Unable to load workspaces");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/market-data/markets")
      .then(async (response) => {
        const payload = (await response.json()) as { markets?: BinanceMarket[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Unable to load markets");
        return payload.markets ?? [];
      })
      .then((catalog) => {
        if (active) {
          setMarkets(catalog);
          setMarketError("");
        }
      })
      .catch((error: unknown) => {
        if (active) setMarketError(error instanceof Error ? error.message : "Unable to load markets");
      })
      .finally(() => {
        if (active) setMarketLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function chooseTemplate(id: string, templateName: string) {
    setTemplateId(id);
    setName(`${symbol.replace("USDT", "")} ${templateName}`);
    setSaved(false);
  }

  function updateRule(side: RuleSide, index: number, update: Partial<Rule>) {
    setRules((current) => ({
      ...current,
      [side]: current[side].map((rule, ruleIndex) => ruleIndex === index ? { ...rule, ...update } : rule),
    }));
    setSaved(false);
  }

  function addRule(side: RuleSide) {
    setRules((current) => ({ ...current, [side]: [...current[side], emptyRule()] }));
  }

  function removeRule(side: RuleSide, index: number) {
    setRules((current) => ({ ...current, [side]: current[side].filter((_, ruleIndex) => ruleIndex !== index) }));
    setSaved(false);
  }

  async function saveDraft() {
    if (!workspaceId) {
      setSaveError("Sign in and create a workspace before saving a strategy");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const response = await fetch("/api/strategies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          name,
          mode,
          config: {
            strategyType,
            ...(strategyType === "custom"
              ? {
                  conditionMode: "all",
                  longEntry: rules.longEntry.map((rule) => ({ left: { type: rule.left, ...(rule.left === "price" || rule.left === "volume" ? {} : { period: Number(rule.period) }) }, operator: rule.operator, right: Number(rule.right) })),
                  shortEntry: rules.shortEntry.map((rule) => ({ left: { type: rule.left, ...(rule.left === "price" || rule.left === "volume" ? {} : { period: Number(rule.period) }) }, operator: rule.operator, right: Number(rule.right) })),
                  longExit: rules.longExit.map((rule) => ({ left: { type: rule.left, ...(rule.left === "price" || rule.left === "volume" ? {} : { period: Number(rule.period) }) }, operator: rule.operator, right: Number(rule.right) })),
                  shortExit: rules.shortExit.map((rule) => ({ left: { type: rule.left, ...(rule.left === "price" || rule.left === "volume" ? {} : { period: Number(rule.period) }) }, operator: rule.operator, right: Number(rule.right) })),
                }
              : { template: templateId }),
            symbol,
            interval,
            maxLeverage: Number(leverage),
            positionMode,
            trailingStopLossPct: Number(trailingStopLossPct),
            trailingTakeProfitPct: Number(trailingTakeProfitPct),
            trailingTakeProfitActivationPct: Number(trailingTakeProfitActivationPct),
          },
        }),
      });
      const payload = (await response.json()) as { error?: string; strategy?: { id?: string } };
      if (!response.ok) throw new Error(payload.error ?? "Unable to save strategy");
      if (!payload.strategy?.id) throw new Error("Strategy was saved without an identifier");
      setStrategyId(payload.strategy.id);
      setSaved(true);
    } catch (error: unknown) {
      setSaveError(error instanceof Error ? error.message : "Unable to save strategy");
    } finally {
      setSaving(false);
    }
  }

  async function queueValidation() {
    if (!strategyId) {
      setQueueMessage("Save the strategy before queueing validation");
      return;
    }
    setQueueing(true);
    setQueueMessage("");
    const endTime = Date.now();
    const parameters = {
      symbol,
      interval,
      initialEquity: 10_000,
      feeRateBps: 4,
      slippageBps: 2,
      ...(mode === "paper"
        ? { durationMs: 60_000 }
        : { startTime: endTime - 7 * 24 * 60 * 60 * 1_000, endTime }),
    };
    try {
      const response = await fetch(`/api/strategies/${strategyId}/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ run_type: mode, parameters }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to queue validation");
      setQueueMessage(mode === "paper" ? "Paper bot session queued safely; no real orders are submitted." : "Backtest validation queued");
    } catch (error: unknown) {
      setQueueMessage(error instanceof Error ? error.message : "Unable to queue validation");
    } finally {
      setQueueing(false);
    }
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
            <button
              className={`template-card ${strategyType === "custom" ? "selected" : ""}`}
              onClick={() => { setStrategyType("custom"); setName(`${symbol.replace("USDT", "")} Custom strategy`); setSaved(false); }}
              type="button"
            >
              <span className="template-icon">⌘</span>
              <strong>Custom rules</strong>
              <span>Build your own entry and exit conditions.</span>
              <small>TradingView-style configuration</small>
            </button>
            {templates.map((candidate) => (
              <button
                className={`template-card ${strategyType === "template" && candidate.id === templateId ? "selected" : ""}`}
                key={candidate.id}
                onClick={() => { setStrategyType("template"); chooseTemplate(candidate.id, candidate.name); }}
                type="button"
              >
                <span className="template-icon">{candidate.id === "momentum" ? "↗" : candidate.id === "mean-reversion" ? "∿" : "⌁"}</span>
                <strong>{candidate.name}</strong>
                <span>{candidate.description}</span>
                <small>{candidate.signal}</small>
              </button>
            ))}
          </div>
          {strategyType === "custom" && (
            <div className="rule-editor">
              <div className="builder-heading"><div><p className="eyebrow">Custom logic</p><h2>Define entry and exit rules</h2></div><span className="step-count">No code required</span></div>
              {(["longEntry", "shortEntry", "longExit", "shortExit"] as RuleSide[]).map((side) => (
                <div className="rule-group" key={side}>
                  <div className="rule-group-heading"><strong>{side === "longEntry" ? "Enter long when" : side === "shortEntry" ? "Enter short when" : side === "longExit" ? "Exit long when" : "Exit short when"}</strong><button className="text-button" type="button" onClick={() => addRule(side)}>+ Add condition</button></div>
                  {rules[side].map((rule, index) => (
                    <div className="rule-row" key={`${side}-${index}`}>
                      <select value={rule.left} onChange={(event) => updateRule(side, index, { left: event.target.value as RuleValue })}><option value="price">Price</option><option value="volume">Volume</option><option value="sma">SMA</option><option value="ema">EMA</option><option value="rsi">RSI</option></select>
                      {rule.left !== "price" && rule.left !== "volume" && <input aria-label="Indicator period" type="number" min="2" max="500" value={rule.period} onChange={(event) => updateRule(side, index, { period: event.target.value })} />}
                      <select value={rule.operator} onChange={(event) => updateRule(side, index, { operator: event.target.value as Rule["operator"] })}><option value="crosses_above">crosses above</option><option value="crosses_below">crosses below</option><option value="greater_than">is greater than</option><option value="less_than">is less than</option></select>
                      <input aria-label="Rule threshold" type="number" value={rule.right} onChange={(event) => updateRule(side, index, { right: event.target.value })} />
                      <button className="row-action" type="button" onClick={() => removeRule(side, index)} aria-label="Remove condition">×</button>
                    </div>
                  ))}
                </div>
              ))}
              <p className="field-help">Rules evaluate only on closed candles. No arbitrary code runs in the worker.</p>
            </div>
          )}
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
              <input
                list="binance-markets"
                value={symbol}
                onChange={(event) => { setSymbol(event.target.value.toUpperCase()); setSaved(false); }}
                placeholder={marketLoading ? "Loading markets…" : "Search symbol"}
                aria-describedby="market-help"
              />
              <datalist id="binance-markets">
                {markets.map((market) => (
                  <option key={market.symbol} value={market.symbol}>
                    {market.baseAsset}/{market.quoteAsset} · {market.contractType}
                  </option>
                ))}
              </datalist>
              <small id="market-help" className="field-help">
                {marketError || (markets.length > 0 ? `${markets.length} live USDⓈ-M markets available` : "Exchange catalog unavailable")}
              </small>
            </label>
            <label>
              Timeframe
              <select value={interval} onChange={(event) => setInterval(event.target.value)}>
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
            <label>
              Position direction
              <select value={positionMode} onChange={(event) => { setPositionMode(event.target.value as PositionMode); setSaved(false); }}>
                <option value="bidirectional">Long + short</option>
                <option value="long-only">Long only</option>
                <option value="short-only">Short only</option>
              </select>
            </label>
            <label>
              Trailing stop loss (%)
              <input type="number" min="0.01" max="100" step="0.01" value={trailingStopLossPct} onChange={(event) => { setTrailingStopLossPct(event.target.value); setSaved(false); }} />
            </label>
            <label>
              Trailing take profit (%)
              <input type="number" min="0.01" max="100" step="0.01" value={trailingTakeProfitPct} onChange={(event) => { setTrailingTakeProfitPct(event.target.value); setSaved(false); }} />
            </label>
            <label>
              Take-profit activation (%)
              <input type="number" min="0.01" max="100" step="0.01" value={trailingTakeProfitActivationPct} onChange={(event) => { setTrailingTakeProfitActivationPct(event.target.value); setSaved(false); }} />
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
            <button
              className={mode === "paper" ? "mode-option selected" : "mode-option"}
              onClick={() => { setMode("paper"); setStrategyId(""); setSaved(false); }}
              type="button"
            >
              <span className="mode-radio" />
              <span><strong>Paper trading</strong><small>Live market data, no real orders</small></span>
            </button>
            <button
              className={mode === "backtest" ? "mode-option selected" : "mode-option"}
              onClick={() => { setMode("backtest"); setStrategyId(""); setSaved(false); }}
              type="button"
            >
              <span className="mode-radio" />
              <span><strong>Historical backtest</strong><small>Validate against stored candle data</small></span>
            </button>
          </div>
          <div className="safe-callout">
            <span>!</span>
            <p><strong>Live trading is locked</strong> until this strategy passes validation and workspace risk checks.</p>
          </div>
          <button className="primary-button wide-button" onClick={saveDraft} disabled={saving} type="button">
            {saving ? "Saving strategy…" : saved ? "Strategy saved" : `Save ${mode} draft`}
          </button>
          <p className="run-error">{saveError || (workspaceName ? `Workspace: ${workspaceName}` : "Loading workspace…")}</p>
          <button
            className="secondary-button wide-button"
            onClick={queueValidation}
            disabled={queueing || !strategyId}
            type="button"
          >
            {queueing ? "Starting…" : mode === "paper" ? "Start paper bot" : "Queue backtest"}
          </button>
          <p className="run-error">{queueMessage}</p>
        </section>

        <section className="builder-card summary-card">
          <p className="eyebrow">Draft summary</p>
          <div className="summary-row"><span>Template</span><strong>{template.name}</strong></div>
          <div className="summary-row"><span>Market</span><strong>{markets.find((market) => market.symbol === symbol)?.contractType ?? "Unverified"}</strong></div>
          <div className="summary-row"><span>Leverage cap</span><strong>{leverage}x</strong></div>
          <div className="summary-row"><span>Direction</span><strong>{positionMode === "bidirectional" ? "Long + short" : positionMode === "long-only" ? "Long only" : "Short only"}</strong></div>
          <div className="summary-row"><span>Execution</span><strong className="summary-green">{mode === "paper" ? "Paper only" : "Backtest only"}</strong></div>
        </section>
      </aside>
    </div>
  );
}
