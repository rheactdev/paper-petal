import { useEffect, useId, useRef, useState } from "react";
import { createClientOnlyFn } from "@tanstack/react-start";
import { LoaderCircle, Search, X } from "lucide-react";
import { findWeatherCities } from "../../weather/functions";
import {
  cityLabel,
  defaultWeatherSettings,
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

export function useWeatherSettings() {
  const [settings, setSettings] = useState(defaultWeatherSettings);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    loadSettings()
      .then((result) => {
        if (!mounted.current) return;
        setSettings(result.settings);
        setError(result.error || "");
        setReady(true);
      })
      .catch(() => {
        if (mounted.current) {
          setReady(true);
          setError(
            "City settings could not be loaded. You can set them below.",
          );
        }
      });
    return () => {
      mounted.current = false;
    };
  }, []);
  async function update(next: WeatherSettings) {
    setSettings(next);
    try {
      await saveSettings(next);
      if (mounted.current) setError("");
    } catch {
      if (mounted.current)
        setError(
          "These city settings could not be saved on this device. They will work until you leave this page.",
        );
    }
  }
  return { settings, ready, error, update };
}

export function WeatherSettingsFields({
  settings,
  onChange,
  disabled = false,
}: {
  settings: WeatherSettings;
  onChange: (settings: WeatherSettings) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState(settings.city?.name || "");
  const [cities, setCities] = useState<WeatherCity[]>([]);
  const [searched, setSearched] = useState(false),
    [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const revision = useRef(0);
  useEffect(() => {
    setQuery(settings.city?.name || "");
  }, [settings.city?.id]);
  useEffect(
    () => () => {
      revision.current++;
    },
    [],
  );
  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (query.trim().length < 2 || searching || disabled) return;
    const request = ++revision.current;
    setSearching(true);
    setCities([]);
    setSearched(false);
    setError("");
    try {
      const result = await findWeatherCities({ data: { query: query.trim() } });
      if (request !== revision.current) return;
      if (result.ok) {
        setCities(result.data);
        setSearched(true);
      } else setError(result.message);
    } catch {
      if (request === revision.current)
        setError("City search is unavailable. Please try again.");
    } finally {
      if (request === revision.current) setSearching(false);
    }
  }
  return (
    <>
      <form onSubmit={search}>
        <label htmlFor={id}>Your city</label>
        <div className="header-city-search">
          <input
            id={id}
            type="search"
            placeholder="City, country"
            maxLength={100}
            value={query}
            disabled={disabled || searching}
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
            disabled={disabled || searching || query.trim().length < 2}
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
                disabled={disabled}
                onClick={() => {
                  onChange({ ...settings, city });
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
            disabled={disabled}
            onClick={() => onChange({ ...settings, city: null })}
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
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...settings,
              unit: event.target.value as WeatherSettings["unit"],
            })
          }
        >
          <option value="celsius">Celsius · °C</option>
          <option value="fahrenheit">Fahrenheit · °F</option>
        </select>
      </label>
      {error && (
        <p className="header-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

export function WeatherCredit() {
  return (
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
  );
}
