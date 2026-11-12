"""Tests for AES-256-GCM encryption/decryption."""

import pytest
from app.core.security import EncryptionService, EncryptedValue


def test_encrypt_decrypt_roundtrip():
    """Plaintext should survive encrypt -> decrypt roundtrip."""
    crypto = EncryptionService(master_key_b64="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
    plaintext = "sk-1234567890abcdef"
    encrypted = crypto.encrypt(plaintext)
    decrypted = crypto.decrypt(encrypted)
    assert decrypted == plaintext


def test_different_nonce_different_ciphertext():
    """Same plaintext encrypted twice should produce different ciphertexts."""
    crypto = EncryptionService(master_key_b64="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
    plaintext = "same-secret"
    e1 = crypto.encrypt(plaintext)
    e2 = crypto.encrypt(plaintext)
    assert e1.ciphertext != e2.ciphertext
    assert e1.nonce != e2.nonce


def test_wrong_key_fails_to_decrypt():
    """Decryption with wrong key should raise an error."""
    crypto1 = EncryptionService(master_key_b64="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
    crypto2 = EncryptionService(master_key_b64="BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=")
    encrypted = crypto1.encrypt("secret")
    with pytest.raises(Exception):
        crypto2.decrypt(encrypted)


def test_encrypted_value_serialization():
    """EncryptedValue should serialize/deserialize correctly."""
    ev = EncryptedValue(ciphertext=b"ct", nonce=b"nonce1234567", tag=b"tag1234567890ab")
    data = ev.to_dict()
    ev2 = EncryptedValue.from_dict(data)
    assert ev2.ciphertext == b"ct"
    assert ev2.nonce == b"nonce1234567"
    assert ev2.tag == b"tag1234567890ab"


def test_encrypted_value_bytes_roundtrip():
    """EncryptedValue should serialize to bytes and back."""
    ev = EncryptedValue(ciphertext=b"ct", nonce=b"nonce1234567", tag=b"tag1234567890ab")
    raw = ev.to_bytes()
    ev2 = EncryptedValue.from_bytes(raw)
    assert ev2.ciphertext == b"ct"
    assert ev2.nonce == b"nonce1234567"
    assert ev2.tag == b"tag1234567890ab"


def test_invalid_key_raises():
    """Invalid master key length should raise ValueError."""
    with pytest.raises(ValueError):
        EncryptionService(master_key_b64="short")


def test_missing_key_raises():
    """Empty master key should raise ValueError."""
    with pytest.raises(ValueError):
        EncryptionService(master_key_b64="")


def test_storage_format():
    """encrypt_for_storage should return separate ciphertext/nonce/tag."""
    crypto = EncryptionService(master_key_b64="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
    result = crypto.encrypt_for_storage("my-secret")
    assert "encrypted_value" in result
    assert "nonce" in result
    assert "tag" in result
    decrypted = crypto.decrypt_from_storage(
        result["encrypted_value"], result["nonce"], result["tag"]
    )
    assert decrypted == "my-secret"