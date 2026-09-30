"""TempVault - a temporary-file holding area for Windows.

Drop files into the Inbox (or use Send To / drag onto the shortcut) and they are
auto-sorted into  Sorted/<Category>/<YYYY-MM>/ by type and date modified.
Review them in the GUI and Delete (to Recycle Bin), Keep, or Move them.

Usage:
    pythonw tempvault.py                  open the manager
    pythonw tempvault.py FILE [FILE...]   add files, then open the manager
    pythonw tempvault.py --add FILE...    add files silently (Send To)
    python  tempvault.py --sort           sort the Inbox once and exit
"""
import ctypes
import json
import os
import shutil
import subprocess
import sys
import time
from ctypes import wintypes
from datetime import datetime
from pathlib import Path

ROOT = Path(os.environ.get("TEMPVAULT_HOME", str(Path.home() / "TempVault")))
INBOX = ROOT / "Inbox"
SORTED = ROOT / "Sorted"
KEPT = ROOT / "Kept"
MARKER = ROOT / ".changed"
CONFIG = ROOT / "config.json"

CATEGORIES = {
    "Images": ".jpg .jpeg .png .gif .bmp .webp .svg .ico .tif .tiff .heic .raw .psd",
    "Videos": ".mp4 .mkv .avi .mov .wmv .flv .webm .m4v .3gp",
    "Audio": ".mp3 .wav .flac .aac .ogg .m4a .wma .opus",
    "Documents": ".pdf .doc .docx .odt .rtf .txt .md .epub",
    "Spreadsheets": ".xls .xlsx .ods .csv .tsv",
    "Presentations": ".ppt .pptx .odp .key",
    "Archives": ".zip .rar .7z .tar .gz .bz2 .xz .iso",
    "Installers": ".exe .msi .msix .appx .apk .bat .cmd",
    "Code": ".py .js .ts .tsx .jsx .html .css .json .xml .yml .yaml .java .c .cpp .h .cs .go .rs .sh .ps1 .sql .ipynb",
    "Fonts": ".ttf .otf .woff .woff2",
}
EXT_MAP = {e: cat for cat, exts in CATEGORIES.items() for e in exts.split()}
ALL_CATEGORIES = sorted(CATEGORIES) + ["Folders", "Other"]
PARTIAL_EXTS = {".crdownload", ".part", ".partial", ".tmp", ".download"}


# ---------------------------------------------------------------- core logic
def ensure_dirs():
    for d in (INBOX, SORTED, KEPT):
        d.mkdir(parents=True, exist_ok=True)


def load_config():
    cfg = {"stale_days": 7}
    try:
        cfg.update(json.loads(CONFIG.read_text(encoding="utf-8")))
    except (OSError, ValueError):
        CONFIG.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    return cfg


def category_for(p: Path) -> str:
    if p.is_dir():
        return "Folders"
    return EXT_MAP.get(p.suffix.lower(), "Other")


def unique_dest(dest: Path) -> Path:
    if not dest.exists():
        return dest
    i = 1
    while True:
        cand = dest.with_name(f"{dest.stem} ({i}){dest.suffix}")
        if not cand.exists():
            return cand
        i += 1


def sorted_dest(src: Path, base: Path = SORTED) -> Path:
    month = datetime.fromtimestamp(src.stat().st_mtime).strftime("%Y-%m")
    return unique_dest(base / category_for(src) / month / src.name)


def touch_marker():
    try:
        MARKER.write_text(str(time.time()), encoding="utf-8")
    except OSError:
        pass


def _inside_vault(p: Path) -> bool:
    try:
        p.resolve().relative_to(ROOT.resolve())
        return True
    except ValueError:
        return False


def add_items(paths):
    """Move arbitrary files/folders into the vault, sorted. Returns count moved."""
    ensure_dirs()
    moved = 0
    for raw in paths:
        src = Path(raw)
        if not src.exists():
            continue
        if _inside_vault(src) and src.parent != INBOX:
            continue  # already sorted, or it is the vault itself
        try:
            dest = sorted_dest(src)
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(src), str(dest))
            moved += 1
        except OSError:
            pass  # locked / in use - leave it where it is
    if moved:
        touch_marker()
    return moved


