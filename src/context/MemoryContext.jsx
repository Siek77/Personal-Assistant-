import { createContext, useContext, useState, useEffect } from 'react'

const MemoryContext = createContext()

const DEFAULT_MEMORY = {
  facts: [],          // things JARVIS has learned about you (unlimited, accumulates forever)
  routines: [],       // your typical routines
  preferences: {},    // inferred preferences
  recentTopics: [],   // recent conversation topics
  mood: null,
  lastSeen: null,
}

// Merge two memory objects — union by id, keeping all facts from both.
// Used when pulling from cloud so nothing is ever lost.
export function mergeMemories(local, remote) {
  // Facts: union by id, sorted newest first
  const factMap = new Map()
  ;[...local.facts, ...remote.facts].forEach(f => factMap.set(f.id, f))
  const facts = [...factMap.values()].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

  // Routines: union by id
  const routineMap = new Map()
  ;[...local.routines, ...remote.routines].forEach(r => routineMap.set(r.id, r))
  const routines = [...routineMap.values()].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

  // Preferences: merge (remote wins on conflict)
  const preferences = { ...local.preferences, ...remote.preferences }

  // Topics: union, keep up to 100
  const recentTopics = [...new Set([...local.recentTopics, ...remote.recentTopics])].slice(0, 100)

  const lastSeen = (!local.lastSeen || (remote.lastSeen && remote.lastSeen > local.lastSeen))
    ? remote.lastSeen
    : local.lastSeen

  return { ...local, facts, routines, preferences, recentTopics, lastSeen }
}

export function MemoryProvider({ children }) {
  const [memory, setMemory] = useState(() => {
    try {
      const saved = localStorage.getItem('jarvis_memory')
      return saved ? { ...DEFAULT_MEMORY, ...JSON.parse(saved) } : DEFAULT_MEMORY
    } catch {
      return DEFAULT_MEMORY
    }
  })

  const saveMemory = (updated) => {
    localStorage.setItem('jarvis_memory', JSON.stringify(updated))
    setMemory(updated)
  }

  // Add a fact — no cap, grows forever
  const addFact = (fact, category = 'general') => {
    const entry = { id: Date.now(), text: fact, category, timestamp: new Date().toISOString() }
    const updated = { ...memory, facts: [entry, ...memory.facts] }
    saveMemory(updated)
  }

  const addRoutine = (routine) => {
    const entry = { id: Date.now(), ...routine, timestamp: new Date().toISOString() }
    const updated = { ...memory, routines: [entry, ...memory.routines] }
    saveMemory(updated)
  }

  const setPreference = (key, value) => {
    const updated = { ...memory, preferences: { ...memory.preferences, [key]: value } }
    saveMemory(updated)
  }

  const addTopic = (topic) => {
    const updated = {
      ...memory,
      recentTopics: [topic, ...memory.recentTopics.filter(t => t !== topic)],
      lastSeen: new Date().toISOString(),
    }
    saveMemory(updated)
  }

  // Merge remote memory into current local memory (used by cloud sync pull)
  const mergeRemoteMemory = (remote) => {
    const merged = mergeMemories(memory, { ...DEFAULT_MEMORY, ...remote })
    saveMemory(merged)
  }

  const clearMemory = () => saveMemory(DEFAULT_MEMORY)

  // Parse AI response for memory cues
  const extractMemory = (userMsg) => {
    const lower = userMsg.toLowerCase()
    if (lower.includes('i usually') || lower.includes('i always') || lower.includes('i like')) {
      addFact(userMsg, 'preference')
    }
    if (lower.includes('every morning') || lower.includes('every day') || lower.includes('routine')) {
      addRoutine({ description: userMsg })
    }
  }

  return (
    <MemoryContext.Provider value={{ memory, addFact, addRoutine, setPreference, addTopic, clearMemory, extractMemory, mergeRemoteMemory }}>
      {children}
    </MemoryContext.Provider>
  )
}

export const useMemory = () => useContext(MemoryContext)
