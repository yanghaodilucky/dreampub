"""macOS Keychain storage for user-owned LLM credentials."""

from __future__ import annotations

import subprocess
import sys


KEYCHAIN_SERVICE = "DreamPub LLM API Key"
KEYCHAIN_ACCOUNT = "local-player"


class CredentialStoreError(RuntimeError):
    pass


class MacOSKeychain:
    """Keep the API key outside the game database, bundle, and web UI."""

    def load(self) -> str:
        if sys.platform != "darwin":
            return ""
        result = subprocess.run(
            ["security", "find-generic-password", "-a", KEYCHAIN_ACCOUNT, "-s", KEYCHAIN_SERVICE, "-w"],
            capture_output=True,
            text=True,
            check=False,
        )
        return result.stdout.strip() if result.returncode == 0 else ""

    def save(self, api_key: str) -> None:
        if sys.platform != "darwin":
            raise CredentialStoreError("Secure credential storage is currently available in the macOS app only")
        result = subprocess.run(
            ["security", "add-generic-password", "-U", "-a", KEYCHAIN_ACCOUNT, "-s", KEYCHAIN_SERVICE, "-w", api_key],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            raise CredentialStoreError("macOS Keychain could not save the API key")

    def clear(self) -> None:
        if sys.platform != "darwin":
            return
        subprocess.run(
            ["security", "delete-generic-password", "-a", KEYCHAIN_ACCOUNT, "-s", KEYCHAIN_SERVICE],
            capture_output=True,
            text=True,
            check=False,
        )
