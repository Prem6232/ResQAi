export type AlertChimeKind = "dispatch" | "offer";

export function playAlertChime(kind: AlertChimeKind): void {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const tones = kind === "offer" ? [880, 1174.66, 880] : [740, 987.77];
    const start = ctx.currentTime;

    tones.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = kind === "offer" ? "triangle" : "sine";
      osc.frequency.setValueAtTime(freq, start + idx * 0.14);

      gain.gain.setValueAtTime(0.001, start + idx * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.12, start + idx * 0.14 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + idx * 0.14 + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start + idx * 0.14);
      osc.stop(start + idx * 0.14 + 0.13);
    });

    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, tones.length * 160 + 100);
  } catch {
    // Ignore audio errors when autoplay is restricted or unsupported
  }
}
