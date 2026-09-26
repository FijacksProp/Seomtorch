import json
import re

raw_text = """
1. Which muscle inserts into the medial lip of the intertubercular (bicipital) groove of the humerus?
A. Pectoralis major
B. Latissimus dorsi
C. Teres major
D. Subscapularis  
Correct Answer: C. Teres major  
Explanation: Teres major inserts into the medial lip of the bicipital groove. Pectoralis major inserts into the lateral lip, while latissimus dorsi inserts into the floor of the groove ("a lady between two majors").  
2. The clavicular head of the pectoralis major originates from which part of the clavicle?
A. Lateral one-third of the superior surface
B. Medial half of the anterior border
C. Inferior surface of the middle third
D. Acromial extremity  
Correct Answer: B. Medial half of the anterior border  
Explanation: The clavicular head of pectoralis major arises from the anterior surface of the medial half of the clavicle, whereas the sternocostal head arises from the anterior manubrium, sternal body, and upper six costal cartilages.  
3. Which muscle inserts into the medial border of the coracoid process of the scapula?
A. Coracobrachialis
B. Pectoralis minor
C. Biceps brachii (short head)
D. Subclavius  
Correct Answer: B. Pectoralis minor  
Explanation: Pectoralis minor inserts onto the medial border and superior surface of the coracoid process. In contrast, coracobrachialis and the short head of biceps brachii originate from its apex.  
4. The tendon of latissimus dorsi inserts into which bony landmark of the humerus?
A. Crest of the greater tubercle
B. Floor of the intertubercular groove
C. Deltoid tuberosity
D. Lesser tubercle  
Correct Answer: B. Floor of the intertubercular groove  
Explanation: Latissimus dorsi winds around the lower border of teres major to insert into the floor of the intertubercular groove of the humerus.  
5. Paralysis of which muscle produces characteristic "winging of the scapula" due to long thoracic nerve injury?
A. Rhomboid major
B. Serratus anterior
C. Trapezius
D. Levator scapulae  
Correct Answer: B. Serratus anterior  
Explanation: Serratus anterior anchors the costal surface of the medial border and inferior angle of the scapula against the thoracic wall. Injury to the long thoracic nerve (C5, C6, C7) causes the medial border to lift posteriorly off the thorax.  
6. Which rotator cuff muscle inserts onto the lesser tubercle of the humerus?
A. Supraspinatus
B. Infraspinatus
C. Teres minor
D. Subscapularis  
Correct Answer: D. Subscapularis  
Explanation: Subscapularis is the only anterior rotator cuff muscle and the sole rotator cuff muscle inserting on the lesser tubercle. Supraspinatus, infraspinatus, and teres minor insert onto the facets of the greater tubercle.  
7. What is the precise sequential insertion of muscles on the three facets of the greater tubercle of the humerus, from superior to inferior?
A. Infraspinatus, Supraspinatus, Teres minor
B. Supraspinatus, Infraspinatus, Teres minor
C. Subscapularis, Supraspinatus, Infraspinatus
D. Supraspinatus, Teres minor, Infraspinatus  
Correct Answer: B. Supraspinatus, Infraspinatus, Teres minor  
Explanation: The greater tubercle of the humerus displays three muscular facets on its posterosuperior surface: superior facet (supraspinatus), middle facet (infraspinatus), and inferior facet (teres minor).  
8. Which muscle initiates the first 0° to 15° of abduction of the arm at the glenohumeral joint?
A. Deltoid (acromial fibers)
B. Supraspinatus
C. Subscapularis
D. Teres minor  
Correct Answer: B. Supraspinatus  
Explanation: Supraspinatus initiates abduction of the humerus (0°–15°) by seating the humeral head firmly against the glenoid cavity, after which the multipennate central fibers of the deltoid take over (15°–90°).
9. The multipennate central fibers of the deltoid muscle originate from which bony structure?
A. Crest of the scapular spine
B. Lateral border of the acromion
C. Lateral third of the clavicle
D. Coracoid process  
Correct Answer: B. Lateral border of the acromion  
Explanation: The acromial (intermediate) part of the deltoid is multipennate to maximize contractile power and originates from the lateral border of the acromion process.  
10. Which muscle is innervated by the dorsal scapular nerve (C5)?
A. Rhomboid major
B. Latissimus dorsi
C. Serratus anterior
D. Subclavius  
Correct Answer: A. Rhomboid major  
Explanation: The dorsal scapular nerve originates from the C5 root of the brachial plexus and descends along the medial border of the scapula to supply rhomboid major, rhomboid minor, and levator scapulae.  
11. Teres major receives its motor innervation from the:
A. Axillary nerve
B. Suprascapular nerve
C. Lower subscapular nerve
D. Thoracodorsal nerve  
Correct Answer: C. Lower subscapular nerve  
Explanation: Teres major is innervated specifically by the lower subscapular nerve (C5, C6) arising from the posterior cord. The upper subscapular nerve supplies only subscapularis.  
12. Which muscle inserts into the clavicle in the subclavian groove on its inferior surface?
A. Pectoralis minor
B. Subclavius
C. Sternocleidomastoid
D. Trapezius  
Correct Answer: B. Subclavius  
Explanation: Subclavius originates at the junction of the first rib and its costal cartilage and inserts into the subclavian groove on the inferior surface of the clavicular shaft.  
13. Which nerve innervates both the supraspinatus and infraspinatus muscles?
A. Dorsal scapular nerve
B. Suprascapular nerve
C. Axillary nerve
D. Upper subscapular nerve  
Correct Answer: B. Suprascapular nerve  
Explanation: The suprascapular nerve (C5, C6 from the superior trunk) runs under the superior transverse scapular ligament into the supraspinous fossa to supply supraspinatus, then winds around the spinoglenoid notch to supply infraspinatus.  
14. The nerve supply of the teres minor muscle is derived from the:
A. Radial nerve
B. Axillary nerve
C. Lower subscapular nerve
D. Thoracodorsal nerve  
Correct Answer: B. Axillary nerve  
Explanation: The posterior terminal division of the axillary nerve supplies teres minor (distinguished histologically by a pseudoganglion) and continues as the upper lateral cutaneous nerve of the arm.  
15. Which muscle forms the anterior boundary of the axilla (anterior axillary fold)?
A. Latissimus dorsi
B. Teres major
C. Pectoralis major
D. Serratus anterior  
Correct Answer: C. Pectoralis major  
Explanation: The lower rounded border of the pectoralis major muscle forms the anterior axillary fold.  
16. Which pair of muscles forms the posterior axillary fold?
A. Pectoralis major and pectoralis minor
B. Latissimus dorsi and teres major
C. Subscapularis and teres minor
D. Coracobrachialis and biceps brachii  
Correct Answer: B. Latissimus dorsi and teres major  
Explanation: The posterior axillary fold is formed by the tendon of latissimus dorsi sweeping anteriorly around the lower border of teres major.  
17. Serratus anterior inserts along which part of the scapula?
A. Entire lateral (axillary) border
B. Entire length of the costal aspect of the medial border
C. Crest of the scapular spine
D. Superior border medial to the notch  
Correct Answer: B. Entire length of the costal aspect of the medial border  
Explanation: Serratus anterior inserts continuously along the anterior/costal lip of the medial border of the scapula, concentrating heavily at the inferior angle.  
18. Which muscle is responsible for both adduction and medial rotation of the arm at the glenohumeral joint?
A. Infraspinatus
B. Teres minor
C. Teres major
D. Supraspinatus  
Correct Answer: C. Teres major  
Explanation: Teres major adducts, medially rotates, and extends the humerus. Infraspinatus and teres minor are lateral rotators.  
19. The subscapularis muscle is innervated by which nerves?
A. Upper and lower subscapular nerves
B. Suprascapular nerve alone
C. Axillary nerve
D. Thoracodorsal nerve  
Correct Answer: A. Upper and lower subscapular nerves  
Explanation: Subscapularis receives both upper and lower subscapular nerves (C5, C6) arising from the posterior cord of the brachial plexus.  
20. The primary action of the subscapularis muscle on the humerus is:
A. Lateral rotation
B. Medial rotation
C. Abduction
D. Retraction  
Correct Answer: B. Medial rotation  
Explanation: Arising from the anterior subscapular fossa and inserting onto the lesser tubercle, subscapularis acts as a powerful medial (internal) rotator of the arm.  
21. Which muscle passes through the triangular space and separates teres minor from teres major?
A. Short head of biceps brachii
B. Long head of triceps brachii
C. Coracobrachialis
D. Lateral head of triceps brachii  
Correct Answer: B. Long head of triceps brachii  
Explanation: The long head of triceps descends from the infraglenoid tubercle between teres minor superiorly and teres major inferiorly, dividing the interval into quadrangular and triangular spaces.  
22. Trapezius receives its motor innervation from the:
A. Dorsal scapular nerve
B. Spinal accessory nerve (CN XI)
C. Long thoracic nerve
D. Axillary nerve  
Correct Answer: B. Spinal accessory nerve (CN XI)  
Explanation: The spinal accessory nerve (CN XI) provides motor innervation to the trapezius, whereas cervical nerves C3 and C4 supply sensory proprioception.  
23. Which rotator cuff tendon is most susceptible to impingement under the coracoacromial arch?
A. Infraspinatus
B. Supraspinatus
C. Subscapularis
D. Teres minor  
Correct Answer: B. Supraspinatus  
Explanation: The supraspinatus tendon travels beneath the coracoacromial arch (acromion, coracoid process, and coracoacromial ligament), making it vulnerable to subacromial friction and tears.  
24. Levator scapulae inserts into the:
A. Medial border of the scapula between superior angle and spine
B. Spine of the scapula
C. Inferior angle of the scapula
D. Coracoid process  
Correct Answer: A. Medial border of the scapula between superior angle and spine  
Explanation: Levator scapulae originates from the transverse processes of C1–C4 and inserts onto the dorsal surface of the medial border of the scapula between the superior angle and the triangular root of the spine.  
25. The clavipectoral fascia is pierced by all of the following EXCEPT:
A. Cephalic vein
B. Thoracoacromial artery
C. Lateral pectoral nerve
D. Medial pectoral nerve  
Correct Answer: D. Medial pectoral nerve  
Explanation: The clavipectoral fascia is pierced by the cephalic vein, thoracoacromial artery, lateral pectoral nerve, and lymphatic vessels. The medial pectoral nerve pierces pectoralis minor directly.  
26. Which muscle is pierced by the musculocutaneous nerve?
A. Biceps brachii
B. Coracobrachialis
C. Brachialis
D. Pronator teres  
Correct Answer: B. Coracobrachialis  
Explanation: The musculocutaneous nerve leaves the lateral cord of the brachial plexus and enters the arm by piercing coracobrachialis.  
27. The long head of the biceps brachii originates from which bony landmark?
A. Infraglenoid tubercle
B. Supraglenoid tubercle of the scapula
C. Tip of the coracoid process
D. Greater tubercle of the humerus  
Correct Answer: B. Supraglenoid tubercle of the scapula  
Explanation: The long head of biceps originates from the supraglenoid tubercle of the scapula and the glenoid labrum, traveling intracapsularly across the humeral head.  
28. The short head of the biceps brachii arises conjointly with which muscle from the apex of the coracoid process?
A. Pectoralis minor
B. Coracobrachialis
C. Brachialis
D. Deltoid  
Correct Answer: B. Coracobrachialis  
Explanation: The short head of biceps brachii and coracobrachialis arise together from the tip of the coracoid process of the scapula via a common conjoined tendon.  
29. Biceps brachii inserts primarily into the:
A. Coronoid process of the ulna
B. Rough posterior part of the radial tuberosity
C. Olecranon process of the ulna
D. Styloid process of the radius  
Correct Answer: B. Rough posterior part of the radial tuberosity  
Explanation: The tendon of the biceps brachii twists and inserts into the rough posterior aspect of the radial tuberosity, separated from the smooth anterior portion by a bursa.  
30. The bicipital aponeurosis extends medially from the biceps tendon to blend with the:
A. Antebrachial deep fascia over the common flexor group
B. Flexor retinaculum
C. Radial collateral ligament
D. Triceps tendon  
Correct Answer: A. Antebrachial deep fascia over the common flexor group  
Explanation: The bicipital aponeurosis (lacertus fibrosus) passes medially across the brachial artery and median nerve to blend with the deep fascia of the anterior forearm.  
31. Which muscle is the chief (primary) flexor of the elbow joint in all positions of forearm rotation?
A. Biceps brachii
B. Brachialis
C. Brachioradialis
D. Pronator teres  
Correct Answer: B. Brachialis  
Explanation: Brachialis inserts onto the ulna (coronoid process and tuberosity); because the ulna does not rotate during pronation/supination, brachialis acts as the workhorse elbow flexor in all forearm postures.  
32. The brachialis muscle receives dual innervation from which two nerves?
A. Musculocutaneous nerve and median nerve
B. Musculocutaneous nerve and radial nerve
C. Radial nerve and ulnar nerve
D. Median nerve and ulnar nerve  
Correct Answer: B. Musculocutaneous nerve and radial nerve  
Explanation: Brachialis is supplied medially by the musculocutaneous nerve (C5, C6) and receives proprioceptive and motor innervation to its inferolateral border from the radial nerve (C7).  
33. Coracobrachialis inserts into which site?
A. Deltoid tuberosity
B. Mid-portion of the medial border and surface of the humeral shaft
C. Lateral supracondylar ridge
D. Crest of the lesser tubercle  
Correct Answer: B. Mid-portion of the medial border and surface of the humeral shaft  
Explanation: Coracobrachialis inserts into a linear impression on the medial border of the humeral shaft near its midpoint, opposite the deltoid tuberosity.  
34. The long head of the triceps brachii originates from the:
A. Supraglenoid tubercle
B. Infraglenoid tubercle of the scapula
C. Spine of the scapula
D. Posterior humeral shaft superior to the radial groove  
Correct Answer: B. Infraglenoid tubercle of the scapula  
Explanation: The long head of triceps brachii originates from the infraglenoid tubercle of the scapula.  
35. The lateral head of triceps brachii arises from the:
A. Infraglenoid tubercle
B. Posterior surface of the humerus superior and lateral to the radial groove
C. Posterior surface of the humerus inferior and medial to the radial groove
D. Medial intermuscular septum  
Correct Answer: B. Posterior surface of the humerus superior and lateral to the radial groove  
Explanation: The lateral head of triceps originates from the posterior surface of the humerus superior and lateral to the radial (spiral) groove.  
36. The medial head of the triceps brachii arises from the:
A. Posterior surface of the humerus inferior and medial to the radial groove
B. Supraglenoid tubercle
C. Greater tubercle of the humerus
D. Lateral border of the scapula  
Correct Answer: A. Posterior surface of the humerus inferior and medial to the radial groove  
Explanation: The medial head originates from the expansive posterior surface of the humeral shaft inferior and medial to the radial groove and from both intermuscular septa.  
37. All three heads of the triceps brachii insert into which anatomical landmark?
A. Coronoid process of the ulna
B. Superior surface of the olecranon process of the ulna
C. Radial tuberosity
D. Head of the radius  
Correct Answer: B. Superior surface of the olecranon process of the ulna  
Explanation: All three heads of triceps unite into a single tendon that inserts into the posterior aspect of the superior surface of the ulnar olecranon.  
38. The anconeus muscle is innervated by a branch from the:
A. Ulnar nerve
B. Radial nerve (nerve to anconeus via radial nerve in spiral groove)
C. Median nerve
D. Musculocutaneous nerve  
Correct Answer: B. Radial nerve (nerve to anconeus via radial nerve in spiral groove)  
Explanation: Anconeus is innervated by a dedicated branch of the radial nerve that arises in the spiral groove and travels through the medial head of triceps.  
39. The anconeus muscle originates from the:
A. Medial epicondyle of the humerus
B. Posterior surface of the lateral epicondyle of the humerus
C. Lateral supracondylar ridge
D. Coronoid process  
Correct Answer: B. Posterior surface of the lateral epicondyle of the humerus  
Explanation: Anconeus originates from the posterior surface of the lateral epicondyle of the humerus.  
40. Anconeus inserts into the:
A. Lateral surface of the olecranon and superior quarter of the posterior ulna
B. Radial head
C. Coronoid process
D. Medial epicondyle  
Correct Answer: A. Lateral surface of the olecranon and superior quarter of the posterior ulna  
Explanation: Anconeus inserts into the lateral aspect of the olecranon and the upper posterior shaft of the ulna, assisting in terminal elbow extension and stabilizing the joint.  
41. Which head of the triceps brachii acts across two joints (glenohumeral and elbow)?
A. Lateral head
B. Long head
C. Medial head
D. All three heads equally  
Correct Answer: B. Long head  
Explanation: Because it originates from the infraglenoid tubercle of the scapula, only the long head crosses both the shoulder and elbow joints.  
42. In a fracture through the radial groove of the humerus, which muscle head is typically spared because its nerve branch arises proximal to the groove?
A. Medial head of triceps
B. Long head of triceps
C. Anconeus
D. Brachioradialis  
Correct Answer: B. Long head of triceps  
Explanation: Nerve branches to the long head leave the radial nerve high in the axilla proximal to the spiral groove, leaving long head contraction intact during midshaft fractures.  
43. Which muscle acts as the most powerful supinator of the flexed forearm?
A. Supinator
B. Biceps brachii
C. Brachioradialis
D. Pronator quadratus  
Correct Answer: B. Biceps brachii  
Explanation: When the elbow is flexed to 90°, the pull of biceps brachii on the radial tuberosity creates maximal mechanical leverage for rapid, forceful supination.  
44. Brachialis inserts into the:
A. Radial tuberosity
B. Coronoid process and tuberosity of the ulna
C. Olecranon process
D. Interosseous membrane  
Correct Answer: B. Coronoid process and tuberosity of the ulna  
Explanation: Brachialis inserts into the anterior surface of the coronoid process and the rough tuberosity of the ulna.  
45. The functional role of the coracobrachialis is primarily:
A. Extension and abduction of the arm
B. Flexion and weak adduction of the arm at the glenohumeral joint
C. Supination of the forearm
D. Pronation of the forearm  
Correct Answer: B. Flexion and weak adduction of the arm at the glenohumeral joint  
Explanation: Coracobrachialis assists pectoralis major and anterior deltoid in arm flexion and adduction, and helps resist downward dislocation of the humeral head.  
46. Which of the following is NOT part of the superficial group of anterior forearm muscles arising from the common flexor origin?
A. Pronator teres
B. Flexor carpi radialis
C. Flexor digitorum profundus
D. Flexor carpi ulnaris  
Correct Answer: C. Flexor digitorum profundus  
Explanation: Flexor digitorum profundus belongs to the deep flexor layer. The superficial flexor group consists of pronator teres, flexor carpi radialis, palmaris longus, and flexor carpi ulnaris.  
47. The common flexor tendon originates from which humeral landmark?
A. Lateral epicondyle
B. Medial epicondyle
C. Lateral supracondylar ridge
D. Medial supracondylar ridge  
Correct Answer: B. Medial epicondyle  
Explanation: The common flexor tendon (CFT) of the anterior forearm muscles originates from the anterior surface of the medial epicondyle of the humerus. In contrast, the common extensor tendon originates from the lateral epicondyle.
"""

