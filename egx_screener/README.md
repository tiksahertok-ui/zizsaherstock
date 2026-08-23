# EGX Daily Stock Screener

Production-ready daily technical screener for Egyptian Exchange (EGX) equities. Generates actionable buy/sell recommendations with entry prices, stop losses, take-profit targets, confidence scores, and risk management.

## Features

### Core Capabilities
- **Universe Coverage**: All EGX-listed liquid stocks (configurable filters)
- **Multi-Timeframe Analysis**: Daily signals with optional weekly confirmation
- **Technical Indicators**: MA crossovers, MACD, RSI, Stochastic, ADX, Bollinger Bands, Volume analysis, ATR
- **Signal Generation**: Clear BUY/SELL/HOLD signals with confidence scoring
- **Risk Management**: Position sizing, stop-loss, take-profit levels, portfolio constraints
- **Backtesting**: Historical validation with comprehensive performance metrics

### Output & Delivery
- CSV and JSON export formats
- Webhook integration for real-time alerts
- Detailed daily reports with rationale tags
- Structured logging for audit trail

## Installation

```bash
# Navigate to the screener directory
cd /workspace/egx_screener

# Install dependencies (if needed)
pip install pandas numpy pyarrow requests
```

## Quick Start

### Run Daily Screen (Demo Mode)
```bash
python main.py --demo
```

### Run Daily Screen (Production)
```bash
python main.py --run
```

### Run Backtest
```bash
python main.py --backtest
```

## Configuration

Edit `config/settings.py` to customize:

### Liquidity Filters
```python
min_avg_volume_20d = 50000      # Minimum 20-day average volume
min_avg_turnover_egp = 500000   # Minimum EGP 500k daily turnover
```

### Risk Parameters
```python
max_risk_per_trade_pct = 2.0    # Max 2% portfolio risk per trade
max_portfolio_exposure_pct = 80  # Max 80% total exposure
min_reward_ratio = 2.0          # Minimum 2:1 reward-to-risk
```

### Indicator Settings
```python
ma_short_period = 20
ma_long_period = 200
rsi_period = 14
rsi_oversold = 30.0
rsi_overbought = 70.0
```

## Signal Logic

### Buy Signals (require 2+ confirming indicators)
- Golden Cross (short MA crosses above long MA)
- MACD Bullish Crossover
- RSI Oversold Recovery (crosses above 30)
- Stochastic Bullish Crossover in oversold zone
- Bollinger Band Upper Breakout
- Volume Spike (>1.5x average)

### Sell Signals (any trigger exits position)
- Death Cross (short MA crosses below long MA)
- MACD Bearish Crossover
- RSI Overbought Decline (crosses below 70)
- Stochastic Bearish Crossover in overbought zone
- Bollinger Band Lower Breakdown

### Stop Loss & Take Profit
- Stop Loss: Entry - (2.5 × ATR)
- TP1: Entry + (2.5 × ATR) - 1:1 R:R
- TP2: Entry + (5.0 × ATR) - 2:1 R:R
- TP3: Entry + (7.5 × ATR) - 3:1 R:R

## Output Structure

### Signal Object
```json
{
  "ticker": "COMI",
  "timestamp": "2025-01-15T15:00:00",
  "signal": "BUY",
  "entry_price": 85.50,
  "stop_loss": 79.20,
  "take_profit_levels": [91.80, 98.10, 104.40],
  "confidence_score": 78.5,
  "rationale_tags": ["Golden Cross", "MACD Bullish Crossover", "Volume Spike"],
  "current_price": 85.50,
  "atr": 2.52,
  "volume_ratio": 2.1
}
```

### Backtest Metrics
- Win Rate (%)
- Total Return (%)
- CAGR (%)
- Average R:R Ratio
- Maximum Drawdown (%)
- Sharpe Ratio
- Sortino Ratio
- Profit Factor

## Project Structure

```
egx_screener/
├── config/
│   └── settings.py       # Configuration parameters
├── data/
│   └── handler.py        # Data loading & API integration
├── indicators/
│   └── technical.py      # Technical indicator calculations
├── signals/
│   └── generator.py      # Signal generation engine
├── risk/
│   └── manager.py        # Risk management & position sizing
├── output/
│   └── handler.py        # Export & webhook delivery
├── backtest/
│   └── engine.py         # Backtesting engine
├── main.py               # Main entry point
└── README.md             # This file
```

## Automation Schedule

The screener is designed to run daily after EGX market close:
- **Market Close**: 14:30 Africa/Cairo
- **Recommended Run Time**: 15:00 Africa/Cairo (30 min delay for data settlement)

### Cron Example (Linux)
```bash
# Run daily at 3 PM Cairo time
0 13 * * * cd /workspace/egx_screener && python main.py --run >> logs/cron.log 2>&1
```

## Integration with Finance API

The system is designed to integrate with the Finance API skill for real-time data:

```python
# In data/handler.py, replace synthetic data with:
api_data = self._fetch_from_api(
    "v1/markets/stock/history",
    {'symbol': symbol, 'interval': '1d', 'diffandsplits': 'true'}
)
```

See `skills/finance/Finance_API_Doc.md` for complete API documentation.

## Monitoring & Alerts

### Logging
All operations are logged to `logs/screener_YYYYMMDD.log` with:
- Signal generation details
- Export confirmations
- Error tracking

### Webhook Alerts
Configure webhook URL in settings for real-time signal delivery:
```python
webhook_enabled = True
webhook_url = "https://your-webhook-endpoint.com/signals"
```

## Performance Validation

Run backtests to validate strategy performance:

```bash
python main.py --backtest
```

Key metrics to monitor:
- **Win Rate > 45%**: Indicates edge in signal generation
- **Profit Factor > 1.5**: Gross wins exceed gross losses
- **Max Drawdown < 20%**: Acceptable risk level
- **Sharpe Ratio > 1.0**: Risk-adjusted returns

## Customization

### Adding New Indicators
Extend `indicators/technical.py`:
```python
def calculate_custom_indicator(self, df: pd.DataFrame) -> pd.DataFrame:
    # Your implementation
    return df
```

### Modifying Signal Rules
Adjust thresholds in `config/settings.py`:
```python
signal_rules = SignalRules(
    buy_ma_golden_cross=True,
    buy_macd_bullish_cross=True,
    # Add custom rules
)
```

## License

Internal use only. Proprietary trading system.

## Support

For issues or enhancements, contact the quantitative development team.
