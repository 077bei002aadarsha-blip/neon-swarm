import re
import os

path = r'c:\Users\Aadarsha Thapa Magar\Documents\gameTest\survivors\game.js'
with open(path, 'r', encoding='utf-8') as f:
    code = f.read()

# Replace if (!isMobile)
code = re.sub(r'if \(!isMobile\)', 'if (true)', code)
code = re.sub(r'if \(!isMobile &&', 'if (true &&', code)

# Replace if (isMobile)
code = re.sub(r'if \(isMobile\)', 'if (false)', code)

with open(path, 'w', encoding='utf-8') as f:
    f.write(code)
    
print("Successfully patched game.js")
