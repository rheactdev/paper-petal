import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  cityLabel,
  citySearchSchema,
  weatherSettingsSchema,
  weatherRequestSchema,
  weatherText,
  weatherDescription,
} from "../src/weather/model";
vi.mock("@tanstack/react-start/server-only", () => ({}));
vi.mock("@tanstack/react-start/client-only", () => ({}));
import {
  readWeatherSettings,
  writeWeatherSettings,
} from "../src/weather/settings.client";

const city = {
  id: 1850147,
  name: "Tokyo",
  region: "Tokyo",
  country: "Japan",
  latitude: 35.6895,
  longitude: 139.6917,
};
const current = {
  current: {
    time: 1791367200,
    temperature_2m: 20.4,
    weather_code: 2,
    is_day: 1,
  },
};
let fetchMock: ReturnType<typeof vi.fn>;
let values: Map<string, string>;
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-07T10:15:00Z"));
  vi.stubEnv("OPEN_METEO_API_KEY", "");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  values = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
describe("weather and city settings", () => {
  it("validates city queries, coordinate ranges, units and unknown fields", () => {
    expect(citySearchSchema.parse({ query: " Tokyo " }).query).toBe("Tokyo");
    expect(citySearchSchema.safeParse({ query: "a" }).success).toBe(false);
    expect(
      weatherRequestSchema.safeParse({
        city: { ...city, latitude: 91 },
        unit: "celsius",
      }).success,
    ).toBe(false);
    expect(
      weatherRequestSchema.safeParse({
        city: { ...city, longitude: -181 },
        unit: "celsius",
      }).success,
    ).toBe(false);
    expect(
      weatherSettingsSchema.safeParse({ city, unit: "kelvin" }).success,
    ).toBe(false);
    expect(
      weatherRequestSchema.safeParse({
        city,
        unit: "celsius",
        url: "https://example.com",
      }).success,
    ).toBe(false);
    expect(cityLabel(city)).toBe("Tokyo, Japan");
  });
  it("persists a selected city and unit and recovers invalid or unavailable browser settings", () => {
    expect(readWeatherSettings().settings).toEqual({
      city: null,
      unit: "celsius",
    });
    writeWeatherSettings({ city, unit: "fahrenheit" });
    expect(readWeatherSettings().settings).toEqual({
      city,
      unit: "fahrenheit",
    });
    values.set("paper-and-petal-weather-settings", "invalid JSON");
    expect(readWeatherSettings().error).toBeTruthy();
    values.set(
      "paper-and-petal-weather-settings",
      JSON.stringify({ city: { ...city, latitude: "bad" }, unit: "celsius" }),
    );
    expect(readWeatherSettings().settings.city).toBeNull();
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
    });
    expect(readWeatherSettings().error).toBeTruthy();
    expect(() => writeWeatherSettings({ city, unit: "celsius" })).toThrow(
      "quota",
    );
  });
  it("maps all supported weather types, nighttime conditions and rounded units without negative zero", () => {
    for (const code of [
      0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75,
      77, 80, 81, 82, 85, 86, 95, 96, 97, 99,
    ])
      expect(weatherDescription(code)).not.toBe("Weather conditions");
    expect(weatherDescription(0, false)).toBe("Clear night");
    expect(weatherDescription(42)).toBe("Weather conditions");
    expect(
      weatherText({
        city: "Tokyo",
        temperature: -0.2,
        unit: "celsius",
        code: 3,
        isDay: false,
        observedAt: "2026-10-07T10:15:00Z",
      }),
    ).toBe("Overcast · 0°C");
  });
  it("normalizes geocoding results, disambiguates regions, and handles an empty search", async () => {
    const { searchCities } = await import("../src/weather/weather.server");
    fetchMock
      .mockResolvedValueOnce(
        reply({ results: [{ ...city, admin1: "Tokyo", population: 1000000 }] }),
      )
      .mockResolvedValueOnce(reply({}));
    expect(await searchCities("Tokyo, Japan")).toEqual({
      ok: true,
      data: [city],
    });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.host).toBe("geocoding-api.open-meteo.com");
    expect(url.searchParams.get("name")).toBe("Tokyo, Japan");
    expect(url.searchParams.get("count")).toBe("5");
    expect(await searchCities("Nowhere")).toEqual({ ok: true, data: [] });
  });
  it("captures current conditions, caches them by coordinate/unit, and expires the cache", async () => {
    const { currentWeather } = await import("../src/weather/weather.server");
    fetchMock.mockResolvedValue(reply(current));
    const result = await currentWeather({ city, unit: "celsius" });
    expect(result).toMatchObject({
      ok: true,
      data: {
        city: "Tokyo, Japan",
        temperature: 20.4,
        code: 2,
        unit: "celsius",
        isDay: true,
        observedAt: new Date(current.current.time * 1000).toISOString(),
      },
    });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.host).toBe("api.open-meteo.com");
    expect(url.searchParams.get("timeformat")).toBe("unixtime");
    expect(url.searchParams.get("timezone")).toBe("auto");
    await currentWeather({
      city: { ...city, name: "Another label" },
      unit: "celsius",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await currentWeather({ city, unit: "fahrenheit" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(600001);
    await currentWeather({ city, unit: "celsius" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it("uses customer endpoints only with a server API key and never returns the key", async () => {
    vi.stubEnv("OPEN_METEO_API_KEY", "synthetic-private-key");
    const { currentWeather, searchCities } =
      await import("../src/weather/weather.server");
    fetchMock
      .mockResolvedValueOnce(reply(current))
      .mockResolvedValueOnce(reply({}));
    const weather = await currentWeather({ city, unit: "celsius" });
    const cities = await searchCities("Tokyo");
    expect(new URL(fetchMock.mock.calls[0][0]).host).toBe(
      "customer-api.open-meteo.com",
    );
    expect(new URL(fetchMock.mock.calls[1][0]).host).toBe(
      "customer-geocoding-api.open-meteo.com",
    );
    expect(JSON.stringify([weather, cities])).not.toContain(
      "synthetic-private-key",
    );
  });
  it("rejects incomplete, null or malformed upstream weather and hides provider errors", async () => {
    const { currentWeather, searchCities } =
      await import("../src/weather/weather.server");
    for (const invalid of [
      {},
      { current: { ...current.current, temperature_2m: null } },
      { current: { ...current.current, weather_code: "2" } },
    ]) {
      fetchMock.mockResolvedValueOnce(reply(invalid));
      expect((await currentWeather({ city, unit: "celsius" })).ok).toBe(false);
    }
    fetchMock.mockResolvedValueOnce(
      reply({ reason: "provider internal details" }, 429),
    );
    expect(await searchCities("Tokyo")).toEqual({
      ok: false,
      message: "City search is unavailable. Please try again shortly.",
    });
    fetchMock.mockRejectedValueOnce(
      new Error("private key in upstream message"),
    );
    expect(await currentWeather({ city, unit: "celsius" })).toEqual({
      ok: false,
      message: "Weather is unavailable. Try again, or add a date-only header.",
    });
  });
});
