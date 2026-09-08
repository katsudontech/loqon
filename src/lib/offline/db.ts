import type { OfflineProject } from './types'

export const OFFLINE_DB_NAME = 'loqon-offline-v1'
export const OFFLINE_DB_VERSION = 1
const STORE = 'projects'

function ensureIndexedDb() {
  if (typeof indexedDB === 'undefined') throw new Error('このブラウザはオフライン保存に対応していません')
  return indexedDB
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = ensureIndexedDb().open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function listOfflineProjects(): Promise<OfflineProject[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readonly')
    const request = transaction.objectStore(STORE).getAll()
    let result: OfflineProject[] = []
    request.onsuccess = () => { result = request.result as OfflineProject[] }
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => resolve(result.sort((a, b) => b.savedAt - a.savedAt))
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
  })
}

export async function getOfflineProject(id: string): Promise<OfflineProject | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readonly')
    const request = transaction.objectStore(STORE).get(id)
    let result: OfflineProject | null = null
    request.onsuccess = () => { result = (request.result as OfflineProject | undefined) ?? null }
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => resolve(result)
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
  })
}

export async function putOfflineProject(project: OfflineProject): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite')
    const request = transaction.objectStore(STORE).put(project)
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
  })
}

export async function deleteOfflineProject(id: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite')
    const request = transaction.objectStore(STORE).delete(id)
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
  })
}
