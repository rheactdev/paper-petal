import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link } from "@tanstack/react-router";
import { createClientOnlyFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Flower2,
  Printer,
  Ruler,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import {
  MM,
  objectStyle,
  syncPages,
  objectWarnings,
  type PaperDocument,
} from "../../data/model";
import {
  buildLetterLayout,
  type PageCrop,
  type PrintSettings,
} from "../../data/print-layout";
import { assetURLs, revokeAssets } from "../../data/storage";
import { FlowEditor, FlowPreview, flowHTML } from "./flow";
import { ObjectArtwork } from "./art";
import { Brand } from "./library";
import { AccountControls } from "./account";

const measureCrops = createClientOnlyFn(
  async (root: HTMLElement, doc: PaperDocument) => {
    const { measurePageCrops } = await import("./print-measurement.client");
    return measurePageCrops(root, doc);
  },
);
const settleFrames = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
const mm = (value: number) => value.toFixed(1).replace(/\.0$/, "");

function PageArtwork({
  doc,
  index,
  html,
  assets,
}: {
  doc: PaperDocument;
  index: number;
  html: string;
  assets: Record<string, string>;
}) {
  return (
    <>
      <FlowPreview doc={doc} index={index} html={html} />
      {doc.pages[index].objects.map((object) => (
        <div
          className="paper-object preview-object"
          key={object.id}
          style={objectStyle(object)}
        >
          <ObjectArtwork object={object} assets={assets} />
        </div>
      ))}
    </>
  );
}

function PrintSheet({
  width,
  height,
  children,
  caption,
  className = "",
}: {
  width: number;
  height: number;
  children: ReactNode;
  caption: ReactNode;
  className?: string;
}) {
  return (
    <div
      className="print-page-wrap"
      style={{ width: width * MM * 0.58, height: height * MM * 0.58 }}
    >
      <section
        className={`print-paper ${className}`}
        style={{ width: `${width}mm`, height: `${height}mm` }}
      >
        {children}
      </section>
      <div className="preview-page-label">{caption}</div>
    </div>
  );
}

function Calibration({
  letter,
  index,
  width,
  height,
}: {
  letter: boolean;
  index: number;
  width: number;
  height: number;
}) {
  return (
    <div className="calibration-content">
      <span className="calibration-arrow">↑</span>
      <h2>
        {letter ? "LETTER · ACTUAL SIZE" : index === 0 ? "FRONT" : "BACK"}
      </h2>
      <p className="calibration-top-note">
        {letter ? (
          "Single-sided sticker sheet. Keep scale at 100%."
        ) : (
          <>
            This arrow should point to the top
            <br />
            on both sides of your sheet.
          </>
        )}
      </p>
      <div className="calibration-ruler">
        {Array.from({ length: 11 }, (_, i) => (
          <span key={i} style={{ left: `${i * 10}mm` }}>
            {i * 10}
          </span>
        ))}
      </div>
      <p className="calibration-measure-note">
        Measure the line: it should be exactly 100 mm.
      </p>
      {!letter && (
        <>
          <div className="calibration-cross">+</div>
          <p className="calibration-alignment-note">
            Hold the page up to a light.
            <br />
            The crosses should line up.
          </p>
        </>
      )}
      {letter && (
        <p>
          Two entries on each sheet, in reading order.
          <br />
          Cut around the entries and place them in your journal.
        </p>
      )}
      <small>
        Paper & Petal · {width} × {height} mm
      </small>
    </div>
  );
}

export function PrintPreparation({
  initial,
  settings,
  onSettingsChange,
}: {
  initial: PaperDocument;
  settings: PrintSettings;
  onSettingsChange: (settings: PrintSettings) => void;
}) {
  const [doc, setDoc] = useState(initial);
  const [assets, setAssets] = useState<Record<string, string>>({});
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [layoutReady, setLayoutReady] = useState(false);
  const [ready, setReady] = useState(false);
  const [crops, setCrops] = useState<PageCrop[]>([]);
  const [calibration, setCalibration] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState("");
  const measurement = useRef<HTMLDivElement>(null);
  const printPages = useRef<HTMLDivElement>(null);
  const html = useMemo(() => flowHTML(doc), [doc.flow]);
  const letter = settings.mode === "letter";
  const landscape = doc.paper.width > doc.paper.height;
  const letterLayout = useMemo(
    () => buildLetterLayout(doc.paper, crops, settings.inset),
    [doc.paper.width, doc.paper.height, crops, settings.inset],
  );
  const width = letter ? letterLayout.width : doc.paper.width;
  const height = letter ? letterLayout.height : doc.paper.height;
  const blank = doc.pages.length % 2 === 1;
  const total = calibration
    ? letter
      ? 1
      : 2
    : letter
      ? Math.ceil(doc.pages.length / 2)
      : doc.pages.length + (blank ? 1 : 0);
  const sheets = letter ? total : Math.ceil(total / 2);
  const fits = !letter || calibration || letterLayout.errors.length === 0;
  const warnings = doc.pages.flatMap((page, i) =>
    page.objects.flatMap((o) => objectWarnings(doc, i, o)),
  );

  useEffect(() => {
    let disposed = false,
      urls: Record<string, string> = {};
    assetURLs(initial)
      .then((result) => {
        urls = result;
        if (disposed) revokeAssets(result);
        else {
          setAssets(result);
          setAssetsLoaded(true);
        }
      })
      .catch(() => {
        if (!disposed)
          setError(
            "Pictures could not be loaded. Please return to your document and try again.",
          );
      });
    return () => {
      disposed = true;
      revokeAssets(urls);
    };
  }, [initial]);

  const onLayout = useCallback((layout: { count: number }) => {
    setDoc((previous) => {
      const pages = syncPages(previous.pages, layout.count);
      return pages.length === previous.pages.length
        ? previous
        : { ...previous, pages };
    });
    setLayoutReady(true);
  }, []);

  useEffect(() => {
    let disposed = false;
    setReady(false);
    if (!assetsLoaded || !layoutReady) return;
    async function prepare() {
      try {
        await document.fonts.ready;
        await Promise.all(
          Array.from(measurement.current?.querySelectorAll("img") ?? []).map(
            (image) => image.decode(),
          ),
        );
        await settleFrames();
        if (disposed || !measurement.current) return;
        const result = await measureCrops(measurement.current, doc);
        if (!disposed) {
          setCrops(result);
          setReady(true);
          setError("");
        }
      } catch {
        if (!disposed)
          setError(
            "A picture, font or page could not be prepared. Return to your document and try again.",
          );
      }
    }
    void prepare();
    return () => {
      disposed = true;
    };
  }, [doc, assets, assetsLoaded, layoutReady]);

  async function print() {
    if (!ready || !fits || printing) return;
    setPrinting(true);
    setError("");
    try {
      await document.fonts.ready;
      await Promise.all(
        Array.from(printPages.current?.querySelectorAll("img") ?? []).map(
          (image) => image.decode(),
        ),
      );
      await settleFrames();
      if (measurement.current) {
        const latest = await measureCrops(measurement.current, doc);
        setCrops(latest);
        if (
          letter &&
          !calibration &&
          buildLetterLayout(doc.paper, latest, settings.inset).errors.length
        ) {
          setError(
            "An entry no longer fits at actual size. Check the highlighted pages before printing.",
          );
          return;
        }
        await settleFrames();
      }
      window.print();
    } catch {
      setError(
        "A picture or page could not be prepared for printing. Restore it in the editor and try again.",
      );
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div className={`print-shell ${letter ? "letter-print-mode" : ""}`}>
      <style>{`@page{size:${width}mm ${height}mm;margin:0;}`}</style>
      <header className="library-header print-header">
        <Brand />
        <Link
          to="/documents/$documentId"
          params={{ documentId: doc.id }}
          className="back-library"
        >
          <ArrowLeft size={15} /> Back to my document
        </Link>
        <span className="device-pill">
          <ShieldCheck size={13} /> Stays on your device
        </span>
        <AccountControls />
      </header>
      <div className="print-layout">
        <aside className="print-instructions">
          <div className="overline">FROM SCREEN TO SOMETHING REAL</div>
          <h1>
            Bring it
            <br />
            to <em>paper.</em>
          </h1>
          <p className="print-intro">
            {letter
              ? "Journal entries, ready to cut and stick."
              : "Your little creation, ready to hold."}
          </p>
          <div className="print-document-summary">
            <Flower2 size={21} />
            <div>
              <strong>{doc.title}</strong>
              <span>
                {width} × {height} mm ·{" "}
                {letter
                  ? `${doc.pages.length} entries · `
                  : `${total} sides · `}
                {sheets} {sheets === 1 ? "sheet" : "sheets"}
              </span>
            </div>
          </div>
          <fieldset className="print-output-options" disabled={printing}>
            <legend>Print format</legend>
            <label className={letter ? "" : "selected"}>
              <input
                type="radio"
                name="print-mode"
                value="document"
                checked={!letter}
                onChange={() =>
                  onSettingsChange({ ...settings, mode: "document" })
                }
              />
              <span>
                <strong>Document paper · duplex</strong>
                <small>A5 or your custom page size</small>
              </span>
            </label>
            <label className={letter ? "selected" : ""}>
              <input
                type="radio"
                name="print-mode"
                value="letter"
                checked={letter}
                onChange={() =>
                  onSettingsChange({ ...settings, mode: "letter" })
                }
              />
              <span>
                <strong>Letter · 2 entries per sheet</strong>
                <small>Actual-size entries for sticker paper</small>
              </span>
            </label>
          </fieldset>
          {letter && (
            <div className="letter-options">
              <label className="letter-inset-field" htmlFor="printer-inset">
                Printer inset
                <span>
                  <input
                    id="printer-inset"
                    type="number"
                    min="0"
                    max="25"
                    step="0.5"
                    disabled={printing}
                    value={settings.inset}
                    onChange={(event) => {
                      const value = event.currentTarget.valueAsNumber;
                      if (Number.isFinite(value) && value >= 0 && value <= 25)
                        onSettingsChange({ ...settings, inset: value });
                    }}
                  />{" "}
                  mm
                </span>
              </label>
              <p>
                Leave room for your printer’s unprintable edges. The gap between
                entries is 6 mm.
              </p>
              <label className="letter-background-field">
                <input
                  type="checkbox"
                  disabled={printing}
                  checked={settings.background === "paper"}
                  onChange={(event) =>
                    onSettingsChange({
                      ...settings,
                      background: event.currentTarget.checked
                        ? "paper"
                        : "content",
                    })
                  }
                />
                Include paper colour and pattern
              </label>
              <p>
                Content only is best for clear sticker paper. Text, pictures,
                shapes and stickers keep their colours.
              </p>
            </div>
          )}
          <h3>A few settings to check</h3>
          <ol className="print-checklist">
            <li>
              <span>1</span>
              <div>
                <strong>Match your paper size</strong>
                <p>
                  {letter
                    ? `Choose Letter ${letterLayout.orientation} (8.5 × 11 in).`
                    : doc.paper.width === 148 && doc.paper.height === 210
                      ? "Choose A5 portrait."
                      : doc.paper.width === 210 && doc.paper.height === 148
                        ? "Choose A5 landscape."
                        : `Choose ${doc.paper.width} × ${doc.paper.height} mm paper.`}
                </p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Keep it true to size</strong>
                <p>
                  100% scale / actual size. Turn off “Fit to page” and browser
                  headers and footers. Choose no additional margins.
                </p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>
                  {letter ? "Print on one side" : "Print on both sides"}
                </strong>
                <p>
                  {letter ? (
                    "Choose single-sided printing for adhesive paper. Entries are paired in reading order: 1–2, 3–4."
                  ) : (
                    <>
                      Enable duplex and flip on the{" "}
                      <b>{landscape ? "short" : "long"} edge</b>. The printer
                      dialog controls this setting.
                    </>
                  )}
                </p>
              </div>
            </li>
            <li>
              <span>4</span>
              <div>
                <strong>Keep the lovely details</strong>
                <p>
                  {letter
                    ? "Enable background graphics for coloured shapes and stickers. Paper colour, lines and dots are omitted unless selected above."
                    : "Enable background graphics so paper colours, lines and dots are included."}
                </p>
              </div>
            </li>
          </ol>
          {letter && !calibration && (
            <div className="print-note">
              <Check size={15} />
              <p>
                Blank outer paper is trimmed with 2 mm padding. Your text and
                pictures stay at their original size. Preview outlines and
                labels do not print.
                {blank && " The last sheet has an empty second slot."}
              </p>
            </div>
          )}
          {!letter && !calibration && blank && (
            <div className="print-note">
              <Check size={15} />
              <p>
                A blank reverse side is added at the end so your pages stay
                paired.
              </p>
            </div>
          )}
          {ready &&
            letter &&
            !calibration &&
            letterLayout.errors.length > 0 && (
              <div className="letter-fit-errors" role="alert">
                <strong>These entries need more room</strong>
                <ul>
                  {letterLayout.errors.map((issue) => (
                    <li key={issue.pageIndex}>
                      <Link
                        to="/documents/$documentId"
                        params={{ documentId: doc.id }}
                        search={{
                          page: issue.pageIndex + 1,
                          view: "single",
                          zoom: 0.8,
                        }}
                      >
                        Page {issue.pageIndex + 1}
                      </Link>
                      {" · "}
                      {[
                        issue.excessWidth > 0.01
                          ? `${Math.ceil(issue.excessWidth * 10) / 10} mm too wide`
                          : "",
                        issue.excessHeight > 0.01
                          ? `${Math.ceil(issue.excessHeight * 10) / 10} mm too tall`
                          : "",
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </li>
                  ))}
                </ul>
                <p>
                  Move content inward in the editor, or reduce the printer inset
                  if your printer supports it. Entries are never automatically
                  shrunk.
                </p>
              </div>
            )}
          {warnings.length > 0 && !calibration && (
            <div className="print-note warning">
              <AlertTriangle size={16} />
              <p>
                Some objects overlap the text area or margin guides. This is
                allowed; check each page in the preview.
              </p>
            </div>
          )}
          {error && (
            <div className="notice error" role="alert">
              {error}
            </div>
          )}
          <button
            className="button primary print-main-button"
            disabled={!ready || !fits || printing}
            onClick={print}
          >
            <Printer size={17} />
            {!ready
              ? "Preparing your pages…"
              : !fits
                ? "Entries need more room"
                : printing
                  ? "Opening print dialog…"
                  : calibration
                    ? "Print test sheet"
                    : "Open print dialog"}
            <ArrowRight size={16} />
          </button>
          <button
            className="calibration-button"
            disabled={printing || (!letter && doc.paper.width < 124)}
            title={
              !letter && doc.paper.width < 124
                ? "The 100 mm test ruler needs paper at least 124 mm wide."
                : undefined
            }
            onClick={() => setCalibration(!calibration)}
          >
            <Ruler size={17} />
            {calibration
              ? "Return to document preview"
              : "Try a calibration sheet first"}
          </button>
          <p className="printer-note">
            The printer dialog controls paper size, scale and sidedness. Your
            printer may override these settings. A test sheet helps check actual
            size and printable edges.
          </p>
        </aside>
        <main className="print-preview-area">
          <div className="print-preview-heading">
            <span>{calibration ? "CALIBRATION SHEET" : "PRINT PREVIEW"}</span>
            <span>
              {total}{" "}
              {letter
                ? total === 1
                  ? "sheet"
                  : "sheets"
                : total === 1
                  ? "side"
                  : "sides"}{" "}
              · reading order
            </span>
          </div>
          <div className="print-pages" ref={printPages} aria-busy={!ready}>
            {calibration ? (
              Array.from({ length: letter ? 1 : 2 }, (_, index) => (
                <PrintSheet
                  key={index}
                  width={width}
                  height={height}
                  className="calibration-paper"
                  caption={
                    letter
                      ? "Letter · single-sided test sheet"
                      : `${index === 0 ? "Front" : "Back"} · test sheet`
                  }
                >
                  <Calibration
                    letter={letter}
                    index={index}
                    width={width}
                    height={height}
                  />
                  {letter && (
                    <div
                      className="letter-calibration-inset"
                      style={{ inset: `${settings.inset}mm` }}
                    />
                  )}
                </PrintSheet>
              ))
            ) : letter ? (
              !ready ? (
                <p className="letter-preparing" role="status">
                  Measuring your entries at actual size…
                </p>
              ) : (
                letterLayout.sheets.map((sheet, sheetIndex) => (
                  <PrintSheet
                    key={sheetIndex}
                    width={width}
                    height={height}
                    className="letter-paper"
                    caption={
                      <>
                        <strong>Sheet {sheetIndex + 1}</strong>
                        {sheet.entries.map((entry, i) => (
                          <span key={i}>
                            {entry.crop
                              ? `Page ${entry.crop.pageIndex + 1} · ${entry.crop.empty ? "blank entry" : `${mm(entry.crop.rect.width)} × ${mm(entry.crop.rect.height)} mm`}`
                              : "Empty slot"}
                          </span>
                        ))}
                      </>
                    }
                  >
                    {sheet.entries.map((entry, slotIndex) => {
                      const crop = entry.crop;
                      const overflow =
                        crop &&
                        letterLayout.errors.some(
                          (issue) => issue.pageIndex === crop.pageIndex,
                        );
                      return (
                        <div
                          key={slotIndex}
                          className="letter-slot"
                          style={{
                            left: `${entry.slot.x}mm`,
                            top: `${entry.slot.y}mm`,
                            width: `${entry.slot.width}mm`,
                            height: `${entry.slot.height}mm`,
                          }}
                        >
                          {!crop || crop.empty ? (
                            <span className="letter-empty-label">
                              {crop
                                ? `Page ${crop.pageIndex + 1} · blank entry`
                                : "Empty slot"}
                            </span>
                          ) : (
                            <div
                              className={`letter-crop ${overflow ? "does-not-fit" : ""}`}
                              data-entry-page={crop.pageIndex + 1}
                              style={{
                                left: `${entry.position!.x - entry.slot.x}mm`,
                                top: `${entry.position!.y - entry.slot.y}mm`,
                                width: `${crop.rect.width}mm`,
                                height: `${crop.rect.height}mm`,
                              }}
                            >
                              <div
                                className={`print-source-paper ${settings.background === "paper" ? `pattern-${doc.paper.pattern}` : ""}`}
                                style={{
                                  left: `${-crop.rect.x}mm`,
                                  top: `${-crop.rect.y}mm`,
                                  width: `${doc.paper.width}mm`,
                                  height: `${doc.paper.height}mm`,
                                  backgroundColor:
                                    settings.background === "paper"
                                      ? doc.paper.background
                                      : "transparent",
                                }}
                              >
                                <PageArtwork
                                  doc={doc}
                                  index={crop.pageIndex}
                                  html={html}
                                  assets={assets}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </PrintSheet>
                ))
              )
            ) : (
              [...doc.pages, ...(blank ? [null] : [])].map((page, index) => (
                <PrintSheet
                  key={page?.id ?? "blank"}
                  width={width}
                  height={height}
                  className={
                    page ? `pattern-${doc.paper.pattern}` : "blank-reverse"
                  }
                  caption={
                    page
                      ? `Page ${index + 1} · ${index % 2 === 0 ? "front" : "back"}`
                      : "Blank reverse side"
                  }
                >
                  {page && (
                    <div
                      className={`print-source-paper pattern-${doc.paper.pattern}`}
                      style={{
                        width: "100%",
                        height: "100%",
                        backgroundColor: doc.paper.background,
                      }}
                    >
                      <PageArtwork
                        doc={doc}
                        index={index}
                        html={html}
                        assets={assets}
                      />
                    </div>
                  )}
                </PrintSheet>
              ))
            )}
          </div>
          <div
            className="print-measurement"
            aria-hidden="true"
            inert
            ref={measurement}
          >
            <FlowEditor
              doc={doc}
              index={0}
              onChange={() => {}}
              onLayout={onLayout}
              readonly
            />
            {doc.pages.map((page, index) => (
              <div
                className="print-measure-paper"
                key={page.id}
                data-measure-page={index}
                style={{
                  width: doc.paper.width * MM,
                  height: doc.paper.height * MM,
                }}
              >
                <PageArtwork
                  doc={doc}
                  index={index}
                  html={html}
                  assets={assets}
                />
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
