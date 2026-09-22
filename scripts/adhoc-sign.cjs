/**
 * Ad-hoc sign the packed .app before electron-builder builds the DMG.
 *
 * `mac.identity: null` tells electron-builder to skip signing, which is what we
 * want — a hobby app given away for free has no business paying $99/year for a
 * Developer ID. But "skip" leaves the bundle carrying only Electron's own
 * linker signature: `Identifier=Electron`, no sealed resources, and a
 * designated requirement that does not describe this app. Apple Silicon needs
 * *some* valid signature, so this signs the bundle ad-hoc properly, which costs
 * nothing and takes about ten seconds.
 *
 * Gatekeeper still blocks the first launch — that is inherent to not paying
 * Apple, and the landing page walks the user through the override. What this
 * buys is a bundle that is internally consistent and verifies.
 */
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );

  // --deep is deprecated for Developer ID workflows but remains the practical
  // way to reach an Electron bundle's nested helpers and frameworks, which must
  // be signed before the outer app.
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit',
  });
  execFileSync('codesign', ['--verify', '--strict', appPath], { stdio: 'inherit' });

  console.log(`  • ad-hoc signed  ${appPath}`);
};
