"""
EGX Screener Package Initialization
"""

from config.settings import (
    EGXScreenerConfig,
    DEFAULT_CONFIG,
    Timeframe,
    SignalType,
    LiquidityFilter,
    RiskParameters,
    IndicatorParams,
    SignalRules
)

from data.handler import DataHandler
from indicators.technical import TechnicalIndicators
from signals.generator import SignalGenerator, Signal
from risk.manager import RiskManager
from output.handler import OutputHandler
from backtest.engine import Backtester, BacktestResult

__version__ = "1.0.0"
__all__ = [
    'EGXScreenerConfig',
    'DEFAULT_CONFIG',
    'Timeframe',
    'SignalType',
    'DataHandler',
    'TechnicalIndicators',
    'SignalGenerator',
    'Signal',
    'RiskManager',
    'OutputHandler',
    'Backtester',
    'BacktestResult'
]
