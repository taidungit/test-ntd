"""add composite indexes on todos

Revision ID: a1b2c3d4e5f6
Revises: a0790c76a129
Create Date: 2026-10-03
"""
from alembic import op

revision = "a1b2c3d4e5f6"
down_revision = "a0790c76a129"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # CREATE INDEX CONCURRENTLY cannot run inside a transaction -> use autocommit_block.
    # CONCURRENTLY: does not block writes on todos while building (safe for large tables).
    with op.get_context().autocommit_block():
        # Status filter + newest first: WHERE user_id=? AND completed=? ORDER BY created_at DESC
        op.create_index(
            "ix_todos_user_completed_created",
            "todos",
            ["user_id", "completed", "created_at"],
            postgresql_concurrently=True,
            postgresql_ops={"created_at": "DESC"},
            if_not_exists=True,
        )
        # Unfiltered list: WHERE user_id=? ORDER BY created_at DESC, id DESC (stable pagination)
        # (the index above cannot serve this sort because completed sits in the middle)
        op.create_index(
            "ix_todos_user_created_id",
            "todos",
            ["user_id", "created_at", "id"],
            postgresql_concurrently=True,
            postgresql_ops={"created_at": "DESC", "id": "DESC"},
            if_not_exists=True,
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.drop_index("ix_todos_user_created_id", table_name="todos",
                      postgresql_concurrently=True, if_exists=True)
        op.drop_index("ix_todos_user_completed_created", table_name="todos",
                      postgresql_concurrently=True, if_exists=True)
