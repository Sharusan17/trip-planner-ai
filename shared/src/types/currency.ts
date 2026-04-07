export interface ConversionResult {
  from: string;
  to: string;
  amount: number;
  converted: number;
  rate: number;
  fetched_at: string;
}

export interface CurrencyRate {
  base: string;
  target: string;
  rate: number;
  fetched_at: string;
}
