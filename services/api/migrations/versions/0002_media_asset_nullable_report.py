"""0002_media_asset_nullable_report

Revision ID: 0002_media_nullable
Revises: 0001_initial
Create Date: 2026-10-20 10:20:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '0002_media_nullable'
down_revision: Union[str, None] = '0001_initial'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.alter_column(
        'media_assets',
        'report_id',
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=True
    )

def downgrade() -> None:
    op.alter_column(
        'media_assets',
        'report_id',
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=False
    )
