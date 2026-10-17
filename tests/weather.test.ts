import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  cityLabel,
  citySearchSchema,
  weatherSettingsSchema,
  weatherRequestSchema,
  weatherText,
  weatherDescription,
  weatherIcon,
  weeklyWeatherRequestSchema,
  dailyWeatherText,
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
const daily = {
  daily: {
    time: [
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
    ],
    temperature_2m_max: [22, 23, 24, 25, 26, 27, 28],
    temperature_2m_min: [12, 13, 14, 15, 16, 17, 18],
    weather_code: [0, 1, 2, 3, 61, 71, 95],
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
  it("chooses distinct local weather symbols for clear, cloudy, wet, frozen and stormy conditions", () => {
    for (const [codes, icon] of [
      [[0], "sun"],
      [[1, 2], "cloud-sun"],
      [[3], "cloud"],
      [[45, 48], "cloud-fog"],
      [[51, 53, 55, 56, 57], "cloud-drizzle"],
      [[61, 63, 65, 66, 67, 80, 81, 82], "cloud-rain"],
      [[71, 73, 75, 77, 85, 86], "cloud-snow"],
      [[95, 97], "cloud-lightning"],
      [[96, 99], "cloud-hail"],
    ] as const)
      for (const code of codes) expect(weatherIcon(code)).toBe(icon);
    expect(weatherIcon(42)).toBe("circle-help");
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
  it("validates weekly dates and time zones, and formats daily high/low without negative zero", () => {
    expect(
      weeklyWeatherRequestSchema.safeParse({
        city,
        unit: "celsius",
        week: "2026-02-30",
        timeZone: "UTC",
      }).success,
    ).toBe(false);
    expect(
      weeklyWeatherRequestSchema.safeParse({
        city,
        unit: "celsius",
        week: "2026-10-05",
        timeZone: "Invalid/Zone",
      }).success,
    ).toBe(false);
    expect(
      dailyWeatherText(
        { date: "2026-10-05", high: 1.6, low: -0.2, code: 2 },
        "celsius",
      ),
    ).toBe("2°/0°C");
  });
  it("requests daily estimates in the calendar time zone, matches dates and caches by week, coordinates, zone and units", async () => {
    const { weeklyWeather } = await import("../src/weather/weather.server");
    fetchMock.mockImplementation(() => Promise.resolve(reply(daily)));
    const input = {
      city,
      unit: "celsius" as const,
      week: "2026-10-07",
      timeZone: "America/New_York",
    };
    const result = await weeklyWeather(input);
    expect(result).toMatchObject({
      ok: true,
      data: {
        city: "Tokyo, Japan",
        unit: "celsius",
        timeZone: input.timeZone,
        days: daily.daily.time.map((date, index) => ({
          date,
          high: daily.daily.temperature_2m_max[index],
          low: daily.daily.temperature_2m_min[index],
          code: daily.daily.weather_code[index],
        })),
      },
    });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("daily")).toBe(
      "weather_code,temperature_2m_max,temperature_2m_min",
    );
    expect(url.searchParams.get("start_date")).toBe("2026-10-05");
    expect(url.searchParams.get("end_date")).toBe("2026-10-11");
    expect(url.searchParams.get("timezone")).toBe(input.timeZone);
    expect(url.searchParams.get("temperature_unit")).toBe("celsius");
    await weeklyWeather({
      ...input,
      week: "2026-10-05",
      city: { ...city, name: "New display name" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await weeklyWeather({ ...input, unit: "fahrenheit" });
    await weeklyWeather({ ...input, timeZone: "UTC" });
    await weeklyWeather({ ...input, city: { ...city, latitude: 30 } });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    vi.advanceTimersByTime(600001);
    await weeklyWeather(input);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
  it("clips partial forecast weeks, leaves unavailable days empty and skips weeks outside the provider window", async () => {
    const { weeklyWeather } = await import("../src/weather/weather.server");
    const input = {
      city,
      unit: "celsius" as const,
      week: "2026-10-19",
      timeZone: "UTC",
    };
    fetchMock.mockResolvedValueOnce(
      reply({
        daily: {
          time: ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22"],
          temperature_2m_max: [20, null, 22, 23],
          temperature_2m_min: [10, null, 12, 13],
          weather_code: [0, null, 2, 3],
        },
      }),
    );
    const result = await weeklyWeather(input);
    expect(result.ok && result.data.days.map((day) => day.date)).toEqual([
      "2026-10-19",
      "2026-10-21",
      "2026-10-22",
    ]);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("end_date")).toBe("2026-10-22");
    for (const week of ["2026-01-05", "2027-01-04"]) {
      const unavailable = await weeklyWeather({ ...input, week });
      expect(unavailable.ok && unavailable.data.days).toEqual([]);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("rejects malformed daily arrays, duplicate or unexpected dates and hides private upstream errors", async () => {
    const { weeklyWeather } = await import("../src/weather/weather.server");
    const input = {
      city,
      unit: "celsius" as const,
      week: "2026-10-05",
      timeZone: "UTC",
    };
    for (const invalid of [
      {},
      { daily: { ...daily.daily, weather_code: [0] } },
      { daily: { ...daily.daily, time: Array(7).fill("2026-10-05") } },
      {
        daily: {
          ...daily.daily,
          time: [...daily.daily.time.slice(0, 6), "2026-11-01"],
        },
      },
      { daily: { ...daily.daily, temperature_2m_min: Array(7).fill(100) } },
    ]) {
      fetchMock.mockResolvedValueOnce(reply(invalid));
      expect((await weeklyWeather(input)).ok).toBe(false);
    }
    fetchMock.mockRejectedValueOnce(new Error("private upstream secret"));
    const error = await weeklyWeather(input);
    expect(error.ok).toBe(false);
    expect(JSON.stringify(error)).not.toContain("private upstream secret");
  });
});
