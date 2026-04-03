# Tauri Signing Keys and Secret Password Setup (LocalLens)

This guide explains how to fix the error below and set up a secure signing workflow for LocalLens.

Error:

```text
A public key has been found but no private key. Make sure to set the `TAURI_SIGNING_PRIVATE_KEY` environment variable.
```

## Why this happens in this repository

LocalLens already has updater signing enabled:

- `frontend/src-tauri/tauri.conf.json` has `bundle.createUpdaterArtifacts: true`
- `frontend/src-tauri/tauri.conf.json` has `plugins.updater.pubkey` set

When updater artifacts are enabled and a public key exists, Tauri expects the matching private key at build time.

## Step 1: Create a strong secret password

Use a random password for the private key encryption.

```bash
openssl rand -base64 48 | tr -d '\n'
```

Optional: store it in macOS Keychain (recommended).

```bash
security add-generic-password -a "$USER" -s locallens-tauri-key-pass -w "PASTE_GENERATED_PASSWORD_HERE"
```

Read it later when needed:

```bash
security find-generic-password -a "$USER" -s locallens-tauri-key-pass -w
```

## Step 2: Generate a Tauri key pair

From the frontend folder:

```bash
cd frontend
pnpm tauri signer generate -w "$HOME/.tauri/locallens.key" -p "YOUR_SECRET_PASSWORD"
```

What this does:

- Writes your encrypted private key to `~/.tauri/locallens.key`
- Prints the public key to terminal

Save that public key output. If you rotated keys, update `plugins.updater.pubkey` in `frontend/src-tauri/tauri.conf.json`.

## Step 3: Export variables for local build

Tauri build expects private key content in `TAURI_SIGNING_PRIVATE_KEY`.

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat "$HOME/.tauri/locallens.key")"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="YOUR_SECRET_PASSWORD"
```

Then build:

```bash
cd frontend
pnpm run tauri build
```

If these are set correctly, the missing-private-key error is resolved.

## Step 4: Configure GitHub Actions secrets

In your repository secrets, add:

- `TAURI_SIGNING_PRIVATE_KEY` = full text content of `~/.tauri/locallens.key`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = your secret password

Important for this repo: in `.github/workflows/release.yml`, set:

- `TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}`

If password stays empty in workflow while your key is encrypted, signing will fail in CI.

## Step 5: Verify your setup quickly

In the same terminal session:

```bash
test -n "$TAURI_SIGNING_PRIVATE_KEY" && echo "Private key is set"
test -n "$TAURI_SIGNING_PRIVATE_KEY_PASSWORD" && echo "Password is set"
```

You can also verify the key file exists:

```bash
ls -l "$HOME/.tauri/locallens.key"
```

## Notes and gotchas

- Do not commit private key files to git.
- If you generate a new key pair, old signed update artifacts cannot be verified by clients using the old public key.
- Keep one stable key pair for a release line unless you intentionally plan key rotation.
- Tauri signer helper commands may mention `TAURI_PRIVATE_KEY` for direct file signing commands, but Tauri build uses `TAURI_SIGNING_PRIVATE_KEY` for updater artifact signing.
