// Every backend call goes through this file, so the rest of the app never has
// to think about tokens, URLs or the error format.

export interface User {
  id: string
  email: string
}

export interface AuthResponse {
  accessToken: string
  user: User
}

export interface DocumentItem {
  id: string
  filename: string
  mimeType: string
  sizeBytes: number
  pageCount: number
  status: 'processing' | 'ready' | 'failed'
  error: string | null
  visibility: 'private' | 'public'
  isOwner: boolean
  uploadDate: string
}

export interface DocumentList {
  items: DocumentItem[]
  total: number
  limit: number
  offset: number
}

export interface SearchResponse {
  mode: 'hybrid' | 'keyword'
  results: {
    chunkId: string
    documentId: string
    filename: string
    pageNumber: number
    content: string
  }[]
}

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const TOKEN_KEY = 'docintel.token'
const USER_KEY = 'docintel.user'

// sessionStorage clears when the tab closes. A script injected into this page
// could still read it, so a public deployment should move to httpOnly cookies.
export const session = {
  token: () => sessionStorage.getItem(TOKEN_KEY),
  user: (): User | null => {
    const raw = sessionStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as User) : null
  },
  save: (auth: AuthResponse) => {
    sessionStorage.setItem(TOKEN_KEY, auth.accessToken)
    sessionStorage.setItem(USER_KEY, JSON.stringify(auth.user))
  },
  clear: () => {
    sessionStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(USER_KEY)
  },
}

let onUnauthorized = () => {}
export const setUnauthorizedHandler = (handler: () => void) => {
  onUnauthorized = handler
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = session.token()
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let res: Response
  try {
    res = await fetch(`/api${path}`, { ...init, headers })
  } catch {
    throw new ApiError(0, 'Could not reach the server. Is the backend running?')
  }

  if (res.ok) {
    return (res.status === 204 ? undefined : await res.json()) as T
  }

  const body = (await res.json().catch(() => null)) as {
    message?: string | string[]
  } | null
  const message = Array.isArray(body?.message)
    ? body.message.join('. ')
    : (body?.message ?? 'Something went wrong')

  // A 401 with a token means it expired. On the login form it's a wrong password.
  if (res.status === 401 && token) {
    session.clear()
    onUnauthorized()
    throw new ApiError(401, 'Your session expired. Please sign in again.')
  }
  throw new ApiError(res.status, message)
}

const jsonPost = (path: string, body: unknown) =>
  request<AuthResponse>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

export const api = {
  login: (email: string, password: string) =>
    jsonPost('/auth/login', { email, password }),
  register: (email: string, password: string) =>
    jsonPost('/auth/register', { email, password }),
  google: (idToken: string) => jsonPost('/auth/google', { idToken }),
  authConfig: () => request<{ googleClientId: string | null }>('/auth/config'),

  search: (query: string) =>
    request<SearchResponse>('/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    }),

  listDocuments: (limit: number, offset: number) =>
    request<DocumentList>(`/documents?limit=${limit}&offset=${offset}`),
  uploadDocument: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<DocumentItem>('/documents/upload', {
      method: 'POST',
      body: form,
    })
  },
  deleteDocument: (id: string) =>
    request<void>(`/documents/${id}`, { method: 'DELETE' }),
  pageNumbers: (id: string) =>
    request<{ pageNumbers: number[] }>(`/documents/${id}/pages`),
  page: (id: string, pageNumber: number) =>
    request<{ pageNumber: number; content: string }>(
      `/documents/${id}/pages/${pageNumber}`,
    ),
}
