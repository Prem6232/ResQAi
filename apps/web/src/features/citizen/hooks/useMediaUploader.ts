import { useState } from "react";

export function useMediaUploader() {
  const [files, setFiles] = useState<File[]>([]);
  const add = (list: FileList | null) => {
    if (!list) return;
    setFiles((f) => [...f, ...Array.from(list)].slice(0, 4));
  };
  const remove = (name: string) => setFiles((f) => f.filter((x) => x.name !== name));
  return { files, add, remove };
}
