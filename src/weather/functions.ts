import { createServerFn } from "@tanstack/react-start";
import { citySearchSchema, weatherRequestSchema } from "./model";
export const findWeatherCities = createServerFn({ method: "GET" })
  .validator(citySearchSchema)
  .handler(async ({ data }) => {
    const { searchCities } = await import("./weather.server");
    return searchCities(data.query);
  });
export const getCurrentWeather = createServerFn({ method: "GET" })
  .validator(weatherRequestSchema)
  .handler(async ({ data }) => {
    const { currentWeather } = await import("./weather.server");
    return currentWeather(data);
  });
