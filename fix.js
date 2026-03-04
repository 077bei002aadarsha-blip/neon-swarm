const fs = require('fs');
const path = 'c:/Users/Aadarsha Thapa Magar/Documents/gameTest/survivors/game.js';
let code = fs.readFileSync(path, 'utf-8');

code = code.replace(/if \(!isMobile\)/g, 'if (true)');
code = code.replace(/if \(!isMobile &&/g, 'if (true &&');
code = code.replace(/if \(isMobile\)/g, 'if (false)');

fs.writeFileSync(path, code);
console.log("Patched game.js");