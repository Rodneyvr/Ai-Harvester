import base64
import os
from dataclasses import dataclass
from typing import ClassVar

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .config import get_settings


@dataclass(slots=True)
class EncryptedValue:
    ciphertext: bytes
    nonce: bytes
    tag: bytes

    def to_bytes(self) -> bytes:
        """Serialize as nonce(12) + tag(16) + ciphertext for storage."""
        return self.nonce + self.tag + self.ciphertext

    @classmethod
    def from_bytes(cls, data: bytes) -> "EncryptedValue":
        """Deserialize from nonce(12) + tag(16) + ciphertext."""
        if len(data) < 28:
            raise ValueError("Invalid encrypted data length")
        nonce = data[:12]
        tag = data[12:28]
        ciphertext = data[28:]
        return cls(ciphertext=ciphertext, nonce=nonce, tag=tag)

    def to_dict(self) -> dict[str, str]:
        """Convert to base64-encoded dict for JSON transport."""
        return {
            "ciphertext": base64.b64encode(self.ciphertext).decode(),
            "nonce": base64.b64encode(self.nonce).decode(),
            "tag": base64.b64encode(self.tag).decode(),
        }

    @classmethod
    def from_dict(cls, data: dict[str, str]) -> "EncryptedValue":
        """Create from base64-encoded dict."""
        return cls(
            ciphertext=base64.b64decode(data["ciphertext"]),
            nonce=base64.b64decode(data["nonce"]),
            tag=base64.b64decode(data["tag"]),
        )


class EncryptionService:
    """AES-256-GCM encryption service for API credentials."""

    KEY_SIZE: ClassVar[int] = 32  # 256 bits
    NONCE_SIZE: ClassVar[int] = 12  # 96 bits for GCM
    TAG_SIZE: ClassVar[int] = 16  # 128 bits

    def __init__(self, master_key_b64: Optional[str] = None):
        settings = get_settings()
        key_b64 = master_key_b64 or settings.master_encryption_key
        if not key_b64:
            raise ValueError("Master encryption key not configured")
        self._key = base64.b64decode(key_b64)
        if len(self._key) != self.KEY_SIZE:
            raise ValueError(f"Master key must be {self.KEY_SIZE} bytes")
        self._aesgcm = AESGCM(self._key)

    def encrypt(self, plaintext: str, associated_data: Optional[bytes] = None) -> EncryptedValue:
        """
        Encrypt a plaintext string.

        Args:
            plaintext: The secret value to encrypt
            associated_data: Optional AAD for additional authentication

        Returns:
            EncryptedValue with ciphertext, nonce, and tag
        """
        nonce = os.urandom(self.NONCE_SIZE)
        data = plaintext.encode("utf-8")
        ciphertext_with_tag = self._aesgcm.encrypt(nonce, data, associated_data)

        # AESGCM returns ciphertext + tag concatenated
        tag = ciphertext_with_tag[-self.TAG_SIZE:]
        ciphertext = ciphertext_with_tag[:-self.TAG_SIZE]

        return EncryptedValue(ciphertext=ciphertext, nonce=nonce, tag=tag)

    def decrypt(
        self, encrypted: EncryptedValue, associated_data: Optional[bytes] = None
    ) -> str:
        """
        Decrypt an EncryptedValue back to plaintext.

        Args:
            encrypted: The EncryptedValue to decrypt
            associated_data: Optional AAD (must match encryption)

        Returns:
            Decrypted plaintext string
        """
        # Reconstruct ciphertext + tag for AESGCM
        ciphertext_with_tag = encrypted.ciphertext + encrypted.tag
        data = self._aesgcm.decrypt(encrypted.nonce, ciphertext_with_tag, associated_data)
        return data.decode("utf-8")

    def encrypt_for_storage(self, plaintext: str) -> dict[str, bytes]:
        """Encrypt and return dict with separate fields for DB storage."""
        encrypted = self.encrypt(plaintext)
        return {
            "encrypted_value": encrypted.ciphertext,
            "nonce": encrypted.nonce,
            "tag": encrypted.tag,
        }

    def decrypt_from_storage(
        self, encrypted_value: bytes, nonce: bytes, tag: bytes
    ) -> str:
        """Decrypt from separate DB fields."""
        encrypted = EncryptedValue(ciphertext=encrypted_value, nonce=nonce, tag=tag)
        return self.decrypt(encrypted)


# Singleton instance
_encryption_service: Optional[EncryptionService] = None


def get_encryption_service() -> EncryptionService:
    global _encryption_service
    if _encryption_service is None:
        _encryption_service = EncryptionService()
    return _encryption_service