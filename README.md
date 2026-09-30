# TempVault

A temporary-file holding area for Windows. Drop files in, they are auto-sorted by
type and date modified, and you decide later whether to delete (Recycle Bin), keep,
or move them.

## Features
- Auto-sorts into `~/TempVault/Sorted/<Type>/<YYYY-MM>/` (Images, Videos, Audio,
  Documents, Spreadsheets, Presentations, Archives, Installers, Code, Fonts, Folders, Other)
- Ways in: the `Inbox` folder (watched while the app is open), Explorer **Send to -> TempVault**,
  dragging files onto the Desktop shortcut, or **Add files...**
- Skips in-progress downloads (`.crdownload`, `.part`, ...) and renames collisions `name (1).ext`
- Filter by type/status, search, sortable columns
- Items older than `stale_days` (default 7, in `~/TempVault/config.json`) shown in red; **Select stale**
- **Delete** sends to the Recycle Bin (undoable); **Keep** moves to `Kept/` (never stale); **Move to...**

## Requirements
Windows + Python 3.9+ (standard library only - tkinter, ctypes).

## Setup
```powershell
powershell -ExecutionPolicy Bypass -File install_shortcuts.ps1
```
Creates Desktop shortcuts (app + Inbox) and a Send To entry. Edit `$py` in the script
if your Python lives elsewhere.

## CLI
```
pythonw tempvault.py                 open the manager
pythonw tempvault.py FILE...         add files, then open the manager
pythonw tempvault.py --add FILE...   add files silently
python  tempvault.py --sort          sort the Inbox once and exit
```
Set `TEMPVAULT_HOME` to use a different vault location.
