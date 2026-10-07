import "@tanstack/react-start/client-only";
import {
  defaultWeatherSettings,
  weatherSettingsSchema,
  type WeatherSettings,
} from "./model";
const storageKey = "paper-and-petal-weather-settings";
export function readWeatherSettings(): {
  settings: WeatherSettings;
  error?: string;
} {
  try {
    const value = localStorage.getItem(storageKey);
    return {
      settings: value
        ? weatherSettingsSchema.parse(JSON.parse(value))
        : defaultWeatherSettings,
    };
  } catch {
    return {
      settings: defaultWeatherSettings,
      error: "City settings could not be loaded. You can set them again below.",
    };
  }
}
export function writeWeatherSettings(settings: WeatherSettings) {
  localStorage.setItem(
    storageKey,
    JSON.stringify(weatherSettingsSchema.parse(settings)),
  );
}
