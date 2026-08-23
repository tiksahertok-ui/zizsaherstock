"""
EGX Daily Stock Screener Configuration

Production-ready configuration for Egyptian Exchange equity screening system.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any
from enum import Enum


class Timeframe(Enum):
    DAILY = "1d"
    WEEKLY = "1wk"
    HOURLY = "1h"
    INTRADAY_30M = "30m"
    INTRADAY_15M = "15m"


class SignalType(Enum):
    BUY = "BUY"
    SELL = "SELL"
    HOLD = "HOLD"


@dataclass
class LiquidityFilter:
    """Minimum liquidity requirements to ensure tradability"""
    min_avg_volume_20d: int = 50000  # Minimum 20-day average volume
    min_avg_turnover_egp: float = 500000  # Minimum EGP 500k daily turnover
    max_bid_ask_spread_pct: float = 2.0  # Maximum 2% spread
    min_market_cap_egp: float = 100000000  # Minimum EGP 100M market cap


@dataclass
class RiskParameters:
    """Position sizing and risk management rules"""
    max_risk_per_trade_pct: float = 2.0  # Max 2% of portfolio per trade
    max_portfolio_exposure_pct: float = 80.0  # Max 80% total exposure
    max_position_size_pct: float = 10.0  # Max 10% in single stock
    min_reward_ratio: float = 2.0  # Minimum 2:1 reward-to-risk
    max_open_positions: int = 10  # Maximum concurrent positions


@dataclass
class IndicatorParams:
    """Technical indicator parameters"""
    # Moving Averages
    ma_short_period: int = 20
    ma_medium_period: int = 50
    ma_long_period: int = 200
    
    # MACD
    macd_fast: int = 12
    macd_slow: int = 26
    macd_signal: int = 9
    
    # RSI
    rsi_period: int = 14
    rsi_oversold: float = 30.0
    rsi_overbought: float = 70.0
    
    # Stochastic
    stoch_k_period: int = 14
    stoch_d_period: int = 3
    stoch_oversold: float = 20.0
    stoch_overbought: float = 80.0
    
    # ADX (trend strength)
    adx_period: int = 14
    adx_trend_threshold: float = 25.0  # ADX > 25 indicates strong trend
    
    # Bollinger Bands
    bb_period: int = 20
    bb_std_dev: float = 2.0
    
    # Volume
    volume_spike_multiplier: float = 2.0  # Volume 2x above average
    volume_avg_period: int = 20
    
    # ATR for stops
    atr_period: int = 14
    atr_stop_multiplier: float = 2.5  # Stop loss at 2.5x ATR


@dataclass
class SignalRules:
    """Entry and exit signal definitions"""
    
    # Buy signals (all must be true for high confidence)
    buy_ma_golden_cross: bool = True  # Short MA crosses above Long MA
    buy_macd_bullish_cross: bool = True  # MACD line crosses above signal
    buy_rsi_oversold_recovery: bool = True  # RSI crosses above 30 from below
    buy_stochastic_oversold: bool = True  # %K crosses above %D in oversold zone
    buy_bollinger_breakout_upper: bool = True  # Price breaks above upper BB
    buy_volume_confirmation: bool = True  # Volume > 1.5x average on breakout
    buy_adx_trending: bool = False  # Optional: ADX > 25 for trending markets
    
    # Sell signals (any can trigger exit)
    sell_ma_death_cross: bool = True  # Short MA crosses below Long MA
    sell_macd_bearish_cross: bool = True  # MACD line crosses below signal
    sell_rsi_overbought: bool = True  # RSI crosses below 70 from above
    sell_stochastic_overbought: bool = True  # %K crosses below %D in overbought
    sell_bollinger_breakout_lower: bool = True  # Price breaks below lower BB
    sell_stop_loss_hit: bool = True  # Stop loss triggered
    sell_take_profit_hit: bool = True  # Take profit target reached


@dataclass
class BacktestConfig:
    """Backtesting configuration"""
    start_date: str = "2023-01-01"
    end_date: str = "2024-12-31"
    initial_capital: float = 1000000.0  # EGP 1M starting capital
    commission_pct: float = 0.1  # 0.1% transaction cost
    slippage_pct: float = 0.05  # 0.05% slippage assumption


@dataclass
class OutputConfig:
    """Output and delivery configuration"""
    output_dir: str = "output"
    log_dir: str = "logs"
    
    # Output formats
    export_csv: bool = True
    export_json: bool = True
    webhook_enabled: bool = False
    webhook_url: str = ""
    
    # Signal details to include
    include_rationale: bool = True
    include_confidence: bool = True
    include_multi_timeframe: bool = True
    
    # Alert thresholds
    alert_on_high_confidence_only: bool = True
    min_confidence_for_alert: float = 70.0


@dataclass
class SchedulerConfig:
    """Daily automation schedule"""
    timezone: str = "Africa/Cairo"
    market_close_time: str = "14:30"  # EGX closes at 2:30 PM
    run_delay_minutes: int = 30  # Run 30 min after close to ensure data availability
    run_time: str = "15:00"  # Execute at 3:00 PM Cairo time


@dataclass
class EGXScreenerConfig:
    """Master configuration for EGX Screener"""
    
    # Data sources
    universe_file: str = "download/egx_from_stockanalysis.json"
    data_source: str = "finance_api"  # Using the Finance API skill
    
    # Timeframes
    primary_timeframe: Timeframe = Timeframe.DAILY
    confirmation_timeframes: List[Timeframe] = field(default_factory=lambda: [Timeframe.WEEKLY])
    
    # Filters and rules
    liquidity_filter: LiquidityFilter = field(default_factory=LiquidityFilter)
    risk_params: RiskParameters = field(default_factory=RiskParameters)
    indicator_params: IndicatorParams = field(default_factory=IndicatorParams)
    signal_rules: SignalRules = field(default_factory=SignalRules)
    
    # Backtesting
    backtest: BacktestConfig = field(default_factory=BacktestConfig)
    
    # Output
    output: OutputConfig = field(default_factory=OutputConfig)
    
    # Scheduling
    scheduler: SchedulerConfig = field(default_factory=SchedulerConfig)
    
    # Logging
    log_level: str = "INFO"
    enable_debug: bool = False


# Default instance
DEFAULT_CONFIG = EGXScreenerConfig()
