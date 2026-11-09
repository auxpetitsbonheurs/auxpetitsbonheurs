import { useSyncExternalStore } from 'react'

export interface LocalStore<T> {
  get: () => T
  set: (v: T) => void
  update: (fn: (v: T) => T) => void
  reset: () => void
  subscribe: (l: () => void) => () => void
  use: () => T
}

/** Tiny typed localStorage-backed store; syncs across tabs through the storage event. */
export function createLocalStore<T>(key: string, init: () => T): LocalStore<T> {
  const listeners = new Set<() => void>()
  const read = (): T => {
    try {
      const raw = localStorage.getItem(key)
      if (raw) return JSON.parse(raw) as T
    } catch {
      /* fall through to init */
    }
    return init()
  }
  let val: T = read()
  const notify = () => listeners.forEach((l) => l())
  const set = (v: T) => {
    val = v
    try {
      localStorage.setItem(key, JSON.stringify(v))
    } catch {
      alert('Prototype storage is full. Use Reset data in the prototype toolbar.')
    }
    notify()
  }
  window.addEventListener('storage', (e) => {
    if (e.key !== key) return
    val = e.newValue ? (JSON.parse(e.newValue) as T) : init()
    notify()
  })
  const subscribe = (l: () => void) => {
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }
  const get = () => val
  return {
    get,
    set,
    update: (fn) => set(fn(val)),
    reset: () => set(init()),
    subscribe,
    use: () => useSyncExternalStore(subscribe, get),
  }
}
