const fs = require('fs');
const path = require('path');

try {
  const unitsFiles = [
    'scratch/unit_1.json',
    'scratch/unit_2.json',
    'scratch/unit_3.json',
    'scratch/unit_4.json',
    'scratch/unit_5.json',
    'scratch/units_6_10.json',
    'scratch/unit_11.json',
    'scratch/units_12_15.json',
    'scratch/units_16_21.json',
    'scratch/units_23_29.json',
    'scratch/units_37_45.json'
  ];

  let allUnits = [];
  unitsFiles.forEach(file => {
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(data)) {
        allUnits = [...allUnits, ...data];
      } else {
        allUnits.push(data);
      }
    } else {
      console.warn('Warning: File not found:', file);
    }
  });

  console.log('Total units to merge:', allUnits.length);

  // Sort units by ID to ensure correct order
  allUnits.sort((a, b) => {
    const idA = parseInt(a.id.split('_')[1]);
    const idB = parseInt(b.id.split('_')[1]);
    return idA - idB;
  });

  const database = {
    units: allUnits.map(u => ({
      id: u.id,
      title: u.title,
      lessons: u.lessons.map(l => ({
        id: l.id,
        title: l.title,
        theory: l.theory,
        exercises: l.exercises
      }))
    }))
  };

  fs.writeFileSync('web/public/unit_database.json', JSON.stringify(database, null, 2), 'utf8');
  fs.writeFileSync('unit_database.json', JSON.stringify(database, null, 2), 'utf8');
  console.log('✅ Database updated successfully with ' + allUnits.length + ' units.');
} catch (e) {
  console.error('❌ Merge failed:', e);
}
