export type ExerciseType = 'multiple_choice' | 'fill_in_the_blank' | 'matching'

export type MultipleChoiceExercise = {
  id?: string
  type: 'multiple_choice'
  question: string
  options: { text: string; is_correct: boolean }[]
  hint?: string
  explanation?: string
}

export type FillInBlankExercise = {
  id?: string
  type: 'fill_in_the_blank'
  question: string
  blanks: { position: number; answer: string }[]
  accepted_answers: string[][]
  hint?: string
  explanation?: string
}

export type MatchingExercise = {
  id?: string
  type: 'matching'
  question: string
  pairs: { term: string; definition: string }[]
  hint?: string
  explanation?: string
}

export type Exercise = MultipleChoiceExercise | FillInBlankExercise | MatchingExercise

export type Lesson = {
  id: string
  title: string
  theory: string
  exercises: Exercise[]
}

export type Unit = {
  id: string
  title: string
  lessons: Lesson[]
}

export type UnitDatabase = {
  units: Unit[]
}
