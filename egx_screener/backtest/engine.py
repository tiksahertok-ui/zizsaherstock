"""
Backtesting Engine for EGX Screener

Provides historical performance validation with comprehensive metrics.
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime

from config.settings import BacktestConfig, RiskParameters
from signals.generator import Signal, SignalType


@dataclass
class Trade:
    """Represents a single executed trade"""
    ticker: str
    entry_date: datetime
    entry_price: float
    exit_date: Optional[datetime] = None
    exit_price: Optional[float] = None
    shares: int = 0
    stop_loss: float = 0.0
    take_profit_levels: List[float] = field(default_factory=list)
    exit_reason: str = ""  # 'TP1', 'TP2', 'TP3', 'SL', 'END'
    pnl_egp: float = 0.0
    pnl_pct: float = 0.0
    rr_achieved: float = 0.0


@dataclass
class BacktestResult:
    """Comprehensive backtest performance metrics"""
    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    win_rate: float = 0.0
    
    total_pnl_egp: float = 0.0
    total_return_pct: float = 0.0
    cagr: float = 0.0
    
    avg_win_pct: float = 0.0
    avg_loss_pct: float = 0.0
    avg_rr_ratio: float = 0.0
    
    max_drawdown_pct: float = 0.0
    max_drawdown_duration_days: int = 0
    
    sharpe_ratio: float = 0.0
    sortino_ratio: float = 0.0
    profit_factor: float = 0.0
    
    initial_capital: float = 0.0
    final_capital: float = 0.0
    
    trades: List[Trade] = field(default_factory=list)
    equity_curve: List[Tuple[datetime, float]] = field(default_factory=list)
    
    def to_dict(self) -> dict:
        """Convert to dictionary for reporting"""
        return {
            'total_trades': self.total_trades,
            'winning_trades': self.winning_trades,
            'losing_trades': self.losing_trades,
            'win_rate': round(self.win_rate, 2),
            'total_pnl_egp': round(self.total_pnl_egp, 2),
            'total_return_pct': round(self.total_return_pct, 2),
            'cagr': round(self.cagr, 4),
            'avg_win_pct': round(self.avg_win_pct, 2),
            'avg_loss_pct': round(self.avg_loss_pct, 2),
            'avg_rr_ratio': round(self.avg_rr_ratio, 2),
            'max_drawdown_pct': round(self.max_drawdown_pct, 2),
            'max_drawdown_duration_days': self.max_drawdown_duration_days,
            'sharpe_ratio': round(self.sharpe_ratio, 2),
            'sortino_ratio': round(self.sortino_ratio, 2),
            'profit_factor': round(self.profit_factor, 2),
            'initial_capital': round(self.initial_capital, 2),
            'final_capital': round(self.final_capital, 2)
        }


class Backtester:
    """
    Event-driven backtesting engine for EGX trading strategies.
    
    Simulates realistic trading with:
    - Commission and slippage
    - Position sizing
    - Stop loss and take profit exits
    - Portfolio constraints
    """
    
    def __init__(
        self,
        config: Optional[BacktestConfig] = None,
        risk_params: Optional[RiskParameters] = None
    ):
        self.config = config or BacktestConfig()
        self.risk_params = risk_params or RiskParameters()
        
        self.capital = self.config.initial_capital
        self.positions: Dict[str, Trade] = {}
        self.closed_trades: List[Trade] = []
        self.equity_curve: List[Tuple[datetime, float]] = []
    
    def _calculate_commission(self, value: float) -> float:
        """Calculate transaction commission"""
        return value * (self.config.commission_pct / 100.0)
    
    def _calculate_slippage(self, price: float, is_buy: bool) -> float:
        """Calculate slippage-adjusted price"""
        slippage = price * (self.config.slippage_pct / 100.0)
        return price + slippage if is_buy else price - slippage
    
    def run_backtest(
        self,
        price_data: Dict[str, pd.DataFrame],
        signal_generator
    ) -> BacktestResult:
        """
        Run full backtest over historical data.
        
        Args:
            price_data: Dict mapping ticker to OHLCV DataFrame
            signal_generator: SignalGenerator instance
            
        Returns:
            BacktestResult with performance metrics
        """
        # Get date range
        all_dates = set()
        for df in price_data.values():
            dates = pd.to_datetime(df['date'])
            all_dates.update(dates.tolist())
        
        if not all_dates:
            return BacktestResult()
        
        sorted_dates = sorted(all_dates)
        start_date = sorted_dates[0]
        end_date = sorted_dates[-1]
        
        print(f"Running backtest from {start_date.date()} to {end_date.date()}")
        
        # Initialize tracking
        self.capital = self.config.initial_capital
        initial_capital = self.capital
        self.positions = {}
        self.closed_trades = []
        self.equity_curve = [(start_date, initial_capital)]
        
        # Iterate through each day
        for current_date in sorted_dates:
            # Check for position exits first
            self._check_exits(price_data, current_date)
            
            # Generate signals for this day
            daily_data = self._get_data_for_date(price_data, current_date)
            if not daily_data:
                continue
            
            # Generate buy signals
            signals = signal_generator.generate_signals_for_universe(daily_data)
            
            # Execute new positions (respecting constraints)
            for signal in signals:
                if signal.signal_type == SignalType.BUY and len(self.positions) < self.risk_params.max_open_positions:
                    self._execute_entry(signal, current_date)
            
            # Calculate portfolio value
            portfolio_value = self._calculate_portfolio_value(price_data, current_date)
            self.equity_curve.append((current_date, portfolio_value))
        
        # Close any remaining positions at end
        self._close_all_positions(price_data, end_date)
        
        # Calculate metrics
        return self._calculate_metrics(initial_capital)
    
    def _get_data_for_date(
        self,
        price_data: Dict[str, pd.DataFrame],
        target_date: pd.Timestamp
    ) -> Dict[str, pd.DataFrame]:
        """Get price data up to and including target date for each ticker"""
        result = {}
        target_date = pd.to_datetime(target_date)
        
        for ticker, df in price_data.items():
            df_copy = df.copy()
            df_copy['date'] = pd.to_datetime(df_copy['date'])
            historical = df_copy[df_copy['date'] <= target_date].copy()
            
            if len(historical) >= 50:  # Need sufficient history
                result[ticker] = historical
        
        return result
    
    def _execute_entry(self, signal: Signal, entry_date: datetime):
        """Execute a buy order"""
        if signal.ticker in self.positions:
            return  # Already have position
        
        # Calculate position size (simplified version)
        risk_amount = self.capital * (self.risk_params.max_risk_per_trade_pct / 100.0)
        risk_per_share = abs(signal.entry_price - signal.stop_loss)
        
        if risk_per_share <= 0:
            return
        
        shares = int(risk_amount / risk_per_share)
        shares = max(100, (shares // 100) * 100)  # Board lot
        
        # Apply slippage
        actual_entry = self._calculate_slippage(signal.entry_price, is_buy=True)
        
        # Calculate cost
        position_value = shares * actual_entry
        commission = self._calculate_commission(position_value)
        total_cost = position_value + commission
        
        if total_cost > self.capital:
            return  # Insufficient capital
        
        # Deduct from capital
        self.capital -= total_cost
        
        # Create position
        trade = Trade(
            ticker=signal.ticker,
            entry_date=entry_date,
            entry_price=actual_entry,
            shares=shares,
            stop_loss=signal.stop_loss,
            take_profit_levels=signal.take_profit_levels
        )
        
        self.positions[signal.ticker] = trade
    
    def _check_exits(
        self,
        price_data: Dict[str, pd.DataFrame],
        current_date: datetime
    ):
        """Check if any positions should be exited"""
        tickers_to_remove = []
        
        for ticker, trade in self.positions.items():
            if ticker not in price_data:
                continue
            
            df = price_data[ticker]
            df['date'] = pd.to_datetime(df['date'])
            match = df[df['date'] == pd.to_datetime(current_date)]
            
            if len(match) == 0:
                continue
            
            row = match.iloc[-1]
            current_price = row['close']
            low = row['low']
            high = row['high']
            
            exit_reason = None
            exit_price = current_price
            
            # Check stop loss (using low of the day)
            if low <= trade.stop_loss:
                exit_reason = 'SL'
                exit_price = trade.stop_loss
            
            # Check take profit levels
            elif trade.take_profit_levels:
                for i, tp in enumerate(trade.take_profit_levels):
                    if high >= tp:
                        exit_reason = f'TP{i+1}'
                        exit_price = tp
                        break
            
            if exit_reason:
                # Apply slippage
                actual_exit = self._calculate_slippage(exit_price, is_buy=False)
                
                # Calculate PnL
                position_value = trade.shares * actual_exit
                commission = self._calculate_commission(position_value)
                net_proceeds = position_value - commission
                
                original_cost = trade.shares * trade.entry_price
                pnl = net_proceeds - original_cost
                pnl_pct = (pnl / original_cost) * 100 if original_cost > 0 else 0
                
                # Calculate R:R achieved
                risk_taken = abs(trade.entry_price - trade.stop_loss)
                reward_achieved = abs(actual_exit - trade.entry_price)
                rr_achieved = reward_achieved / risk_taken if risk_taken > 0 else 0
                
                # Update trade
                trade.exit_date = current_date
                trade.exit_price = actual_exit
                trade.exit_reason = exit_reason
                trade.pnl_egp = pnl
                trade.pnl_pct = pnl_pct
                trade.rr_achieved = rr_achieved
                
                # Add capital back
                self.capital += net_proceeds
                
                # Move to closed trades
                self.closed_trades.append(trade)
                tickers_to_remove.append(ticker)
        
        # Remove closed positions
        for ticker in tickers_to_remove:
            del self.positions[ticker]
    
    def _calculate_portfolio_value(
        self,
        price_data: Dict[str, pd.DataFrame],
        current_date: datetime
    ) -> float:
        """Calculate total portfolio value (cash + positions)"""
        value = self.capital
        
        for ticker, trade in self.positions.items():
            if ticker in price_data:
                df = price_data[ticker]
                df['date'] = pd.to_datetime(df['date'])
                match = df[df['date'] == pd.to_datetime(current_date)]
                
                if len(match) > 0:
                    current_price = match.iloc[-1]['close']
                    value += trade.shares * current_price
        
        return value
    
    def _close_all_positions(
        self,
        price_data: Dict[str, pd.DataFrame],
        end_date: datetime
    ):
        """Force close all remaining positions"""
        for ticker in list(self.positions.keys()):
            if ticker not in price_data:
                continue
            
            df = price_data[ticker]
            df['date'] = pd.to_datetime(df['date'])
            match = df[df['date'] == pd.to_datetime(end_date)]
            
            if len(match) == 0:
                continue
            
            trade = self.positions[ticker]
            exit_price = match.iloc[-1]['close']
            
            # Apply slippage
            actual_exit = self._calculate_slippage(exit_price, is_buy=False)
            
            position_value = trade.shares * actual_exit
            commission = self._calculate_commission(position_value)
            net_proceeds = position_value - commission
            
            original_cost = trade.shares * trade.entry_price
            pnl = net_proceeds - original_cost
            pnl_pct = (pnl / original_cost) * 100 if original_cost > 0 else 0
            
            trade.exit_date = end_date
            trade.exit_price = actual_exit
            trade.exit_reason = 'END'
            trade.pnl_egp = pnl
            trade.pnl_pct = pnl_pct
            
            self.capital += net_proceeds
            self.closed_trades.append(trade)
        
        self.positions.clear()
    
    def _calculate_metrics(self, initial_capital: float) -> BacktestResult:
        """Calculate comprehensive performance metrics"""
        result = BacktestResult()
        result.initial_capital = initial_capital
        result.final_capital = self.capital
        result.trades = self.closed_trades
        result.equity_curve = self.equity_curve
        
        if not self.closed_trades:
            return result
        
        # Basic trade statistics
        result.total_trades = len(self.closed_trades)
        winning = [t for t in self.closed_trades if t.pnl_egp > 0]
        losing = [t for t in self.closed_trades if t.pnl_egp <= 0]
        
        result.winning_trades = len(winning)
        result.losing_trades = len(losing)
        result.win_rate = (result.winning_trades / result.total_trades) * 100
        
        # PnL calculations
        result.total_pnl_egp = self.capital - initial_capital
        result.total_return_pct = ((self.capital / initial_capital) - 1) * 100
        
        # CAGR
        if self.equity_curve:
            start_date = self.equity_curve[0][0]
            end_date = self.equity_curve[-1][0]
            years = (end_date - start_date).days / 365.25
            if years > 0:
                result.cagr = ((self.capital / initial_capital) ** (1 / years)) - 1
        
        # Average win/loss
        if winning:
            result.avg_win_pct = np.mean([t.pnl_pct for t in winning])
        if losing:
            result.avg_loss_pct = np.mean([t.pnl_pct for t in losing])
        
        # Average R:R
        result.avg_rr_ratio = np.mean([t.rr_achieved for t in self.closed_trades])
        
        # Maximum drawdown
        result.max_drawdown_pct, result.max_drawdown_duration_days = self._calculate_max_drawdown()
        
        # Sharpe ratio (annualized)
        result.sharpe_ratio = self._calculate_sharpe_ratio()
        
        # Sortino ratio
        result.sortino_ratio = self._calculate_sortino_ratio()
        
        # Profit factor
        gross_wins = sum(t.pnl_egp for t in winning)
        gross_losses = abs(sum(t.pnl_egp for t in losing))
        if gross_losses > 0:
            result.profit_factor = gross_wins / gross_losses
        else:
            result.profit_factor = float('inf') if gross_wins > 0 else 0
        
        return result
    
    def _calculate_max_drawdown(self) -> Tuple[float, int]:
        """Calculate maximum drawdown percentage and duration"""
        if not self.equity_curve:
            return 0.0, 0
        
        equity_values = [e[1] for e in self.equity_curve]
        
        peak = equity_values[0]
        max_dd = 0.0
        max_dd_duration = 0
        current_dd_start = 0
        
        for i, equity in enumerate(equity_values):
            if equity > peak:
                peak = equity
                current_dd_start = i
            
            drawdown = (peak - equity) / peak if peak > 0 else 0
            
            if drawdown > max_dd:
                max_dd = drawdown
                max_dd_duration = i - current_dd_start
        
        return max_dd * 100, max_dd_duration
    
    def _calculate_sharpe_ratio(self, risk_free_rate: float = 0.05) -> float:
        """Calculate annualized Sharpe ratio"""
        if len(self.equity_curve) < 2:
            return 0.0
        
        # Calculate daily returns
        equity_values = [e[1] for e in self.equity_curve]
        daily_returns = pd.Series(equity_values).pct_change().dropna()
        
        if daily_returns.std() == 0:
            return 0.0
        
        # Annualize
        excess_return = daily_returns.mean() * 252 - risk_free_rate
        volatility = daily_returns.std() * np.sqrt(252)
        
        return excess_return / volatility if volatility > 0 else 0.0
    
    def _calculate_sortino_ratio(self, risk_free_rate: float = 0.05) -> float:
        """Calculate annualized Sortino ratio (downside deviation)"""
        if len(self.equity_curve) < 2:
            return 0.0
        
        equity_values = [e[1] for e in self.equity_curve]
        daily_returns = pd.Series(equity_values).pct_change().dropna()
        
        # Downside deviation (only negative returns)
        negative_returns = daily_returns[daily_returns < 0]
        if len(negative_returns) == 0:
            return float('inf') if daily_returns.mean() * 252 > risk_free_rate else 0.0
        
        downside_std = negative_returns.std() * np.sqrt(252)
        
        excess_return = daily_returns.mean() * 252 - risk_free_rate
        
        return excess_return / downside_std if downside_std > 0 else 0.0
