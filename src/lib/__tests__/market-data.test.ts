/**
 * Unit tests for market-data utility functions.
 */
import { describe, it, expect } from 'vitest';
import { toTvTicker, fromTvTicker } from '../market-data';

describe('toTvTicker', () => {
  it('maps EGX stock to EGX: prefix', () => {
    expect(toTvTicker('COMI')).toBe('EGX:COMI');
    expect(toTvTicker('comi')).toBe('EGX:COMI');
  });

  it('maps special indices', () => {
    expect(toTvTicker('EGX30')).toBe('EGX:EGX30');
    expect(toTvTicker('EGX70_EWI')).toBe('EGX:EGX70EWI');
    expect(toTvTicker('EGX100_EWI')).toBe('EGX:EGX100EWI');
  });

  it('maps XAUUSD to OANDA', () => {
    expect(toTvTicker('XAUUSD')).toBe('OANDA:XAUUSD');
    expect(toTvTicker('xauusd')).toBe('OANDA:XAUUSD');
  });

  it('maps USDEGP to FX_IDC', () => {
    expect(toTvTicker('USDEGP')).toBe('FX_IDC:USDEGP');
  });
});

describe('fromTvTicker', () => {
  it('strips EGX: prefix', () => {
    expect(fromTvTicker('EGX:COMI')).toBe('COMI');
  });

  it('handles special index reverse mapping', () => {
    expect(fromTvTicker('EGX:EGX70EWI')).toBe('EGX70_EWI');
    expect(fromTvTicker('EGX:EGX100EWI')).toBe('EGX100_EWI');
  });

  it('handles OANDA reverse mapping', () => {
    expect(fromTvTicker('OANDA:XAUUSD')).toBe('XAUUSD');
  });

  it('handles lowercase input', () => {
    expect(fromTvTicker('egx:comi')).toBe('COMI');
  });

  it('returns uppercase for unknown tickers', () => {
    expect(fromTvTicker('UNKNOWN')).toBe('UNKNOWN');
  });
});
