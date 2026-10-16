"""Flight Plotter v2 — NAV Portugal / GOPLIS
Janela de ambiente de trabalho (pywebview) + backend Python/DuckDB.

Arrancar em desenvolvimento:  python app.py
Gerar .exe (Windows):          build_windows.bat
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import traceback
from pathlib import Path

import webview

from core.db import Database, resource_path
from core.filenames import date_label

APP_NAME = "Flight Plotter"
VERSION = "2.0.0"


def data_dir() -> Path:
    """Pasta onde fica a base de dados: %LOCALAPPDATA%\\FlightPlotter (Windows) ou ~/.flightplotter."""
    override = os.environ.get("FLIGHTPLOTTER_DATA")
    if override:
        p = Path(override)
    elif os.name == "nt":
        p = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "FlightPlotter"
    else:
        p = Path.home() / ".flightplotter"
    p.mkdir(parents=True, exist_ok=True)
    return p


class Api:
    """Métodos chamados a partir do JavaScript via window.pywebview.api.<nome>(...)."""

    def __init__(self):
        self.db = Database(data_dir() / "flightplotter.duckdb")
        self.window: webview.Window | None = None
        self._importing = False
        self._lock = threading.Lock()

    # -------------------------------------------------------------- utilidades
    def _js(self, code: str):
        if self.window:
            try:
                self.window.evaluate_js(code)
            except Exception:  # noqa: BLE001
                pass

    def _safe(self, fn, *a, **kw):
        try:
            with self._lock:
                return {"ok": True, "data": fn(*a, **kw)}
        except Exception as e:  # noqa: BLE001
            traceback.print_exc()
            return {"ok": False, "error": str(e)}

    # ------------------------------------------------------------------ estado
    def get_state(self):
        def f():
            s = self.db.summary()
            s["version"] = VERSION
            s["importing"] = self._importing
            return s
        return self._safe(f)

    def get_filters(self):
        def f():
            r = self.db.filters()
            for d in r["dates"]:
                d["label"] = date_label(d["date"])
            return r
        return self._safe(f)

    def get_points(self):
        def f():
            pts = json.loads(resource_path("data", "aip_points.json").read_text(encoding="utf-8"))
            grp = json.loads(resource_path("data", "point_groups.json").read_text(encoding="utf-8"))
            return {"points": pts, "groups": grp}
        return self._safe(f)

    # -------------------------------------------------------------- importação
    def choose_folder(self):
        try:
            res = self.window.create_file_dialog(webview.FOLDER_DIALOG)
            if res:
                return {"ok": True, "data": res[0] if isinstance(res, (list, tuple)) else res}
            return {"ok": True, "data": None}
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "error": str(e)}

    def import_folder(self, folder: str | None = None):
        """Arranca a importação em thread; o progresso chega ao JS por onImportProgress/onImportDone."""
        if self._importing:
            return {"ok": False, "error": "Já está uma importação a decorrer."}
        if not folder:
            folder = self.db.summary().get("last_folder")
        if not folder or not os.path.isdir(folder):
            return {"ok": False, "error": "Pasta inválida."}
        self._importing = True

        def progress(done, total, name):
            self._js(f"onImportProgress({done},{total},{json.dumps(name)})")

        def run():
            try:
                with self._lock:
                    res = self.db.import_folder(folder, progress)
                self._js(f"onImportDone({json.dumps({'ok': True, 'data': res})})")
            except Exception as e:  # noqa: BLE001
                traceback.print_exc()
                self._js(f"onImportDone({json.dumps({'ok': False, 'error': str(e)})})")
            finally:
                self._importing = False

        threading.Thread(target=run, daemon=True).start()
        return {"ok": True, "data": folder}

    def remove_missing(self):
        return self._safe(self.db.remove_missing)

    def import_nmir(self):
        try:
            res = self.window.create_file_dialog(webview.OPEN_DIALOG, allow_multiple=False,
                                                 file_types=("Excel NMIR (*.xlsx)", "Todos (*.*)"))
            if not res:
                return {"ok": True, "data": None}
            path = res[0] if isinstance(res, (list, tuple)) else res
            return self._safe(self.db.import_nmir_xlsx, path)
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "error": str(e)}

    # ---------------------------------------------------------------- consultas
    def get_flights(self, airport, dates, blocks, csn="", cls=""):
        return self._safe(self.db.flights_list, airport, dates, blocks, csn or "", cls or "")

    def get_tracks(self, flight_ids, max_points=400000):
        return self._safe(self.db.tracks, flight_ids, int(max_points))

    def get_flight(self, flight_id):
        return self._safe(self.db.flight_points, int(flight_id))

    def get_stats(self, airport, dates, blocks):
        return self._safe(self.db.stats, airport, dates, blocks)

    def export_flights_csv(self, airport, dates, blocks, csn="", cls=""):
        try:
            res = self.window.create_file_dialog(webview.SAVE_DIALOG, save_filename="movimentos.csv",
                                                 file_types=("CSV (*.csv)",))
            if not res:
                return {"ok": True, "data": None}
            path = res[0] if isinstance(res, (list, tuple)) else res
            rows = self.db.flights_list(airport, dates, blocks, csn or "", cls or "")
            import csv
            with open(path, "w", newline="", encoding="utf-8-sig") as fh:
                w = csv.writer(fh, delimiter=";")
                w.writerow(["Data", "Aeroporto", "Callsign", "Tipo", "WTC", "Classe", "Início", "Fim",
                            "Alt início", "Alt fim", "Alt mín", "Alt máx", "Plots", "Blocos", "Mode S"])
                for r in rows:
                    w.writerow([date_label(r["date"]), r["airport"], r["csn"], r["actype"] or "", r["wtc"] or "",
                                r["cls"].upper(), r["tod_first"], r["tod_last"], r["alt_first"], r["alt_last"],
                                r["alt_min"], r["alt_max"], r["n"], r["blocks"], r["modes"] or ""])
            return {"ok": True, "data": path}
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "error": str(e)}

    def open_data_folder(self):
        p = str(data_dir())
        try:
            if os.name == "nt":
                os.startfile(p)  # type: ignore[attr-defined]
            elif sys.platform == "darwin":
                subprocess.Popen(["open", p])
            else:
                subprocess.Popen(["xdg-open", p])
            return {"ok": True, "data": p}
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "error": str(e)}


def main():
    api = Api()
    html = resource_path("ui", "index.html")
    window = webview.create_window(f"{APP_NAME} {VERSION} — NAV Portugal", str(html), js_api=api,
                                   width=1500, height=940, min_size=(1100, 700), background_color="#0b1220")
    api.window = window
    webview.start(debug="--debug" in sys.argv)


if __name__ == "__main__":
    main()
