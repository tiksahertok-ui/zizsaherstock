"""
EGX Daily Stock Screener - Main Entry Point

Production-ready daily screener for Egyptian Exchange equities.
Generates buy/sell signals with targets, stop losses, and risk management.

Usage:
    python main.py --run              # Run daily screen
    python main.py --backtest         # Run backtest
    python main.py --demo             # Run demo with synthetic data
"""

import argparse
import sys
from pathlib import Path
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from config.settings import DEFAULT_CONFIG, EGXScreenerConfig
from data.handler import DataHandler
from indicators.technical import TechnicalIndicators
from signals.generator import SignalGenerator, Signal
from risk.manager import RiskManager
from output.handler import OutputHandler
from backtest.engine import Backtester


def run_daily_screener(config: EGXScreenerConfig):
    """Execute daily screening process"""
    print("=" * 60)
    print("EGX Daily Stock Screener")
    print(f"Run Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    
    # Initialize components
    data_handler = DataHandler(base_path=".")
    output_handler = OutputHandler(
        output_dir=config.output.output_dir,
        log_dir=config.output.log_dir,
        log_level=config.log_level
    )
    
    output_handler.logger.info("Starting daily EGX screen...")
    
    # Load universe
    try:
        universe = data_handler.load_egx_universe()
        symbols = [stock['symbol'] for stock in universe[:50]]  # Limit for demo
        output_handler.logger.info(f"Loaded {len(symbols)} stocks for screening")
    except Exception as e:
        output_handler.logger.error(f"Failed to load universe: {e}")
        return
    
    # Fetch price data (uses synthetic data in demo mode)
    output_handler.logger.info("Fetching historical price data...")
    price_data = data_handler.fetch_universe_data(symbols=symbols, interval="1d")
    
    if not price_data:
        output_handler.logger.error("No price data available")
        return
    
    # Filter liquid stocks
    liquid_stocks = data_handler.get_liquid_stocks(
        price_data,
        min_avg_volume=config.liquidity_filter.min_avg_volume_20d,
        min_avg_turnover=config.liquidity_filter.min_avg_turnover_egp
    )
    output_handler.logger.info(f"Filtered to {len(liquid_stocks)} liquid stocks")
    
    # Initialize signal generator
    signal_generator = SignalGenerator(
        signal_rules=config.signal_rules,
        indicator_params=config.indicator_params,
        risk_params=config.risk_params
    )
    
    # Calculate indicators and generate signals
    output_handler.logger.info("Calculating technical indicators...")
    
    processed_data = {}
    for ticker, df in liquid_stocks.items():
        try:
            indicators = TechnicalIndicators(config.indicator_params)
            df_with_indicators = indicators.calculate_all_indicators(df.copy())
            processed_data[ticker] = df_with_indicators
        except Exception as e:
            output_handler.logger.warning(f"Error processing {ticker}: {e}")
    
    # Generate signals
    output_handler.logger.info("Generating trading signals...")
    signals = signal_generator.generate_signals_for_universe(processed_data)
    
    output_handler.logger.info(f"Generated {len(signals)} signals")
    
    # Apply risk management
    risk_manager = RiskManager(
        risk_params=config.risk_params,
        liquidity_filter=config.liquidity_filter,
        portfolio_value=config.backtest.initial_capital
    )
    
    actionable_trades = risk_manager.apply_risk_management_to_signals(
        signals,
        processed_data
    )
    
    output_handler.logger.info(f"Filtered to {len(actionable_trades)} actionable trades after risk checks")
    
    # Export results
    if signals:
        # Log signal details
        output_handler.log_signal_details(signals)
        
        # Export to CSV
        if config.output.export_csv:
            csv_path = output_handler.export_signals_csv(signals)
            output_handler.logger.info(f"CSV exported: {csv_path}")
        
        # Export to JSON
        if config.output.export_json:
            portfolio_summary = risk_manager.get_portfolio_summary()
            json_path = output_handler.export_signals_json(
                signals,
                metadata={'run_date': datetime.now().isoformat()}
            )
            output_handler.logger.info(f"JSON exported: {json_path}")
            
            # Also export detailed report
            report_path = output_handler.export_detailed_report(
                signals,
                portfolio_summary=portfolio_summary
            )
            output_handler.logger.info(f"Detailed report: {report_path}")
        
        # Send webhook if configured
        if config.output.webhook_enabled:
            output_handler.configure_webhook(config.output.webhook_url)
            output_handler.send_webhook(signals)
    
    # Print summary
    print("\n" + "=" * 60)
    print("SCREENING SUMMARY")
    print("=" * 60)
    
    buy_signals = [s for s in signals if s.signal_type.value == 'BUY']
    sell_signals = [s for s in signals if s.signal_type.value == 'SELL']
    
    print(f"Total Signals: {len(signals)}")
    print(f"  - BUY:  {len(buy_signals)}")
    print(f"  - SELL: {len(sell_signals)}")
    
    if buy_signals:
        print(f"\nTop BUY Recommendations:")
        for signal in buy_signals[:5]:
            print(f"  {signal.ticker}: Entry={signal.entry_price:.4f}, "
                  f"SL={signal.stop_loss:.4f}, Confidence={signal.confidence_score:.1f}%")
    
    if sell_signals:
        print(f"\nTop SELL Recommendations:")
        for signal in sell_signals[:5]:
            print(f"  {signal.ticker}: Entry={signal.entry_price:.4f}, "
                  f"SL={signal.stop_loss:.4f}, Confidence={signal.confidence_score:.1f}%")
    
    print("\n" + "=" * 60)
    print("Screening complete. Check output/ and logs/ directories for results.")
    print("=" * 60)


def run_backtest(config: EGXScreenerConfig):
    """Run historical backtest"""
    print("=" * 60)
    print("EGX Screener - Backtest Mode")
    print("=" * 60)
    
    data_handler = DataHandler(base_path=".")
    output_handler = OutputHandler(log_level=config.log_level)
    
    # Load universe and fetch data
    universe = data_handler.load_egx_universe()
    symbols = [stock['symbol'] for stock in universe[:30]]  # Limit for speed
    
    output_handler.logger.info("Fetching historical data for backtest...")
    price_data = data_handler.fetch_universe_data(symbols=symbols, interval="1d")
    
    if not price_data:
        output_handler.logger.error("No price data available for backtest")
        return
    
    # Initialize components
    signal_generator = SignalGenerator(
        signal_rules=config.signal_rules,
        indicator_params=config.indicator_params
    )
    
    backtester = Backtester(
        config=config.backtest,
        risk_params=config.risk_params
    )
    
    # Run backtest
    output_handler.logger.info("Running backtest...")
    results = backtester.run_backtest(price_data, signal_generator)
    
    # Print results
    print("\n" + "=" * 60)
    print("BACKTEST RESULTS")
    print("=" * 60)
    
    metrics = results.to_dict()
    
    print(f"Period: {config.backtest.start_date} to {config.backtest.end_date}")
    print(f"Initial Capital: EGP {metrics['initial_capital']:,.0f}")
    print(f"Final Capital:   EGP {metrics['final_capital']:,.0f}")
    print(f"Total Return:    {metrics['total_return_pct']:.2f}%")
    print(f"CAGR:            {metrics['cagr']*100:.2f}%")
    print(f"")
    print(f"Total Trades:    {metrics['total_trades']}")
    print(f"Win Rate:        {metrics['win_rate']:.1f}%")
    print(f"Avg Win:         {metrics['avg_win_pct']:.2f}%")
    print(f"Avg Loss:        {metrics['avg_loss_pct']:.2f}%")
    print(f"Avg R:R Ratio:   {metrics['avg_rr_ratio']:.2f}")
    print(f"Profit Factor:   {metrics['profit_factor']:.2f}")
    print(f"")
    print(f"Max Drawdown:    {metrics['max_drawdown_pct']:.2f}%")
    print(f"Sharpe Ratio:    {metrics['sharpe_ratio']:.2f}")
    print(f"Sortino Ratio:   {metrics['sortino_ratio']:.2f}")
    print("=" * 60)
    
    # Export backtest results
    result_file = output_handler.output_dir / f"backtest_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    import json
    with open(result_file, 'w') as f:
        json.dump(metrics, f, indent=2)
    
    print(f"\nResults saved to: {result_file}")


def main():
    parser = argparse.ArgumentParser(description='EGX Daily Stock Screener')
    parser.add_argument('--run', action='store_true', help='Run daily screening')
    parser.add_argument('--backtest', action='store_true', help='Run historical backtest')
    parser.add_argument('--demo', action='store_true', help='Run demo mode with sample data')
    parser.add_argument('--config', type=str, help='Path to custom config file')
    
    args = parser.parse_args()
    
    # Load configuration
    config = DEFAULT_CONFIG
    
    if args.config:
        # Custom config loading would go here
        print(f"Loading custom config from {args.config}")
    
    if args.demo or (not args.run and not args.backtest):
        print("Running in DEMO mode...")
        run_daily_screener(config)
    elif args.run:
        run_daily_screener(config)
    elif args.backtest:
        run_backtest(config)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
