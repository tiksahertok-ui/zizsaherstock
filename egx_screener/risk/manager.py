"""
Risk Management Module for EGX Screener

Implements position sizing, portfolio exposure limits, and liquidity filters.
"""

import pandas as pd
from typing import Dict, List, Optional
from dataclasses import dataclass

from config.settings import RiskParameters, LiquidityFilter
from signals.generator import Signal


@dataclass
class PositionSize:
    """Calculated position size with risk parameters"""
    ticker: str
    shares: int
    entry_price: float
    stop_loss: float
    position_value_egp: float
    risk_amount_egp: float
    risk_percentage: float
    reward_to_risk: float


class RiskManager:
    """
    Manages risk parameters, position sizing, and portfolio constraints.
    """
    
    def __init__(
        self,
        risk_params: Optional[RiskParameters] = None,
        liquidity_filter: Optional[LiquidityFilter] = None,
        portfolio_value: float = 1000000.0  # Default EGP 1M
    ):
        self.risk_params = risk_params or RiskParameters()
        self.liquidity_filter = liquidity_filter or LiquidityFilter()
        self.portfolio_value = portfolio_value
        self.current_positions: Dict[str, PositionSize] = {}
    
    def check_liquidity_filters(
        self,
        ticker: str,
        df: pd.DataFrame
    ) -> tuple[bool, str]:
        """
        Check if stock meets minimum liquidity requirements.
        
        Returns:
            Tuple of (passes_filter, reason)
        """
        if len(df) < 20:
            return False, "Insufficient data history"
        
        last_row = df.iloc[-1]
        
        # Check average volume
        avg_volume_20d = df['volume'].rolling(window=20).mean().iloc[-1]
        if avg_volume_20d < self.liquidity_filter.min_avg_volume_20d:
            return False, f"Low avg volume: {avg_volume_20d:.0f} < {self.liquidity_filter.min_avg_volume_20d}"
        
        # Check turnover (volume * price)
        avg_turnover = (df['volume'] * df['close']).rolling(window=20).mean().iloc[-1]
        if avg_turnover < self.liquidity_filter.min_avg_turnover_egp:
            return False, f"Low turnover: {avg_turnover:.0f} < {self.liquidity_filter.min_avg_turnover_egp}"
        
        # Note: Market cap and spread checks would require additional data sources
        # These can be added when fundamental data is integrated
        
        return True, "Passed liquidity filters"
    
    def calculate_position_size(
        self,
        signal: Signal,
        df: pd.DataFrame
    ) -> Optional[PositionSize]:
        """
        Calculate optimal position size based on risk parameters.
        
        Uses ATR-based stop loss to determine share count that limits
        risk to max_risk_per_trade_pct of portfolio.
        """
        # Check liquidity first
        passes, reason = self.check_liquidity_filters(signal.ticker, df)
        if not passes:
            print(f"Liquidity filter failed for {signal.ticker}: {reason}")
            return None
        
        entry_price = signal.entry_price
        stop_loss = signal.stop_loss
        
        # Calculate risk per share
        risk_per_share = abs(entry_price - stop_loss)
        if risk_per_share <= 0:
            print(f"Invalid stop loss for {signal.ticker}: {stop_loss} vs entry {entry_price}")
            return None
        
        # Maximum risk amount for this trade
        max_risk_amount = self.portfolio_value * (self.risk_params.max_risk_per_trade_pct / 100.0)
        
        # Calculate shares based on risk
        shares = int(max_risk_amount / risk_per_share)
        
        # Apply maximum position size constraint
        max_position_value = self.portfolio_value * (self.risk_params.max_position_size_pct / 100.0)
        max_shares_by_position = int(max_position_value / entry_price)
        
        shares = min(shares, max_shares_by_position)
        
        if shares <= 0:
            print(f"Position size too small for {signal.ticker}")
            return None
        
        # Round to board lot (typically 100 shares for EGX)
        shares = (shares // 100) * 100
        if shares < 100:
            shares = 100
        
        # Calculate actual position metrics
        position_value = shares * entry_price
        actual_risk = shares * risk_per_share
        actual_risk_pct = (actual_risk / self.portfolio_value) * 100
        
        # Calculate reward-to-risk ratio
        first_tp = signal.take_profit_levels[0] if signal.take_profit_levels else entry_price
        reward_per_share = abs(first_tp - entry_price)
        reward_to_risk = reward_per_share / risk_per_share if risk_per_share > 0 else 0
        
        # Check minimum reward-to-risk requirement
        if reward_to_risk < self.risk_params.min_reward_ratio:
            print(f"R:R too low for {signal.ticker}: {reward_to_risk:.2f} < {self.risk_params.min_reward_ratio}")
            # Still return but flag it
            # return None
        
        return PositionSize(
            ticker=signal.ticker,
            shares=shares,
            entry_price=entry_price,
            stop_loss=stop_loss,
            position_value_egp=position_value,
            risk_amount_egp=actual_risk,
            risk_percentage=actual_risk_pct,
            reward_to_risk=reward_to_risk
        )
    
    def check_portfolio_exposure(
        self,
        new_position: PositionSize
    ) -> tuple[bool, str]:
        """
        Check if adding this position violates portfolio constraints.
        
        Returns:
            Tuple of (can_add, reason)
        """
        # Calculate current total exposure
        current_exposure = sum(pos.position_value_egp for pos in self.current_positions.values())
        
        # Check maximum portfolio exposure
        max_exposure = self.portfolio_value * (self.risk_params.max_portfolio_exposure_pct / 100.0)
        
        if current_exposure + new_position.position_value_egp > max_exposure:
            return False, f"Would exceed max exposure: {(current_exposure + new_position.position_value_egp):.0f} > {max_exposure:.0f}"
        
        # Check number of open positions
        if len(self.current_positions) >= self.risk_params.max_open_positions:
            return False, f"Max positions reached: {len(self.current_positions)} >= {self.risk_params.max_open_positions}"
        
        # Check concentration (already handled in position sizing, but double-check)
        if new_position.position_value_egp > max_exposure * 0.2:  # Single position < 20% of max exposure
            return False, f"Position too large relative to portfolio"
        
        return True, "Within portfolio limits"
    
    def add_position(self, position: PositionSize) -> bool:
        """
        Add position to portfolio tracking.
        
        Returns:
            True if added successfully
        """
        can_add, reason = self.check_portfolio_exposure(position)
        if not can_add:
            print(f"Cannot add position for {position.ticker}: {reason}")
            return False
        
        self.current_positions[position.ticker] = position
        return True
    
    def remove_position(self, ticker: str) -> Optional[PositionSize]:
        """Remove position from portfolio tracking"""
        return self.current_positions.pop(ticker, None)
    
    def get_portfolio_summary(self) -> dict:
        """Get current portfolio risk summary"""
        if not self.current_positions:
            return {
                'total_positions': 0,
                'total_exposure_egp': 0,
                'total_risk_egp': 0,
                'exposure_pct': 0,
                'risk_pct': 0
            }
        
        total_exposure = sum(pos.position_value_egp for pos in self.current_positions.values())
        total_risk = sum(pos.risk_amount_egp for pos in self.current_positions.values())
        
        return {
            'total_positions': len(self.current_positions),
            'total_exposure_egp': total_exposure,
            'total_risk_egp': total_risk,
            'exposure_pct': (total_exposure / self.portfolio_value) * 100,
            'risk_pct': (total_risk / self.portfolio_value) * 100,
            'positions': {
                ticker: {
                    'shares': pos.shares,
                    'value_egp': pos.position_value_egp,
                    'risk_egp': pos.risk_amount_egp,
                    'rr_ratio': pos.reward_to_risk
                }
                for ticker, pos in self.current_positions.items()
            }
        }
    
    def apply_risk_management_to_signals(
        self,
        signals: List[Signal],
        price_data: Dict[str, pd.DataFrame]
    ) -> List[Dict]:
        """
        Apply risk management filters and position sizing to generated signals.
        
        Returns list of actionable trade recommendations with position sizes.
        """
        actionable_trades = []
        
        for signal in signals:
            if signal.ticker not in price_data:
                continue
            
            df = price_data[signal.ticker]
            
            # Calculate position size
            position = self.calculate_position_size(signal, df)
            if position is None:
                continue
            
            # Check portfolio constraints
            can_add, reason = self.check_portfolio_exposure(position)
            if not can_add:
                # Skip due to portfolio limits, but could queue for later
                continue
            
            # Build trade recommendation
            trade_rec = {
                'signal': signal.to_dict(),
                'position_sizing': {
                    'shares': position.shares,
                    'position_value_egp': round(position.position_value_egp, 2),
                    'risk_amount_egp': round(position.risk_amount_egp, 2),
                    'risk_percentage': round(position.risk_percentage, 4),
                    'reward_to_risk': round(position.reward_to_risk, 2)
                },
                'liquidity_check': 'PASSED',
                'portfolio_check': 'PASSED'
            }
            
            actionable_trades.append(trade_rec)
        
        return actionable_trades
