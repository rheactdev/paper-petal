import "@tanstack/react-start/server-only";
import { z } from "zod";
import {
  citySchema,
  cityLabel,
  weatherSnapshotSchema,
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