def parse_mcqs(text):
    questions = []
    # Pattern to match question block
    # e.g., 1. Text ... A. ... B. ... C. ... D. ... Correct Answer: ... Explanation: ...
    q_blocks = re.split(r'\n(?=\d+\.\s)', text.strip())
    
    section_map = {
        (1, 25): "Section I: Pectoral Girdle & Shoulder Musculature",
        (26, 45): "Section II: Arm Musculature (Brachium)",
        (46, 65): "Section III: Anterior Forearm Musculature",
    }
    
    for block in q_blocks:
        block = block.strip()
        if not block:
            continue
        
        m_num = re.match(r'^(\d+)\.\s*(.+?)(?=\n[A-D]\.)', block, re.DOTALL)
        if not m_num:
            continue
        q_num = int(m_num.group(1))
        q_text = m_num.group(2).strip()
        
        # Options
        opts = []
        for letter in ['A', 'B', 'C', 'D']:
            next_letter = chr(ord(letter) + 1)
            if letter != 'D':
                m_opt = re.search(rf'\n{letter}\.\s*(.+?)(?=\n{next_letter}\.)', block, re.DOTALL)
            else:
                m_opt = re.search(r'\nD\.\s*(.+?)(?=\nCorrect Answer:)', block, re.DOTALL)
            if m_opt:
                opts.append(m_opt.group(1).strip())
            else:
                opts.append("")
                
        # Correct answer
        m_ans = re.search(r'\nCorrect Answer:\s*([A-D])(?:\.\s*(.*?))?(?=\nExplanation:|$)', block, re.DOTALL)
        correct_letter = m_ans.group(1) if m_ans else "A"
        correct_idx = ord(correct_letter) - ord('A')
        
        # Explanation
        m_expl = re.search(r'\nExplanation:\s*(.+)$', block, re.DOTALL)
        explanation = m_expl.group(1).strip() if m_expl else ""
        
        # Determine section
        section_name = "General Musculature"
        for (start, end), sname in section_map.items():
            if start <= q_num <= end:
                section_name = sname
                break
                
        questions.append({
            "id": f"ana201-muscles-q{q_num:02d}",
            "number": q_num,
            "subject": "ana201",
            "courseCode": "ANA 201",
            "courseTitle": "Upper and Lower Limb",
            "section": section_name,
            "topic": "Muscles of the Upper Limb",
            "topicId": "ul-muscles",
            "difficulty": "advanced",
            "text": q_text,
            "options": opts,
            "correct": correct_idx,
            "correctAnswer": correct_letter,
            "explanation": explanation
        })
    return questions

questions = parse_mcqs(raw_text)
print(f"Parsed {len(questions)} questions.")
output_path = "data/university/anatomy/200/questions-ana201-muscles.json"
with open(output_path, "w", encoding="utf-8") as f:
    json.dump({
        "course": "ANA 201",
        "courseTitle": "Upper and Lower Limb",
        "topic": "Muscles of the Upper Limb",
        "topicId": "ul-muscles",
        "totalQuestions": len(questions),
        "source": "Standard International Medical & Anatomy Quiz Competition Format",
        "questions": questions
    }, f, indent=2)

print(f"Wrote to {output_path}")
