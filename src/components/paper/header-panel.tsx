import { useEffect, useRef, useState } from "react";
import { createClientOnlyFn } from "@tanstack/react-start";
import { CalendarDays, LoaderCircle, Search, X } from "lucide-react";
import { headerDate, todayDate, type DocumentHeader } from "../../data/header";
import { findWeatherCities, getCurrentWeather } from "../../weather/functions";
import {
  cityLabel,
  defaultWeatherSettings,
  weatherText,
  type WeatherCity,
  type WeatherSettings,
} from "../../weather/model";

const loadSettings = createClientOnlyFn(async () => {
  const { readWeatherSettings } = await import("../../weather/settings.client");
  return readWeatherSettings();
});
const saveSettings = createClientOnlyFn(async (settings: WeatherSettings) => {
  const { writeWeatherSettings } =
    await import("../../weather/settings.client");
  writeWeatherSettings(settings);
});

export function HeaderPanel({
  header,
  onChange,
}: {
  header?: DocumentHeader;
  onChange: (header?: DocumentHeader) => void;
}) {
  const [settings, setSettings] = useState(defaultWeatherSettings);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [cities, setCities] = useState<WeatherCity[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [weatherError, setWeatherError] = useState("");
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    loadSettings()
      .then((result) => {
        if (!mounted.current) return;
        setSettings(result.settings);
        setQuery(result.settings.city?.name || "");
        setSettingsError(result.error || "");
        setReady(true);
      })
      .catch(() => {
        if (mounted.current) {
          setReady(true);
          setSettingsError(
            "City settings could not be loaded. You can set them below.",
          );
        }
      });
    return () => {
      mounted.current = false;
    };
  }, []);

  async function updateSettings(next: WeatherSettings) {
    setSettings(next);
    setWeatherError("");
    try {
      await saveSettings(next);
      if (mounted.current) setSettingsError("");
    } catch {
      if (mounted.current)
        setSettingsError(
          "These city settings could not be saved on this device. They will work until you leave this editor.",
        );
    }
  }
  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (query.trim().length < 2 || searching || updating) return;
    setSearching(true);
    setCities([]);
    setSearched(false);
    setSettingsError("");
    try {
      const result = await findWeatherCities({ data: { query: query.trim() } });
      if (!mounted.current) return;
      if (result.ok) {
        setCities(result.data);
        setSearched(true);
      } else setSettingsError(result.message);
    } catch {
      if (mounted.current)
        setSettingsError("City search is unavailable. Please try again.");
    } finally {
      if (mounted.current) setSearching(false);
    }
  }
  async function setHeader() {
    setWeatherError("");
    const date = todayDate();
    if (!settings.city) {
      onChange({ date });
      return;
    }
    setUpdating(true);
    try {
      const result = await getCurrentWeather({
        data: { city: settings.city, unit: settings.unit },
      });
      if (!mounted.current) return;
      if (result.ok) onChange({ date, weather: result.data });
      else setWeatherError(result.message);
    } catch {
      if (mounted.current)
        setWeatherError(
          "Weather is unavailable. Try again, or add a date-only header.",
        );
    } finally {
      if (mounted.current) setUpdating(false);
    }
  }
  return (
    <section
      className="property-section header-panel"
      aria-label="Document header"
    >
      <h3>HEADER</h3>
      {header ? (
        <div className="header-snapshot">
          <strong>
            {headerDate(header.date).day} · {headerDate(header.date).date}
          </strong>
          {header.weather && (
            <span>
              {weatherText(header.weather)} · {header.weather.city}
            </span>
          )}
        </div>
      ) : (
        <p className="header-hint">
          Today's date and day, at the top of every page.
        </p>
      )}
      <div className="header-actions">
        <button
          className="header-set"
          disabled={!ready || updating || searching}
          onClick={setHeader}
        >
          {updating ? (
            <LoaderCircle size={16} className="header-spinner" />
          ) : (
            <CalendarDays size={16} />
          )}
          {updating
            ? "Getting weather…"
            : header
              ? "Update header"
              : "Set header"}
        </button>
        {header && (
          <button
            aria-label="Remove header"
            title="Remove header"
            disabled={updating}
            onClick={() => {
              onChange(undefined);
              setWeatherError("");
            }}
          >
            <X size={16} />
          </button>
        )}
      </div>
      {!settings.city && (
        <p className="header-hint">
          Choose your city in settings to include weather.
        </p>
      )}
      {weatherError && (
        <div className="header-error" role="alert">
          <p>{weatherError}</p>
          <button
            onClick={() => {
              onChange({ date: todayDate() });
              setWeatherError("");
            }}
          >
            Use date only
          </button>
        </div>
      )}
      <details className="header-settings">
        <summary>Header settings</summary>
        <form onSubmit={search}>
          <label htmlFor="header-city-search">Your city</label>
          <div className="header-city-search">
            <input
              id="header-city-search"
              type="search"
              placeholder="City, country"
              maxLength={100}
              value={query}
              disabled={!ready || updating || searching}
              onChange={(event) => {
                setQuery(event.target.value);
                setCities([]);
                setSearched(false);
              }}
            />
            <button
              type="submit"
              aria-label="Search cities"
              title="Search cities"
              disabled={
                !ready || updating || searching || query.trim().length < 2
              }
            >
              {searching ? (
                <LoaderCircle size={16} className="header-spinner" />
              ) : (
                <Search size={16} />
              )}
            </button>
          </div>
        </form>
        {searching && (
          <p className="header-hint" role="status">
            Finding cities…
          </p>
        )}
        {searched && !cities.length && (
          <p className="header-hint" role="status">
            No cities found. Try the city name and country.
          </p>
        )}
        {!!cities.length && (
          <ul className="header-city-results" aria-label="City matches">
            {cities.map((city) => (
              <li key={city.id}>
                <button
                  disabled={updating}
                  onClick={() => {
                    updateSettings({ ...settings, city });
                    setCities([]);
                    setSearched(false);
                    setQuery(city.name);
                  }}
                >
                  {cityLabel(city)}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="header-selected-city">
          <span>
            {settings.city ? cityLabel(settings.city) : "No city selected"}
          </span>
          {settings.city && (
            <button
              aria-label="Clear weather city"
              title="Clear weather city"
              disabled={updating}
              onClick={() => updateSettings({ ...settings, city: null })}
            >
              <X size={14} />
            </button>
          )}
        </div>
        <label className="select-field">
          <span>Temperature</span>
          <select
            aria-label="Weather temperature unit"
            value={settings.unit}
            disabled={!ready || updating}
            onChange={(event) =>
              updateSettings({
                ...settings,
                unit: event.target.value as WeatherSettings["unit"],
              })
            }
          >
            <option value="celsius">Celsius · °C</option>
            <option value="fahrenheit">Fahrenheit · °F</option>
          </select>
        </label>
        <p className="header-hint">
          City settings stay on this device. Changes apply when you set or
          update a header.
        </p>
      </details>
      {settingsError && (
        <p className="header-error" role="alert">
          {settingsError}
        </p>
      )}
      {header && (
        <p className="header-hint">
          Saved as a snapshot. Use Update header for today's date and weather.
        </p>
      )}
      <p className="weather-credit">
        Weather by{" "}
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
          Open-Meteo
        </a>{" "}
        · cities by{" "}
        <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">
          GeoNames
        </a>
      </p>
    </section>
  );
}
