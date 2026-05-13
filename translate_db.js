const fs = require('fs');
const { translate } = require('@vitalets/google-translate-api');
const path = require('path');

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function generateTheory(title) {
  const t = title.toLowerCase();
  if (t.includes('material')) return "This section covers the properties and classification of engineering materials. Metals are distinguished by their conductivity and malleability, while non-metals like polymers and ceramics offer insulation and heat resistance. Understanding material properties is crucial for selecting the right material for specific structural and functional requirements.";
  if (t.includes('machining') || t.includes('tool')) return "Machining involves removing material to shape a component. Techniques include turning, milling, and drilling using CNC (Computer Numerical Control) machines. Cutting tools must be harder than the workpiece and often require coolants to manage heat generation during the manufacturing process.";
  if (t.includes('circuit') || t.includes('component')) return "Electrical circuits consist of a power source, conductors, and a load. Key components include resistors (which limit current), capacitors (which store charge), and diodes (which allow current to flow in one direction). Circuit breakers and fuses act as safety devices against short circuits and overloads.";
  if (t.includes('motion') || t.includes('engine')) return "Motion in engineering is categorized into rotary, reciprocating, and linear motion. Engines, such as internal combustion engines, convert thermal energy into mechanical work through a cycle of intake, compression, combustion, and exhaust. Lubrication is essential to reduce friction and wear between moving parts.";
  if (t.includes('force')) return "Forces can cause deformation or failure in structures. Tension pulls materials apart, compression pushes them together, and shear forces act parallel to the surface. Engineers must design structures within the elastic limit to ensure they return to their original shape after the load is removed.";
  if (t.includes('fluid') || t.includes('pump')) return "Fluid dynamics studies the behavior of liquids and gases in motion. Pumps are used to move fluids through pipes by increasing pressure. Bernoulli's principle and concepts like laminar vs. turbulent flow are fundamental in designing efficient containment and delivery systems.";
  if (t.includes('energy') || t.includes('power') || t.includes('generation')) return "Energy generation involves converting one form of energy (like mechanical or chemical) into electrical energy. AC (Alternating Current) is preferred for long-distance supply because transformers can efficiently step up voltage to reduce power loss, and step it down for safe residential use.";
  if (t.includes('joint') || t.includes('fastener') || t.includes('weld')) return "Mechanical fasteners (bolts, screws, rivets) allow for temporary or permanent assembly of components. Non-mechanical joints, such as welding, brazing, or using adhesives, fuse materials together. The choice of joint depends on the required strength, vibration resistance, and whether disassembly will be needed.";
  
  return `This lesson introduces core engineering concepts related to ${title}. It covers fundamental principles, standard terminology, and practical applications in modern engineering design and analysis. Mastery of this vocabulary is essential for effective technical communication.`;
}

async function translateText(text) {
  if (!text || typeof text !== 'string') return text;
  if (text.length < 3) return text;
  
  // Basic check: if it contains typical Italian words, translate it
  const isItalian = /[àèéìòù]/.test(text) || /\b(del|della|dei|delle|nella|negli|per|come|sono|con|tra|fra|un|una|il|lo|la|gli|le)\b/i.test(text);
  
  if (!isItalian && text.length > 15) {
     // Might be already english
     return text;
  }
  
  try {
    const res = await translate(text, { to: 'en' });
    await sleep(200); // rate limiting
    return res.text;
  } catch (e) {
    console.log("Translation error for:", text.substring(0, 20), e.message);
    return text;
  }
}

async function main() {
  console.log("Reading DB...");
  const dbPath = path.join(__dirname, 'unit_database_normalized.json');
  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

  for (let i = 0; i < db.units.length; i++) {
    const unit = db.units[i];
    if (unit.title) unit.title = await translateText(unit.title);
    console.log(`Processing Unit ${i + 1}/${db.units.length}: ${unit.title}`);
    
    for (let j = 0; j < unit.lessons.length; j++) {
      const lesson = unit.lessons[j];
      if (lesson.title) lesson.title = await translateText(lesson.title);
      lesson.theory = generateTheory(lesson.title || unit.title);
      
      for (let k = 0; k < lesson.exercises.length; k++) {
        const ex = lesson.exercises[k];
        
        if (ex.question) ex.question = await translateText(ex.question);
        if (ex.hint) ex.hint = await translateText(ex.hint);
        if (ex.explanation) ex.explanation = await translateText(ex.explanation);
        
        if (ex.options) {
          for (let o = 0; o < ex.options.length; o++) {
            if (ex.options[o].text) ex.options[o].text = await translateText(ex.options[o].text);
          }
        }
        
        if (ex.pairs) {
          for (let p = 0; p < ex.pairs.length; p++) {
            if (ex.pairs[p].left) ex.pairs[p].left = await translateText(ex.pairs[p].left);
            if (ex.pairs[p].right) ex.pairs[p].right = await translateText(ex.pairs[p].right);
          }
        }
      }
    }
    // save after each unit to prevent data loss
    fs.writeFileSync(path.join(__dirname, 'web/public/unit_database.json'), JSON.stringify(db, null, 2), 'utf8');
    fs.writeFileSync(path.join(__dirname, 'unit_database.json'), JSON.stringify(db, null, 2), 'utf8');
  }
  
  console.log("All done!");
}

main();
