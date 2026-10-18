import "@tanstack/react-start/server-only";
import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";
import {
  citySchema,
  cityLabel,
  weatherSnapshotSchema,
  dailyWeatherSchema,
  weeklyWeatherSchema,
  sunsetSchema,
  type DailyWeather,
  type WeeklyWeather,
  type weeklyWeatherRequestSchema,
  type WeatherCity,
  type WeatherSnapshot,
  type WeatherResult,
  type weatherRequestSchema,
} from "./model";

const geocodingResponse = z.object({
  results: z
    .array(
      z.object({
        id: citySchema.shape.id,
        name: citySchema.shape.name,
        admin1: z.string().max(100).optional(),
        country: z.string().max(100).optional(),
        latitude: citySchema.shape.latitude,
        longitude: citySchema.shape.longitude,
      }),
    )
    .max(10)
    .default([]),
});
const currentResponse = z.object({
  current: z.object({
    time: z.number().int().positive(),
    temperature_2m: weatherSnapshotSchema.shape.temperature,
    weather_code: weatherSnapshotSchema.shape.code,
    is_day: z.union([z.literal(0), z.literal(1)]),
  }),
});
type Conditions = z.infer<typeof currentResponse>["current"];
const weatherCache = new Map<string, { expires: number; data: Conditions }>();
const CACHE_TIME = 10 * 60 * 1000;
const dailyResponse = z.object({
  daily: z
    .object({
      time: z.array(dailyWeatherSchema.shape.date).max(7),
      weather_code: z.array(dailyWeatherSchema.shape.code.nullable()).max(7),
      sunset: z.array(sunsetSchema.nullable()).max(7),
      temperature_2m_max: z
        .array(dailyWeatherSchema.shape.high.nullable())
        .max(7),
      temperature_2m_min: z
        .array(dailyWeatherSchema.shape.low.nullable())
        .max(7),
    })
    .refine(
      (data) =>
        [
          data.weather_code,
          data.temperature_2m_max,
          data.temperature_2m_min,
          data.sunset,
        ].every((values) => values.length === data.time.length),
      "Incomplete daily weather.",
    ),
  hourly: z
    .object({
      time: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:00$/)).max(175),
      temperature_2m: z
        .array(weatherSnapshotSchema.shape.temperature.nullable())
        .max(175),
      weather_code: z
        .array(weatherSnapshotSchema.shape.code.nullable())
        .max(175),
      is_day: z
        .array(z.union([z.literal(0), z.literal(1)]).nullable())
        .max(175),
    })
    .refine(
      (data) =>
        [data.temperature_2m, data.weather_code, data.is_day].every(
          (values) => values.length === data.time.length,
        ),
      "Incomplete hourly weather.",
    ),
});
const dailyCache = new Map<
  string,
  { expires: number; days: DailyWeather[]; fetchedAt: string }
>();
function providerURL(service: "geocoding" | "forecast") {
  const apiKey = process.env.OPEN_METEO_API_KEY || "";
  const domain =
    service === "geocoding"
      ? "geocoding-api.open-meteo.com"
      : "api.open-meteo.com";
  const url = new URL(
    `https://${apiKey ? "customer-" : ""}${domain}/v1/${service === "geocoding" ? "search" : "forecast"}`,
  );
  if (apiKey) url.searchParams.set("apikey", apiKey);
  return url;
}
async function request(url: URL) {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("Weather service unavailable.");
  return response.json();
}
export async function searchCities(
  query: string,
): Promise<WeatherResult<WeatherCity[]>> {
  try {
    const url = providerURL("geocoding");
    url.searchParams.set("name", query);
    url.searchParams.set("count", "5");
    url.searchParams.set("language", "en");
    url.searchParams.set("format", "json");
    const response = geocodingResponse.parse(await request(url));
    return {
      ok: true,
      data: response.results.map((city) => ({
        id: city.id,
        name: city.name,
        region: city.admin1 || "",
        country: city.country || "",
        latitude: city.latitude,
        longitude: city.longitude,
      })),
    };
  } catch {
    return {
      ok: false,
      message: "City search is unavailable. Please try again shortly.",
    };
  }
}
export async function currentWeather(
  input: z.infer<typeof weatherRequestSchema>,
): Promise<WeatherResult<WeatherSnapshot>> {
  try {
    const key = `${input.city.latitude},${input.city.longitude},${input.unit}`;
    const cached = weatherCache.get(key);
    let data = cached && cached.expires > Date.now() ? cached.data : undefined;
    if (!data) {
      const url = providerURL("forecast");
      url.searchParams.set("latitude", String(input.city.latitude));
      url.searchParams.set("longitude", String(input.city.longitude));
      url.searchParams.set("current", "temperature_2m,weather_code,is_day");
      url.searchParams.set("temperature_unit", input.unit);
      url.searchParams.set("timezone", "auto");
      // Unix time is UTC even when the requested city uses another timezone.
      url.searchParams.set("timeformat", "unixtime");
      url.searchParams.set("forecast_days", "1");
      data = currentResponse.parse(await request(url)).current;
      if (weatherCache.size >= 128)
        weatherCache.delete(weatherCache.keys().next().value!);
      weatherCache.set(key, { expires: Date.now() + CACHE_TIME, data });
    }
    return {
      ok: true,
      data: weatherSnapshotSchema.parse({
        city: cityLabel(input.city),
        temperature: data.temperature_2m,
        unit: input.unit,
        code: data.weather_code,
        isDay: data.is_day === 1,
        observedAt: new Date(data.time * 1000).toISOString(),
      }),
    };
  } catch {
    return {
      ok: false,
      message: "Weather is unavailable. Try again, or add a date-only header.",
    };
  }
}

