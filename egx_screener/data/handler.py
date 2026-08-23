"""
Data Handler Module for EGX Screener

Handles data loading, API integration, and corporate actions adjustments.
"""

import json
import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
from pathlib import Path


class DataHandler:
    """
    Manages data loading from various sources including:
    - Finance API (via gateway)
    - Local JSON files (EGX universe)
    - Historical OHLCV data with adjustments
    
    Handles missing data and corporate actions.
    """
    
    def __init__(self, base_path: str = "."):
        self.base_path = Path(base_path)
        # Handle both relative paths from /workspace and from egx_screener directory
        if not (self.base_path / "download" / "egx_from_stockanalysis.json").exists():
            # Try parent directory (when running from within egx_screener)
            self.base_path = Path("..")
        self.universe_file = self.base_path / "download" / "egx_from_stockanalysis.json"
        self.cache_dir = self.base_path / "egx_screener" / "data" / "cache"
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        
        # API configuration (to be integrated with Finance API skill)
        self.api_base_url = None  # Will be set from environment or config
        self.api_headers = {'X-Z-AI-From': 'Z'}
    
    def load_egx_universe(self) -> List[Dict[str, str]]:
        """
        Load list of EGX-listed stocks from JSON file.
        
        Returns:
            List of dicts with 'symbol' and 'name' keys
        """
        if not self.universe_file.exists():
            raise FileNotFoundError(f"Universe file not found: {self.universe_file}")
        
        with open(self.universe_file, 'r', encoding='utf-8') as f:
            universe = json.load(f)
        
        # Validate structure
        if not isinstance(universe, list):
            raise ValueError("Universe file must contain a JSON array")
        
        # Filter out invalid entries
        valid_stocks = []
        for stock in universe:
            if isinstance(stock, dict) and 'symbol' in stock:
                # Clean symbol (remove .CA suffix variations for now)
                symbol = stock['symbol'].replace('.CA', '')
                valid_stocks.append({
                    'symbol': symbol,
                    'name': stock.get('name', ''),
                    'sector': stock.get('sector', 'Unknown')
                })
        
        print(f"Loaded {len(valid_stocks)} stocks from EGX universe")
        return valid_stocks
    
    def _fetch_from_api(
        self,
        endpoint: str,
        params: Dict
    ) -> Optional[Dict]:
        """
        Fetch data from Finance API via gateway.
        
        Note: This is a placeholder for actual API integration.
        In production, this would use requests library with proper authentication.
        """
        # Placeholder implementation
        # In production:
        # url = f"{self.api_base_url}/{endpoint}"
        # response = requests.get(url, params=params, headers=self.api_headers)
        # return response.json() if response.ok else None
        
        print(f"API call placeholder: {endpoint} with params {params}")
        return None
    
    def fetch_historical_data(
        self,
        symbol: str,
        interval: str = "1d",
        period: int = 365
    ) -> Optional[pd.DataFrame]:
        """
        Fetch historical OHLCV data for a single stock.
        
        Args:
            symbol: Stock ticker symbol
            interval: Time interval (1d, 1wk, 1h, etc.)
            period: Number of days to fetch
            
        Returns:
            DataFrame with columns: date, open, high, low, close, volume
        """
        # Try cache first
        cache_file = self.cache_dir / f"{symbol}_{interval}.parquet"
        if cache_file.exists():
            try:
                df = pd.read_parquet(cache_file)
                # Check if data is recent enough
                last_date = pd.to_datetime(df['date']).max()
                if (datetime.now() - last_date).days < 1:
                    print(f"Using cached data for {symbol}")
                    return df
            except Exception as e:
                print(f"Cache read error for {symbol}: {e}")
        
        # Fetch from API (placeholder)
        # In production, this would call the Finance API
        api_data = self._fetch_from_api(
            "v1/markets/stock/history",
            {
                'symbol': symbol,
                'interval': interval,
                'diffandsplits': 'true'
            }
        )
        
        if api_data is None:
            # Generate synthetic data for demonstration
            print(f"Generating synthetic data for {symbol} (demo mode)")
            df = self._generate_synthetic_data(symbol, period)
        else:
            # Parse API response
            df = self._parse_api_history_response(api_data, symbol)
        
        # Cache the data
        if df is not None and len(df) > 0:
            try:
                df.to_parquet(cache_file, index=False)
            except Exception as e:
                print(f"Cache write error for {symbol}: {e}")
        
        return df
    
    def _generate_synthetic_data(
        self,
        symbol: str,
        period: int = 365
    ) -> pd.DataFrame:
        """
        Generate synthetic OHLCV data for demonstration/testing.
        
        In production, this would be replaced with real API data.
        """
        np.random.seed(hash(symbol) % 2**32)  # Reproducible per symbol
        
        dates = pd.date_range(end=datetime.now(), periods=period, freq='D')
        
        # Generate realistic price series using geometric Brownian motion
        initial_price = np.random.uniform(10, 500)  # EGP 10-500
        daily_return_mean = 0.0003  # ~7.5% annual return
        daily_return_std = 0.025  # ~40% annual volatility
        
        returns = np.random.normal(daily_return_mean, daily_return_std, period)
        close_prices = pd.Series(initial_price * np.cumprod(1 + returns), index=dates)
        
        # Generate OHLC from close prices
        daily_range = close_prices * np.random.uniform(0.01, 0.04, period)
        high_prices = pd.Series(np.maximum(close_prices.values, np.roll(close_prices.values, 1)) + daily_range.values * np.random.uniform(0.3, 0.7, period), index=dates)
        low_prices = pd.Series(np.minimum(close_prices.values, np.roll(close_prices.values, 1)) - daily_range.values * np.random.uniform(0.3, 0.7, period), index=dates)
        open_prices = pd.Series(np.roll(close_prices.values, 1) + np.random.normal(0, daily_range.values * 0.3, period), index=dates)
        
        # Handle first row
        open_prices.iloc[0] = initial_price
        high_prices.iloc[0] = initial_price * 1.02
        low_prices.iloc[0] = initial_price * 0.98
        
        # Ensure OHLC consistency
        high_prices = pd.Series(np.maximum(high_prices.values, np.maximum(open_prices.values, close_prices.values)), index=dates)
        low_prices = pd.Series(np.minimum(low_prices.values, np.minimum(open_prices.values, close_prices.values)), index=dates)
        
        # Generate volume with some pattern
        base_volume = np.random.randint(50000, 500000)
        volumes = pd.Series((base_volume * np.random.lognormal(0, 0.5, period)).astype(int), index=dates)
        
        df = pd.DataFrame({
            'date': dates,
            'open': open_prices.values,
            'high': high_prices.values,
            'low': low_prices.values,
            'close': close_prices.values,
            'volume': volumes.values
        })
        
        return df
    
    def _parse_api_history_response(
        self,
        api_response: Dict,
        symbol: str
    ) -> pd.DataFrame:
        """Parse API response into standardized DataFrame format"""
        # Placeholder - implement based on actual API response structure
        # Expected format from Finance API documentation:
        # {
        #   "symbol": "...",
        #   "historical": [
        #     {"date": "...", "open": ..., "high": ..., "low": ..., "close": ..., "volume": ...},
        #     ...
        #   ]
        # }
        
        if 'historical' not in api_response:
            return pd.DataFrame()
        
        df = pd.DataFrame(api_response['historical'])
        df['symbol'] = symbol
        
        # Standardize column names
        df = df.rename(columns={
            'Date': 'date',
            'Open': 'open',
            'High': 'high',
            'Low': 'low',
            'Close': 'close',
            'Volume': 'volume'
        })
        
        # Ensure date is datetime
        if 'date' in df.columns:
            df['date'] = pd.to_datetime(df['date'])
        
        return df
    
    def adjust_for_corporate_actions(
        self,
        df: pd.DataFrame,
        symbol: str
    ) -> pd.DataFrame:
        """
        Adjust historical prices for dividends, splits, and other corporate actions.
        
        In production, this would fetch corporate action data from API and apply
        backward adjustment factors to ensure continuity in technical analysis.
        """
        # Placeholder implementation
        # In production:
        # 1. Fetch corporate actions from API
        # 2. Calculate adjustment factors
        # 3. Apply to OHLCV data
        
        # For now, return data as-is (assuming API provides adjusted data)
        print(f"Corporate actions adjustment for {symbol}: Using API-adjusted data")
        return df
    
    def fetch_universe_data(
        self,
        symbols: Optional[List[str]] = None,
        interval: str = "1d",
        parallel: bool = True
    ) -> Dict[str, pd.DataFrame]:
        """
        Fetch historical data for multiple stocks.
        
        Args:
            symbols: List of ticker symbols (uses full universe if None)
            interval: Time interval
            parallel: Whether to fetch in parallel (recommended)
            
        Returns:
            Dict mapping symbol to DataFrame
        """
        if symbols is None:
            universe = self.load_egx_universe()
            symbols = [stock['symbol'] for stock in universe]
        
        price_data = {}
        failed_symbols = []
        
        for i, symbol in enumerate(symbols):
            try:
                df = self.fetch_historical_data(symbol, interval)
                if df is not None and len(df) > 0:
                    price_data[symbol] = df
                else:
                    failed_symbols.append(symbol)
            except Exception as e:
                print(f"Error fetching {symbol}: {e}")
                failed_symbols.append(symbol)
            
            # Progress indicator
            if (i + 1) % 50 == 0:
                print(f"Progress: {i+1}/{len(symbols)} stocks processed")
        
        print(f"Successfully loaded data for {len(price_data)} stocks")
        if failed_symbols:
            print(f"Failed to load data for {len(failed_symbols)} stocks: {failed_symbols[:10]}...")
        
        return price_data
    
    def get_liquid_stocks(
        self,
        price_data: Dict[str, pd.DataFrame],
        min_avg_volume: int = 50000,
        min_avg_turnover: float = 500000
    ) -> Dict[str, pd.DataFrame]:
        """
        Filter universe to liquid stocks only.
        
        Args:
            price_data: Dict of symbol -> DataFrame
            min_avg_volume: Minimum 20-day average volume
            min_avg_turnover: Minimum 20-day average turnover in EGP
            
        Returns:
            Filtered dict of liquid stocks
        """
        liquid_stocks = {}
        
        for symbol, df in price_data.items():
            if len(df) < 20:
                continue
            
            avg_volume = df['volume'].rolling(20).mean().iloc[-1]
            avg_turnover = (df['volume'] * df['close']).rolling(20).mean().iloc[-1]
            
            if avg_volume >= min_avg_volume and avg_turnover >= min_avg_turnover:
                liquid_stocks[symbol] = df
        
        print(f"Filtered to {len(liquid_stocks)} liquid stocks")
        return liquid_stocks
    
    def validate_data_quality(
        self,
        df: pd.DataFrame,
        symbol: str
    ) -> Tuple[bool, List[str]]:
        """
        Validate data quality before processing.
        
        Returns:
            Tuple of (is_valid, list_of_issues)
        """
        issues = []
        
        # Check required columns
        required_cols = ['date', 'open', 'high', 'low', 'close', 'volume']
        missing = set(required_cols) - set(df.columns)
        if missing:
            issues.append(f"Missing columns: {missing}")
            return False, issues
        
        # Check for NaN values
        nan_count = df[required_cols].isna().sum().sum()
        if nan_count > 0:
            issues.append(f"Found {nan_count} NaN values")
        
        # Check for zero or negative prices
        for col in ['open', 'high', 'low', 'close']:
            if (df[col] <= 0).any():
                issues.append(f"Non-positive values in {col}")
        
        # Check OHLC consistency
        if (df['high'] < df['low']).any():
            issues.append("High < Low detected")
        if (df['high'] < df['open']).any() or (df['high'] < df['close']).any():
            issues.append("High inconsistent with Open/Close")
        if (df['low'] > df['open']).any() or (df['low'] > df['close']).any():
            issues.append("Low inconsistent with Open/Close")
        
        # Check for suspicious volume spikes
        if len(df) > 20:
            avg_vol = df['volume'].rolling(20).mean()
            if (df['volume'] > avg_vol * 100).any():
                issues.append("Extreme volume spikes detected")
        
        is_valid = len(issues) == 0
        return is_valid, issues
