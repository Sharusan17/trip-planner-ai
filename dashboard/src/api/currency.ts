import type { ConversionResult, CurrencyRate } from '@trip-planner-ai/shared';
import { api } from './client';

export const currencyApi = {
  convert: (from: string, to: string, amount: number) =>
    api.get<ConversionResult>(`/currency?from=${from}&to=${to}&amount=${amount}`),
  rate: (from: string, to: string) =>
    api.get<CurrencyRate>(`/currency/rate?from=${from}&to=${to}`),
};
