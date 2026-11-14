"""
Vault service — encrypted API credential management.

Re-exports from the reference implementation in apps/api/services/vault.py.
This module provides a clean import path for embedding into other projects.
"""

from apps.api.services.vault import VaultService  # noqa: F401
from apps.api.schemas import (  # noqa: F401
    CredentialCreate,
    CredentialUpdate,
    CredentialResponse,
)