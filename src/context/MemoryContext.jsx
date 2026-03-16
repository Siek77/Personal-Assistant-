import { createContext, useContext, useState } from 'react'

const MemoryContext = createContext()

const DEFAULT_MEMORY = {
  facts: [],
  routines: [],
  preferences: {},
  recentTopics: [],
  mood: null,
  lastSeen: null,
}

export function mergeMemories(local, remote) {
  const factMap = new Map()
  ;[...local.facts, ...remote.facts].forEach(f => factMap.set(f.id, f))
  const facts = [...factMap.values()].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

  const routineMap = new Map()
  ;[...local.routines, ...remote.routines].forEach(r => routineMap.set(r.id, r))
  const routines = [...routineMap.values()].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

  const preferences = { ...local.preferences, ...remote.preferences }
  const recentTopics = [...new Set([...local.recentTopics, ...remote.recentTopics])].slice(0, 100)
  const lastSeen = (!local.lastSeen || (remote.lastSeen && remote.lastSeen > local.lastSeen))
    ? remote.lastSeen : local.lastSeen

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

  const addFact = (fact, category = 'general') => {
    const entry = { id: Date.now(), text: fact, category, timestamp: new Date().toISOString() }
    saveMemory({ ...memory, facts: [entry, ...memory.facts] })
  }

  const editFact = (id, newText) => {
    saveMemory({ ...memory, facts: memory.facts.map(f => f.id === id ? { ...f, text: newText } : f) })
  }

  const removeFact = (id) => {
    saveMemory({ ...memory, facts: memory.facts.filter(f => f.id !== id) })
  }

  const addRoutine = (routine) => {
    const entry = { id: Date.now(), ...routine, timestamp: new Date().toISOString() }
    saveMemory({ ...memory, routines: [entry, ...memory.routines] })
  }

  const removeRoutine = (id) => {
    saveMemory({ ...memory, routines: memory.routines.filter(r => r.id !== id) })
  }

  const setPreference = (key, value) => {
    saveMemory({ ...memory, preferences: { ...memory.preferences, [key]: value } })
  }

  const addTopic = (topic) => {
    saveMemory({
      ...memory,
      recentTopics: [topic, ...memory.recentTopics.filter(t => t !== topic)],
      lastSeen: new Date().toISOString(),
    })
  }

  const removeTopic = (topic) => {
    saveMemory({ ...memory, recentTopics: memory.recentTopics.filter(t => t !== topic) })
  }

  const mergeRemoteMemory = (remote) => {
    saveMemory(mergeMemories(memory, { ...DEFAULT_MEMORY, ...remote }))
  }

  const clearMemory = () => saveMemory(DEFAULT_MEMORY)

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
    <MemoryContext.Provider value={{
      memory,
      addFact, editFact, removeFact,
      addRoutine, removeRoutine,
      setPreference,
      addTopic, removeTopic,
      clearMemory, extractMemory, mergeRemoteMemory,
    }}>
      {children}
    </MemoryContext.Provider>
  )
}

export const useMemory = () => useContext(MemoryContext)
