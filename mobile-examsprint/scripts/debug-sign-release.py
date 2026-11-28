"""Point the Expo release build at the debug keystore.

The APK this produces is installable for a hackathon demo. It is not the key
a store listing should ship with. A release upload needs a keystore the owner
keeps outside git.
"""

from pathlib import Path

gradle = Path(__file__).resolve().parents[1] / "android" / "app" / "build.gradle"
text = gradle.read_text()
marker = "release {"
start = text.find(marker)
if start < 0:
    raise SystemExit(f"No release build type in {gradle}")
window = text[start : start + 400]
if "signingConfig" in window:
    print("release already has a signingConfig")
else:
    text = text.replace(marker, marker + "\n            signingConfig signingConfigs.debug", 1)
    gradle.write_text(text)
    print("release now uses the debug keystore")
