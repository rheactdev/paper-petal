import { useEffect, useRef, useState } from "react";
import { CalendarDays, LoaderCircle, X } from "lucide-react";
import { headerDate, todayDate, type DocumentHeader } from "../../data/header";
import { getCurrentWeather } from "../../weather/functions";
import { weatherText } from "../../weather/model";
import {
  useWeatherSettings,
  WeatherSettingsFields,
  WeatherCredit,
} from "./weather-settings";

export function HeaderPanel({
  header,
  onChange,
}: {
  header?: DocumentHeader;
  onChange: (header?: DocumentHeader) => void;
}) {
  const {
    settings,
    ready,
    error: settingsError,
    update,
  } = useWeatherSettings();
  const [updating, setUpdating] = useState(false);
  const [weatherError, setWeatherError] = useState("");
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
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
          disabled={!ready || updating}
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
        <WeatherSettingsFields
          settings={settings}
          disabled={!ready || updating}
          onChange={(next) => {
            setWeatherError("");
            update(next);
          }}
        />
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
      <WeatherCredit />
    </section>
  );
}
