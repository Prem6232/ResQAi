from __future__ import annotations

import argparse
import json
import os
import subprocess
from pathlib import Path
from typing import Dict, List, Tuple

DEFAULT_ML_DIR = Path(__file__).resolve().parents[2]
os.environ.setdefault("HF_HOME", str(DEFAULT_ML_DIR / ".hf_cache"))
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

from datasets import Audio, load_dataset  # noqa: E402


# Emergency voice memo scenarios spanning all 7 ResQAI categories + Bhopal/Indian context
EMERGENCY_VOICE_MEMOS: List[Tuple[str, str, str, str]] = [
    ("memo_fire_01.wav", "fire_smoke", "critical", "Urgent emergency near MP Nagar Zone 1. Thick black smoke and flames are coming out of the corner transformer shop."),
    ("memo_fire_02.wav", "fire_smoke", "critical", "Gas cylinder caught fire inside the hostel canteen kitchen at Arera Colony, heavy smoke everywhere."),
    ("memo_fire_03.wav", "fire_smoke", "high", "Dry grass and garbage burning rapidly close to parked two wheelers behind New Market."),
    ("memo_accident_01.wav", "road_accident", "critical", "Head on collision between a city bus and motorcycle at Habibganj crossing, the rider is bleeding on the road."),
    ("memo_accident_02.wav", "road_accident", "high", "An auto rickshaw overturned near Kolar Road turn blocking traffic, two passengers are injured."),
    ("memo_accident_03.wav", "road_accident", "medium", "Minor fender bender between two cars near TT Nagar signal causing a slow traffic queue."),
    ("memo_medical_01.wav", "medical", "critical", "An elderly passenger collapsed with severe chest pain outside Rani Kamalapati station gate, send ambulance immediately."),
    ("memo_medical_02.wav", "medical", "critical", "A student suddenly fell unconscious with seizures outside the MANIT library, urgent medical help needed."),
    ("memo_medical_03.wav", "medical", "high", "Student suffered a deep glass cut in the lab with continuous bleeding, first aid and ambulance required."),
    ("memo_safety_01.wav", "personal_safety", "critical", "SOS please help, two unknown men on a motorcycle are stalking and chasing me near Bairagarh dark alley."),
    ("memo_safety_02.wav", "personal_safety", "high", "Aggressive drunk individuals harassing commuters outside the girls hostel gate near Shahpura."),
    ("memo_safety_03.wav", "personal_safety", "critical", "Armed muggers threatening people outside the ATM booth near Indrapuri, dispatch police urgently."),
    ("memo_flood_01.wav", "water_flood", "critical", "Flash monsoon flooding submerged Habibganj railway underpass up to car windows, passengers are trapped inside."),
    ("memo_flood_02.wav", "water_flood", "high", "A major municipal water pipe burst is flooding the entire hospital road near Bhopal Talkies."),
    ("memo_flood_03.wav", "water_flood", "medium", "Rainwater pooling along the service lane near Bittan Market due to clogged drains."),
    ("memo_hazard_01.wav", "hazard", "critical", "A live high voltage power cable snapped and fell sparking into rainwater puddle on Raisen Road."),
    ("memo_hazard_02.wav", "hazard", "high", "There is a deep uncovered open manhole without any barricade on the middle lane near Misrod."),
    ("memo_hazard_03.wav", "hazard", "high", "A large neem tree fell across the main road blocking both lanes near Ashoka Garden."),
    ("memo_other_01.wav", "other", "low", "False alarm, triggered the emergency button by mistake while unlocking my phone, everything is safe here."),
    ("memo_other_02.wav", "other", "low", "Just testing the ResQAI emergency app microphone and alert latency, ignore this test message."),
    ("memo_other_03.wav", "other", "low", "Hostel Wi-Fi router has been down since morning, please share the IT support desk timing."),
]


def synthesize_emergency_wavs(out_dir: Path) -> List[Dict]:
    out_dir.mkdir(parents=True, exist_ok=True)
    ps_lines = [
        "Add-Type -AssemblyName System.Speech",
        "$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer",
        "$synth.Rate = -1",
    ]
    rows: List[Dict] = []
    for fname, cat, urg, text in EMERGENCY_VOICE_MEMOS:
        wav_path = out_dir / fname
        escaped_path = str(wav_path).replace("'", "''")
        escaped_text = text.replace("'", "''")
        ps_lines.append(f"$synth.SetOutputToWaveFile('{escaped_path}')")
        ps_lines.append(f"$synth.Speak('{escaped_text}')")
        rows.append(
            {
                "id": fname.replace(".wav", ""),
                "audio_path": str(wav_path),
                "reference_text": text,
                "language": "en",
                "category": cat,
                "urgency": urg,
                "slice": "emergency_voice_memo",
            }
        )
    ps_lines.append("$synth.SetOutputToNull()")
    ps_lines.append("$synth.Dispose()")

    script_path = out_dir / "_synth.ps1"
    script_path.write_text("\n".join(ps_lines), encoding="utf-8")
    subprocess.run(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(script_path)],
        check=True,
    )
    script_path.unlink(missing_ok=True)
    return rows


def download_kathbath_hindi(out_dir: Path, count: int) -> List[Dict]:
    out_dir.mkdir(parents=True, exist_ok=True)
    ds = load_dataset("Trelis/vistaar-hi-kathbath-test", split="test", streaming=True)
    ds = ds.cast_column("audio", Audio(decode=False))

    rows: List[Dict] = []
    for idx, item in enumerate(ds):
        if idx >= count:
            break
        audio_info = item["audio"]
        raw_bytes = audio_info.get("bytes")
        src_name = Path(audio_info.get("path") or f"kathbath_{idx:03d}.wav").name
        if not raw_bytes:
            continue
        dest_path = out_dir / f"hi_{idx:03d}_{src_name}"
        dest_path.write_bytes(raw_bytes)
        rows.append(
            {
                "id": f"kathbath_hi_{idx:03d}",
                "audio_path": str(dest_path),
                "reference_text": str(item["text"]).strip(),
                "language": "hi",
                "category": None,
                "urgency": None,
                "slice": "indian_hindi_kathbath",
            }
        )
    return rows


def main() -> None:
    base_dir = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description="Build Indian ASR & Voice->Classifier benchmark")
    parser.add_argument("--hindi-count", type=int, default=30)
    args = parser.parse_args()

    print("1. Generating emergency voice memo WAV files via local offline TTS...")
    memo_rows = synthesize_emergency_wavs(base_dir / "raw" / "emergency_memos")
    print(f"   Generated {len(memo_rows)} emergency voice memos.")

    print(f"2. Streaming {args.hindi_count} real Indian Hindi clips from Trelis/vistaar-hi-kathbath-test...")
    hindi_rows = download_kathbath_hindi(base_dir / "raw" / "kathbath_hi", count=args.hindi_count)
    print(f"   Saved {len(hindi_rows)} Hindi human voice recordings.")

    manifest_path = base_dir / "indian_audio_benchmark.jsonl"
    all_rows = hindi_rows + memo_rows
    with open(manifest_path, "w", encoding="utf-8") as f:
        for r in all_rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    print(f"Manifest saved: {manifest_path} (total={len(all_rows)})")


if __name__ == "__main__":
    main()
