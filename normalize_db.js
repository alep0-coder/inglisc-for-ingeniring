const fs = require('fs');
const path = require('path');

const rawDb = fs.readFileSync(path.join(__dirname, 'unit_database.json'), 'utf8');
const db = JSON.parse(rawDb);

const normalized = {
  units: []
};

let unitCounter = 1;
let lessonCounter = 1;
let exerciseCounter = 1;

db.units.forEach(u => {
  let title = "Unit";
  let lessons = [];
  
  // Extract Title and Lessons from various formats
  if (u.unit && typeof u.unit === 'object') {
    title = u.unit.title || u.unit.unit_title || `Unit ${unitCounter}`;
    lessons = u.unit.lessons || [];
  } else if (u.units && Array.isArray(u.units)) {
    // some units are nested...
    u.units.forEach(subU => {
       const subTitle = subU.title || u.unit_title || `Unit ${unitCounter}`;
       normalized.units.push({
         id: subU.id || `unit_${unitCounter++}`,
         title: subTitle,
         lessons: normalizeLessons(subU.lessons)
       });
    });
    return; // Already handled
  } else if (u.unit_title) {
    title = u.unit_title;
    lessons = u.lessons || [];
  } else if (u.title) {
    title = u.title;
    lessons = u.lessons || [];
  } else if (u.unit && typeof u.unit === 'string') {
    title = u.unit;
    lessons = u.lessons || [];
  }

  normalized.units.push({
    id: u.unit_id || u.id || `unit_${unitCounter++}`,
    title: title,
    lessons: normalizeLessons(lessons)
  });
});

function normalizeLessons(rawLessons) {
  if (!rawLessons || !Array.isArray(rawLessons)) return [];
  
  return rawLessons.map(l => {
    const lTitle = l.title || l.lesson_title || `Lesson ${lessonCounter}`;
    const lTheory = l.theory || "";
    
    return {
      id: l.id || l.lesson_id || `lesson_${lessonCounter++}`,
      title: lTitle,
      theory: lTheory,
      exercises: normalizeExercises(l.exercises)
    };
  });
}

function normalizeExercises(rawExs) {
  if (!rawExs || !Array.isArray(rawExs)) return [];
  
  return rawExs.map(e => {
    let ex = {
      id: e.id || e.exercise_id || `ex_${exerciseCounter++}`,
      type: e.type || "multiple_choice",
      question: e.question || "",
      hint: e.hint || "",
      explanation: e.explanation || ""
    };
    
    if (ex.type === 'multiple_choice' || ex.type === 'fill_in_the_blank') {
      ex.options = [];
      if (Array.isArray(e.options)) {
        e.options.forEach(opt => {
           if (typeof opt === 'string') {
             ex.options.push({ text: opt, is_correct: (opt === e.correct_answer) });
           } else {
             ex.options.push({ text: opt.text || "", is_correct: !!opt.is_correct });
           }
        });
      }
    } else if (ex.type === 'matching') {
      ex.pairs = [];
      if (Array.isArray(e.pairs)) {
        ex.pairs = e.pairs.map(p => ({ left: p.left || "", right: p.right || "" }));
      }
    }
    
    return ex;
  });
}

fs.writeFileSync(path.join(__dirname, 'unit_database_normalized.json'), JSON.stringify(normalized, null, 2));
console.log("Database normalized!");
