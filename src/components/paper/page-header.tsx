import {
  Sun,
  Moon,
  CloudSun,
  CloudMoon,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudSnow,
  CloudLightning,
} from "lucide-react";
import { MM, pageMargins, type PaperDocument } from "../../data/model";
import { HEADER_SPACE, headerDate } from "../../data/header";
import { weatherText, type WeatherSnapshot } from "../../weather/model";

function WeatherIcon({ weather }: { weather: WeatherSnapshot }) {
  const code = weather.code;
  const Icon =
    code <= 1
      ? weather.isDay
        ? Sun
        : Moon
      : code === 2
        ? weather.isDay
          ? CloudSun
          : CloudMoon
        : [45, 48].includes(code)
          ? CloudFog
          : [51, 53, 55, 56, 57].includes(code)
            ? CloudDrizzle
            : [61, 63, 65, 66, 67, 80, 81, 82].includes(code)
              ? CloudRain
              : [71, 73, 75, 77, 85, 86].includes(code)
                ? CloudSnow
                : code >= 95
                  ? CloudLightning
                  : Cloud;
  return <Icon aria-hidden="true" />;
}
export function PageHeader({
  doc,
  index,
}: {
  doc: PaperDocument;
  index: number;
}) {
  if (!doc.header) return null;
  const margin = pageMargins(doc, index),
    width = doc.paper.width - margin.left - margin.right,
    compact = width < 80,
    date = headerDate(doc.header.date, compact);
  return (
    <div
      className={`page-header ${compact ? "compact-header" : ""}`}
      style={{
        left: margin.left * MM,
        top: margin.top * MM,
        width: width * MM,
        height: (HEADER_SPACE - 2) * MM,
        color: doc.typography.color,
        fontFamily: doc.typography.font,
      }}
    >
      <div className="page-header-date">
        <time dateTime={doc.header.date}>{date.date}</time>
        <span>{date.day}</span>
      </div>
      {doc.header.weather && (
        <div className="page-header-weather">
          <WeatherIcon weather={doc.header.weather} />
          <span>{weatherText(doc.header.weather)}</span>
          {!compact && (
            <span className="page-header-city">{doc.header.weather.city}</span>
          )}
        </div>
      )}
    </div>
  );
}
