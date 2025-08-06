import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';


export const showPackageVersion = (): void => {
  try {
      // Print package.json version
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const possiblePaths = [
      join(process.cwd(), 'package.json'),
      join(__dirname, 'package.json'),
      join(__dirname, '../package.json'),
      join(__dirname, '../../package.json'),
    ];

    let packageJson;
    let found = false;

    for (const packageJsonPath of possiblePaths) {
      try {
        packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        found = true;
        break;
      } catch (error) {
        continue;
      }
    }

    if (found && packageJson?.version) {
      console.log(`Package version: ${packageJson.version}`);
    } else {
      console.log('Package version: unknown');
    }
  } catch (error) {
    console.error('Error reading package.json:', error);
  }
};
