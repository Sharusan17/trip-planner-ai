// Returns the narrow currency symbol using browser-native ICU data (e.g. CZK → Kč, JPY → ¥).
// Falls back to the 3-letter code if the currency is unrecognised.
export function getCurrencySymbol(currency: string): string {
  try {
    const parts = new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0);
    return parts.find(p => p.type === 'currency')?.value ?? currency;
  } catch {
    return currency;
  }
}

export const ALL_CURRENCIES = [
  'AED','AFN','ALL','AMD','ANG','AOA','ARS','AUD','AWG','AZN',
  'BAM','BBD','BDT','BGN','BHD','BIF','BMD','BND','BOB','BRL','BSD','BTN','BWP','BZD',
  'CAD','CDF','CHF','CLP','CNY','COP','CRC','CUP','CVE','CZK',
  'DJF','DKK','DOP','DZD',
  'EGP','ETB','EUR',
  'FJD',
  'GBP','GEL','GHS','GIP','GMD','GTQ','GYD',
  'HKD','HNL','HTG','HUF',
  'IDR','ILS','INR','IQD','ISK',
  'JMD','JOD','JPY',
  'KES','KGS','KHR','KRW','KWD','KYD','KZT',
  'LAK','LBP','LKR','LYD',
  'MAD','MDL','MKD','MMK','MNT','MOP','MUR','MVR','MWK','MXN','MYR','MZN',
  'NAD','NGN','NIO','NOK','NPR','NZD',
  'OMR',
  'PAB','PEN','PHP','PKR','PLN','PYG',
  'QAR',
  'RON','RSD','RUB','RWF',
  'SAR','SCR','SEK','SGD','SOS','SRD','SZL',
  'THB','TJS','TND','TOP','TRY','TTD','TWD','TZS',
  'UAH','UGX','USD','UYU','UZS',
  'VES','VND',
  'WST',
  'XAF','XCD','XOF','XPF',
  'YER',
  'ZAR','ZMW',
];