export async function weeklyWeather(
  input: z.infer<typeof weeklyWeatherRequestSchema>,
): Promise<WeatherResult<WeeklyWeather>> {
  try {
    const date = Temporal.PlainDate.from(input.week);
    const monday = date.subtract({ days: date.dayOfWeek - 1 });
    const today = Temporal.Now.plainDateISO(input.timeZone);
    // Open-Meteo provides recent archived estimates and up to 16 forecast days.
    // Clamp partial weeks instead of requesting unsupported dates or inventing values.
    const first = today.subtract({ days: 92 });
    const last = today.add({ days: 15 });
    const requested = Array.from({ length: 7 }, (_, index) =>
      monday.add({ days: index }),
    ).filter(
      (day) =>
        Temporal.PlainDate.compare(day, first) >= 0 &&
        Temporal.PlainDate.compare(day, last) <= 0,
    );
    const base = {
      city: cityLabel(input.city),
      unit: input.unit,
      timeZone: input.timeZone,
    };
    if (!requested.length)
      return {
        ok: true,
        data: { ...base, days: [], fetchedAt: new Date().toISOString() },
      };
    const start = requested[0].toString(),
      end = requested.at(-1)!.toString();
    const key = `${input.city.latitude},${input.city.longitude},${input.unit},${input.timeZone},${start},${end}`;
    let cached = dailyCache.get(key);
    if (!cached || cached.expires <= Date.now()) {
      const url = providerURL("forecast");
      url.searchParams.set("latitude", String(input.city.latitude));
      url.searchParams.set("longitude", String(input.city.longitude));
      url.searchParams.set("temperature_unit", input.unit);
      url.searchParams.set("timezone", input.timeZone);
      url.searchParams.set(
        "daily",
        "weather_code,temperature_2m_max,temperature_2m_min,sunset",
      );
      url.searchParams.set("hourly", "temperature_2m,weather_code,is_day");
      url.searchParams.set("start_date", start);
      url.searchParams.set("end_date", end);
      const { daily, hourly } = dailyResponse.parse(await request(url));
      if (new Set(daily.time).size !== daily.time.length)
        throw new Error("Duplicate forecast dates.");
      const expected = new Set(requested.map(String));
      const periods = new Map<
        string,
        {
          daytime: { temperature: number; code: number } | null;
          nighttime: { temperature: number; code: number } | null;
        }
      >();
      hourly.time.forEach((time, index) => {
        const local = Temporal.PlainDateTime.from(time);
        const date = local.toPlainDate().toString();
        if (!expected.has(date)) throw new Error("Unexpected hourly date.");
        const temperature = hourly.temperature_2m[index],
          code = hourly.weather_code[index],
          isDay = hourly.is_day[index];
        if (temperature === null || code === null || isDay === null) return;
        const day = periods.get(date) ?? { daytime: null, nighttime: null };
        const key = isDay ? "daytime" : "nighttime";
        const previous = day[key];
        day[key] = {
          temperature: previous
            ? (isDay ? Math.max : Math.min)(previous.temperature, temperature)
            : temperature,
          // WMO severity order matches the provider's daily weather summary.
          code: Math.max(previous?.code ?? 0, code),
        };
        periods.set(date, day);
      });
      const days = daily.time.flatMap((date, index) => {
        if (!expected.has(date)) throw new Error("Unexpected forecast date.");
        const high = daily.temperature_2m_max[index],
          low = daily.temperature_2m_min[index],
          code = daily.weather_code[index];
        // Null values represent unavailable days; keep the remaining valid days.
        if (high === null || low === null || code === null) return [];
        return [
          dailyWeatherSchema.parse({
            date,
            high,
            low,
            code,
            // A sunset outside this date is not an estimate for this day.
            sunset: daily.sunset[index]?.startsWith(`${date}T`)
              ? daily.sunset[index]
              : null,
            ...(periods.get(date) ?? { daytime: null, nighttime: null }),
          }),
        ];
      });
      cached = {
        days,
        expires: Date.now() + CACHE_TIME,
        fetchedAt: new Date().toISOString(),
      };
      if (dailyCache.size >= 128)
        dailyCache.delete(dailyCache.keys().next().value!);
      dailyCache.set(key, cached);
    }
    return {
      ok: true,
      data: weeklyWeatherSchema.parse({
        ...base,
        days: cached.days,
        fetchedAt: cached.fetchedAt,
      }),
    };
  } catch {
    return {
      ok: false,
      message:
        "Daily weather couldn’t be loaded. Try again or create the spread without weather.",
    };
  }
}
