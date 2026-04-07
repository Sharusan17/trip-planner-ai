const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1';

export async function fetchWeather(lat: number, lng: number) {
  const forecastUrl = `${OPEN_METEO_BASE}/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,sunrise,sunset,uv_index_max,wind_speed_10m_max,wind_direction_10m_dominant&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m&timezone=auto&forecast_days=7`;

  const marineUrl = `${OPEN_METEO_BASE}/marine?latitude=${lat}&longitude=${lng}&daily=wave_height_max,wave_period_max&hourly=sea_surface_temperature&timezone=auto&forecast_days=1`;

  const [forecastRes, marineRes] = await Promise.all([
    fetch(forecastUrl),
    fetch(marineUrl).catch(() => null),
  ]);

  if (!forecastRes.ok) {
    throw new Error('Failed to fetch weather data');
  }

  const forecast = await forecastRes.json();
  let marine = null;
  if (marineRes && marineRes.ok) {
    marine = await marineRes.json();
  }

  // Build daily forecast
  const daily = forecast.daily.time.map((date: string, i: number) => ({
    date,
    temperature_max: forecast.daily.temperature_2m_max[i],
    temperature_min: forecast.daily.temperature_2m_min[i],
    precipitation_probability: forecast.daily.precipitation_probability_max[i],
    weather_code: forecast.daily.weather_code[i],
    sunrise: forecast.daily.sunrise[i],
    sunset: forecast.daily.sunset[i],
    uv_index_max: forecast.daily.uv_index_max[i],
    wind_speed_max: forecast.daily.wind_speed_10m_max[i],
    wind_direction: forecast.daily.wind_direction_10m_dominant[i],
  }));

  // Build hourly (today only — first 24 entries)
  const hourly = forecast.hourly.time.slice(0, 24).map((time: string, i: number) => ({
    time,
    temperature: forecast.hourly.temperature_2m[i],
    precipitation_probability: forecast.hourly.precipitation_probability[i],
    weather_code: forecast.hourly.weather_code[i],
    wind_speed: forecast.hourly.wind_speed_10m[i],
  }));

  // Beach conditions
  let beach = null;
  if (marine && daily.length > 0) {
    const todayUv = daily[0].uv_index_max;
    const todayWind = daily[0].wind_speed_max;
    const waveHeight = marine.daily?.wave_height_max?.[0] ?? null;
    const wavePeriod = marine.daily?.wave_period_max?.[0] ?? null;

    // Find current hour's sea surface temp
    const currentHour = new Date().getHours();
    const seaTemp = marine.hourly?.sea_surface_temperature?.[currentHour] ?? null;

    // Beach flag heuristic
    let beachFlag: 'green' | 'yellow' | 'red' = 'green';
    if ((waveHeight && waveHeight > 2) || todayWind > 40) {
      beachFlag = 'red';
    } else if ((waveHeight && waveHeight > 1) || todayWind > 25) {
      beachFlag = 'yellow';
    }

    // SPF recommendation
    let spf = 'SPF 30';
    if (todayUv >= 8) spf = 'SPF 50+ (very high UV — reapply every 90 mins, keep infants in shade)';
    else if (todayUv >= 6) spf = 'SPF 50 (high UV — reapply every 2 hours)';
    else if (todayUv >= 3) spf = 'SPF 30 (moderate UV)';
    else spf = 'SPF 15 (low UV)';

    beach = {
      sea_surface_temperature: seaTemp,
      wave_height: waveHeight,
      wave_period: wavePeriod,
      wind_speed: todayWind,
      wind_direction: daily[0].wind_direction,
      uv_index: todayUv,
      beach_flag: beachFlag,
      spf_recommendation: spf,
    };
  }

  return { daily, hourly, beach };
}
