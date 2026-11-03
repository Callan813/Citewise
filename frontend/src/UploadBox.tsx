import { type DragEvent, useRef, useState } from 'react';
import { api, ApiError } from './api';

const MAX_BYTES = 10 * 1024 * 1024;

interface Props {
  onUploaded: () => void;
}

export function UploadBox({ onUploaded }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const uploading = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  async function uploadAll(files: File[]) {
    if (uploading.current || files.length === 0) return;
    uploading.current = true;
    setErrors([]);
    const failed: string[] = [];
    // One at a time, to keep the request simple. The server replies quickly now
    // that extraction happens in the background.
    for (const [index, file] of files.entries()) {
      setProgress(`Uploading ${file.name} (${index + 1} of ${files.length})…`);
      if (file.size > MAX_BYTES) {
        failed.push(`${file.name}: larger than 10 MB`);
        continue;
      }
      try {
        await api.uploadDocument(file);
        onUploaded();
      } catch (err) {
        const reason = err instanceof ApiError ? err.message : 'Upload failed';
        failed.push(`${file.name}: ${reason}`);
      }
    }
    setProgress('');
    setErrors(failed);
    uploading.current = false;
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (!progress) void uploadAll([...event.dataTransfer.files]);
  }

  const busy = Boolean(progress);

  return (
    <section>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-xl border border-dashed px-4 py-5 text-center transition-colors ${
          dragging ? 'border-accent bg-surface' : 'border-muted/50'
        }`}
      >
        {busy ? (
          <p role="status" className="text-sm break-words text-muted">
            {progress}
          </p>
        ) : (
          <>
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold transition-colors hover:border-accent hover:text-accent"
            >
              Add documents
            </button>
            <p className="mt-2 text-sm text-muted">
              or drop PDF and text files here, up to 10 MB each
            </p>
          </>
        )}
        <input
          ref={input}
          type="file"
          multiple
          accept=".pdf,.txt,.md,application/pdf,text/plain"
          className="hidden"
          aria-label="Choose files to upload"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = ''; // lets the same file be chosen again
            if (files.length > 0) void uploadAll(files);
          }}
        />
      </div>
      <p className="mt-2 text-xs text-muted">
        Avoid anything sensitive: text is processed by Google's Gemini API.
      </p>

      {errors.length > 0 && (
        <ul role="alert" className="mt-3 space-y-1 text-sm text-danger">
          {errors.map((error) => (
            <li key={error} className="break-words">
              {error}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
