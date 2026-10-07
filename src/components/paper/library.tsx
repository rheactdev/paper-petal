import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  Flower2,
  FolderOpen,
  Import,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { newDocument } from "../../data/templates";
import type { WeekStart } from "../../data/calendar";
import {
  listDocuments,
  saveDocument,
  deleteDocument,
  importDocument,
  exportDocument,
} from "../../data/storage";
import type { PaperDocument, EditorMode } from "../../data/model";
import { withEditorMode } from "../../editor/markdown";
import { EditorChoice } from "./editor-choice";
import { TemplateArt } from "./art";
import type { getTemplates } from "../../data/functions";
import { AccountControls } from "./account";
export function Brand({ onNavigate }: { onNavigate?: () => void } = {}) {
  return (
    <Link
      to="/"
      className="paper-brand"
      onClick={
        onNavigate
          ? (e) => {
              e.preventDefault();
              onNavigate();
            }
          : undefined
      }
    >
      <span className="brand-flower">
        <Flower2 size={25} strokeWidth={1.35} />
      </span>
      paper <i>&</i> petal<span className="brand-tm">✦</span>
    </Link>
  );
}
export function Library({
  templates,
}: {
  templates: Awaited<ReturnType<typeof getTemplates>>;
}) {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<PaperDocument[]>([]),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [remove, setRemove] = useState<PaperDocument | null>(null),
    [help, setHelp] = useState(false),
    [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  const [weekStart, setWeekStart] = useState<WeekStart>(1);
  useEffect(() => {
    listDocuments()
      .then(setDocs)
      .catch(() =>
        setError(
          "Local storage is unavailable. Enable browser storage to keep your documents.",
        ),
      )
      .finally(() => setReady(true));
  }, []);
  async function create(template: string, mode?: EditorMode) {
    if (template === "calendar-weekly") {
      await navigate({ to: "/calendar" });
      return;
    }
    if (!mode) {
      setCreating(template);
      return;
    }
    setBusy(true);
    try {
      const doc = withEditorMode(newDocument(template, { weekStart }), mode);
      await saveDocument(doc);
      navigate({
        to: "/documents/$documentId",
        params: { documentId: doc.id },
        search: {
          page: 1,
          view: template === "calendar-spread" ? "spread" : "single",
          zoom: template === "calendar-spread" ? 0.55 : 0.8,
        },
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not create the document.",
      );
      setBusy(false);
    }
  }
  async function importFile(file?: File) {
    if (!file) return;
    try {
      const doc = await importDocument(file);
      navigate({
        to: "/documents/$documentId",
        params: { documentId: doc.id },
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "This backup could not be imported.",
      );
    }
  }
  return (
    <div className="library-shell">
      <header className="library-header">
        <Brand />
        <nav>
          <span className="library-active">Your studio</span>
          <button onClick={() => setHelp(true)}>
            A little guidance <BookOpen size={15} />
          </button>
          <Link to="/calendar">Calendar spreads</Link>
        </nav>
        <div className="library-account-area">
          <span className="device-pill">
            <span /> Saved on this device
          </span>
          <AccountControls />
        </div>
      </header>
      <main className="library-main">
        {error && (
          <div className="notice error" role="alert">
            {error}
            <button aria-label="Dismiss message" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        <section className="welcome">
          <div className="welcome-copy">
            <div className="overline">
              <span /> A LITTLE SPACE TO CREATE
            </div>
            <h1>
              Lovely things
              <br />
              start with a <em>little space.</em>
            </h1>
            <p>
              A journal entry, a memory, a week of small joys.
              <br />
              Make it yours, then bring it to paper.
            </p>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => create("blank")}
            >
              <Plus size={17} /> Create a document <ArrowRight size={17} />
            </button>
            <div className="welcome-foot">
              <ShieldCheck size={14} /> Your words and pictures stay on your
              device.
            </div>
          </div>
          <div className="hero-composition" aria-hidden="true">
            <div className="hero-shadow-page" />
            <div className="hero-note">
              <div className="washi-tape" />
              <span className="hero-date">SUNDAY, OCTOBER 4</span>
              <h2>
                A slower
                <br />
                <em>kind of Sunday.</em>
              </h2>
              <div className="hero-note-lines">
                <p>Tea while it’s still warm.</p>
                <p>A walk with no destination.</p>
                <p>A page for the little things.</p>
              </div>
              <div className="hero-sprig">
                <TemplateArt type="journal" />
              </div>
              <div className="hero-note-bottom">
                find a little lovely in today <span>✧</span>
              </div>
            </div>
            <div className="hero-sticker">
              made
              <br />
              with <em>you</em>
            </div>
            <span className="hero-doodle">✳</span>
          </div>
        </section>
        <section className="templates-section">
          <div className="section-heading">
            <div>
              <h2>Find your starting point</h2>
              <p>
                A blank page or a little inspiration. Everything is yours to
                change.
              </p>
            </div>
            <label className="calendar-week-start">
              Calendar week starts
              <select
                aria-label="Calendar week starts"
                value={weekStart}
                onChange={(event) =>
                  setWeekStart(Number(event.target.value) as WeekStart)
                }
              >
                <option value={1}>Monday</option>
                <option value={0}>Sunday</option>
              </select>
            </label>
          </div>
          <div className="template-grid">
            {templates.map((t) => (
              <button
                className="template-card"
                aria-label={t.name}
                key={t.id}
                onClick={() => create(t.id)}
                disabled={busy}
              >
                <TemplateArt type={t.id} />
                <div className="template-info">
                  <span className="template-tag">{t.tag}</span>
                  <div>
                    <h3>{t.name}</h3>
                    <ArrowUpRight size={17} />
                  </div>
                  <p>{t.description}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
        <section className="documents-section">
          <div className="section-heading">
            <div>
              <h2>
                Your little collection{" "}
                <span className="count-pill">{docs.length}</span>
              </h2>
              <p>Pick up where you left off.</p>
            </div>
            <div className="collection-actions">
              <div className="search-box">
                <Search size={15} />
                <input
                  aria-label="Search documents"
                  placeholder="Find a document…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <button
                className="button secondary"
                onClick={() => upload.current?.click()}
              >
                <Import size={15} /> Import document
              </button>
              <input
                hidden
                ref={upload}
                type="file"
                accept=".petal,application/json"
                onChange={(e) => {
                  importFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
          {!ready ? (
            <div className="collection-empty">Opening your collection…</div>
          ) : !docs.length ? (
            <div className="collection-empty">
              <div className="empty-icon">
                <FolderOpen size={29} strokeWidth={1.3} />
              </div>
              <div>
                <h3>Something lovely belongs here.</h3>
                <p>
                  Create your first document above. We’ll keep it safe right
                  here.
                </p>
              </div>
              <button onClick={() => create("blank")} className="empty-create">
                <Plus size={15} /> Start a fresh page
              </button>
            </div>
          ) : (
            <div className="document-grid">
              {docs
                .filter((d) =>
                  d.title.toLowerCase().includes(query.toLowerCase()),
                )
                .map((doc) => (
                  <article className="document-card" key={doc.id}>
                    <Link
                      to="/documents/$documentId"
                      params={{ documentId: doc.id }}
                    >
                      <div
                        className="document-mini"
                        style={{ background: doc.paper.background }}
                      >
                        <span>{doc.title}</span>
                        {doc.flow.content?.slice(0, 4).map((n, i) => (
                          <p key={i}>
                            {n.content?.map((t) => t.text).join("")}
                          </p>
                        ))}
                      </div>
                      <h3>{doc.title || "Untitled document"}</h3>
                      <p>
                        {doc.pages.length}{" "}
                        {doc.pages.length === 1 ? "page" : "pages"}{" "}
                        <span>·</span>{" "}
                        {new Date(doc.updatedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </Link>
                    <div className="document-actions">
                      <button
                        onClick={() =>
                          exportDocument(doc).catch((e) => setError(e.message))
                        }
                      >
                        Backup
                      </button>
                      <button
                        aria-label={`Delete ${doc.title}`}
                        onClick={() => setRemove(doc)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </article>
                ))}
            </div>
          )}
        </section>
        <div className="library-bottom-note">
          <Flower2 size={16} />
          <span>
            Less fiddling. More creating. A studio that works at your pace.
          </span>
          <button onClick={() => setHelp(true)}>
            Designed with care <ArrowUpRight size={13} />
          </button>
        </div>
      </main>
      <footer className="library-footer">
        <span>
          Paper & Petal <span>—</span> for the things worth keeping.
        </span>
        <span>
          Made for real pages, and real people. <Flower2 size={13} />
        </span>
      </footer>
      {creating && (
        <EditorChoice
          busy={busy}
          onClose={() => {
            if (!busy) setCreating(null);
          }}
          onChoose={(mode) => void create(creating, mode)}
        />
      )}
      {remove && (
        <Dialog title="Let this document go?" onClose={() => setRemove(null)}>
          <p>
            “{remove.title}” and its unused pictures will be removed from this
            device. Download a backup first if you want to keep it.
          </p>
          <div className="dialog-actions">
            <button
              className="button secondary"
              onClick={() => setRemove(null)}
            >
              Keep document
            </button>
            <button
              className="button danger"
              onClick={async () => {
                try {
                  await deleteDocument(remove.id);
                  setDocs(docs.filter((d) => d.id !== remove.id));
                  setRemove(null);
                } catch {
                  setError("The document could not be deleted.");
                  setRemove(null);
                }
              }}
            >
              Delete document
            </button>
          </div>
        </Dialog>
      )}
      {help && (
        <Dialog
          title="A studio that works at your pace."
          onClose={() => setHelp(false)}
        >
          <p>
            Type across pages, add pictures, and arrange a spread using your
            keyboard or mouse. You never need to drag.
          </p>
          <ul className="guidance-list">
            <li>
              <Check size={15} /> Position and resize objects with labelled
              number fields.
            </li>
            <li>
              <Check size={15} /> Use arrow keys to move selected objects by 1
              mm; hold Shift for 10 mm.
            </li>
            <li>
              <Check size={15} /> Your documents autosave here. Download .petal
              backups to move them to another device.
            </li>
            <li>
              <Check size={15} /> Print exact-size pages with a guide for
              double-sided printing.
            </li>
          </ul>
          <p>
            Browser storage can be cleared by your browser. Keep backups of
            pages you love.
          </p>
          <button className="button primary" onClick={() => setHelp(false)}>
            Back to creating
          </button>
        </Dialog>
      )}
    </div>
  );
}
import { useEffect as useDialogEffect, type ReactNode } from "react";
export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useDialogEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => previous?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      className="paper-dialog"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <button
        className="dialog-close"
        aria-label="Close dialog"
        onClick={onClose}
      >
        <X size={19} />
      </button>
      <div className="dialog-flower">
        <Flower2 size={28} strokeWidth={1.3} />
      </div>
      <h2>{title}</h2>
      {children}
    </dialog>
  );
}