def sort_inbox():
    """Sort everything sitting in the Inbox. Skips in-progress downloads."""
    ensure_dirs()
    ready = []
    now = time.time()
    for item in INBOX.iterdir():
        if item.suffix.lower() in PARTIAL_EXTS:
            continue
        try:
            if now - item.stat().st_mtime < 2:  # probably still being written
                continue
        except OSError:
            continue
        ready.append(item)
    return add_items(ready)


def item_size(p: Path) -> int:
    if p.is_file():
        return p.stat().st_size
    total = 0
    for dirpath, _, files in os.walk(p):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(dirpath, f))
            except OSError:
                pass
    return total


def scan():
    """Return every item in Sorted/ and Kept/ (layout: base/Category/YYYY-MM/item)."""
    ensure_dirs()
    entries = []
    for base, status in ((SORTED, "Temporary"), (KEPT, "Kept")):
        for cat_dir in base.iterdir():
            if not cat_dir.is_dir():
                continue
            for month_dir in cat_dir.iterdir():
                if not month_dir.is_dir():
                    continue
                for item in month_dir.iterdir():
                    try:
                        st = item.stat()
                        entries.append({
                            "path": item, "name": item.name, "category": cat_dir.name,
                            "mtime": st.st_mtime, "size": item_size(item), "status": status,
                        })
                    except OSError:
                        pass
    return entries


def prune_empty(*bases):
    for base in bases:
        for dirpath, _, _ in sorted(os.walk(base), key=lambda t: -len(t[0])):
            if Path(dirpath) != base:
                try:
                    os.rmdir(dirpath)  # only succeeds when empty
                except OSError:
                    pass


class _SHFILEOPSTRUCTW(ctypes.Structure):
    _fields_ = [
        ("hwnd", wintypes.HWND), ("wFunc", wintypes.UINT),
        ("pFrom", wintypes.LPCWSTR), ("pTo", wintypes.LPCWSTR),
        ("fFlags", ctypes.c_uint16), ("fAnyOperationsAborted", wintypes.BOOL),
        ("hNameMappings", ctypes.c_void_p), ("lpszProgressTitle", wintypes.LPCWSTR),
    ]


def recycle(paths) -> bool:
    """Send paths to the Recycle Bin (undoable). Returns True on success."""
    if not paths:
        return True
    FO_DELETE, FOF_SILENT, FOF_NOCONFIRMATION, FOF_ALLOWUNDO, FOF_NOERRORUI = 3, 0x4, 0x10, 0x40, 0x400
    op = _SHFILEOPSTRUCTW()
    op.wFunc = FO_DELETE
    # double-NUL-terminated list; ctypes appends the final NUL
    op.pFrom = "\0".join(str(Path(p).resolve()) for p in paths) + "\0"
    op.fFlags = FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT | FOF_NOERRORUI
    rc = ctypes.windll.shell32.SHFileOperationW(ctypes.byref(op))
    return rc == 0 and not op.fAnyOperationsAborted


