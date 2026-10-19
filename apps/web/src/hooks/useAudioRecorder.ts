import { useRef, useState } from "react";

export function useAudioRecorder() {
  const rec = useRef<MediaRecorder>();
  const chunks = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [blob, setBlob] = useState<Blob>();

  const start = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    rec.current = recorder;
    chunks.current = [];
    recorder.ondataavailable = (e) => chunks.current.push(e.data);
    recorder.onstop = () => {
      setBlob(new Blob(chunks.current, { type: recorder.mimeType || "audio/webm" }));
      stream.getTracks().forEach((t) => t.stop());
    };
    recorder.start();
    setRecording(true);
  };

  const stop = () => {
    rec.current?.stop();
    setRecording(false);
  };

  return { start, stop, recording, blob };
}
