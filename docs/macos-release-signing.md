# macOS release signing

Cosmos ships as a zipped `Cosmos.app`, not an installer package. The release needs a Developer ID Application certificate issued to Polarity Lab LLC. It does not need a Developer ID Installer certificate.

The App Store Connect `.p8` key authenticates notarization. It cannot sign the app. Code signing uses the private key paired with the Developer ID Application certificate in the macOS keychain.

## Required local inputs

- A `Developer ID Application: Polarity Lab LLC (<team id>)` certificate with its matching private key in the login keychain
- The App Store Connect Issuer ID for key `CHA2KDX6C4`
- The org Apple Team ID, recommended as `POLARITY_TEAM_ID` so the build verifies the selected certificate and signed bundle
- The existing key at `/Users/shadrack/projects/cosmos/.secrets/apple/AuthKey_CHA2KDX6C4.p8`

`scripts/resolve-sign-identity.sh` accepts only Developer ID Application identities named Polarity Lab or Polarity Lab LLC. It will not fall back to a personal certificate.

## Local release build

```bash
export NOTARY_ISSUER_ID="<app-store-connect-issuer-uuid>"
export POLARITY_TEAM_ID="<polarity-apple-team-id>"
bash scripts/build-daemon-app.sh
```

The script builds `dist/Cosmos.app`, signs both executables and the bundle with the hardened runtime and timestamp, submits `dist/Cosmos.zip` to Apple, then staples and validates the notarization ticket.

Do not replace the installed `~/Applications/Cosmos Sync.app` until this build completes. Verify the finished artifact before installation.

```bash
codesign --verify --deep --strict --verbose=2 dist/Cosmos.app
codesign -dv --verbose=4 dist/Cosmos.app
spctl --assess --type execute --verbose=4 dist/Cosmos.app
xcrun stapler validate dist/Cosmos.app
```

## GitHub Actions inputs

The release workflow needs these repository secrets.

- `DEV_ID_P12_BASE64`
- `DEV_ID_P12_PASSWORD`
- `KEYCHAIN_PASSWORD`
- `SIGN_IDENTITY`
- `POLARITY_TEAM_ID`
- `NOTARY_KEY_P8`
- `NOTARY_KEY_ID`, set to `CHA2KDX6C4`
- `NOTARY_ISSUER_ID`

The workflow uploads `dist/Cosmos.zip`, the notarized archive produced by the build script. Uploading the `.app` directory directly would flatten executable permissions inside the bundle.
