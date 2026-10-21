import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import asyncio
import uuid
from datetime import datetime, timedelta
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.core.security import get_password_hash
from app.models.user import User, TrustedContact
from app.models.operating_area import OperatingArea
from app.models.responder import ResponderProfile
from app.models.incident import Incident, IncidentReport, IncidentStatusEvent
from app.models.report import Report
from app.common.spatial import point_to_wkt, geojson_to_wkt_polygon

async def seed_database():
    print("[INFO] Seeding ResQAi database with synthetic demo data...")

    async with AsyncSessionLocal() as session:
        # 1. Clean existing seed data
        user_check = await session.execute(select(User).where(User.email == "citizen@campus.demo"))
        if user_check.scalar_one_or_none():
            print("Database already contains demo data. Skipping clean.")
            return

        demo_password_hash = get_password_hash("demo1234")

        # 2. Demo Users
        citizen = User(
            id=uuid.UUID("11111111-1111-1111-1111-111111111111"),
            email="citizen@campus.demo",
            hashed_password=demo_password_hash,
            full_name="Aisha Rahman",
            phone="+919876543210",
            role="citizen",
            is_active=True
        )

        responder_user = User(
            id=uuid.UUID("22222222-2222-2222-2222-222222222222"),
            email="responder@campus.demo",
            hashed_password=demo_password_hash,
            full_name="Rohit Nair",
            phone="+919876543220",
            role="responder",
            is_active=True
        )

        operator_user = User(
            id=uuid.UUID("33333333-3333-3333-3333-333333333333"),
            email="operator@campus.demo",
            hashed_password=demo_password_hash,
            full_name="Meera Kapoor",
            phone="+919876543230",
            role="operator",
            is_active=True
        )

        admin_user = User(
            id=uuid.UUID("44444444-4444-4444-4444-444444444444"),
            email="admin@campus.demo",
            hashed_password=demo_password_hash,
            full_name="Campus Admin",
            phone="+919876543240",
            role="admin",
            is_active=True
        )

        session.add_all([citizen, responder_user, operator_user, admin_user])
        await session.flush()

        # 3. Trusted Contacts for Citizen
        c1 = TrustedContact(
            user_id=citizen.id,
            name="Tariq Rahman",
            phone="+919876543211",
            relationship_label="Brother"
        )
        c2 = TrustedContact(
            user_id=citizen.id,
            name="Priya Sharma",
            phone="+919876543212",
            relationship_label="Friend"
        )
        c3 = TrustedContact(
            user_id=citizen.id,
            name="Campus Security Desk",
            phone="+919876543200",
            relationship_label="Campus Security"
        )
        session.add_all([c1, c2, c3])

        # 4. Campus Geofence Boundary
        # Northridge Campus polygon around center 28.5452, 77.2731
        campus_geojson = {
            "type": "Polygon",
            "coordinates": [[
                [77.2690, 28.5410],
                [77.2770, 28.5410],
                [77.2770, 28.5490],
                [77.2690, 28.5490],
                [77.2690, 28.5410]
            ]]
        }
        campus_area = OperatingArea(
            name="Northridge Campus (synthetic)",
            boundary=geojson_to_wkt_polygon(campus_geojson),
            is_active=True
        )
        session.add(campus_area)

        # 5. Responder Profiles
        resp_f2 = ResponderProfile(
            user_id=responder_user.id,
            unit_code="F-2",
            display_name="Fire Unit F-2",
            responder_type="fire_warden",
            capabilities=["first_aid", "firefighting", "rescue"],
            is_on_duty=True,
            availability_status="available",
            is_approved=True,
            last_known_location=point_to_wkt(28.5455, 77.2735),
            last_ping_at=datetime.utcnow()
        )
        session.add(resp_f2)

        # Extra demo responders for roster
        user_a12 = User(
            email="ambulance@campus.demo",
            hashed_password=demo_password_hash,
            full_name="Paramedic Lead",
            role="responder"
        )
        session.add(user_a12)
        await session.flush()

        resp_a12 = ResponderProfile(
            user_id=user_a12.id,
            unit_code="A-12",
            display_name="Ambulance Alpha",
            responder_type="medical_volunteer",
            capabilities=["first_aid", "medical"],
            is_on_duty=True,
            availability_status="busy",
            is_approved=True,
            last_known_location=point_to_wkt(28.5430, 77.2710),
            last_ping_at=datetime.utcnow()
        )
        session.add(resp_a12)

        user_p07 = User(
            email="patrol07@campus.demo",
            hashed_password=demo_password_hash,
            full_name="Security Patrol 07",
            role="responder"
        )
        session.add(user_p07)
        await session.flush()

        resp_p07 = ResponderProfile(
            user_id=user_p07.id,
            unit_code="P-07",
            display_name="Patrol 07",
            responder_type="campus_security",
            capabilities=["security_patrol", "first_aid"],
            is_on_duty=True,
            availability_status="available",
            is_approved=True,
            last_known_location=point_to_wkt(28.5470, 77.2750),
            last_ping_at=datetime.utcnow()
        )
        session.add(resp_p07)

        # Unapproved volunteer to test vetting gate
        user_v01 = User(
            email="volunteer@campus.demo",
            hashed_password=demo_password_hash,
            full_name="New Volunteer",
            role="responder"
        )
        session.add(user_v01)
        await session.flush()

        resp_v01 = ResponderProfile(
            user_id=user_v01.id,
            unit_code="V-01",
            display_name="Volunteer Team",
            responder_type="volunteer",
            capabilities=["first_aid"],
            is_on_duty=False,
            availability_status="off_duty",
            is_approved=False
        )
        session.add(resp_v01)

        # 6. Sample Initial Incidents & Reports
        # Incident 402: Fire & Smoke
        inc_402 = Incident(
            public_code="402",
            title="Incident 402 · Fire & Smoke",
            category="fire_smoke",
            urgency="critical",
            status="assigned",
            evidence_label="unverified",
            location=point_to_wkt(28.5464, 77.2741),
            location_label="Market road (synthetic)",
            operator_notes="Reported active flame in ground floor cafe kitchen.",
            created_at=datetime.utcnow() - timedelta(minutes=15)
        )
        session.add(inc_402)
        await session.flush()

        rep_1 = Report(
            reporter_id=citizen.id,
            channel="form",
            category="fire_smoke",
            urgency="critical",
            raw_text="Visible dense smoke and flames coming from shop window",
            location=point_to_wkt(28.5464, 77.2741),
            location_label="Market road cafe",
            status="linked",
            processing_state="ai_complete",
            created_at=datetime.utcnow() - timedelta(minutes=15)
        )
        session.add(rep_1)
        await session.flush()

        session.add(IncidentReport(incident_id=inc_402.id, report_id=rep_1.id, link_reason="Initial report"))

        # Incident SOS-19: Personal SOS
        inc_sos = Incident(
            public_code="SOS-19",
            title="Personal SOS",
            category="personal_safety",
            urgency="critical",
            status="under_review",
            evidence_label="insufficient_evidence",
            hide_precise_location=True,
            location=point_to_wkt(28.5444, 77.2735),
            location_label="Station road — coarsened for public map",
            operator_notes="Emergency beacon broadcasted by student.",
            created_at=datetime.utcnow() - timedelta(minutes=8)
        )
        session.add(inc_sos)

        # Incident 118: Road Accident
        inc_acc = Incident(
            public_code="118",
            title="Road accident",
            category="road_accident",
            urgency="high",
            status="confirmed",
            evidence_label="possible_duplicate",
            location=point_to_wkt(28.5456, 77.2717),
            location_label="Bypass junction (synthetic)",
            operator_notes="Two-wheeler collision at pedestrian crossing.",
            created_at=datetime.utcnow() - timedelta(minutes=25)
        )
        session.add(inc_acc)

        await session.commit()
        print("[SUCCESS] Database seeding completed successfully!")

if __name__ == "__main__":
    asyncio.run(seed_database())
