"""
Signal Generation Engine for EGX Screener

Generates buy/sell/hold signals based on technical indicators with confidence scoring.
"""

import pandas as pd
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum

from config.settings import SignalRules, IndicatorParams, RiskParameters, SignalType
from indicators.technical import TechnicalIndicators


@dataclass
class Signal:
    """Individual trading signal with all required metadata"""
    ticker: str
    timestamp: datetime
    signal_type: SignalType
    entry_price: float
    stop_loss: float
    take_profit_levels: List[float]
    confidence_score: float  # 0-100
    rationale_tags: List[str]
    
    # Additional metadata
    current_price: float = 0.0
    atr: float = 0.0
    volume_ratio: float = 1.0
    multi_timeframe_confirmation: Dict[str, str] = field(default_factory=dict)
    
    def to_dict(self) -> dict:
        """Convert to dictionary for JSON export"""
        return {
            'ticker': self.ticker,
            'timestamp': self.timestamp.isoformat(),
            'signal': self.signal_type.value,
            'entry_price': round(self.entry_price, 4),
            'stop_loss': round(self.stop_loss, 4),
            'take_profit_levels': [round(tp, 4) for tp in self.take_profit_levels],
            'confidence_score': round(self.confidence_score, 2),
            'rationale_tags': self.rationale_tags,
            'current_price': round(self.current_price, 4),
            'atr': round(self.atr, 4),
            'volume_ratio': round(self.volume_ratio, 2),
            'multi_timeframe_confirmation': self.multi_timeframe_confirmation
        }


