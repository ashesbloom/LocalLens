# Code Signing Setup Guide

This guide explains how to set up code signing for Local Lens releases to ensure authenticity and build trust with users.

## Why Code Signing?

Code signing provides:
- **Authenticity**: Proves the software comes from you
- **Integrity**: Ensures the software hasn't been tampered with
- **Trust**: Windows Defender and other security software trust signed code
- **Professional appearance**: Removes "Unknown Publisher" warnings

## Windows Code Signing

### Option 1: Commercial Certificate (Recommended for production)

1. **Purchase a Code Signing Certificate**
   - Recommended providers: DigiCert, Sectigo, GlobalSign
   - Cost: ~$100-400/year
   - Requires identity verification

2. **Install Certificate**
   ```powershell
   # Import certificate to local machine
   certlm.msc
   # Or use PowerShell
   Import-PfxCertificate -FilePath "certificate.pfx" -CertStoreLocation "Cert:\LocalMachine\My"
   ```

3. **Configure GitHub Secrets**
   - Convert certificate to base64:
   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("certificate.pfx"))
   ```
   - Add these secrets to your GitHub repository:
     - `WINDOWS_CERTIFICATE`: Base64 encoded certificate
     - `WINDOWS_CERTIFICATE_PASSWORD`: Certificate password

4. **Update GitHub Actions**
   Add to your `release.yml` workflow:
   ```yaml
   - name: Import Code-Signing Certificate
     run: |
       echo "${{ secrets.WINDOWS_CERTIFICATE }}" | base64 --decode > certificate.pfx
       Import-PfxCertificate -FilePath certificate.pfx -CertStoreLocation Cert:\CurrentUser\My -Password (ConvertTo-SecureString -String "${{ secrets.WINDOWS_CERTIFICATE_PASSWORD }}" -AsPlainText -Force)
     
   - name: Build Tauri app (with signing)
     env:
       TAURI_PRIVATE_KEY: ${{ secrets.TAURI_PRIVATE_KEY }}
       TAURI_KEY_PASSWORD: ${{ secrets.TAURI_KEY_PASSWORD }}
     run: |
       cd frontend
       npm run tauri build
   ```

### Option 2: Self-Signed Certificate (For testing/development)

1. **Create Self-Signed Certificate**
   ```powershell
   # Create certificate
   $cert = New-SelfSignedCertificate -Subject "CN=Local Lens" -Type CodeSigning -CertStoreLocation Cert:\CurrentUser\My
   
   # Export certificate
   $password = ConvertTo-SecureString -String "YourPassword" -Force -AsPlainText
   Export-PfxCertificate -Cert $cert -FilePath "LocalLens.pfx" -Password $password
   ```

2. **Configure Tauri**
   Update `tauri.conf.json`:
   ```json
   {
     "tauri": {
       "bundle": {
         "windows": {
           "certificateThumbprint": "YOUR_CERT_THUMBPRINT",
           "digestAlgorithm": "sha256",
           "timestampUrl": "http://timestamp.digicert.com"
         }
       }
     }
   }
   ```

## macOS Code Signing

### Apple Developer Account Setup

1. **Join Apple Developer Program** ($99/year)
2. **Create Certificates**
   - Developer ID Application Certificate
   - Developer ID Installer Certificate

3. **Configure GitHub Secrets**
   ```bash
   # Export certificates
   security export -t certs -f pkcs12 -k login.keychain -P "password" -o certificate.p12
   
   # Convert to base64
   base64 certificate.p12
   ```
   
   Add secrets:
   - `APPLE_CERTIFICATE`: Base64 encoded certificate
   - `APPLE_CERTIFICATE_PASSWORD`: Certificate password
   - `APPLE_SIGNING_IDENTITY`: Certificate name

4. **Notarization (Optional but recommended)**
   Add secrets:
   - `APPLE_ID`: Your Apple ID email
   - `APPLE_PASSWORD`: App-specific password

## Linux Code Signing

Linux doesn't have built-in code signing, but you can:

1. **GPG Signing**
   ```bash
   # Create GPG key
   gpg --full-generate-key
   
   # Sign packages
   gpg --armor --detach-sign package.deb
   ```

2. **Package Repository Signing**
   - For Debian packages: Use `debsign`
   - For RPM packages: Use `rpm --addsign`

## Verification Instructions for Users

Add this section to your README:

### Windows
```powershell
# Verify certificate
Get-AuthenticodeSignature "Local_Lens_v1.0.0_x64-setup.exe"

# Check certificate details
$sig = Get-AuthenticodeSignature "Local_Lens_v1.0.0_x64-setup.exe"
$sig.SignerCertificate | Format-List Subject, Issuer, NotAfter
```

### macOS
```bash
# Verify signature
codesign -v Local_Lens_v1.0.0_x64.dmg

# Check certificate details
codesign -dv Local_Lens_v1.0.0_x64.dmg
```

### Linux
```bash
# Verify GPG signature
gpg --verify package.deb.sig package.deb
```

## Security Best Practices

1. **Protect Private Keys**
   - Never commit certificates to Git
   - Use GitHub Secrets for sensitive data
   - Rotate certificates before expiration

2. **Timestamping**
   - Always use timestamp servers
   - Ensures signatures remain valid after certificate expires

3. **Verification**
   - Test signed binaries before release
   - Document verification steps for users

4. **Backup**
   - Keep secure backups of certificates
   - Document recovery procedures

## Alternative: Reproducible Builds

If code signing is not feasible, focus on reproducible builds:

1. **Docker-based builds**
2. **Deterministic compilation**
3. **Source code transparency**
4. **Community verification**

This provides transparency even without traditional code signing.
