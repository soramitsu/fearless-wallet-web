import fs from 'node:fs/promises';
import path from 'node:path';

// Copy notices with the other static assets, without changing the shared
// compiler configuration covered by recorded transfer evidence.
export async function copyLicenseAssets({ sourceRoot, outDir }) {
  const assets = {
    LICENSE: 'LICENSE',
    NOTICE: 'NOTICE',
    'licenses/fonts/Unbounded-OFL.txt': 'src/assets/fonts/Unbounded-OFL.txt',
  };

  for (const [fileName, source] of Object.entries(assets)) {
    const destination = path.join(outDir, fileName);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(path.join(sourceRoot, source), destination);
  }
}
