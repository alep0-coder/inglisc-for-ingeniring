import type { UnitDatabase } from './types'

export async function loadDatabase(): Promise<UnitDatabase> {
  const res = await fetch('./unit_database.json', { cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`Failed to load unit_database.json (${res.status})`)
  }
  const raw = await res.json()
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.units)) {
    throw new Error('Invalid JSON format: expected { units: [...] }')
  }
  
  // We already flattened and mapped unit_database.json so it matches the types directly.
  // We ensure we filter out empty units or lessons to be safe.
  const units = raw.units.filter((u: any) => 
    u && typeof u === 'object' && Array.isArray(u.lessons) && u.lessons.length > 0
  ).map((u: any) => {
    return {
      id: u.id || `unit_${Math.random()}`,
      title: u.title || 'Untitled Unit',
      lessons: u.lessons.filter((l: any) => {
        // A lesson must have exercises to be valid
        if (!Array.isArray(l.exercises) || l.exercises.length === 0) return false;
        // Check if at least one exercise is valid
        return l.exercises.some((ex: any) => {
          if (!ex.type || !ex.question) return false;
          if (ex.type === 'multiple_choice' && (!Array.isArray(ex.options) || ex.options.length < 2)) return false;
          if (ex.type === 'matching' && (!Array.isArray(ex.pairs) || ex.pairs.length === 0)) return false;
          return true;
        });
      }).map((l: any) => {
        return {
          id: l.id || `lesson_${Math.random()}`,
          title: l.title || 'Untitled Lesson',
          theory: l.theory || '',
          exercises: l.exercises.filter((ex: any) => ex.question && ex.type)
        }
      })
    }
  }).filter((u: any) => u.lessons.length > 0);

  return { units }
}
