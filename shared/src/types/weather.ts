export interface DailyForecast {
  date: string;
  temperature_max: number;
  temperature_min: number;
  precipitation_probability: number;
  weather_code: number;
  sunrise: string;
  sunset: string;
  uv_index_max: number;
  wind_speed_max: number;
  wind_direction: number;
}

export interface HourlyWeather {
  time: string;
  temperature: number;
  precipitation_probability: number;
  weather_code: number;
  wind_speed: number;
}

export interface BeachConditions {
  sea_surface_temperature: number | null;
  wave_height: number | null;
  wave_period: number | null;
  wind_speed: number;
  wind_direction: number;
  uv_index: number;
  beach_flag: 'green' | 'yellow' | 'red';
  spf_recommendation: string;
}

export interface WeatherData {
  daily: DailyForecast[];
  hourly: HourlyWeather[];
  beach: BeachConditions | null;
}
