import { useState } from "react";
import { X, Upload, MapPin } from "lucide-react";
import UploadDropzone from "./UploadDropzone";
import { addUpload } from "../lib/storage";

export default function SiteQuickUpload({ site, onClose, onDone }) {
  const [count, setCount] = useState(0);

  const handleParsed = (parsed) => {
    addUpload({
      siteId: site.id,
      reportDate: parsed.reportDate,
      chargerId: parsed.chargerId,
      totalKwh: parsed.totalKwh,
      totalSessions: parsed.totalSessions,
      c1Sessions: parsed.c1Sessions,
      c2Sessions: parsed.c2Sessions,
      sessions: parsed.sessions,
    });
    setCount(c => c + 1);
    onDone?.();
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-brand to-brand-dark px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 text-white min-w-0">
            <Upload className="w-5 h-5 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.2em] opacity-80 font-bold">Quick Upload</p>
              <h3 className="font-bold truncate">{site.name}</h3>
              <p className="text-[11px] opacity-80 flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3" /> {site.city}, {site.country}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 bg-slate-50">
          <UploadDropzone onParsed={handleParsed} theme="light" />
          {count > 0 && (
            <p className="text-center text-xs text-emerald-700 mt-4 font-bold">
              ✓ {count} report{count > 1 ? "s" : ""} saved · close to refresh
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
