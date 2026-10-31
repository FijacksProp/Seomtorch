from django.db import migrations

ASPIRANT_SUBJECTS = [
    ("biology", "Biology", "JAMB cell biology, physiology, ecology, genetics and evolution", 1),
    ("chemistry", "Chemistry", "JAMB physical, inorganic and organic chemistry", 2),
    ("civic-education", "Civic Education", "WAEC & JAMB citizenship, human rights, democracy and governance", 3),
    ("computer-studies", "Computer Studies", "Hardware, software, networking, logic, programming and data processing", 4),
    ("economics", "Economics", "Microeconomics, macroeconomics, national income, trade and public finance", 5),
    ("english", "English Language", "Usage, comprehension and oral forms", 6),
    ("further-mathematics", "Further Mathematics", "Pure mathematics, mechanics, statistics, vectors, matrices and calculus", 7),
    ("general-paper", "General Paper", "Civics, current affairs and general knowledge", 8),
    ("government", "Government", "Political theories, Nigerian constitutional development, institutions and foreign policy", 9),
    ("history", "History", "Nigerian, African and world history from pre-colonial to modern times", 10),
    ("literature-in-english", "Literature in English", "Literary devices, African and non-African prose, drama, and poetry", 11),
    ("marketing", "Marketing", "Marketing concepts, 4Ps, distribution channels, promotion and consumer behavior", 12),
    ("mathematics", "Mathematics", "Numbers, algebra, geometry and calculus", 13),
    ("music", "Music", "JAMB music theory, African music and Western art music", 14),
    ("physics", "Physics", "JAMB mechanics, waves, electricity and modern physics", 15),
]

UNIVERSITY_SUBJECTS = [
    ("ana-201", "ANA 201", "ANA 201: Upper and Lower Limb", "Anatomy of the upper limb, lower limb, osteology and musculature", 101),
    ("ana-203", "ANA 203", "ANA 203: General & Systemic Embryology", "Embryological development, gametogenesis, fertilization, and congenital anomalies", 102),
    ("pio-201", "PIO 201", "PIO 201: Physiology and Blood", "General physiology, membrane transport, body fluids, homeostasis, and hematology", 103),
]

def populate_subjects(apps, schema_editor):
    Subject = apps.get_model("learning", "Subject")
    for slug, name, desc, pos in ASPIRANT_SUBJECTS:
        Subject.objects.update_or_create(
            slug=slug,
            defaults={
                "name": name,
                "description": desc,
                "position": pos,
                "track": "aspirant",
                "is_active": True,
            }
        )
    for slug, code, name, desc, pos in UNIVERSITY_SUBJECTS:
        Subject.objects.update_or_create(
            slug=slug,
            defaults={
                "code": code,
                "name": name,
                "description": desc,
                "position": pos,
                "track": "university",
                "is_active": True,
            }
        )

def unpopulate_subjects(apps, schema_editor):
    pass

class Migration(migrations.Migration):
    dependencies = [
        ('learning', '0007_practicesession_course_code_and_more'),
    ]

    operations = [
        migrations.RunPython(populate_subjects, unpopulate_subjects),
    ]
