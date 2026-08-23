"""
Technical Indicators Module for EGX Screener

Implements all required technical indicators with proper calculation methods.
"""

import numpy as np
import pandas as pd
from typing import Tuple, Optional
from config.settings import IndicatorParams


class TechnicalIndicators:
    """
    Collection of technical indicators for signal generation.
    All methods operate on pandas DataFrames with OHLCV data.
    """
    
    def __init__(self, params: Optional[IndicatorParams] = None):
        self.params = params or IndicatorParams()
    
    @staticmethod
    def calculate_sma(prices: pd.Series, period: int) -> pd.Series:
        """Simple Moving Average"""
        return prices.rolling(window=period).mean()
    
    @staticmethod
    def calculate_ema(prices: pd.Series, period: int) -> pd.Series:
        """Exponential Moving Average"""
        return prices.ewm(span=period, adjust=False).mean()
    
    def calculate_ma_crossovers(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Calculate Moving Average crossovers.
        Returns DataFrame with MA values and crossover signals.
        """
        close = df['close']
        
        # Calculate MAs
        df['ma_short'] = self.calculate_ema(close, self.params.ma_short_period)
        df['ma_medium'] = self.calculate_sma(close, self.params.ma_medium_period)
        df['ma_long'] = self.calculate_sma(close, self.params.ma_long_period)
        
        # Golden cross (short crosses above long)
        df['golden_cross'] = (
            (df['ma_short'] > df['ma_long']) & 
            (df['ma_short'].shift(1) <= df['ma_long'].shift(1))
        )
        
        # Death cross (short crosses below long)
        df['death_cross'] = (
            (df['ma_short'] < df['ma_long']) & 
            (df['ma_short'].shift(1) >= df['ma_long'].shift(1))
        )
        
        # Trend filter: price above all MAs (bullish)
        df['above_all_mas'] = (
            (close > df['ma_short']) & 
            (close > df['ma_medium']) & 
            (close > df['ma_long'])
        )
        
        # Trend filter: price below all MAs (bearish)
        df['below_all_mas'] = (
            (close < df['ma_short']) & 
            (close < df['ma_medium']) & 
            (close < df['ma_long'])
        )
        
        return df
    
    def calculate_macd(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        MACD (Moving Average Convergence Divergence)
        Returns MACD line, signal line, and histogram.
        """
        close = df['close']
        
        ema_fast = self.calculate_ema(close, self.params.macd_fast)
        ema_slow = self.calculate_ema(close, self.params.macd_slow)
        
        df['macd_line'] = ema_fast - ema_slow
        df['macd_signal'] = self.calculate_ema(df['macd_line'], self.params.macd_signal)
        df['macd_histogram'] = df['macd_line'] - df['macd_signal']
        
        # Bullish crossover: MACD line crosses above signal
        df['macd_bullish_cross'] = (
            (df['macd_line'] > df['macd_signal']) & 
            (df['macd_line'].shift(1) <= df['macd_signal'].shift(1))
        )
        
        # Bearish crossover: MACD line crosses below signal
        df['macd_bearish_cross'] = (
            (df['macd_line'] < df['macd_signal']) & 
            (df['macd_line'].shift(1) >= df['macd_signal'].shift(1))
        )
        
        # Divergence detection (simplified)
        df['macd_positive'] = df['macd_line'] > 0
        df['macd_negative'] = df['macd_line'] < 0
        
        return df
    
    def calculate_rsi(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        RSI (Relative Strength Index)
        Momentum oscillator measuring speed and magnitude of price changes.
        """
        close = df['close']
        delta = close.diff()
        
        gain = delta.where(delta > 0, 0.0)
        loss = (-delta).where(delta < 0, 0.0)
        
        avg_gain = gain.rolling(window=self.params.rsi_period).mean()
        avg_loss = loss.rolling(window=self.params.rsi_period).mean()
        
        rs = avg_gain / avg_loss.replace(0, np.inf)
        df['rsi'] = 100 - (100 / (1 + rs))
        df['rsi'] = df['rsi'].fillna(50.0)  # Neutral midpoint for initial values
        
        # Oversold condition
        df['rsi_oversold'] = df['rsi'] < self.params.rsi_oversold
        df['rsi_overbought'] = df['rsi'] > self.params.rsi_overbought
        
        # RSI crossing above oversold (buy signal)
        df['rsi_oversold_recovery'] = (
            (df['rsi'] > self.params.rsi_oversold) & 
            (df['rsi'].shift(1) <= self.params.rsi_oversold)
        )
        
        # RSI crossing below overbought (sell signal)
        df['rsi_overbought_decline'] = (
            (df['rsi'] < self.params.rsi_overbought) & 
            (df['rsi'].shift(1) >= self.params.rsi_overbought)
        )
        
        return df
    
    def calculate_stochastic(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Stochastic Oscillator (%K and %D)
        Compares closing price to price range over a period.
        """
        low_min = df['low'].rolling(window=self.params.stoch_k_period).min()
        high_max = df['high'].rolling(window=self.params.stoch_k_period).max()
        
        df['stoch_k'] = 100 * (df['close'] - low_min) / (high_max - low_min).replace(0, np.inf)
        df['stoch_k'] = df['stoch_k'].fillna(50.0)
        
        # %D is SMA of %K
        df['stoch_d'] = df['stoch_k'].rolling(window=self.params.stoch_d_period).mean()
        
        # Oversold/Overbought conditions
        df['stoch_oversold'] = df['stoch_k'] < self.params.stoch_oversold
        df['stoch_overbought'] = df['stoch_k'] > self.params.stoch_overbought
        
        # Bullish crossover in oversold zone
        df['stoch_bullish_cross'] = (
            (df['stoch_k'] > df['stoch_d']) & 
            (df['stoch_k'].shift(1) <= df['stoch_d'].shift(1)) &
            (df['stoch_k'] < self.params.stoch_oversold)
        )
        
        # Bearish crossover in overbought zone
        df['stoch_bearish_cross'] = (
            (df['stoch_k'] < df['stoch_d']) & 
            (df['stoch_k'].shift(1) >= df['stoch_d'].shift(1)) &
            (df['stoch_k'] > self.params.stoch_overbought)
        )
        
        return df
    
    def calculate_adx(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        ADX (Average Directional Index)
        Measures trend strength regardless of direction.
        """
        high = df['high']
        low = df['low']
        close = df['close']
        
        # True Range
        tr1 = high - low
        tr2 = abs(high - close.shift(1))
        tr3 = abs(low - close.shift(1))
        df['tr'] = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        df['atr'] = df['tr'].rolling(window=self.params.atr_period).mean()
        
        # Directional Movement
        plus_dm = high.diff()
        minus_dm = -low.diff()
        
        plus_dm = plus_dm.where((plus_dm > minus_dm) & (plus_dm > 0), 0)
        minus_dm = minus_dm.where((minus_dm > plus_dm) & (minus_dm > 0), 0)
        
        # Smoothed DM
        plus_di = 100 * (plus_dm.ewm(span=self.params.adx_period).mean() / df['atr'])
        minus_di = 100 * (minus_dm.ewm(span=self.params.adx_period).mean() / df['atr'])
        
        # DX and ADX
        dx = 100 * abs(plus_di - minus_di) / (plus_di + minus_di).replace(0, np.inf)
        df['adx'] = dx.rolling(window=self.params.adx_period).mean()
        
        # Trend strength classification
        df['adx_strong_trend'] = df['adx'] > self.params.adx_trend_threshold
        df['adx_weak_trend'] = df['adx'] <= self.params.adx_trend_threshold
        
        # Directional bias
        df['plus_di'] = plus_di
        df['minus_di'] = minus_di
        df['di_plus_above_minus'] = plus_di > minus_di
        
        return df
    
    def calculate_bollinger_bands(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Bollinger Bands
        Volatility bands placed above and below a moving average.
        """
        close = df['close']
        
        # Middle band (SMA)
        df['bb_middle'] = self.calculate_sma(close, self.params.bb_period)
        
        # Standard deviation
        bb_std = close.rolling(window=self.params.bb_period).std()
        
        # Upper and lower bands
        df['bb_upper'] = df['bb_middle'] + (self.params.bb_std_dev * bb_std)
        df['bb_lower'] = df['bb_middle'] - (self.params.bb_std_dev * bb_std)
        
        # Bandwidth (volatility measure)
        df['bb_bandwidth'] = (df['bb_upper'] - df['bb_lower']) / df['bb_middle']
        
        # %B (position within bands)
        df['bb_percent_b'] = (close - df['bb_lower']) / (df['bb_upper'] - df['bb_lower']).replace(0, np.inf)
        
        # Breakout signals
        df['bb_breakout_upper'] = close > df['bb_upper']
        df['bb_breakout_lower'] = close < df['bb_lower']
        
        # Squeeze (low volatility - potential breakout coming)
        df['bb_squeeze'] = df['bb_bandwidth'] < df['bb_bandwidth'].rolling(window=20).quantile(0.25)
        
        return df
    
    def calculate_volume_analysis(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Volume analysis including volume spikes and OBV.
        """
        volume = df['volume']
        close = df['close']
        
        # Average volume
        df['volume_avg'] = volume.rolling(window=self.params.volume_avg_period).mean()
        
        # Volume spike detection
        df['volume_spike'] = volume > (df['volume_avg'] * self.params.volume_spike_multiplier)
        
        # Volume ratio (current vs average)
        df['volume_ratio'] = volume / df['volume_avg'].replace(0, np.inf)
        
        # On-Balance Volume (OBV)
        obv = [0]
        for i in range(1, len(df)):
            if close.iloc[i] > close.iloc[i-1]:
                obv.append(obv[-1] + volume.iloc[i])
            elif close.iloc[i] < close.iloc[i-1]:
                obv.append(obv[-1] - volume.iloc[i])
            else:
                obv.append(obv[-1])
        df['obv'] = obv
        
        # OBV trend (simplified: compare to its MA)
        df['obv_ma'] = df['obv'].rolling(window=20).mean()
        df['obv_uptrend'] = df['obv'] > df['obv_ma']
        
        # Volume confirmation for price moves
        df['volume_confirms_up'] = (close.diff() > 0) & (volume > df['volume_avg'])
        df['volume_confirms_down'] = (close.diff() < 0) & (volume > df['volume_avg'])
        
        return df
    
    def calculate_atr_stops(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        ATR-based stop loss and take profit levels.
        """
        close = df['close']
        atr = df['atr']
        
        if 'atr' not in df.columns:
            # Calculate ATR if not already present
            high = df['high']
            low = df['low']
            tr1 = high - low
            tr2 = abs(high - close.shift(1))
            tr3 = abs(low - close.shift(1))
            df['tr'] = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
            df['atr'] = df['tr'].rolling(window=self.params.atr_period).mean()
            atr = df['atr']
        
        # Stop loss levels (for long positions)
        df['stop_loss_long'] = close - (atr * self.params.atr_stop_multiplier)
        
        # Take profit levels (multiple targets)
        df['tp1_long'] = close + (atr * self.params.atr_stop_multiplier * 1.0)  # 1:1 RR
        df['tp2_long'] = close + (atr * self.params.atr_stop_multiplier * 2.0)  # 2:1 RR
        df['tp3_long'] = close + (atr * self.params.atr_stop_multiplier * 3.0)  # 3:1 RR
        
        # For short positions
        df['stop_loss_short'] = close + (atr * self.params.atr_stop_multiplier)
        df['tp1_short'] = close - (atr * self.params.atr_stop_multiplier * 1.0)
        df['tp2_short'] = close - (atr * self.params.atr_stop_multiplier * 2.0)
        df['tp3_short'] = close - (atr * self.params.atr_stop_multiplier * 3.0)
        
        return df
    
    def calculate_all_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Calculate all technical indicators in sequence.
        This is the main method called by the screener.
        """
        # Ensure required columns exist
        required_cols = ['open', 'high', 'low', 'close', 'volume']
        missing = set(required_cols) - set(df.columns)
        if missing:
            raise ValueError(f"Missing required columns: {missing}")
        
        # Calculate indicators in order (some depend on others)
        df = self.calculate_ma_crossovers(df)
        df = self.calculate_macd(df)
        df = self.calculate_rsi(df)
        df = self.calculate_stochastic(df)
        df = self.calculate_adx(df)  # Also calculates ATR
        df = self.calculate_bollinger_bands(df)
        df = self.calculate_volume_analysis(df)
        df = self.calculate_atr_stops(df)
        
        return df
