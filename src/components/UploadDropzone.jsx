import { useRef, useState } from "react";
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { parseChargerXlsx } from "../lib/parseXLSX";

export default function UploadDropzone({ onParsed, theme = "dark" }) {
  const inputRef = useRef();
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(0);
  const [done, setDone] = useState([]);
  const [errors, setErrors] = useState([]);

  const handleFiles = async (files) => {
    if (!files.length) return;
    setErrors([]);
    setParsing(files.length);
    const ok = [];
    const errs = [];
    for (const f of files) {
      try {
        const r = await parseChargerXlsx(f);
        onParsed?.(r, f);
        ok.push({ filename: f.name, ...r });
      } catch (e) {
        errs.push(`${f.name}: ${e.message}`);
      }
      setParsing(p => p - 1);
    }
    setDone(d => [...d, ...ok]);
    setErrors(errs);
  };

  // Theme styles
  const dark = theme === "dark";
  const dropzoneBase = dark
    ? `bg-slate-950 border-slate-700 hover:bg-slate-900/70 hover:border-slate-600`
    : `bg-slate-50 border-slate-300 hover:bg-slate-100`;
  const dropzoneActive = dark
    ? `bg-brand/10 border-brand`
    : `bg-brand-light border-brand`;
  const titleText = dark ? "text-slate-200" : "text-slate-700";
  const hintText  = dark ? "text-slate-500" : "text-slate-500";
  const errorBox  = dark ? "bg-red-500/10 border-red-500/30 text-red-300" : "bg-red-50 border-red-200 text-red-700";
  const successBox = dark ? "bg-emerald-500/10 border-emerald-500/30" : "bg-emerald-50 border-emerald-200";
  const successText = dark ? "text-emerald-300" : "text-emerald-700";
  const filenameText = dark ? "text-slate-400" : "text-slate-600";
  const successLabel = dark ? "text-emerald-400" : "text-emerald-700";

  return (
    <div>
      <div
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
          dragOver ? dropzoneActive : dropzoneBase
        }`}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles([...e.dataTransfer.files]); }}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          multiple
          className="hidden"
          onChange={e => handleFiles([...e.target.files])}
        />
        <div className="flex flex-col items-center gap-2">
          {parsing > 0 ? (
            <>
              <Loader2 className="w-10 h-10 text-brand animate-spin" />
              <p className={`font-bold ${titleText}`}>Parsing {parsing} file{parsing > 1 ? "s" : ""}…</p>
            </>
          ) : (
            <>
              <UploadCloud className="w-10 h-10 text-brand" />
              <p className={`font-bold ${titleText}`}>Drop xlsx files here, or click to browse</p>
              <p className={`text-xs ${hintText}`}>
                Multiple files supported · Each file = one day's data ·
                Existing dates will be overwritten
              </p>
            </>
          )}
        </div>
      </div>

      {errors.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {errors.map((e, i) => (
            <div key={i} className={`flex items-start gap-2 text-sm border rounded-lg p-3 ${errorBox}`}>
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{e}</span>
            </div>
          ))}
        </div>
      )}

      {done.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className={`text-[10px] uppercase tracking-wider font-bold ${successLabel}`}>
            Saved · {done.length} file{done.length > 1 ? "s" : ""}
          </p>
          {done.map((r, i) => (
            <div key={i} className={`flex items-center justify-between border rounded-lg p-3 text-sm ${successBox}`}>
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className={`w-4 h-4 flex-shrink-0 ${dark ? "text-emerald-400" : "text-emerald-600"}`} />
                <FileSpreadsheet className={`w-4 h-4 flex-shrink-0 ${dark ? "text-slate-400" : "text-slate-500"}`} />
                <span className={`font-mono text-xs truncate ${filenameText}`}>{r.filename}</span>
              </div>
              <div className="text-xs flex-shrink-0">
                <span className={`font-bold ${dark ? "text-white" : "text-slate-800"}`}>{r.reportDate}</span>
                <span className={`mx-2 ${dark ? "text-slate-600" : "text-slate-300"}`}>·</span>
                <span className={`font-bold ${successText}`}>{r.totalSessions} sess</span>
                <span className={`mx-1 ${dark ? "text-slate-600" : "text-slate-400"}`}>·</span>
                <span className={`font-bold ${successText}`}>{r.totalKwh.toFixed(1)} kWh</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
