import { type DragEvent, useRef, useState } from 'react'
import { api, ApiError } from './api'

const MAX_BYTES = 10 * 1024 * 1024

interface Props {
  onUploaded: () => void
}

export function UploadBox({ onUploaded }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState('')
  const [errors, setErrors] = useState<string[]>([])

  async function uploadAll(files: File[]) {
    const failed: string[] = []
    // One at a time, because the server extracts text during the request.
    for (const [index, file] of files.entries()) {
      setProgress(`Reading ${file.name} (${index + 1} of ${files.length})…`)
      if (file.size > MAX_BYTES) {
        failed.push(`${file.name}: larger than 10 MB`)
        continue
      }
      try {
        await api.uploadDocument(file)
        onUploaded()
      } catch (err) {
        const reason = err instanceof ApiError ? err.message : 'Upload failed'
        failed.push(`${file.name}: ${reason}`)
      }
    }
    setProgress('')
    setErrors(failed)
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    if (!progress) void uploadAll([...event.dataTransfer.files])
  }

  const busy = Boolean(progress)

  return (
    <section>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
          dragging ? 'border-accent bg-white' : 'border-line'
        }`}
      >
        {busy ? (
          <p role="status" className="break-words text-muted">
            {progress}
          </p>
        ) : (
          <>
            <p className="font-medium">Drop PDF or text files here</p>
            <p className="mt-1 mb-4 text-sm text-muted">Up to 10 MB each</p>
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="rounded-md bg-accent px-4 py-2 font-medium text-white hover:bg-accent-dark"
            >
              Choose files
            </button>
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
            const files = [...(e.target.files ?? [])]
            e.target.value = '' // lets the same file be chosen again
            if (files.length > 0) void uploadAll(files)
          }}
        />
      </div>

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
  )
}
