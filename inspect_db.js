var db = JSON.parse(require('fs').readFileSync('unit_database.json','utf8'));

// Show raw structure of first few units
for(var i=0; i < Math.min(db.units.length, 5); i++){
  console.log('=== Unit ' + i + ' ===');
  console.log(JSON.stringify(db.units[i], null, 2).substring(0, 500));
  console.log('...\n');
}

// Find a unit with valid lessons  
for(var i=0; i<db.units.length; i++){
  var u = db.units[i];
  if(u.lessons && u.lessons.length > 0 && u.lessons[0].exercises && u.lessons[0].exercises.length > 0) {
    console.log('\n=== First valid unit with exercises: Unit ' + i + ' ===');
    console.log('Unit name:', JSON.stringify(u.unit));
    console.log('Lesson 0 title:', JSON.stringify(u.lessons[0].title));
    console.log('Lesson 0 theory:', JSON.stringify(u.lessons[0].theory));
    console.log('Exercise 0:', JSON.stringify(u.lessons[0].exercises[0], null, 2));
    break;
  }
}

// Count total valid data
var totalLessons = 0, totalExercises = 0, italianCount = 0;
for(var i=0; i<db.units.length; i++){
  var u = db.units[i];
  if(!u.lessons) continue;
  totalLessons += u.lessons.length;
  for(var j=0; j<u.lessons.length; j++){
    if(u.lessons[j].exercises) totalExercises += u.lessons[j].exercises.length;
    // Check if title is Italian
    var t = u.lessons[j].title || '';
    if(/[àèéìòù]/.test(t) || /\b(del|della|dei|delle|nella|negli|per|come|sono|con|tra|fra)\b/i.test(t)) {
      italianCount++;
    }
  }
}
console.log('\nTotal units:', db.units.length);
console.log('Total lessons:', totalLessons);
console.log('Total exercises:', totalExercises);
console.log('Italian lesson titles detected:', italianCount);
