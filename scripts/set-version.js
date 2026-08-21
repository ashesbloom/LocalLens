const fs = require('fs');
const path = require('path');

const newVersion = process.argv[2];

if (!newVersion) {
    console.error('Please provide a version number. Usage: node scripts/set-version.js <version>');
    process.exit(1);
}

const paths = {
    packageJson: path.join(__dirname, '../frontend/package.json'),
    tauriConf: path.join(__dirname, '../frontend/src-tauri/tauri.conf.json'),
    cargoToml: path.join(__dirname, '../frontend/src-tauri/Cargo.toml'),
    mainPy: path.join(__dirname, '../backend/main.py'),
};

// Update package.json
if (fs.existsSync(paths.packageJson)) {
    const packageJson = JSON.parse(fs.readFileSync(paths.packageJson, 'utf8'));
    packageJson.version = newVersion;
    fs.writeFileSync(paths.packageJson, JSON.stringify(packageJson, null, 2));
    console.log(`Updated package.json to ${newVersion}`);
} else {
    console.error(`Could not find ${paths.packageJson}`);
}

// Update tauri.conf.json
if (fs.existsSync(paths.tauriConf)) {
    const tauriConf = JSON.parse(fs.readFileSync(paths.tauriConf, 'utf8'));
    tauriConf.version = newVersion;
    fs.writeFileSync(paths.tauriConf, JSON.stringify(tauriConf, null, 2));
    console.log(`Updated tauri.conf.json to ${newVersion}`);
} else {
    console.error(`Could not find ${paths.tauriConf}`);
}

// Update Cargo.toml
if (fs.existsSync(paths.cargoToml)) {
    let cargoToml = fs.readFileSync(paths.cargoToml, 'utf8');
    // Replace version = "x.x.x" with version = "newVersion"
    // We assume the package version is the first 'version =' line in the file, which is standard for Cargo.toml
    const versionRegex = /^version\s*=\s*".*?"/m;
    if (versionRegex.test(cargoToml)) {
        cargoToml = cargoToml.replace(versionRegex, `version = "${newVersion}"`);
        fs.writeFileSync(paths.cargoToml, cargoToml);
        console.log(`Updated Cargo.toml to ${newVersion}`);
    } else {
        console.warn('Could not find version string in Cargo.toml');
    }
} else {
    console.error(`Could not find ${paths.cargoToml}`);
}

// Update backend/main.py's APP_VERSION (AGENTS.md §5 — the fourth canonical
// version file; forgotten here during v2.4.1). Cargo.lock is NOT touched —
// AGENTS.md leaves the lockfile to cargo.
if (fs.existsSync(paths.mainPy)) {
    let mainPy = fs.readFileSync(paths.mainPy, 'utf8');
    const appVersionRegex = /^APP_VERSION\s*=\s*".*?"/m;
    if (appVersionRegex.test(mainPy)) {
        mainPy = mainPy.replace(appVersionRegex, `APP_VERSION = "${newVersion}"`);
        fs.writeFileSync(paths.mainPy, mainPy);
        console.log(`Updated backend/main.py to ${newVersion}`);
    } else {
        console.warn('Could not find APP_VERSION string in backend/main.py');
    }
} else {
    console.error(`Could not find ${paths.mainPy}`);
}

console.log('Version update complete. Please run "pnpm install" or "cargo build" if needed to update lockfiles.');
