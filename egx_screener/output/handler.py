"""
Output Handler Module for EGX Screener

Handles export of signals to CSV, JSON, and webhook delivery.
Includes logging and monitoring capabilities.
"""

import json
import csv
import logging
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, Any
import pandas as pd

from signals.generator import Signal


class OutputHandler:
    """
    Manages output formatting, file export, webhook delivery, and logging.
    
    Supports:
    - CSV export for spreadsheet analysis
    - JSON export for API consumption
    - Webhook delivery for real-time alerts
    - Structured logging for audit trail
    """
    
    def __init__(
        self,
        output_dir: str = "output",
        log_dir: str = "logs",
        log_level: str = "INFO"
    ):
        self.output_dir = Path(output_dir)
        self.log_dir = Path(log_dir)
        
        # Create directories
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.log_dir.mkdir(parents=True, exist_ok=True)
        
        # Setup logging
        self._setup_logging(log_level)
        
        # Webhook configuration
        self.webhook_url = None
        self.webhook_enabled = False
    
    def _setup_logging(self, log_level: str):
        """Configure structured logging for audit trail"""
        log_file = self.log_dir / f"screener_{datetime.now().strftime('%Y%m%d')}.log"
        
        # Create logger
        self.logger = logging.getLogger('EGXScreener')
        self.logger.setLevel(getattr(logging, log_level.upper()))
        
        # File handler (JSON format for machine parsing)
        file_handler = logging.FileHandler(log_file)
        file_handler.setLevel(logging.DEBUG)
        
        # Console handler
        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.INFO)
        
        # Formatters
        detailed_formatter = logging.Formatter(
            '%(asctime)s | %(levelname)s | %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        
        file_handler.setFormatter(detailed_formatter)
        console_handler.setFormatter(detailed_formatter)
        
        self.logger.addHandler(file_handler)
        self.logger.addHandler(console_handler)
    
    def configure_webhook(self, url: str, enabled: bool = True):
        """Configure webhook for real-time signal delivery"""
        self.webhook_url = url
        self.webhook_enabled = enabled
        self.logger.info(f"Webhook configured: {url[:50]}... (enabled={enabled})")
    
    def _generate_filename(self, prefix: str, extension: str) -> str:
        """Generate timestamped filename"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        return f"{prefix}_{timestamp}.{extension}"
    
    def export_signals_csv(
        self,
        signals: List[Signal],
        filename: Optional[str] = None
    ) -> str:
        """
        Export signals to CSV format.
        
        Returns path to created file.
        """
        if not signals:
            self.logger.warning("No signals to export to CSV")
            return ""
        
        if filename is None:
            filename = self._generate_filename('egx_signals', 'csv')
        
        filepath = self.output_dir / filename
        
        # Convert signals to list of dicts
        rows = [signal.to_dict() for signal in signals]
        
        # Define CSV columns
        fieldnames = [
            'ticker', 'timestamp', 'signal', 'entry_price', 'stop_loss',
            'take_profit_levels', 'confidence_score', 'rationale_tags',
            'current_price', 'atr', 'volume_ratio', 'multi_timeframe_confirmation'
        ]
        
        with open(filepath, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            
            for row in rows:
                # Convert complex fields to strings
                row_copy = row.copy()
                row_copy['take_profit_levels'] = '|'.join(
                    str(tp) for tp in row['take_profit_levels']
                )
                row_copy['rationale_tags'] = '|'.join(row['rationale_tags'])
                row_copy['multi_timeframe_confirmation'] = json.dumps(
                    row['multi_timeframe_confirmation']
                )
                writer.writerow(row_copy)
        
        self.logger.info(f"Exported {len(signals)} signals to CSV: {filepath}")
        return str(filepath)
    
    def export_signals_json(
        self,
        signals: List[Signal],
        metadata: Optional[Dict] = None,
        filename: Optional[str] = None
    ) -> str:
        """
        Export signals to JSON format with optional metadata.
        
        Returns path to created file.
        """
        if not signals:
            self.logger.warning("No signals to export to JSON")
            return ""
        
        if filename is None:
            filename = self._generate_filename('egx_signals', 'json')
        
        filepath = self.output_dir / filename
        
        # Build output structure
        output = {
            'generated_at': datetime.now().isoformat(),
            'market': 'EGX',
            'total_signals': len(signals),
            'buy_signals': sum(1 for s in signals if s.signal_type.value == 'BUY'),
            'sell_signals': sum(1 for s in signals if s.signal_type.value == 'SELL'),
            'metadata': metadata or {},
            'signals': [signal.to_dict() for signal in signals]
        }
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(output, f, indent=2, ensure_ascii=False)
        
        self.logger.info(f"Exported {len(signals)} signals to JSON: {filepath}")
        return str(filepath)
    
    def export_detailed_report(
        self,
        signals: List[Signal],
        portfolio_summary: Optional[Dict] = None,
        filename: Optional[str] = None
    ) -> str:
        """
        Export comprehensive daily report with signals and portfolio status.
        """
        if filename is None:
            filename = self._generate_filename('egx_daily_report', 'json')
        
        filepath = self.output_dir / filename
        
        # Separate buy and sell signals
        buy_signals = [s for s in signals if s.signal_type.value == 'BUY']
        sell_signals = [s for s in signals if s.signal_type.value == 'SELL']
        
        # Calculate summary statistics
        avg_confidence_buy = (
            sum(s.confidence_score for s in buy_signals) / len(buy_signals)
            if buy_signals else 0
        )
        avg_confidence_sell = (
            sum(s.confidence_score for s in sell_signals) / len(sell_signals)
            if sell_signals else 0
        )
        
        # Top signals by confidence
        top_buys = sorted(buy_signals, key=lambda s: s.confidence_score, reverse=True)[:5]
        top_sells = sorted(sell_signals, key=lambda s: s.confidence_score, reverse=True)[:5]
        
        report = {
            'report_type': 'daily_screener',
            'generated_at': datetime.now().isoformat(),
            'market': 'Egyptian Exchange (EGX)',
            'summary': {
                'total_signals': len(signals),
                'buy_signals_count': len(buy_signals),
                'sell_signals_count': len(sell_signals),
                'avg_confidence_buy': round(avg_confidence_buy, 2),
                'avg_confidence_sell': round(avg_confidence_sell, 2)
            },
            'portfolio_status': portfolio_summary or {},
            'top_buy_recommendations': [s.to_dict() for s in top_buys],
            'top_sell_recommendations': [s.to_dict() for s in top_sells],
            'all_signals': [s.to_dict() for s in signals]
        }
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        
        self.logger.info(f"Generated daily report: {filepath}")
        return str(filepath)
    
    def send_webhook(
        self,
        signals: List[Signal],
        event_type: str = "daily_screen"
    ) -> bool:
        """
        Send signals to configured webhook URL.
        
        Returns True if successful, False otherwise.
        """
        if not self.webhook_enabled or not self.webhook_url:
            self.logger.debug("Webhook not enabled, skipping delivery")
            return False
        
        # Import requests here to avoid dependency if not used
        try:
            import requests
        except ImportError:
            self.logger.error("requests library not installed, cannot send webhook")
            return False
        
        # Prepare payload
        payload = {
            'event_type': event_type,
            'timestamp': datetime.now().isoformat(),
            'market': 'EGX',
            'signal_count': len(signals),
            'signals': [signal.to_dict() for signal in signals]
        }
        
        try:
            response = requests.post(
                self.webhook_url,
                json=payload,
                headers={'Content-Type': 'application/json'},
                timeout=30
            )
            
            if response.ok:
                self.logger.info(f"Webhook delivered successfully: {len(signals)} signals")
                return True
            else:
                self.logger.error(f"Webhook delivery failed: HTTP {response.status_code}")
                return False
                
        except Exception as e:
            self.logger.error(f"Webhook delivery error: {str(e)}")
            return False
    
    def log_signal_details(self, signals: List[Signal]):
        """Log detailed information about each signal for audit trail"""
        for signal in signals:
            self.logger.info(
                f"SIGNAL | {signal.ticker} | {signal.signal_type.value} | "
                f"Entry: {signal.entry_price:.4f} | SL: {signal.stop_loss:.4f} | "
                f"TPs: {[f'{tp:.4f}' for tp in signal.take_profit_levels]} | "
                f"Confidence: {signal.confidence_score:.1f} | "
                f"Rationale: {', '.join(signal.rationale_tags)}"
            )
    
    def export_for_backtest(
        self,
        signals: List[Signal],
        price_data: Dict[str, pd.DataFrame],
        filename: Optional[str] = None
    ) -> str:
        """
        Export signals in format suitable for backtesting.
        
        Includes OHLCV data for each signal date.
        """
        if filename is None:
            filename = self._generate_filename('egx_backtest_data', 'json')
        
        filepath = self.output_dir / filename
        
        backtest_data = []
        
        for signal in signals:
            if signal.ticker not in price_data:
                continue
            
            df = price_data[signal.ticker]
            signal_date = pd.to_datetime(signal.timestamp).date()
            
            # Find matching row in price data
            df['date'] = pd.to_datetime(df['date']).dt.date
            match = df[df['date'] == signal_date]
            
            if len(match) == 0:
                continue
            
            row = match.iloc[-1]
            
            backtest_data.append({
                'ticker': signal.ticker,
                'signal_date': signal_date.isoformat(),
                'signal_type': signal.signal_type.value,
                'entry_price': signal.entry_price,
                'stop_loss': signal.stop_loss,
                'take_profit_levels': signal.take_profit_levels,
                'confidence_score': signal.confidence_score,
                'ohlc': {
                    'open': float(row['open']),
                    'high': float(row['high']),
                    'low': float(row['low']),
                    'close': float(row['close']),
                    'volume': int(row['volume'])
                },
                'indicators': {
                    'rsi': float(row.get('rsi', 0)),
                    'macd': float(row.get('macd_line', 0)),
                    'adx': float(row.get('adx', 0))
                }
            })
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(backtest_data, f, indent=2)
        
        self.logger.info(f"Exported {len(backtest_data)} signals for backtesting: {filepath}")
        return str(filepath)
    
    def cleanup_old_files(self, days_to_keep: int = 30):
        """Remove output files older than specified days"""
        cutoff = datetime.now().timestamp() - (days_to_keep * 24 * 60 * 60)
        
        for file_path in self.output_dir.iterdir():
            if file_path.is_file() and file_path.stat().st_mtime < cutoff:
                file_path.unlink()
                self.logger.info(f"Cleaned up old file: {file_path.name}")
        
        for file_path in self.log_dir.iterdir():
            if file_path.is_file() and file_path.stat().st_mtime < cutoff:
                file_path.unlink()
                self.logger.info(f"Cleaned up old log: {file_path.name}")