def human_size(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"


# ---------------------------------------------------------------------- GUI
def run_gui():
    import tkinter as tk
    from tkinter import filedialog, messagebox, ttk

    cfg = load_config()
    stale_secs = cfg["stale_days"] * 86400

    root = tk.Tk()
    root.title(f"TempVault  -  {ROOT}")
    root.geometry("1100x640")
    root.minsize(800, 400)

    state = {"entries": [], "sort": "mtime", "rev": True, "sig": None}

    # --- filters
    top = ttk.Frame(root, padding=(8, 8, 8, 4))
    top.pack(fill="x")
    cat_var, status_var, search_var = tk.StringVar(value="All"), tk.StringVar(value="All"), tk.StringVar()
    ttk.Label(top, text="Type").pack(side="left")
    cat_box = ttk.Combobox(top, textvariable=cat_var, state="readonly", width=14, values=["All"] + ALL_CATEGORIES)
    cat_box.pack(side="left", padx=(4, 12))
    ttk.Label(top, text="Show").pack(side="left")
    st_box = ttk.Combobox(top, textvariable=status_var, state="readonly", width=16,
                          values=["All", "Temporary", "Kept", f"Stale (>{cfg['stale_days']} days)"])
    st_box.pack(side="left", padx=(4, 12))
    ttk.Label(top, text="Search").pack(side="left")
    search = ttk.Entry(top, textvariable=search_var, width=28)
    search.pack(side="left", padx=4)
    ttk.Button(top, text="Open Inbox folder", command=lambda: os.startfile(INBOX)).pack(side="right")
    ttk.Button(top, text="Add files...", command=lambda: do_add()).pack(side="right", padx=4)

    # --- table
    mid = ttk.Frame(root, padding=(8, 0))
    mid.pack(fill="both", expand=True)
    cols = [("name", "Name", 380), ("category", "Type", 110), ("mtime", "Date modified", 150),
            ("size", "Size", 90), ("age", "Age", 80), ("status", "Status", 90)]
    tree = ttk.Treeview(mid, columns=[c[0] for c in cols], show="headings", selectmode="extended")
    for key, label, width in cols:
        tree.heading(key, text=label, command=lambda k=key: set_sort(k))
        tree.column(key, width=width, anchor="w" if key in ("name", "category") else "center")
    vsb = ttk.Scrollbar(mid, orient="vertical", command=tree.yview)
    tree.configure(yscrollcommand=vsb.set)
    tree.pack(side="left", fill="both", expand=True)
    vsb.pack(side="right", fill="y")
    tree.tag_configure("stale", foreground="#c0392b")
    tree.tag_configure("kept", foreground="#1e8449")

    # --- actions
    bot = ttk.Frame(root, padding=8)
    bot.pack(fill="x")
    status_lbl = ttk.Label(root, padding=(8, 0, 8, 6), anchor="w")
    status_lbl.pack(fill="x")

    def selected():
        return [Path(i) for i in tree.selection()]

    def visible():
        now = time.time()
        q = search_var.get().strip().lower()
        out = []
        for e in state["entries"]:
            stale = e["status"] == "Temporary" and now - e["mtime"] > stale_secs
            if cat_var.get() != "All" and e["category"] != cat_var.get():
                continue
            sv = status_var.get()
            if sv.startswith("Stale") and not stale:
                continue
            if sv in ("Temporary", "Kept") and e["status"] != sv:
                continue
            if q and q not in e["name"].lower():
                continue
            out.append((e, stale))
        keyf = {"name": lambda t: t[0]["name"].lower(), "age": lambda t: -t[0]["mtime"]}.get(
            state["sort"], lambda t: t[0][state["sort"]])
        out.sort(key=keyf, reverse=state["rev"])
        return out

    def render():
        sel = set(tree.selection())
        tree.delete(*tree.get_children())
        now = time.time()
        rows = visible()
        for e, stale in rows:
            days = int((now - e["mtime"]) // 86400)
            tag = ("stale",) if stale else (("kept",) if e["status"] == "Kept" else ())
            iid = str(e["path"])
            tree.insert("", "end", iid=iid, tags=tag, values=(
                e["name"], e["category"], datetime.fromtimestamp(e["mtime"]).strftime("%Y-%m-%d %H:%M"),
                human_size(e["size"]), f"{days} d", e["status"]))
            if iid in sel:
                tree.selection_add(iid)
        total = sum(e["size"] for e in state["entries"])
        n_stale = sum(1 for e in state["entries"] if e["status"] == "Temporary" and now - e["mtime"] > stale_secs)
        status_lbl.config(text=f"{len(rows)} shown  |  {len(state['entries'])} in vault ({human_size(total)})"
                               f"  |  {n_stale} stale  |  {len(tree.selection())} selected")

    def refresh():
        state["entries"] = scan()
        render()

    def set_sort(k):
        state["rev"] = not state["rev"] if state["sort"] == k else k in ("mtime", "size")
        state["sort"] = k
        render()

    def move_many(pairs):
        failed = []
        for src, dst in pairs:
            try:
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(src), str(unique_dest(dst)))
            except OSError:
                failed.append(src.name)
        prune_empty(SORTED, KEPT)
        refresh()
        if failed:
            messagebox.showwarning("TempVault", "Could not move (in use?):\n" + "\n".join(failed[:15]))

    def do_keep():
        move_many([(p, KEPT / p.relative_to(SORTED)) for p in selected() if SORTED in p.parents])

    def do_unkeep():
        move_many([(p, SORTED / p.relative_to(KEPT)) for p in selected() if KEPT in p.parents])

    def do_move_to():
        sel = selected()
        if not sel:
            return
        dest = filedialog.askdirectory(title=f"Move {len(sel)} item(s) to...")
        if dest:
            move_many([(p, Path(dest) / p.name) for p in sel])

    def do_delete():
        sel = selected()
        if not sel:
            return
        if not messagebox.askyesno("TempVault", f"Send {len(sel)} item(s) to the Recycle Bin?"):
            return
        ok = recycle(sel)
        prune_empty(SORTED, KEPT)
        refresh()
        if not ok:
            messagebox.showwarning("TempVault", "Some items could not be deleted (in use?).")

    def do_open(_=None):
        for p in selected()[:10]:
            os.startfile(p)

    def do_reveal():
        sel = selected()
        if sel:
            subprocess.Popen(f'explorer /select,"{sel[0]}"')

    def select_stale():
        tree.selection_set([str(e["path"]) for e, stale in visible() if stale])

    def do_add():
        files = filedialog.askopenfilenames(title="Add files to TempVault")
        if files:
            add_items(files)
            refresh()

    for text, cmd in (("Open", do_open), ("Show in Explorer", do_reveal), ("Keep", do_keep),
                      ("Un-keep", do_unkeep), ("Move to...", do_move_to), ("Select stale", select_stale)):
        ttk.Button(bot, text=text, command=cmd).pack(side="left", padx=(0, 6))
    ttk.Button(bot, text="Delete (Recycle Bin)", command=do_delete).pack(side="right")
    ttk.Button(bot, text="Refresh", command=refresh).pack(side="right", padx=6)

    tree.bind("<Double-1>", do_open)
    tree.bind("<Delete>", lambda _: do_delete())
    tree.bind("<Control-a>", lambda _: (tree.selection_set(tree.get_children()), "break")[1])
    tree.bind("<<TreeviewSelect>>", lambda _: render_status())
    for w in (cat_box, st_box):
        w.bind("<<ComboboxSelected>>", lambda _: render())
    search_var.trace_add("write", lambda *_: render())

    def render_status():
        txt = status_lbl.cget("text").rsplit("|", 1)[0]
        status_lbl.config(text=f"{txt}|  {len(tree.selection())} selected")

    def marker_sig():
        try:
            return MARKER.stat().st_mtime
        except OSError:
            return None

    def tick():
        moved = sort_inbox()
        sig = marker_sig()
        if moved or sig != state["sig"]:
            state["sig"] = sig
            refresh()
        root.after(3000, tick)

    state["sig"] = marker_sig()
    sort_inbox()
    refresh()
    root.after(3000, tick)
    root.mainloop()


def main(argv):
    ensure_dirs()
    if argv[:1] == ["--sort"]:
        print(f"sorted {sort_inbox()} item(s)")
        return
    if argv[:1] == ["--add"]:
        add_items(argv[1:])
        return
    if argv:
        add_items(argv)  # files dragged onto the shortcut
    run_gui()


if __name__ == "__main__":
    main(sys.argv[1:])
