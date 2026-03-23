import { execSync } from 'child_process';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';

// Extract the zip file
execSync('unzip -o "dms Backup.zip" -d extracted_dms', { cwd: '/vercel/share/v0-project' });

// List the contents recursively
function listDir(dir, prefix = '') {
  const items = readdirSync(dir);
  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);
    console.log(prefix + item + (stat.isDirectory() ? '/' : ''));
    if (stat.isDirectory() && prefix.length < 20) {
      listDir(fullPath, prefix + '  ');
    }
  }
}

console.log('Extracted contents:');
listDir('/vercel/share/v0-project/extracted_dms');
