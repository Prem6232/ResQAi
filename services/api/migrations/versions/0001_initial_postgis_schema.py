"""0001_initial_postgis_schema

Revision ID: 0001_initial
Revises: 
Create Date: 2026-10-20 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import geoalchemy2

revision: str = '0001_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # 1. Enable PostGIS Extension
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis;")

    # 2. Table: users
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('hashed_password', sa.String(255), nullable=False),
        sa.Column('full_name', sa.String(255), nullable=False),
        sa.Column('phone', sa.String(50), nullable=True),
        sa.Column('role', sa.String(50), nullable=False, server_default='citizen'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_users_email', 'users', ['email'], unique=True)
    op.create_index('ix_users_role', 'users', ['role'])
    op.create_index('ix_users_created_at', 'users', ['created_at'])

    # 3. Table: trusted_contacts
    op.create_table(
        'trusted_contacts',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('phone', sa.String(50), nullable=False),
        sa.Column('relationship_label', sa.String(100), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_trusted_contacts_user_id', 'trusted_contacts', ['user_id'])

    # 4. Table: operating_areas
    op.create_table(
        'operating_areas',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('boundary', geoalchemy2.types.Geometry(geometry_type='POLYGON', srid=4326), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # 5. Table: responder_profiles
    op.create_table(
        'responder_profiles',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('unit_code', sa.String(50), nullable=False, unique=True),
        sa.Column('display_name', sa.String(255), nullable=True),
        sa.Column('responder_type', sa.String(50), nullable=False, server_default='campus_security'),
        sa.Column('capabilities', postgresql.JSON(astext_type=sa.Text()), nullable=False, server_default='[]'),
        sa.Column('is_on_duty', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('availability_status', sa.String(50), nullable=False, server_default='off_duty'),
        sa.Column('share_location', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('last_known_location', geoalchemy2.types.Geometry(geometry_type='POINT', srid=4326), nullable=True),
        sa.Column('last_ping_at', sa.DateTime(), nullable=True),
        sa.Column('is_approved', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_responder_profiles_unit_code', 'responder_profiles', ['unit_code'], unique=True)
    op.create_index('ix_responder_profiles_is_on_duty', 'responder_profiles', ['is_on_duty'])
    op.create_index('ix_responder_profiles_availability_status', 'responder_profiles', ['availability_status'])
    op.create_index('ix_responder_profiles_is_approved', 'responder_profiles', ['is_approved'])

    # 6. Table: reports
    op.create_table(
        'reports',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('reporter_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('channel', sa.String(50), nullable=False, server_default='form'),
        sa.Column('category', sa.String(50), nullable=False),
        sa.Column('urgency', sa.String(50), nullable=False, server_default='high'),
        sa.Column('raw_text', sa.Text(), nullable=True),
        sa.Column('location', geoalchemy2.types.Geometry(geometry_type='POINT', srid=4326), nullable=False),
        sa.Column('location_label', sa.String(255), nullable=True),
        sa.Column('status', sa.String(50), nullable=False, server_default='submitted'),
        sa.Column('processing_state', sa.String(50), nullable=False, server_default='received'),
        sa.Column('delivery_state', sa.String(50), nullable=False, server_default='received_by_server'),
        sa.Column('is_offline_draft', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('idempotency_key', sa.String(255), nullable=True, unique=True),
        sa.Column('cancelled_reason', sa.String(255), nullable=True),
        sa.Column('submitted_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_reports_reporter_id', 'reports', ['reporter_id'])
    op.create_index('ix_reports_category', 'reports', ['category'])
    op.create_index('ix_reports_urgency', 'reports', ['urgency'])
    op.create_index('ix_reports_status', 'reports', ['status'])
    op.create_index('ix_reports_processing_state', 'reports', ['processing_state'])
    op.create_index('ix_reports_idempotency_key', 'reports', ['idempotency_key'], unique=True)
    op.create_index('ix_reports_created_at', 'reports', ['created_at'])

    # 7. Table: media_assets
    op.create_table(
        'media_assets',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('report_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('reports.id', ondelete='CASCADE'), nullable=False),
        sa.Column('file_type', sa.String(50), nullable=False),
        sa.Column('file_name', sa.String(255), nullable=True),
        sa.Column('s3_key', sa.String(500), nullable=False),
        sa.Column('file_size_bytes', sa.Integer(), nullable=True),
        sa.Column('mime_type', sa.String(100), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_media_assets_report_id', 'media_assets', ['report_id'])

    # 8. Table: incidents
    op.create_table(
        'incidents',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('public_code', sa.String(50), nullable=False, unique=True),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('category', sa.String(50), nullable=False),
        sa.Column('urgency', sa.String(50), nullable=False, server_default='high'),
        sa.Column('status', sa.String(50), nullable=False, server_default='reported'),
        sa.Column('evidence_label', sa.String(100), nullable=False, server_default='unverified'),
        sa.Column('hide_precise_location', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('location', geoalchemy2.types.Geometry(geometry_type='POINT', srid=4326), nullable=False),
        sa.Column('location_label', sa.String(255), nullable=True),
        sa.Column('operator_notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_incidents_public_code', 'incidents', ['public_code'], unique=True)
    op.create_index('ix_incidents_category', 'incidents', ['category'])
    op.create_index('ix_incidents_urgency', 'incidents', ['urgency'])
    op.create_index('ix_incidents_status', 'incidents', ['status'])
    op.create_index('ix_incidents_created_at', 'incidents', ['created_at'])

    # 9. Table: incident_reports (link table)
    op.create_table(
        'incident_reports',
        sa.Column('incident_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('incidents.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('report_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('reports.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('linked_by_user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('linked_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('link_reason', sa.String(255), nullable=True),
    )

    # 10. Table: incident_status_events
    op.create_table(
        'incident_status_events',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('incident_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('incidents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('from_status', sa.String(50), nullable=True),
        sa.Column('to_status', sa.String(50), nullable=False),
        sa.Column('actor_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('actor_role', sa.String(50), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_incident_status_events_incident_id', 'incident_status_events', ['incident_id'])

    # 11. Table: assignments
    op.create_table(
        'assignments',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('incident_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('incidents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('responder_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('responder_profiles.id', ondelete='CASCADE'), nullable=False),
        sa.Column('status', sa.String(50), nullable=False, server_default='offered'),
        sa.Column('offer_deadline', sa.DateTime(), nullable=True),
        sa.Column('offered_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('acknowledged_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('eta_minutes', sa.Integer(), nullable=True),
        sa.Column('distance_km', sa.Float(), nullable=True),
        sa.Column('route_note', sa.Text(), nullable=True),
    )
    op.create_index('ix_assignments_incident_id', 'assignments', ['incident_id'])
    op.create_index('ix_assignments_responder_id', 'assignments', ['responder_id'])
    op.create_index('ix_assignments_status', 'assignments', ['status'])

    # 12. Table: assignment_events
    op.create_table(
        'assignment_events',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('assignment_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('assignments.id', ondelete='CASCADE'), nullable=False),
        sa.Column('from_status', sa.String(50), nullable=True),
        sa.Column('to_status', sa.String(50), nullable=False),
        sa.Column('triggered_by_user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('reason', sa.String(255), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_assignment_events_assignment_id', 'assignment_events', ['assignment_id'])

    # 13. Table: ai_assessments
    op.create_table(
        'ai_assessments',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('report_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('reports.id', ondelete='CASCADE'), nullable=False),
        sa.Column('pipeline_type', sa.String(100), nullable=False),
        sa.Column('model_name', sa.String(100), nullable=False),
        sa.Column('model_version', sa.String(50), nullable=False),
        sa.Column('confidence_score', sa.Float(), nullable=True),
        sa.Column('explanation', sa.Text(), nullable=True),
        sa.Column('raw_output', postgresql.JSON(astext_type=sa.Text()), nullable=False, server_default='{}'),
        sa.Column('is_flagged_uncertain', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_ai_assessments_report_id', 'ai_assessments', ['report_id'])
    op.create_index('ix_ai_assessments_pipeline_type', 'ai_assessments', ['pipeline_type'])

    # 14. Table: outbox_events
    op.create_table(
        'outbox_events',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('aggregate_type', sa.String(100), nullable=False),
        sa.Column('aggregate_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('event_type', sa.String(100), nullable=False),
        sa.Column('payload', postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column('status', sa.String(50), nullable=False, server_default='pending'),
        sa.Column('retry_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('processed_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_outbox_events_aggregate_type', 'outbox_events', ['aggregate_type'])
    op.create_index('ix_outbox_events_aggregate_id', 'outbox_events', ['aggregate_id'])
    op.create_index('ix_outbox_events_event_type', 'outbox_events', ['event_type'])
    op.create_index('ix_outbox_events_status', 'outbox_events', ['status'])
    op.create_index('ix_outbox_events_created_at', 'outbox_events', ['created_at'])

    # 15. Table: audit_logs
    op.create_table(
        'audit_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('actor_email', sa.String(255), nullable=True),
        sa.Column('action', sa.String(100), nullable=False),
        sa.Column('target_entity', sa.String(100), nullable=False),
        sa.Column('target_id', sa.String(100), nullable=False),
        sa.Column('details', postgresql.JSON(astext_type=sa.Text()), nullable=False, server_default='{}'),
        sa.Column('ip_address', sa.String(50), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_audit_logs_user_id', 'audit_logs', ['user_id'])
    op.create_index('ix_audit_logs_actor_email', 'audit_logs', ['actor_email'])
    op.create_index('ix_audit_logs_action', 'audit_logs', ['action'])
    op.create_index('ix_audit_logs_target_entity', 'audit_logs', ['target_entity'])
    op.create_index('ix_audit_logs_target_id', 'audit_logs', ['target_id'])
    op.create_index('ix_audit_logs_created_at', 'audit_logs', ['created_at'])

def downgrade() -> None:
    op.drop_table('audit_logs')
    op.drop_table('outbox_events')
    op.drop_table('ai_assessments')
    op.drop_table('assignment_events')
    op.drop_table('assignments')
    op.drop_table('incident_status_events')
    op.drop_table('incident_reports')
    op.drop_table('incidents')
    op.drop_table('media_assets')
    op.drop_table('reports')
    op.drop_table('responder_profiles')
    op.drop_table('operating_areas')
    op.drop_table('trusted_contacts')
    op.drop_table('users')
