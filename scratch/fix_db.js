const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'unit_database.json');
const rawDb = fs.readFileSync(dbPath, 'utf8');
const db = JSON.parse(rawDb);

// 1. Remove Unit 42
db.units = db.units.filter(u => u.id !== 'unit_42');

// 2. Fix matching schema globally
db.units.forEach(unit => {
  unit.lessons.forEach(lesson => {
    lesson.exercises.forEach(ex => {
      if (ex.type === 'matching' && ex.pairs) {
        ex.pairs = ex.pairs.map(p => {
          const newPair = {};
          newPair.term = p.term || p.left || "";
          newPair.definition = p.definition || p.right || "";
          return newPair;
        });
      }
    });
  });
});

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
console.log("Database updated: Unit 42 removed and matching schema fixed.");
