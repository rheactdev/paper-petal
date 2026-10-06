import { useEffect, useRef, useState } from "react";
import type { PaperObject } from "../../data/model";
export function Sticker({
  kind,
  color = "#849476",
}: {
  kind: PaperObject["sticker"];
  color?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      style={{ width: "100%", height: "100%", overflow: "visible" }}
    >
      {kind === "flower" ? (
        <g fill={color}>
          <path
            d="M50 36C18-8 7 30 34 47C-8 61 20 85 42 64C39 106 76 102 61 66C102 87 111 49 68 48C96 17 65 0 50 36Z"
            opacity=".8"
          />
          <circle cx="51" cy="52" r="10" fill="#f7edd9" />
        </g>
      ) : kind === "leaf" ? (
        <g stroke={color} fill={color} strokeWidth="2">
          <path d="M48 95Q66 51 45 8" fill="none" />
          <path
            d="M49 78Q4 62 30 48Q55 50 49 78M54 58Q95 46 77 29Q57 30 54 58M48 39Q17 22 33 8Q51 16 48 39"
            opacity=".75"
          />
        </g>
      ) : kind === "star" ? (
        <path
          fill={color}
          d="M50 5L62 34L94 36L70 58L77 91L50 73L23 91L30 58L6 36L38 34Z"
        />
      ) : kind === "heart" ? (
        <path fill={color} d="M50 85C-20 42 10 0 50 30C90 0 120 42 50 85Z" />
      ) : (
        <path
          fill={color}
          opacity=".65"
          d="M4 20L13 14L22 21L31 15L40 20L49 13L58 20L67 16L76 22L85 15L96 20L96 81L87 85L78 80L69 87L60 81L51 86L42 79L33 87L24 82L15 87L4 81Z"
        />
      )}
    </svg>
  );
}
export function ObjectArtwork({
  object,
  assets,
}: {
  object: PaperObject;
  assets: Record<string, string>;
}) {
  const textRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const check = () => setOverflow(el.scrollHeight > el.clientHeight + 1);
    const observer = new ResizeObserver(check);
    observer.observe(el);
    document.fonts.addEventListener("loadingdone", check);
    document.fonts.ready.then(check);
    check();
    return () => {
      observer.disconnect();
      document.fonts.removeEventListener("loadingdone", check);
    };
  }, [
    object.text,
    object.font,
    object.fontSize,
    object.lineHeight,
    object.width,
    object.height,
  ]);
  if (object.type === "text")
    return (
      <>
        <div
          ref={textRef}
          className="object-text"
          data-overflow={overflow}
          style={{
            fontFamily: object.font,
            fontSize: `${object.fontSize}pt`,
            lineHeight: object.lineHeight,
            textAlign: object.textAlign,
            color: object.color,
          }}
        >
          {object.text}
        </div>
        {overflow && (
          <span className="text-overflow-badge" role="status">
            Text overflows this box
          </span>
        )}
      </>
    );
  if (object.type === "image")
    return assets[object.assetId || ""] ? (
      <img
        src={assets[object.assetId || ""]}
        alt={object.label}
        draggable={false}
      />
    ) : (
      <div className="missing-image">Picture unavailable</div>
    );
  if (object.type === "sticker")
    return <Sticker kind={object.sticker} color={object.color} />;
  if (object.shape === "arrow") {
    const head = Math.min(1.4, object.height * 0.45);
    const stroke = Math.min(0.25, object.width * 0.25, object.height * 0.1);
    return (
      <svg
        className="shape-art duration-arrow"
        viewBox={`0 0 ${object.width} ${object.height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
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
      </svg>
    );
  }
  return (
    <div
      className="shape-art"
      style={{
        background: object.fill,
        borderRadius: object.shape === "ellipse" ? "50%" : 0,
        height: object.shape === "line" ? "1mm" : "100%",
        marginTop: object.shape === "line" ? "50%" : 0,
      }}
    />
  );
}
export function TemplateArt({ type }: { type: string }) {
  if (type === "calendar-weekly")
    return (
      <div className="template-art art-calendar-weekly" aria-hidden="true">
        <div className="tiny-weekly-spread">
          {[0, 1].map((page) => (
            <div className="tiny-weekly-page" key={page}>
              <span className="tiny-weekly-month">A little week</span>
              <div className="tiny-weekly-columns">
                {[0, 1, 2, 3].map((column) => (
                  <span key={column}>
                    <i
                      style={{
                        top: `${22 + ((column * 11 + page * 7) % 55)}%`,
                        height: `${16 + (column % 2) * 9}%`,
                      }}
                    />
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  if (type === "calendar" || type === "calendar-spread") {
    const spread = type === "calendar-spread";
    return (
      <div
        className={`template-art art-calendar ${spread ? "art-calendar-spread" : ""}`}
        aria-hidden="true"
      >
        <div className="tiny-calendar-pages">
          {Array.from({ length: spread ? 2 : 1 }, (_, index) => (
            <div className="tiny-paper" key={index}>
              <span className="tiny-date">A MONTH OF LITTLE MOMENTS</span>
              <span className="tiny-title">
                {index === 0 ? "This month" : "A little space"}
              </span>
              <div
                className="tiny-calendar-grid"
                style={{
                  gridTemplateColumns: `repeat(${spread ? 4 : 7}, 1fr)`,
                }}
              >
                {Array.from({ length: (spread ? 4 : 7) * 5 }, (_, cell) => (
                  <i key={cell} />
                ))}
              </div>
              <span className="tiny-calendar-caption">one day at a time</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className={`template-art art-${type}`}>
      <div className="tiny-paper">
        <span className="tiny-date">a little space for you</span>
        <span className="tiny-title">
          {type === "journal"
            ? "Little moments"
            : type === "collage"
              ? "Collected memories"
              : type === "planner"
                ? "A gentle week"
                : ""}
        </span>
        {type === "blank" ? (
          <span className="tiny-plus">+</span>
        ) : type === "collage" ? (
          <>
            <i className="photo-block one" />
            <i className="photo-block two" />
            <span className="tiny-caption">things worth keeping</span>
          </>
        ) : type === "planner" ? (
          <div className="tiny-week">
            {["monday", "tuesday", "wednesday", "thursday"].map((day) => (
              <span key={day}>
                {day}
                <i />
              </span>
            ))}
          </div>
        ) : (
          <div className="tiny-lines">
            <i />
            <i />
            <i />
            <i />
            <span>notice the small things</span>
          </div>
        )}
        <div className="tiny-flower">
          <Sticker
            kind={type === "journal" ? "leaf" : "flower"}
            color={type === "collage" ? "#c3a386" : "#9aaa80"}
          />
        </div>
      </div>
    </div>
  );
}
