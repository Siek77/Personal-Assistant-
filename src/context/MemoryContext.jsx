import { createContext, useContext, useState, useEffect } from 'react'

const MemoryContext = createContext()

const DEFAULT_MEMORY = {
  facts: [],          // things JARVIS has learned about you
  routines: [],       // your typical routines
  preferences: {},    // inferred preferences
  recentTopics: [],   // recent conversation topics
  mood: null,         // detected current mood
  lastSeen: null,
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
    const updated = { ...memory, facts: [entry, ...memory.facts.slice(0, 49)] }
    saveMemory(updated)
  }

  const addRoutine = (routine) => {
    const entry = { id: Date.now(), ...routine, timestamp: new Date().toISOString() }
    const updated = { ...memory, routines: [entry, ...memory.routines.slice(0, 19)] }
    saveMemory(updated)
  }

  const setPreference = (key, value) => {
    const updated = { ...memory, preferences: { ...memory.preferences, [key]: value } }
    saveMemory(updated)
  }

  const addTopic = (topic) => {
    const updated = {
      ...memory,
      recentTopics: [topic, ...memory.recentTopics.filter(t => t !== topic).slice(0, 9)],
      lastSeen: new Date().toISOString(),
    }
    saveMemory(updated)
  }

  const clearMemory = () => saveMemory(DEFAULT_MEMORY)

  // Parse AI response for memory cues
  const extractMemory = (userMsg, aiResponse) => {
    const lower = userMsg.toLowerCase()
    if (lower.includes('i usually') || lower.includes('i always') || lower.includes('i like')) {
      addFact(userMsg, 'preference')
    }
    if (lower.includes('every morning') || lower.includes('every day') || lower.includes('routine')) {
      addRoutine({ description: userMsg })
    }
  }

  return (
    <MemoryContext.Provider value={{ memory, addFact, addRoutine, setPreference, addTopic, clearMemory, extractMemory }}>
      {children}
    </MemoryContext.Provider>
  )
}

export const useMemory = () => useContext(MemoryContext)
