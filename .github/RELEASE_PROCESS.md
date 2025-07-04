# Release Process Documentation

This document outlines the complete release process for Local Lens, ensuring transparency, security, and reproducibility.

## 🚀 Creating a Release

### Prerequisites

1. **Repository access**: Push access to the main repository
2. **Clean state**: All changes committed and pushed to main branch
3. **Testing**: All tests passing on CI
4. **Version planning**: Semantic version decided (e.g., v1.2.3)

### Step 1: Prepare Release

1. **Update version numbers**:
   ```bash
   # Update package.json
   cd frontend
   npm version patch|minor|major --no-git-tag-version
   
   # Update Cargo.toml
   cd src-tauri
   # Edit version in Cargo.toml manually
   
   # Update any other version references
   ```

2. **Update CHANGELOG** (if you have one):
   ```markdown
   ## [1.2.3] - 2025-07-05
   ### Added
   - New feature description
   ### Fixed
   - Bug fix description
   ### Changed
   - Breaking change description
   ```

3. **Commit version updates**:
   ```bash
   git add .
   git commit -m "chore: bump version to v1.2.3"
   git push origin main
   ```

### Step 2: Create and Push Tag

```bash
# Create annotated tag
git tag -a v1.2.3 -m "Release v1.2.3"

# Push tag to trigger release workflow
git push origin v1.2.3
```

### Step 3: Monitor Release Build

1. **Watch GitHub Actions**: Go to the [Actions tab](https://github.com/ashesbloom/LocalLens/actions)
2. **Monitor each platform build**: Windows, macOS, Linux
3. **Check for errors**: Fix any build issues and re-tag if necessary

### Step 4: Verify Release Assets

Once the build completes:

1. **Check all platforms have binaries**:
   - Windows: `.msi` and `.exe` files
   - macOS: `.dmg` file
   - Linux: `.deb` and `.AppImage` files

2. **Verify checksums are present**:
   - `checksums-windows.txt`
   - `checksums-macos.txt`
   - `checksums-linux.txt`

3. **Test download and installation** on at least one platform

### Step 5: Update Release Notes

1. **Edit the draft release** created by the workflow
2. **Add detailed changelog**
3. **Highlight security features**
4. **Include upgrade instructions** if needed
5. **Publish the release**

## 🔐 Security and Transparency

### Build Transparency

Every release provides:

1. **Source Code Link**: Direct link to the exact commit
2. **Build Logs**: Complete CI/CD logs in GitHub Actions
3. **Reproducible Instructions**: Scripts to build identical binaries
4. **Dependency Locks**: Exact versions of all dependencies

### Verification Methods

#### For Users
```bash
# 1. Download checksums
curl -L https://github.com/ashesbloom/LocalLens/releases/download/v1.2.3/checksums-windows.txt

# 2. Verify downloaded file
certutil -hashfile Local_Lens_v1.2.3_x64-setup.exe SHA256

# 3. Compare with checksums file
```

#### For Developers
```bash
# 1. Clone and checkout exact version
git clone https://github.com/ashesbloom/LocalLens.git
cd LocalLens
git checkout v1.2.3

# 2. Build using reproducible script
./scripts/build-reproducible.sh

# 3. Compare checksums with official release
```

### Code Signing

#### Windows (Optional but Recommended)

1. **Obtain Certificate**: Purchase from DigiCert, Sectigo, or similar
2. **Store Securely**: Add to GitHub Secrets as base64-encoded
3. **Configure Workflow**: Uncomment signing steps in `release.yml`

```yaml
# In .github/workflows/release.yml
env:
  TAURI_PRIVATE_KEY: ${{ secrets.TAURI_PRIVATE_KEY }}
  TAURI_KEY_PASSWORD: ${{ secrets.TAURI_KEY_PASSWORD }}
```

#### macOS (Requires Apple Developer Account)

1. **Apple Developer Membership**: $99/year
2. **Certificates**: Developer ID Application & Installer
3. **Notarization**: For Gatekeeper compatibility

## 🔧 Troubleshooting Releases

### Common Issues

#### Build Failures

1. **Dependency conflicts**:
   ```bash
   # Clear all caches
   cd backend && rm -rf venv __pycache__ dist build
   cd ../frontend && rm -rf node_modules dist
   ```

2. **Platform-specific errors**:
   - Check system dependencies in CI logs
   - Verify cross-compilation setup
   - Test locally with Docker if needed

3. **Tauri build errors**:
   - Check Rust toolchain version
   - Verify backend binary is correctly copied
   - Check tauri.conf.json configuration

#### Missing Assets

1. **Backend binary missing**:
   - Check PyInstaller spec file
   - Verify Python dependencies
   - Check file permissions on Unix systems

2. **Installer not generated**:
   - Check Tauri bundle configuration
   - Verify platform-specific requirements
   - Check target architecture settings

### Recovery Procedures

#### Failed Release

1. **Delete the tag**:
   ```bash
   git tag -d v1.2.3
   git push origin :refs/tags/v1.2.3
   ```

2. **Fix issues and re-tag**:
   ```bash
   # Make fixes
   git add . && git commit -m "fix: release issues"
   git push origin main
   
   # Re-create tag
   git tag -a v1.2.3 -m "Release v1.2.3"
   git push origin v1.2.3
   ```

#### Partial Build Success

1. **Cancel running workflows**
2. **Delete draft release**
3. **Re-trigger with workflow_dispatch**

## 📋 Release Checklist

### Pre-Release
- [ ] All tests passing
- [ ] Version numbers updated
- [ ] CHANGELOG updated
- [ ] No uncommitted changes
- [ ] Branch protection satisfied

### During Release
- [ ] Tag created and pushed
- [ ] GitHub Actions triggered
- [ ] All platform builds successful
- [ ] Assets uploaded correctly
- [ ] Checksums generated

### Post-Release
- [ ] Release published (not draft)
- [ ] Download links tested
- [ ] Installation tested on multiple platforms
- [ ] Community notified (if applicable)
- [ ] Documentation updated

### Verification
- [ ] Checksums match
- [ ] Code signatures valid (if applicable)
- [ ] Source code matches tag
- [ ] Build logs accessible
- [ ] No security warnings

## 🤝 Community Verification

### Encouraging Verification

1. **Documentation**: Clear instructions for users
2. **Tools**: Provide verification scripts
3. **Transparency**: Highlight the verification process
4. **Community**: Encourage third-party verification

### Handling Issues

1. **Security concerns**: Respond quickly and transparently
2. **Build discrepancies**: Investigate and document
3. **False positives**: Provide clear explanations
4. **Community feedback**: Address promptly

## 📈 Release Metrics

### Success Criteria

- [ ] Build time under 30 minutes
- [ ] All platforms build successfully
- [ ] Zero critical vulnerabilities
- [ ] Checksums consistent across builds
- [ ] User verification successful

### Monitoring

1. **Download statistics**
2. **Installation success rates**
3. **Security scanner results**
4. **Community feedback**
5. **Issue reports**

---

This process ensures that every Local Lens release is secure, transparent, and verifiable by the community.