class SignalGenerator:
    """
    Generates trading signals based on technical indicator conditions.
    Implements configurable signal rules with confidence scoring.
    """
    
    def __init__(
        self,
        signal_rules: Optional[SignalRules] = None,
        indicator_params: Optional[IndicatorParams] = None,
        risk_params: Optional[RiskParameters] = None
    ):
        self.rules = signal_rules or SignalRules()
        self.indicator_params = indicator_params or IndicatorParams()
        self.risk_params = risk_params or RiskParameters()
        self.indicators = TechnicalIndicators(indicator_params)
    
    def _calculate_confidence(
        self,
        df: pd.DataFrame,
        is_buy: bool
    ) -> Tuple[float, List[str]]:
        """
        Calculate confidence score (0-100) and rationale tags.
        
        Confidence is based on:
        - Number of confirming indicators
        - Trend strength (ADX)
        - Volume confirmation
        - Multi-timeframe alignment (if available)
        """
        last_row = df.iloc[-1]
        confidence = 50.0  # Base confidence
        rationales = []
        
        if is_buy:
            # Check bullish conditions
            if last_row.get('golden_cross', False):
                confidence += 10
                rationales.append('Golden Cross')
            
            if last_row.get('macd_bullish_cross', False):
                confidence += 15
                rationales.append('MACD Bullish Crossover')
            
            if last_row.get('rsi_oversold_recovery', False):
                confidence += 10
                rationales.append('RSI Oversold Recovery')
            
            if last_row.get('stoch_bullish_cross', False):
                confidence += 10
                rationales.append('Stochastic Bullish Crossover')
            
            if last_row.get('bb_breakout_upper', False):
                confidence += 10
                rationales.append('Bollinger Band Breakout')
            
            if last_row.get('volume_spike', False):
                confidence += 10
                rationales.append('Volume Spike')
            
            if last_row.get('above_all_mas', False):
                confidence += 5
                rationales.append('Above All MAs')
            
            # ADX trend strength bonus
            if last_row.get('adx_strong_trend', False) and last_row.get('di_plus_above_minus', False):
                confidence += 10
                rationales.append('Strong Uptrend (ADX)')
            
            # Volume confirmation
            if last_row.get('volume_confirms_up', False):
                confidence += 5
                rationales.append('Volume Confirms Move')
            
            # OBV uptrend
            if last_row.get('obv_uptrend', False):
                confidence += 5
                rationales.append('OBV Uptrend')
                
        else:  # Sell signal
            # Check bearish conditions
            if last_row.get('death_cross', False):
                confidence += 10
                rationales.append('Death Cross')
            
            if last_row.get('macd_bearish_cross', False):
                confidence += 15
                rationales.append('MACD Bearish Crossover')
            
            if last_row.get('rsi_overbought_decline', False):
                confidence += 10
                rationales.append('RSI Overbought Decline')
            
            if last_row.get('stoch_bearish_cross', False):
                confidence += 10
                rationales.append('Stochastic Bearish Crossover')
            
            if last_row.get('bb_breakout_lower', False):
                confidence += 10
                rationales.append('Bollinger Band Breakdown')
            
            if last_row.get('below_all_mas', False):
                confidence += 5
                rationales.append('Below All MAs')
            
            # ADX trend strength bonus
            if last_row.get('adx_strong_trend', False) and not last_row.get('di_plus_above_minus', False):
                confidence += 10
                rationales.append('Strong Downtrend (ADX)')
            
            # Volume confirmation
            if last_row.get('volume_confirms_down', False):
                confidence += 5
                rationales.append('Volume Confirms Move')
        
        # Cap confidence at 100
        confidence = min(100.0, confidence)
        
        # Ensure minimum confidence for any signal
        if len(rationales) > 0 and confidence < 60:
            confidence = 60.0
        
        return confidence, rationales
    
    def _check_buy_signal(self, df: pd.DataFrame) -> bool:
        """Check if buy conditions are met based on configured rules"""
        last_row = df.iloc[-1]
        
        # Count required conditions
        conditions_met = 0
        total_conditions = 0
        
        if self.rules.buy_ma_golden_cross:
            total_conditions += 1
            if last_row.get('golden_cross', False):
                conditions_met += 1
        
        if self.rules.buy_macd_bullish_cross:
            total_conditions += 1
            if last_row.get('macd_bullish_cross', False):
                conditions_met += 1
        
        if self.rules.buy_rsi_oversold_recovery:
            total_conditions += 1
            if last_row.get('rsi_oversold_recovery', False):
                conditions_met += 1
        
        if self.rules.buy_stochastic_oversold:
            total_conditions += 1
            if last_row.get('stoch_bullish_cross', False):
                conditions_met += 1
        
        if self.rules.buy_bollinger_breakout_upper:
            total_conditions += 1
            if last_row.get('bb_breakout_upper', False):
                conditions_met += 1
        
        if self.rules.buy_volume_confirmation:
            total_conditions += 1
            if last_row.get('volume_spike', False) or last_row.get('volume_ratio', 0) > 1.5:
                conditions_met += 1
        
        if self.rules.buy_adx_trending:
            total_conditions += 1
            if last_row.get('adx_strong_trend', False) and last_row.get('di_plus_above_minus', False):
                conditions_met += 1
        
        # Require at least 2 confirming signals OR all enabled conditions
        min_required = max(2, total_conditions // 2)
        return conditions_met >= min_required
    
    def _check_sell_signal(self, df: pd.DataFrame) -> bool:
        """Check if sell conditions are met based on configured rules"""
        last_row = df.iloc[-1]
        
        # For sell signals, any strong condition can trigger
        if self.rules.sell_ma_death_cross and last_row.get('death_cross', False):
            return True
        
        if self.rules.sell_macd_bearish_cross and last_row.get('macd_bearish_cross', False):
            return True
        
        if self.rules.sell_rsi_overbought and last_row.get('rsi_overbought_decline', False):
            return True
        
        if self.rules.sell_stochastic_overbought and last_row.get('stoch_bearish_cross', False):
            return True
        
        if self.rules.sell_bollinger_breakout_lower and last_row.get('bb_breakout_lower', False):
            return True
        
        return False
    
    def generate_signal(
        self,
        ticker: str,
        df: pd.DataFrame,
        weekly_df: Optional[pd.DataFrame] = None
    ) -> Optional[Signal]:
        """
        Generate trading signal for a single ticker.
        
        Args:
            ticker: Stock symbol
            df: Daily OHLCV DataFrame with indicators calculated
            weekly_df: Optional weekly DataFrame for multi-timeframe confirmation
            
        Returns:
            Signal object if conditions met, None otherwise
        """
        if len(df) < 30:  # Need sufficient history
            return None
        
        # Ensure indicators are calculated
        if 'rsi' not in df.columns:
            df = self.indicators.calculate_all_indicators(df)
        
        last_row = df.iloc[-1]
        current_price = last_row['close']
        
        # Check for buy signal
        is_buy = self._check_buy_signal(df)
        is_sell = self._check_sell_signal(df)
        
        if not is_buy and not is_sell:
            return None  # Hold/no action
        
        # Determine signal type
        if is_buy and is_sell:
            # Conflicting signals - skip or reduce confidence
            return None
        
        signal_type = SignalType.BUY if is_buy else SignalType.SELL
        
        # Calculate confidence and get rationale
        confidence, rationales = self._calculate_confidence(df, is_buy)
        
        # Get ATR-based levels
        atr = last_row.get('atr', current_price * 0.03)  # Default 3% if ATR not available
        
        if is_buy:
            entry_price = current_price
            stop_loss = last_row.get('stop_loss_long', current_price * 0.95)
            take_profit_levels = [
                last_row.get('tp1_long', current_price * 1.03),
                last_row.get('tp2_long', current_price * 1.06),
                last_row.get('tp3_long', current_price * 1.09)
            ]
        else:
            entry_price = current_price
            stop_loss = last_row.get('stop_loss_short', current_price * 1.05)
            take_profit_levels = [
                last_row.get('tp1_short', current_price * 0.97),
                last_row.get('tp2_short', current_price * 0.94),
                last_row.get('tp3_short', current_price * 0.91)
            ]
        
        # Multi-timeframe confirmation (optional)
        mt_confirmation = {}
        if weekly_df is not None and len(weekly_df) >= 20:
            weekly_df = self.indicators.calculate_all_indicators(weekly_df.copy())
            weekly_last = weekly_df.iloc[-1]
            
            # Simple weekly trend check
            if weekly_last.get('ma_short', 0) > weekly_last.get('ma_long', 0):
                mt_confirmation['weekly'] = 'BULLISH'
            else:
                mt_confirmation['weekly'] = 'BEARISH'
            
            # Adjust confidence based on alignment
            if is_buy and mt_confirmation.get('weekly') == 'BULLISH':
                confidence = min(100, confidence + 10)
                rationales.append('Weekly Confirmation')
            elif is_sell and mt_confirmation.get('weekly') == 'BEARISH':
                confidence = min(100, confidence + 10)
                rationales.append('Weekly Confirmation')
        
        # Volume ratio
        volume_ratio = last_row.get('volume_ratio', 1.0)
        
        return Signal(
            ticker=ticker,
            timestamp=datetime.now(),
            signal_type=signal_type,
            entry_price=entry_price,
            stop_loss=stop_loss,
            take_profit_levels=take_profit_levels,
            confidence_score=confidence,
            rationale_tags=rationales,
            current_price=current_price,
            atr=atr,
            volume_ratio=volume_ratio,
            multi_timeframe_confirmation=mt_confirmation
        )
    
    def generate_signals_for_universe(
        self,
        price_data: Dict[str, pd.DataFrame],
        weekly_data: Optional[Dict[str, pd.DataFrame]] = None
    ) -> List[Signal]:
        """
        Generate signals for entire universe of stocks.
        
        Args:
            price_data: Dict mapping ticker to daily OHLCV DataFrame
            weekly_data: Optional dict mapping ticker to weekly OHLCV DataFrame
            
        Returns:
            List of Signal objects
        """
        signals = []
        
        for ticker, df in price_data.items():
            try:
                weekly_df = weekly_data.get(ticker) if weekly_data else None
                signal = self.generate_signal(ticker, df, weekly_df)
                if signal:
                    signals.append(signal)
            except Exception as e:
                # Log error but continue processing other tickers
                print(f"Error generating signal for {ticker}: {str(e)}")
                continue
        
        # Sort by confidence (highest first)
        signals.sort(key=lambda s: s.confidence_score, reverse=True)
        
        return signals
