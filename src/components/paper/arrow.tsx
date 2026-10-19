import { useMemo } from "react";
import rough from "roughjs";
import type { PaperObject } from "../../data/model";
import { ARROW_ROUGHNESS, arrowSeedFromKey } from "../../data/arrows";

function arrowStroke(width: number, height: number) {
  return Math.min(0.25, width * 0.25, height * 0.1);
}

/** SVG coordinates are millimetres, so the drawing stays the same at any zoom. */
export function handdrawnArrowGeometry(
  width: number,
  height: number,
  seed: number,
  roughness: number = ARROW_ROUGHNESS.default,
) {
  const generator = rough.generator();
  const stroke = arrowStroke(width, height);
  const edge = stroke / 2;
  const center = width / 2;
  const tip = height - edge;
  const head = Math.min(1.4, height * 0.45);
  const options = {
    seed,
    roughness,
    bowing: 0.8,
    disableMultiStroke: true,
    preserveVertices: true,
    maxRandomnessOffset: Math.min(0.2, width * 0.15, height * 0.05),
    strokeWidth: stroke,
    fill: "none",
  };
  const drawings = [
    generator.line(center, edge, center, tip, options),
    generator.linearPath(
      [
        [edge, tip - head],
        [center, tip],
        [width - edge, tip - head],
      ],
      { ...options, seed: seed === 2 ** 31 - 1 ? 1 : seed + 1 },
    ),
  ];
  // A Bézier curve stays inside its control-point hull. Constrain that hull
  // plus the stroke to the existing object bounds, including narrow arrows.
  for (const drawing of drawings)
    for (const set of drawing.sets)
      for (const op of set.ops)
        op.data = op.data.map((value, index) =>
          Math.max(edge, Math.min((index % 2 ? height : width) - edge, value)),
        );
  return {
    stroke,
    paths: drawings.flatMap((drawing) =>
      generator.toPaths(drawing).map((path) => path.d),
    ),
  };
}

export function ArrowArtwork({ object }: { object: PaperObject }) {
  const handdrawn = object.arrowStyle === "handdrawn";
  const seed = object.arrowSeed ?? arrowSeedFromKey(object.id);
  const geometry = useMemo(
    () =>
      handdrawn
        ? handdrawnArrowGeometry(
            object.width,
            object.height,
            seed,
            object.arrowRoughness,
          )
        : null,
    [handdrawn, object.width, object.height, seed, object.arrowRoughness],
  );
  const head = Math.min(1.4, object.height * 0.45);
  const stroke = arrowStroke(object.width, object.height);
  return (
    <svg
      className="shape-art duration-arrow"
      data-arrow-style={handdrawn ? "handdrawn" : "regular"}
      viewBox={`0 0 ${object.width} ${object.height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {geometry ? (
        geometry.paths.map((d, index) => (
          <path
            key={index}
            d={d}
            stroke={object.fill}
            strokeWidth={geometry.stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ))
      ) : (
        <>
          <path
            d={`M ${object.width / 2} ${stroke / 2} V ${object.height - head}`}
            stroke={object.fill}
            strokeWidth={stroke}
            fill="none"
          />
          <path
            d={`M 0 ${object.height - head} L ${object.width / 2} ${object.height} L ${object.width} ${object.height - head} Z`}
            fill={object.fill}
          />
        </>
      )}
    </svg>
  );
}
