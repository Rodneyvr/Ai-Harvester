from typing import Optional
from uuid import UUID

from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import ApiCredential
from ..schemas import CredentialCreate, CredentialUpdate, CredentialResponse, CredentialRevealResponse
from ..core.security import get_encryption_service


class VaultService:
    """Service for managing API credentials with encryption."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.crypto = get_encryption_service()

    async def create(self, data: CredentialCreate) -> CredentialResponse:
        """Create a new encrypted credential."""
        encrypted = self.crypto.encrypt_for_storage(data.value)

        credential = ApiCredential(
            name=data.name,
            provider=data.provider,
            category=data.category,
            tags=data.tags,
            environment=data.environment,
            encrypted_value=encrypted["encrypted_value"],
            nonce=encrypted["nonce"],
            tag=encrypted["tag"],
            metadata=data.metadata,
        )
        self.session.add(credential)
        await self.session.flush()
        await self.session.refresh(credential)
        return CredentialResponse.model_validate(credential)

    async def get(self, credential_id: UUID) -> Optional[CredentialResponse]:
        """Get a credential by ID (without decrypted value)."""
        result = await self.session.execute(
            select(ApiCredential).where(ApiCredential.id == credential_id)
        )
        credential = result.scalar_one_or_none()
        if credential:
            return CredentialResponse.model_validate(credential)
        return None

    async def list(
        self,
        category: Optional[str] = None,
        environment: Optional[str] = None,
        provider: Optional[str] = None,
        search: Optional[str] = None,
        tags: Optional[list[str]] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[CredentialResponse], int]:
        """List credentials with filters and pagination."""
        query = select(ApiCredential)

        if category:
            query = query.where(ApiCredential.category == category)
        if environment:
            query = query.where(ApiCredential.environment == environment)
        if provider:
            query = query.where(ApiCredential.provider.ilike(f"%{provider}%"))
        if search:
            query = query.where(
                ApiCredential.name.ilike(f"%{search}%")
                | ApiCredential.provider.ilike(f"%{search}%")
            )
        if tags:
            for tag in tags:
                query = query.where(ApiCredential.tags.contains([tag]))

        # Count total
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await self.session.execute(count_query)
        total = total_result.scalar()

        # Paginate
        query = query.order_by(ApiCredential.created_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)

        result = await self.session.execute(query)
        credentials = result.scalars().all()

        return [CredentialResponse.model_validate(c) for c in credentials], total

    async def update(self, credential_id: UUID, data: CredentialUpdate) -> Optional[CredentialResponse]:
        """Update a credential."""
        result = await self.session.execute(
            select(ApiCredential).where(ApiCredential.id == credential_id)
        )
        credential = result.scalar_one_or_none()
        if not credential:
            return None

        if data.name is not None:
            credential.name = data.name
        if data.provider is not None:
            credential.provider = data.provider
        if data.category is not None:
            credential.category = data.category
        if data.tags is not None:
            credential.tags = data.tags
        if data.environment is not None:
            credential.environment = data.environment
        if data.metadata is not None:
            credential.metadata = data.metadata
        if data.value is not None:
            encrypted = self.crypto.encrypt_for_storage(data.value)
            credential.encrypted_value = encrypted["encrypted_value"]
            credential.nonce = encrypted["nonce"]
            credential.tag = encrypted["tag"]

        await self.session.flush()
        await self.session.refresh(credential)
        return CredentialResponse.model_validate(credential)

    async def delete(self, credential_id: UUID) -> bool:
        """Delete a credential."""
        result = await self.session.execute(
            delete(ApiCredential).where(ApiCredential.id == credential_id)
        )
        return result.rowcount > 0

    async def reveal(self, credential_id: UUID) -> Optional[CredentialRevealResponse]:
        """Decrypt and reveal a credential value."""
        result = await self.session.execute(
            select(ApiCredential).where(ApiCredential.id == credential_id)
        )
        credential = result.scalar_one_or_none()
        if not credential:
            return None

        value = self.crypto.decrypt_from_storage(
            credential.encrypted_value, credential.nonce, credential.tag
        )
        return CredentialRevealResponse(id=credential.id, name=credential.name, value=value)

    async def export_env(self, credential_ids: Optional[list[UUID]] = None) -> str:
        """Export selected credentials as .env format."""
        if credential_ids:
            result = await self.session.execute(
                select(ApiCredential).where(ApiCredential.id.in_(credential_ids))
            )
        else:
            result = await self.session.execute(select(ApiCredential))
        credentials = result.scalars().all()

        lines = ["# Exported from AI Harvester Vault", ""]
        for cred in credentials:
            value = self.crypto.decrypt_from_storage(
                cred.encrypted_value, cred.nonce, cred.tag
            )
            # Sanitize name for env var
            env_name = cred.name.upper().replace(" ", "_").replace("-", "_")
            lines.append(f"{env_name}={value}")

        return "\n".join(lines)

    async def get_categories(self) -> list[str]:
        """Get all unique categories."""
        result = await self.session.execute(
            select(ApiCredential.category).distinct().where(ApiCredential.category.isnot(None))
        )
        return [c for c in result.scalars().all() if c]

    async def get_providers(self) -> list[str]:
        """Get all unique providers."""
        result = await self.session.execute(
            select(ApiCredential.provider).distinct()
        )
        return result.scalars().all()