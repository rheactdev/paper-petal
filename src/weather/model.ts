import { z } from "zod";

export const temperatureUnit = z.enum(["celsius", "fahrenheit"]);
export const citySchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().min(1).max(100),
    region: z.string().max(100),
    country: z.string().max(100),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
  })
  .strict();
export type WeatherCity = z.infer<typeof citySchema>;
export const weatherSettingsSchema = z
  .object({
    city: citySchema.nullable().default(null),
    unit: temperatureUnit.default("celsius"),
  })
  .strict();
export type WeatherSettings = z.infer<typeof weatherSettingsSchema>;
export const defaultWeatherSettings: WeatherSettings = {
  city: null,
  unit: "celsius",
};
export const citySearchSchema = z
  .object({ query: z.string().trim().min(2).max(100) })
  .strict();
export const weatherRequestSchema = z
  .object({ city: citySchema, unit: temperatureUnit })
  .strict();
export const weatherSnapshotSchema = z
  .object({
    city: z.string().min(1).max(320),
    temperature: z.number().finite().min(-200).max(200),
    unit: temperatureUnit,
    code: z.number().int().min(0).max(99),
    isDay: z.boolean(),
    observedAt: z.iso.datetime(),
  })
  .strict();
export type WeatherSnapshot = z.infer<typeof weatherSnapshotSchema>;
export type WeatherResult<T> =
  { ok: true; data: T } | { ok: false; message: string };

export function cityLabel(city: WeatherCity) {
  return [
    ...new Set([city.name, city.region, city.country].filter(Boolean)),
  ].join(", ");
}
export function weatherDescription(code: number, isDay = true) {
  if (code === 0) return isDay ? "Clear skies" : "Clear night";
  if (code === 1) return "Mostly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if ([45, 48].includes(code)) return "Foggy";
  if ([51, 53, 55].includes(code)) return "Drizzle";
  if ([56, 57].includes(code)) return "Freezing drizzle";
  if ([61, 63, 65].includes(code)) return "Rainy";
  if ([66, 67].includes(code)) return "Freezing rain";
  if ([71, 73, 75, 77].includes(code)) return "Snowy";
  if ([80, 81, 82].includes(code)) return "Rain showers";
  if ([85, 86].includes(code)) return "Snow showers";
  if ([95, 97].includes(code)) return "Thunderstorms";
  if ([96, 99].includes(code)) return "Thunderstorms with hail";
  return "Weather conditions";
}
export function weatherText(weather: WeatherSnapshot) {
  const temperature = Math.round(weather.temperature);
  return `${weatherDescription(weather.code, weather.isDay)} · ${Object.is(temperature, -0) ? 0 : temperature}°${weather.unit === "celsius" ? "C" : "F"}`;
}
