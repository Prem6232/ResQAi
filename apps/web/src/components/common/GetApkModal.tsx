import { useState } from "react";
import { Download, Smartphone, Check, Copy, ExternalLink, ShieldCheck, RefreshCw, QrCode } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface GetApkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const GITHUB_REPO = "Prem6232/ResQAi";
const LATEST_APK_URL = `https://github.com/${GITHUB_REPO}/releases/latest/download/ResQAi-mobile.apk`;
const RELEASES_PAGE_URL = `https://github.com/${GITHUB_REPO}/releases`;

export function GetApkModal({ open, onOpenChange }: GetApkModalProps) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(LATEST_APK_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback if clipboard API is blocked
    }
  };

  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&data=${encodeURIComponent(LATEST_APK_URL)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        {/* Modal Header */}
        <div className="relative bg-gradient-to-br from-slate-900 via-sky-950 to-blue-900 px-6 pt-6 pb-5 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 text-sky-300 shadow-inner">
              <Smartphone className="h-6 w-6 text-sky-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle>Download ResQAi Mobile</DialogTitle>
                <span className="rounded-full bg-emerald-500/20 border border-emerald-400/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                  Android APK
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-300">
                Install directly on your Android smartphone or tablet
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-xl bg-white/10 px-3 py-1.5 backdrop-blur-sm text-xs text-sky-100 border border-white/10">
            <div className="flex items-center gap-1.5 font-medium">
              <RefreshCw className="h-3.5 w-3.5 text-emerald-400 animate-spin" style={{ animationDuration: "6s" }} />
              <span>CI/CD Continuous Build</span>
            </div>
            <span className="text-[11px] text-sky-200/90 font-mono">v1.0.0-latest</span>
          </div>
        </div>

        {/* Modal Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Main Action Buttons */}
          <div className="space-y-2.5">
            <a
              href={LATEST_APK_URL}
              download="ResQAi-mobile.apk"
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-500 active:scale-[0.99] transition-all px-4 py-3.5 text-sm font-semibold text-white shadow-md shadow-sky-600/20"
            >
              <Download className="h-4 w-4" />
              <span>Download ResQAi APK (Direct)</span>
            </a>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1 text-xs border-slate-200 hover:bg-slate-50 text-slate-700"
                onClick={() => setShowQr(!showQr)}
              >
                <QrCode className="h-3.5 w-3.5 mr-1.5 text-slate-500" />
                {showQr ? "Hide QR Code" : "Scan QR with Phone"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1 text-xs border-slate-200 hover:bg-slate-50 text-slate-700"
                onClick={handleCopyLink}
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />
                    <span className="text-emerald-700 font-medium">Link Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 mr-1.5 text-slate-500" />
                    <span>Copy APK Link</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* QR Code Section (Collapsible) */}
          {showQr && (
            <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4 text-center animate-in fade-in zoom-in-95 duration-200">
              <div className="mx-auto w-36 h-36 bg-white p-2 rounded-xl shadow-sm border border-slate-200">
                <img
                  src={qrImageUrl}
                  alt="ResQAi APK Download QR Code"
                  className="w-full h-full object-contain"
                />
              </div>
              <p className="mt-2 text-xs font-medium text-slate-600">
                Point your phone's camera at the QR code to start the APK download directly
              </p>
            </div>
          )}

          {/* Installation Steps */}
          <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 mb-2.5">
              <ShieldCheck className="h-3.5 w-3.5 text-sky-600" />
              Easy Sideload Instructions (3 Steps)
            </h4>
            <ol className="space-y-2 text-xs text-slate-600">
              <li className="flex items-start gap-2">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[10px] font-bold text-sky-700 mt-0.5">
                  1
                </span>
                <span>Tap <strong>Download</strong> above to save <code className="font-mono text-slate-800 bg-slate-200/70 px-1 py-0.5 rounded">ResQAi-mobile.apk</code> to your device.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[10px] font-bold text-sky-700 mt-0.5">
                  2
                </span>
                <span>Open downloaded file. If Android asks, select <em>"Settings &gt; Allow from this source"</em> to allow sideloading.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[10px] font-bold text-sky-700 mt-0.5">
                  3
                </span>
                <span>Tap <strong>Install</strong>, launch the app, and log in with your demo account password: <code className="font-mono font-bold text-slate-900 bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded">demo1234</code>.</span>
              </li>
            </ol>
          </div>

          {/* Continuous Integration Footer */}
          <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px] text-slate-400">
            <span>Always updated via GitHub CI/CD</span>
            <a
              href={RELEASES_PAGE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-sky-600 hover:text-sky-700 hover:underline"
            >
              <span>All Releases</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
