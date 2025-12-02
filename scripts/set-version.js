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

console.log('Version update complete. Please run "npm install" or "cargo build" if needed to update lockfiles.');
