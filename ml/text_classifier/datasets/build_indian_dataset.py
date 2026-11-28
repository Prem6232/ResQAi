from __future__ import annotations

import hashlib
import json
import os
import random
import re
from collections import Counter
from pathlib import Path
from typing import Dict, List, Optional, Tuple

DEFAULT_ML_DIR = Path(__file__).resolve().parents[2]
os.environ.setdefault("HF_HOME", str(DEFAULT_ML_DIR / ".hf_cache"))
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

from datasets import load_dataset  # noqa: E402

RNG = random.Random(42)

TRAIN_PLACES = [
    "MP Nagar Zone 1",
    "New Market",
    "Habibganj",
    "Kolar Road",
    "Arera Colony",
    "Bairagarh",
    "Indrapuri",
    "Shahpura",
    "TT Nagar",
    "BHEL Gate 2",
    "Ashoka Garden",
    "Ayodhya Bypass",
    "MANIT Square",
    "VIP Road",
    "Koramangala",
    "Indiranagar",
    "Andheri West",
    "Dadar TT",
    "Lajpat Nagar",
    "Connaught Place",
    "Gomti Nagar",
    "Viman Nagar",
    "Jawahar Chowk",
    "Bapu Nagar",
    "Rajendra Nagar",
]

VAL_PLACES = [
    "Piplani",
    "Awadhpuri",
    "Saket Nagar",
    "Govindpura",
    "Jahangirabad",
    "Kothrud",
    "HSR Layout",
    "Salt Lake Sector 5",
    "Malviya Nagar",
    "Karol Bagh",
    "Anna Nagar",
    "Gachibowli",
]

TRAIN_PREFIXES_EN = ["", "Urgent: ", "Emergency alert — ", "Please help, ", "Reported right now: "]
TRAIN_SUFFIXES_EN = ["", " please send help fast.", " need immediate assistance.", " commuters at risk."]
TRAIN_PREFIXES_HI = ["", "जल्दी मदद करें: ", "आपातकालीन सूचना — ", "कृपया ध्यान दें, "]
TRAIN_SUFFIXES_HI = ["", " तुरंत सहायता भेजें।", " स्थिति गंभीर है।"]
TRAIN_PREFIXES_HG = ["", "bhai jaldi ", "please madad karo, ", "abhi abhi ", "urgent help: "]
TRAIN_SUFFIXES_HG = ["", " jaldi team bhejo", " bahut risky situation hai", " please respond fast"]

CLEAN_URL_RE = re.compile(r"https?://\S+")
CLEAN_MENTION_RE = re.compile(r"@\w+")
CLEAN_RT_RE = re.compile(r"^\s*RT\s+:?\s*", re.IGNORECASE)
CLEAN_WS_RE = re.compile(r"\s+")


def clean_social_text(text: str) -> str:
    text = CLEAN_RT_RE.sub("", text)
    text = CLEAN_URL_RE.sub("", text)
    text = CLEAN_MENTION_RE.sub("", text)
    text = text.replace("#", "")
    text = CLEAN_WS_RE.sub(" ", text).strip()
    return text


def is_clean_text(text: str) -> bool:
    if len(text) < 16 or len(text) > 260:
        return False
    lower = text.lower()
    if any(bad in lower for bad in ["subscribe", "follow me", "click here", "donate $", "paypal", "retweets"]):
        return False
    return True


def make_row(text: str, category: str, urgency: str, source: str, slice_name: str) -> Dict:
    return {
        "text": CLEAN_WS_RE.sub(" ", text).strip(),
        "category": category,
        "urgency": urgency,
        "source": source,
        "slice": slice_name,
    }


def apply_realistic_noise(text: str, rng: random.Random, prob: float = 0.25) -> str:
    if rng.random() > prob:
        return text
    replacements = [
        ("paani", "pani"),
        ("dhuwa", "dhuan"),
        ("khoon", "khun"),
        ("behosh", "behoosh"),
        ("bijli", "bijlee"),
        ("jaldi", "jldi"),
        ("ambulance", "ambulence"),
        ("transformer", "trnsformer"),
        ("scooty", "scooti"),
        ("rikshaw", "rickshaw"),
    ]
    out = text
    old, new = rng.choice(replacements)
    if old in out.lower():
        out = re.sub(old, new, out, count=1, flags=re.IGNORECASE)
    if rng.random() < 0.35:
        out = out.lower()
    return out


# Comprehensive disjoint templates covering ALL 7 categories x ALL urgencies x 4 Indian script/register styles
TRAIN_TEMPLATES: List[Tuple[str, str, str, str]] = [
    # --- FIRE & SMOKE ---
    ("fire_smoke", "critical", "hinglish", "{place} ke paas transformer blast hua hai aur tez aag dhuwa nikal raha hai"),
    ("fire_smoke", "critical", "hinglish", "dost ke hostel room mein gas cylinder leak se aag lag gayi hai {place} par"),
    ("fire_smoke", "critical", "hinglish", "{place} market ki dukan mein bhayanak aag lagi hai log andar fase hain"),
    ("fire_smoke", "critical", "hinglish", "{place} basement mein parked EV bike ki battery fatne se aag aur kala dhuan fail gaya"),
    ("fire_smoke", "critical", "indian_english", "Thick black smoke and active flames engulfing commercial shop at {place}, people trapped"),
    ("fire_smoke", "critical", "indian_english", "LPG kitchen cylinder caught fire inside PG canteen at {place}, flames spreading fast"),
    ("fire_smoke", "critical", "hindi_devanagari", "{place} के पास बिजली के ट्रांसफार्मर में भीषण आग और काला धुआं निकल रहा है तुरंत फायर ब्रिगेड भेजें"),
    ("fire_smoke", "critical", "hindi_devanagari", "{place} स्थित घर में रसोई गैस सिलेंडर से आग लग गई है काफी धुआं भर गया है"),
    ("fire_smoke", "high", "hinglish", "{place} main road ke electric pole par chingari aur dhuan uth raha hai"),
    ("fire_smoke", "high", "hinglish", "{place} godown ke piche sukhe kachre mein tej aag jal rahi hai"),
    ("fire_smoke", "high", "indian_english", "Dry bushes and garbage burning rapidly close to parked two-wheelers at {place}"),
    ("fire_smoke", "high", "code_mixed", "{place} petrol pump ke peeche kachre mein fire lag gayi hai smoke fail raha hai"),
    ("fire_smoke", "medium", "hinglish", "{place} block C ke meter box se jalne ki smell aur halka dhuwa aa raha hai"),
    ("fire_smoke", "medium", "hinglish", "{place} showroom ke AC unit aur electric meter se chhota spark aur dhuan dikh raha"),
    ("fire_smoke", "medium", "indian_english", "Smoldering electrical cable odor reported near generator shaft at {place}, no large flames yet"),
    ("fire_smoke", "medium", "indian_english", "Small electrical wire sparking inside meter box near {place}, no major fire yet"),
    ("fire_smoke", "medium", "hindi_devanagari", "{place} भवन की सीढ़ियों के पास हल्का धुआं और तार जलने की गंध आ रही है"),

    # --- ROAD ACCIDENT ---
    ("road_accident", "critical", "hinglish", "{place} chowk par truck ne bike ko takkar maari rider road par behosh pada hai"),
    ("road_accident", "critical", "hinglish", "{place} highway par car aur auto rickshaw ka bhayankar accident hua hai passengers fase hain"),
    ("road_accident", "critical", "hinglish", "{place} flyover par tez car ne Activa ko uda diya do log khoon se lathpath hain"),
    ("road_accident", "critical", "hinglish", "{place} BRTS lane mein city bus aur tanker bhid gaye driver cabin mein dab gaya"),
    ("road_accident", "critical", "indian_english", "Head-on collision between city bus and motorcycle at {place}, rider bleeding heavily"),
    ("road_accident", "critical", "indian_english", "Speeding car hit pedestrian crossing near {place} junction, victim unconscious on road"),
    ("road_accident", "critical", "hindi_devanagari", "{place} चौराहे पर तेज रफ्तार ट्रक और बाइक की टक्कर हो गई दो लोग गंभीर घायल हैं"),
    ("road_accident", "critical", "hindi_devanagari", "{place} मार्ग पर ऑटो पलट गया है और यात्री गंभीर चोटिल होकर सड़क पर पड़े हैं"),
    ("road_accident", "critical", "code_mixed", "Emergency road crash at {place} flyover, auto palat gaya hai aur do log injured hain"),
    ("road_accident", "high", "hinglish", "{place} ke mod par scooty slip ho gayi ladke ke pair mein gehri chot lagi hai"),
    ("road_accident", "high", "hinglish", "{place} turn pe e-rickshaw palat gaya aur teen sawariyan ghayal ho gayi"),
    ("road_accident", "high", "indian_english", "Overturned e-rickshaw blocking intersection at {place}, commuter hurt and traffic stuck"),
    ("road_accident", "high", "hindi_devanagari", "{place} रोड पर कार और ऑटो में टक्कर हो गई सवारी घायल है और यातायात रुक गया है"),
    ("road_accident", "medium", "hinglish", "{place} signal par do car halki bhid gayi hain koi injured nahi par jam lag gaya"),
    ("road_accident", "medium", "indian_english", "Minor fender-bender between two cars near {place} causing heavy traffic congestion"),
    ("road_accident", "medium", "indian_english", "Slow tempo lightly grazed stationary van at {place} gate, minor dent only no injuries"),
    ("road_accident", "medium", "hindi_devanagari", "{place} चौराहे पर दो वाहनों की हल्की रगड़ से जाम लगा है कोई घायल नहीं"),
    ("road_accident", "medium", "code_mixed", "{place} chauraha pe auto aur scooter ki slight takkar hui hai minor damage traffic jam"),

    # --- MEDICAL ---
    ("medical", "critical", "hinglish", "{place} metro gate par ek uncle achanak behosh ho kar gir gaye saans phool rahi hai"),
    ("medical", "critical", "hinglish", "mere friend ko {place} par tez seene mein dard aur chakkar aa raha hai jaldi ambulance bhejo"),
    ("medical", "critical", "hinglish", "{place} library ke bahar student ko mirgi ka daura pad gaya muh se jhag aa raha hai"),
    ("medical", "critical", "hinglish", "{place} lake ghat par ek ladka paani mein doob ke nikala gaya hosh mein nahi hai"),
    ("medical", "critical", "indian_english", "Student collapsed with seizure and difficulty breathing outside {place}, urgent ambulance required"),
    ("medical", "critical", "indian_english", "Worker suffered deep laceration with heavy blood loss at {place} construction site"),
    ("medical", "critical", "indian_english", "Suspected cardiac arrest at {place} bus shelter, elderly man unresponsive"),
    ("medical", "critical", "hindi_devanagari", "{place} बस स्टॉप पर एक व्यक्ति बेहोश होकर गिर पड़ा है तुरंत एम्बुलेंस भेजें"),
    ("medical", "critical", "hindi_devanagari", "{place} में बुजुर्ग को अचानक सीने में तेज दर्द और सांस लेने में दिक्कत हो रही है"),
    ("medical", "high", "hinglish", "{place} ground mein girne se player ke hath ki haddi toot gayi hai bahut dard hai"),
    ("medical", "high", "hinglish", "{place} hostel ke ladke ko tez bukhar aur lagatar ultiyan ho rahi chal nahi pa raha"),
    ("medical", "high", "indian_english", "Severe dehydration and heatstroke symptoms in commuter at {place} waiting area"),
    ("medical", "high", "indian_english", "Resident bitten by stray dog outside {place} park requiring urgent rabies medical care"),
    ("medical", "high", "code_mixed", "{place} hostel ke student ko high fever aur breathing trouble feel ho rahi doctor chahiye"),
    ("medical", "medium", "hinglish", "{place} ke paas pair mein moch aur BP low lag raha hai first aid madad chahiye"),
    ("medical", "medium", "hinglish", "{place} stand par dhoop se halka chakkar aa raha paani pi ke baitha hun doctor check karein"),
    ("medical", "medium", "indian_english", "Minor ankle sprain and dizziness reported near {place}, conscious and seated safely"),
    ("medical", "medium", "hindi_devanagari", "{place} परिसर में छात्र के हाथ में हल्का कट लगा है प्राथमिक चिकित्सा किट चाहिए"),

    # --- PERSONAL SAFETY ---
    ("personal_safety", "critical", "hinglish", "koi mera peecha kar raha hai {place} gali mein bahut andhera hai jaldi madad bhejo"),
    ("personal_safety", "critical", "hinglish", "{place} ATM ke bahar kuch ladke chaaku dikha kar dhamki de rahe hain SOS"),
    ("personal_safety", "critical", "hinglish", "{place} bus stop se ghar jate time ek bike wala rasta rok raha hai bachaao"),
    ("personal_safety", "critical", "hinglish", "{place} dukan ke bahar hinsa aur chaku-bazi ho rahi log bhaag rahe hain"),
    ("personal_safety", "critical", "indian_english", "SOS being chased by unknown men on bikes near {place} bus stand late at night"),
    ("personal_safety", "critical", "indian_english", "Violent physical assault happening outside {place} market gate, caller hiding nearby"),
    ("personal_safety", "critical", "indian_english", "Armed muggers cornered commuters near {place} underpass stairs, immediate police needed"),
    ("personal_safety", "critical", "hindi_devanagari", "{place} सुनसान सड़क पर कुछ लोग मेरा पीछा कर रहे हैं मुझे तुरंत पुलिस सुरक्षा चाहिए"),
    ("personal_safety", "critical", "hindi_devanagari", "{place} कॉलोनी में मारपीट और हथियार से धमकी दी जा रही है जल्दी मदद भेजें"),
    ("personal_safety", "high", "hinglish", "{place} auto stand par kuch sharabi log ladkiyon ko pareshan aur chedchad kar rahe hain"),
    ("personal_safety", "high", "hinglish", "{place} girls hostel gate ke bahar anjaan ladke gandi baatein bol ke dhamka rahe"),
    ("personal_safety", "high", "indian_english", "Suspicious masked individual loitering aggressively outside girls hostel gate at {place}"),
    ("personal_safety", "high", "code_mixed", "{place} station road par harassment ho rahi hai security patrol jaldi bhejein"),
    ("personal_safety", "high", "hindi_devanagari", "{place} चौराहे के पास नशे में धुत लोग राहगीरों को गालियां दे रहे हैं सुरक्षा गश्त भेजें"),
    ("personal_safety", "medium", "hinglish", "{place} park ke paas raat mein kuch log gher kar khade hain security escort chahiye"),
    ("personal_safety", "medium", "indian_english", "Unsafe unlit alley near {place} with suspicious group staring at solo walkers, patrol requested"),
    ("personal_safety", "medium", "code_mixed", "{place} metro exit par raat mein ek aadmi suspiciously follow kar raha guard bhej dein"),

    # --- WATER / FLOOD ---
    ("water_flood", "critical", "hinglish", "{place} underpass mein kamar tak baarish ka paani bhar gaya ek car andar doob rahi hai"),
    ("water_flood", "critical", "hinglish", "nallah overflow hone se {place} ke ground floor gharon mein paani ghus gaya log fase hain"),
    ("water_flood", "critical", "indian_english", "Flash flooding submerging {place} railway underpass, passenger auto trapped in deep water"),
    ("water_flood", "critical", "indian_english", "Torrential storm water entering ground floor homes and basements in {place}"),
    ("water_flood", "critical", "hindi_devanagari", "{place} अंडरपास में तेज बारिश से भारी जलभराव हो गया है एक वाहन पानी में फंस गया है"),
    ("water_flood", "high", "hinglish", "{place} hospital road par ghutne tak paani bhara hai ambulance nikalna mushkil hai"),
    ("water_flood", "high", "hinglish", "{place} mein main water pipeline tootne se poori sadak talab ban gayi hai"),
    ("water_flood", "high", "indian_english", "Major municipal water main burst flooding entire main road at {place}"),
    ("water_flood", "high", "indian_english", "Heavy storm runoff submerging shops and road intersection at {place}"),
    ("water_flood", "high", "code_mixed", "Heavy baarish ke baad {place} chauraha poora waterlogged ho gaya hai"),
    ("water_flood", "medium", "hinglish", "{place} lane 4 mein naali block hone se road par paani jama ho raha hai"),
    ("water_flood", "medium", "hinglish", "{place} colony ke bahar barish ka paani ghutne se neeche jama hai gadi slow chal rahi"),
    ("water_flood", "medium", "indian_english", "Moderate rainwater accumulation slowing vehicles along service lane at {place}"),
    ("water_flood", "medium", "hindi_devanagari", "{place} की निचली बस्ती में नाली का पानी सड़क पर भरने लगा है"),

    # --- HAZARD ---
    ("hazard", "critical", "hinglish", "{place} par bijli ka nanga taar toot kar paani mein gira hai current lagne ka khatra hai"),
    ("hazard", "critical", "hinglish", "{place} road par khula bada manhole hai aur ek boundary wall girne wali hai"),
    ("hazard", "critical", "indian_english", "Snapped live 11kV overhead power cable sparking in rainwater puddle at {place}"),
    ("hazard", "critical", "hindi_devanagari", "{place} मुख्य मार्ग पर बिजली का चालू तार टूटकर गिरा हुआ है करंट फैलने का खतरा है"),
    ("hazard", "high", "hinglish", "{place} main chowk par bada ped gir gaya hai aur road par bada gaddha khula pada hai"),
    ("hazard", "high", "hinglish", "{place} turn par gaadi se oil girne ke karan road par phislan bahut badh gayi hai"),
    ("hazard", "high", "indian_english", "Open uncovered sewer manhole and collapsed trench near dark bend at {place}"),
    ("hazard", "high", "indian_english", "Exposed dry drainage pit without barricade right outside gate at {place}"),
    ("hazard", "high", "code_mixed", "{place} petrol turn par diesel oil leak hone se slippery road hazard ho gaya hai"),
    ("hazard", "medium", "hinglish", "{place} mod ki sabhi streetlight kharab hain raat mein bilkul andhera rehta hai"),
    ("hazard", "medium", "hinglish", "{place} hostel ke bahar loose wire aur broken slab se danger hai"),
    ("hazard", "medium", "indian_english", "Loose low-hanging utility cables and broken barricade reported at {place}"),
    ("hazard", "medium", "hindi_devanagari", "{place} मार्ग की स्ट्रीट लाइट कई दिनों से बंद है रात में अंधेरा रहता है"),
    ("hazard", "low", "hinglish", "{place} footpath ki tile tooti hui hai aur chhota gaddha ban gaya hai"),
    ("hazard", "low", "indian_english", "Flickering street lamp and cracked pavement curb near {place} bus shelter"),
    ("hazard", "low", "hindi_devanagari", "{place} पार्क के बाहर कचरा पेटी टूटी हुई है और फुटपाथ की पटिया खिसक गई है"),

    # --- OTHER (Hard Negatives, Figurative Slang, App Tests, Non-Emergency Queries) ---
    ("other", "low", "hinglish", "bhai bas app test kar raha tha sab badhiya chal raha hai {place} se"),
    ("other", "low", "hinglish", "galti se button dab gaya tha koi dikkat nahi hai {place} par sab theek hai false alarm"),
    ("other", "low", "hinglish", "aaj {place} mein garmi se aag baras rahi hai dimag phat raha hai lol"),
    ("other", "low", "hinglish", "{place} wale fest mein doston ne dance mein aag laga di aaj raat"),
    ("other", "low", "hinglish", "{place} par khana itna spicy tha lag raha tha fire hai haha"),
    ("other", "low", "hinglish", "traffic dekh ke lag raha hai {place} mein aaj pura din barbaad ho gaya bhai"),
    ("other", "low", "hinglish", "{place} hostel ka wifi subah se band hai aur chai thandi mil rahi hai"),
    ("other", "low", "indian_english", "Just testing the emergency reporting app connectivity from {place}, ignore this test"),
    ("other", "low", "indian_english", "That street food spot at {place} was straight fire today, loved it"),
    ("other", "low", "indian_english", "Traffic in {place} today is killing me, totally wrecked my evening schedule"),
    ("other", "low", "indian_english", "Hostel Wi-Fi router down and mess coffee machine broken at {place}"),
    ("other", "low", "indian_english", "False alarm please cancel, everything is safe and normal at {place}"),
    ("other", "low", "hindi_devanagari", "यह केवल ऐप जांचने के लिए टेस्ट संदेश है {place} में कोई आपात स्थिति नहीं है"),
    ("other", "low", "hindi_devanagari", "आज {place} में बहुत गर्मी है और कॉलेज की कैंटीन कब खुलेगी"),
    ("other", "low", "hindi_devanagari", "{place} में मेरा पर्स और आईडी कार्ड खो गया है कृपया किसी को मिले तो बताएं"),
    ("other", "medium", "hinglish", "{place} college gate par bus schedule aur hall number puchhna tha"),
    ("other", "medium", "indian_english", "Looking for lost student ID card near {place} library, please contact desk"),
]

VAL_TEMPLATES: List[Tuple[str, str, str, str]] = [
    ("fire_smoke", "critical", "hinglish", "{place} ki bakery mein oven fatne se laptein aur kala dhuan fail raha hai"),
    ("fire_smoke", "critical", "indian_english", "Massive blaze inside garment godown at {place}, fire tender needed immediately"),
    ("fire_smoke", "critical", "hindi_devanagari", "{place} के शॉपिंग कॉम्प्लेक्स में आग की लपटें दिख रही हैं तुरंत दमकल भेजें"),
    ("fire_smoke", "high", "hinglish", "{place} transformer ke upar chingari aur tej smoke dikh raha hai"),
    ("fire_smoke", "medium", "indian_english", "Light smoke odor near generator room at {place}, checking source safely"),

    ("road_accident", "critical", "hinglish", "{place} bypass par bus aur car bhid gayi hain log andar dabe hue hain"),
    ("road_accident", "critical", "hinglish", "{place} railway fatak par truck ne scooter ko kuchal diya driver behosh hai"),
    ("road_accident", "critical", "indian_english", "Speeding SUV rammed divider and scooter at {place}, two critically injured"),
    ("road_accident", "critical", "hindi_devanagari", "{place} मार्ग पर बस और दुपहिया की जोरदार टक्कर में युवक गंभीर घायल"),
    ("road_accident", "high", "hinglish", "{place} pul ke paas bike phisal gayi rider ke pair mein khoon beh raha hai"),
    ("road_accident", "high", "indian_english", "Two-wheeler hit an auto-rickshaw at {place} crossing, rider bruised and blocking lane"),
    ("road_accident", "medium", "indian_english", "Two autos grazed each other at {place} junction causing traffic slowdown"),

    ("medical", "critical", "hinglish", "{place} coaching ke bahar student ko mirgi ka daura pada aur behosh hai"),
    ("medical", "critical", "hinglish", "{place} jogging track par uncle ko chest pain hua aur zameen par gir gaye"),
    ("medical", "critical", "indian_english", "Elderly pedestrian unconscious with weak pulse near {place} temple gate"),
    ("medical", "critical", "hindi_devanagari", "{place} अस्पताल गेट के बाहर व्यक्ति अचानक गिरकर बेहोश हो गया"),
    ("medical", "high", "hinglish", "{place} cricket match mein player ka ghutna mud gaya chal nahi pa raha"),
    ("medical", "high", "indian_english", "Heavy fever and fainting spells reported in student dorm at {place}"),
    ("medical", "medium", "indian_english", "Visitor feeling dizzy and dehydrated at {place} helpdesk"),

    ("personal_safety", "critical", "hinglish", "{place} dark lane mein do bike wale mera bag chheen kar peecha kar rahe hain"),
    ("personal_safety", "critical", "hinglish", "{place} lonely gali mein kuch gunde gher kar dhamka rahe hain turant police bhejo"),
    ("personal_safety", "critical", "indian_english", "Armed threat and shouting inside {place} parking lot, immediate police help needed"),
    ("personal_safety", "critical", "hindi_devanagari", "{place} गली में कुछ बदमाश रास्ता रोककर धमकी दे रहे हैं तुरंत सहायता भेजें"),
    ("personal_safety", "high", "hinglish", "{place} metro ke niche sharabi aadmi logon ko gaali aur dhamki de raha hai"),
    ("personal_safety", "high", "indian_english", "Stalker following female student near {place} auto stand, security response requested"),
    ("personal_safety", "medium", "indian_english", "Requesting night patrol check near {place} alley due to suspicious loitering"),

    ("water_flood", "critical", "hinglish", "{place} railway bridge ke niche paani bharne se school van phans gayi hai"),
    ("water_flood", "critical", "indian_english", "Overflowing stormwater canal entering homes in low-lying lanes of {place}"),
    ("water_flood", "critical", "hindi_devanagari", "{place} में भारी बारिश से घरों के भीतर पानी भर गया लोग छत पर फंसे हैं"),
    ("water_flood", "high", "hinglish", "{place} main chowk poora paani mein doob gaya traffic band hai"),
    ("water_flood", "medium", "indian_english", "Waterlogging near {place} market entrance slowing buses"),

    ("hazard", "critical", "hinglish", "{place} par transformer ka taar toot kar geeli sadak par chingari chhod raha hai"),
    ("hazard", "critical", "indian_english", "Deep caved-in road sinkhole right in middle lane of {place}"),
    ("hazard", "critical", "hindi_devanagari", "{place} सड़क के बीचोबीच गहरा गड्ढा और खुला मेनहोल दुर्घटना का खतरा है"),
    ("hazard", "high", "hinglish", "{place} mein puraani deewar jhuki hui hai kabhi bhi gir sakti hai"),
    ("hazard", "medium", "indian_english", "Broken streetlight poles keeping {place} turn completely dark"),
    ("hazard", "low", "hinglish", "{place} side walk par kachra aur toote slab se chalne mein dikkat hai"),

    ("other", "low", "hinglish", "sirf app check karne ke liye message dala hai {place} par sab normal hai"),
    ("other", "low", "indian_english", "Yesterday cricket match at {place} was absolute fire, crowd went crazy"),
    ("other", "low", "hindi_devanagari", "परीक्षा बहुत अच्छी गई सब लोग खुश हैं {place} में मौसम सुहावना है"),
    ("other", "medium", "hinglish", "{place} bus stop ka timetable app par dikh nahi raha"),
]

# Completely unseen, hand-authored Indian OOD evaluation suite (balanced across all 7 categories + Hindi/Hinglish/English/Adversarial)
CURATED_INDIAN_OOD_TEST: List[Tuple[str, str, str, str]] = [
    # FIRE & SMOKE (16)
    ("Chuna Bhatti square pe ek e-rickshaw mein battery blast hoke aag lag gayi dhuwa fail gaya", "fire_smoke", "critical", "hinglish"),
    ("Raisen road petrol station ke paas sukhi ghaas aur kachre mein badi aag bhadak rahi", "fire_smoke", "high", "hinglish"),
    ("hostel mess ki chimney se tez kaala dhuan aur chingari aa rahi jaldi fire unit bhejo", "fire_smoke", "critical", "hinglish"),
    ("Bittan Market ke showroom ke AC compressor se halka smoke aa raha hai check karwayein", "fire_smoke", "medium", "hinglish"),
    ("Kolar colony ke ek flat ki kitchen mein gas pipe fat ke aag lag gayi log terrace pe hain", "fire_smoke", "critical", "hinglish"),
    ("10 number market ke transformer se chingari giri aur neeche ke kapde ke thele mein aag lag gayi", "fire_smoke", "critical", "hinglish"),
    ("चूना भट्टी चौराहे के पास दुकान में शॉर्ट सर्किट से भीषण आग लग गई है", "fire_smoke", "critical", "hindi_devanagari"),
    ("बाजार की गोदाम में धुआं भर गया है और अंदर आग सुलग रही है तुरंत दमकल भेजें", "fire_smoke", "critical", "hindi_devanagari"),
    ("सड़क किनारे बिजली खंभे के बॉक्स से चिंगारी और हल्का धुआं निकल रहा है", "fire_smoke", "high", "hindi_devanagari"),
    ("LPG cylinder caught fire inside canteen kitchen near Chuna Bhatti, smoke everywhere", "fire_smoke", "critical", "indian_english"),
    ("Pungent electrical burning smoke coming out of basement UPS room, please inspect", "fire_smoke", "medium", "indian_english"),
    ("Parked diesel generator caught flames outside shopping plaza at Katara Hills", "fire_smoke", "critical", "indian_english"),
    ("Thick toxic smoke billowing from scrap warehouse behind Bhopal Junction", "fire_smoke", "high", "indian_english"),
    ("Small wire sparking inside meter panel at Rani Kamalapati parking block", "fire_smoke", "medium", "indian_english"),
    ("Dry grass fire spreading dangerously near boundary wall of school ground", "fire_smoke", "high", "indian_english"),
    ("Kitchen exhaust fan smoking heavily inside crowded food court, no open flame yet", "fire_smoke", "medium", "indian_english"),

    # ROAD ACCIDENT (18)
    ("Misrod highway pe truck aur car ki bhayankar takkar ho gayi driver andar phasa hua hai", "road_accident", "critical", "hinglish"),
    ("Rani Kamalapati station ke bahar scooty wale ko car ne uda diya sir se khoon beh raha", "road_accident", "critical", "hinglish"),
    ("10 number market turn par do bike takra gayi ek ladke ke kandhe mein chot aayi hai", "road_accident", "high", "hinglish"),
    ("Bhopal Talkies signal pe auto aur cab halki touch ho gayi minor traffic jam laga hai", "road_accident", "medium", "hinglish"),
    ("Narela bypass par tez speed bus ne divider tod ke e-rickshaw ko maar diya 3 log ghayal", "road_accident", "critical", "hinglish"),
    ("Jayanagar circle ke paas barish mein bike phisal gayi rider ko pair mein fracture lag raha", "road_accident", "high", "hinglish"),
    ("रेलवे स्टेशन के बाहर तेज रफ्तार कार ने दोपहिया को टक्कर मार दी दो लोग घायल हैं", "road_accident", "critical", "hindi_devanagari"),
    ("हाईवे मोड़ पर बस और ऑटो रिक्शा आपस में भिड़ गए एक यात्री बेहोश है", "road_accident", "critical", "hindi_devanagari"),
    ("चौराहे पर दो कारों की हल्की टक्कर से ट्रैफिक जाम लग गया है किसी को गंभीर चोट नहीं", "road_accident", "medium", "hindi_devanagari"),
    ("City bus hit a two-wheeler at Misrod crossing, rider unconscious with head injury", "road_accident", "critical", "indian_english"),
    ("Minor auto and car scrape at Bittan Market circle, no one hurt, traffic slowing", "road_accident", "medium", "indian_english"),
    ("Delivery scooter skidded near Powai lake turn, rider injured and unable to stand", "road_accident", "high", "indian_english"),
    ("Multi-car pileup on Raisen Road flyover in dense fog, emergency rescue needed", "road_accident", "critical", "indian_english"),
    ("School van bumped rear of stationary tempo near Narela gate, minor bumper damage only", "road_accident", "medium", "indian_english"),
    ("Speeding SUV overturned on highway ramp, occupants calling for urgent extraction", "road_accident", "critical", "indian_english"),
    ("Auto rickshaw collided with cyclist outside metro pillar, cyclist has bleeding knee", "road_accident", "high", "indian_english"),
    ("Tractor trolley axle snapped causing collision near outskirts highway toll plaza", "road_accident", "high", "indian_english"),
    ("Bumper touch between two cabs near station drop-off lane, causing queue", "road_accident", "medium", "indian_english"),

    # MEDICAL (18)
    ("Katara Hills park mein daudte waqt buzurg ko chest pain aur chakkar aa ke gir gaye", "medical", "critical", "hinglish"),
    ("coaching class mein ek ladki achanak behosh ho gayi saans lene mein takleef hai", "medical", "critical", "hinglish"),
    ("football ground mein girne se dost ka takhna mud gaya sujan aa gayi chal nahi pa raha", "medical", "high", "hinglish"),
    ("garmi se thoda chakkar aa raha paani peene ke baad baitha hun nurse bhejo", "medical", "medium", "hinglish"),
    ("AIIMS road ke bahar ek aadmi ko mirgi ka daura pada hai ambulance turant bhejein", "medical", "critical", "hinglish"),
    ("lab mein kaanch tootne se student ke haath se bahut khoon beh raha hai first aid chahiye", "medical", "high", "hinglish"),
    ("अचानक सीने में तेज दर्द के कारण एक बुजुर्ग जमीन पर गिरकर बेहोश हो गए एम्बुलेंस भेजें", "medical", "critical", "hindi_devanagari"),
    ("स्कूल मैदान में दौड़ते समय छात्र गिर गया और हाथ में गंभीर चोट आई है", "medical", "high", "hindi_devanagari"),
    ("तेज धूप से यात्री को चक्कर आ रहे हैं और पानी की उल्टी हो रही है मदद चाहिए", "medical", "high", "hindi_devanagari"),
    ("Senior citizen fainted due to severe heatstroke outside Rani Kamalapati gate", "medical", "critical", "indian_english"),
    ("Student cut hand deeply on broken glass in lab, bleeding steadily, medical kit needed", "medical", "high", "indian_english"),
    ("Passenger experiencing acute asthma attack and gasping for air at Bhopal Junction waiting hall", "medical", "critical", "indian_english"),
    ("Commuter slipped on wet marble stairs suffering painful wrist sprain, conscious and seated", "medical", "medium", "indian_english"),
    ("Child bitten by stray dog near colony park gate, urgent anti-rabies medical attention needed", "medical", "high", "indian_english"),
    ("Diabetic teacher suddenly collapsed from hypoglycemia inside lecture hall, unresponsive", "medical", "critical", "indian_english"),
    ("Hostel resident having high fever and dehydration chills requesting doctor visit", "medical", "high", "indian_english"),
    ("Minor dizzy spell after standing in sun near ticket counter, patient resting on bench", "medical", "medium", "indian_english"),
    ("Elderly passenger having severe palpitations and sweating near platform 2 stairs", "medical", "critical", "indian_english"),

    # PERSONAL SAFETY (18)
    ("raat ke 11 baje Narela mod pe do ladke bike se peecha kar rahe dar lag raha help", "personal_safety", "critical", "hinglish"),
    ("Bhopal Junction platform bahar kuch gunde paise cheenne ki dhamki de rahe SOS", "personal_safety", "critical", "hinglish"),
    ("girls PG gate ke saamne anjaan ladke shor macha ke pareshan kar rahe security bhejo", "personal_safety", "high", "hinglish"),
    ("library se hostel jate waqt gali ki light kharab aur ajeeb log khade hain escort bhejein", "personal_safety", "medium", "hinglish"),
    ("auto driver galat sunsan raste pe le ja raha hai please meri location track karke bachaao", "personal_safety", "critical", "hinglish"),
    ("market mein do groups mein haathapai aur chaaku nikal aaya hai jaldi police bhejo", "personal_safety", "critical", "hinglish"),
    ("अंधेरी गली में अज्ञात लोग मेरा पीछा कर रहे हैं मुझे तुरंत सुरक्षा सहायता चाहिए", "personal_safety", "critical", "hindi_devanagari"),
    ("गर्ल्स हॉस्टल गेट के बाहर कुछ असामाजिक तत्व लड़कियों को परेशान कर रहे हैं", "personal_safety", "high", "hindi_devanagari"),
    ("एटीएम के बाहर कुछ बदमाश चाकू दिखाकर लूटने की कोशिश कर रहे हैं जल्दी पुलिस भेजें", "personal_safety", "critical", "hindi_devanagari"),
    ("SOS stalked by two men near unlit Narela flyover stairs, please dispatch patrol", "personal_safety", "critical", "indian_english"),
    ("Aggressive drunk argument breaking out near ATM booth at 10 Number Stop", "personal_safety", "high", "indian_english"),
    ("Stranger forcibly trying to open hostel back gate and threatening security guard", "personal_safety", "critical", "indian_english"),
    ("Chain snatching attempt reported outside temple entrance, suspects fleeing on motorbike", "personal_safety", "high", "indian_english"),
    ("Evening jogger reporting harassment and catcalling by group parked near lakefront", "personal_safety", "high", "indian_english"),
    ("Solo student requesting campus security escort from late library shift to dorm", "personal_safety", "medium", "indian_english"),
    ("Two intoxicated men blocking women commuters at bus bay and shouting abuses", "personal_safety", "high", "indian_english"),
    ("Unidentified person banging loudly on apartment door at midnight refusing to leave", "personal_safety", "critical", "indian_english"),
    ("Suspicious stranger loitering quietly near school pickup lane, security check advised", "personal_safety", "medium", "indian_english"),

    # WATER / FLOOD (16)
    ("Misrod underpass mein 4 feet paani bhar gaya hai ek bus beech mein ruk ke doob rahi", "water_flood", "critical", "hinglish"),
    ("tez baarish se Jayanagar nala ufan par aa gaya aur road par ghutno tak paani bhara", "water_flood", "high", "hinglish"),
    ("Powai colony lane 2 mein naali jam hone se barish ka paani sadak par jama ho raha", "water_flood", "medium", "hinglish"),
    ("Bairagarh ke nichle gharon mein nadi ka paani ghus gaya parivar upar chhat par fase", "water_flood", "critical", "hinglish"),
    ("paani ki main pipeline tootne se Bhopal Talkies chauraha poora talab ban gaya hai", "water_flood", "high", "hinglish"),
    ("लगातार बारिश से अंडरपास में पानी भर गया है और कई गाड़ियां फंस गई हैं", "water_flood", "critical", "hindi_devanagari"),
    ("कॉलोनी की सड़कों पर घुटनों तक पानी भरने से घरों से निकलना मुश्किल हो गया है", "water_flood", "high", "hindi_devanagari"),
    ("नाला ओवरफ्लो होने से निचले इलाके की गलियों में बारिश का पानी जमा होने लगा है", "water_flood", "medium", "hindi_devanagari"),
    ("Monsoon waterlogging up to car headlights inside Raisen Road culvert, commuters stuck", "water_flood", "critical", "indian_english"),
    ("Burst municipal supply pipe flooding pedestrian lane near Bhopal Talkies", "water_flood", "high", "indian_english"),
    ("Flash flood water entering basement hostel parking as drain overflowed in storm", "water_flood", "critical", "indian_english"),
    ("Knee-deep rainwater inundation blocking hospital ambulance entry ramp", "water_flood", "high", "indian_english"),
    ("Heavy storm runoff submerging ground-floor shops in Chuna Bhatti low pocket", "water_flood", "critical", "indian_english"),
    ("Water pooling along right turn lane due to clogged storm drain grate", "water_flood", "medium", "indian_english"),
    ("Overflowing canal embankment spilling water onto agricultural link road", "water_flood", "high", "indian_english"),
    ("Moderate ankle-deep rainwater accumulation outside market gate during downpour", "water_flood", "medium", "indian_english"),

    # HAZARD (16)
    ("bijli ka live wire toot ke baarish ke paani mein gira hua chingari maar raha door raho", "hazard", "critical", "hinglish"),
    ("main road ke beech ek khula deep manhole hai bina dhakkan ke raat mein dikhta nahi", "hazard", "high", "hinglish"),
    ("mod par truck se diesel leak hoke sadak chikni ho gayi bike phisal sakti hai", "hazard", "high", "hinglish"),
    ("subah se street light kharab hai aur footpath ka stone ukhad gaya hai", "hazard", "low", "hinglish"),
    ("Raisen road par purana bargad ka ped aadha gir gaya hai bijli ke taar ke upar", "hazard", "high", "hinglish"),
    ("gas pipeline khudai mein tod di gayi aur tez badboo aa rahi hai ilaka khali karwayein", "hazard", "critical", "hinglish"),
    ("सड़क किनारे बिजली का खंभा झुक गया है और नंगे तार लटक रहे हैं", "hazard", "high", "hindi_devanagari"),
    ("बारिश के पानी में बिजली का चालू केबल गिरा पड़ा है करंट लगने का भारी खतरा है", "hazard", "critical", "hindi_devanagari"),
    ("फुटपाथ की लाइट खराब है और गली में छोटा गड्ढा बना हुआ है", "hazard", "low", "hindi_devanagari"),
    ("Snapped high-voltage conductor touching flooded sidewalk near Powai junction", "hazard", "critical", "indian_english"),
    ("Large fallen neem tree branch blocking left lane near Jayanagar traffic light", "hazard", "high", "indian_english"),
    ("Street lamp post flickering and sidewalk paver loose near bus bay", "hazard", "low", "indian_english"),
    ("Uncovered deep stormwater chamber outside school gate without warning cone", "hazard", "high", "indian_english"),
    ("Collapsed portion of old brick boundary wall leaning over narrow footpath", "hazard", "high", "indian_english"),
    ("Broken glass shards and construction rubble scattered across cycle track", "hazard", "medium", "indian_english"),
    ("Dangling low-hanging fiber optic cables snagging tall delivery vans", "hazard", "medium", "indian_english"),

    # OTHER + ADVERSARIAL FALSE ALARMS (18)
    ("Bro that biryani spot near Bhopal Junction is straight fire tonight", "other", "low", "adversarial_false_alarm"),
    ("Aaj ke match mein Sharma ji ne batting se aag laga di stadium mein", "other", "low", "adversarial_false_alarm"),
    ("My laptop is dead after the update and exam stress is killing me", "other", "low", "adversarial_false_alarm"),
    ("Traffic on VIP Road wrecked my morning mood completely, flooded with office rush", "other", "low", "adversarial_false_alarm"),
    ("False alarm triggered by mistake while checking pocket phone lock, all safe", "other", "low", "adversarial_false_alarm"),
    ("Testing ResQAi notification latency only, no active emergency here", "other", "low", "adversarial_false_alarm"),
    ("Galti se SOS press ho gaya bachche ke hath se sorry sab theek hai", "other", "low", "adversarial_false_alarm"),
    ("Hostel Wi-Fi router down since morning and mess tea is cold", "other", "low", "adversarial_false_alarm"),
    ("यह सिर्फ सिस्टम टेस्ट करने के लिए भेजा गया संदेश है कोई घटना नहीं हुई है", "other", "low", "hindi_devanagari"),
    ("कैंपस बस का समय क्या है और पुस्तकालय कितने बजे तक खुला रहेगा", "other", "low", "hindi_devanagari"),
    ("Yaar garmi itni hai lag raha hai suraj se aag baras rahi hai bas paani peete raho", "other", "low", "adversarial_false_alarm"),
    ("College fest ka DJ night aaj poora blast tha sab dost nache", "other", "low", "adversarial_false_alarm"),
    ("Bhai mera phone gir gaya par screen safe hai galti se alert khul gaya tha", "other", "low", "adversarial_false_alarm"),
    ("Can someone share the exam seating plan PDF for block B", "other", "low", "indian_english"),
    ("Lost my black water bottle in lecture hall 4 yesterday afternoon", "other", "low", "indian_english"),
    ("Please ignore previous ping, it was an accidental test during app onboarding", "other", "low", "indian_english"),
    ("मेरा पहचान पत्र कैंटीन के पास खो गया है अगर किसी को मिले तो बताएं", "other", "low", "hindi_devanagari"),
    ("Aaj ki movie ke climax mein hero ne toh flood of emotions la diya", "other", "low", "adversarial_false_alarm"),
]


def load_open_disaster_corpora() -> Tuple[List[Dict], List[Dict], List[Dict]]:
    train_out: List[Dict] = []
    val_out: List[Dict] = []
    test_out: List[Dict] = []

    def map_humaid(event_cfg: str, label: str, text: str) -> Optional[Tuple[str, str]]:
        lower = text.lower()
        if label in ("not_humanitarian", "sympathy_and_support"):
            return ("other", "low")
        if label == "injured_or_dead_people":
            if any(w in lower for w in ["crash", "collision", "highway", "traffic", "vehicle", "car", "bike"]):
                return ("road_accident", "critical")
            if any(w in lower for w in ["hospital", "injured", "ambulance", "rescue", "hurt", "critical", "medical", "doctor"]):
                return ("medical", "critical")
            return None
        if label in ("requests_or_urgent_needs", "displaced_people_and_evacuations"):
            if event_cfg == "flood" and any(w in lower for w in ["flood", "water", "rain", "submerged", "trapped", "rescue"]):
                return ("water_flood", "critical" if "trapped" in lower else "high")
            if event_cfg == "fire" and any(w in lower for w in ["fire", "smoke", "wildfire", "blaze", "evacuat", "burn"]):
                return ("fire_smoke", "critical" if ("trapped" in lower or "evacuat" in lower) else "high")
            return None
        if label == "infrastructure_and_utility_damage":
            if event_cfg == "flood" and any(w in lower for w in ["submerged", "flooded", "water", "drain", "underpass"]):
                return ("water_flood", "high")
            return ("hazard", "high")
        if label == "caution_and_advice":
            if event_cfg == "fire" and any(w in lower for w in ["smoke", "fire", "flame", "air quality"]):
                return ("fire_smoke", "high")
            if event_cfg == "flood" and any(w in lower for w in ["flood", "water", "rain"]):
                return ("water_flood", "medium")
            return ("hazard", "medium")
        return None

    for cfg in ("flood", "fire"):
        for hf_split, bucket in (("train", train_out), ("dev", val_out), ("test", test_out)):
            ds = load_dataset("QCRI/HumAID-event-type", cfg, split=hf_split)
            for row in ds:
                txt = clean_social_text(row["tweet_text"])
                if not is_clean_text(txt):
                    continue
                mapped = map_humaid(cfg, row["class_label"], txt)
                if mapped:
                    cat, urg = mapped
                    bucket.append(make_row(txt, cat, urg, f"humaid_{cfg}", "open_corpus_en"))

    for hf_split, bucket, max_other in (("train", train_out, 700), ("dev", val_out, 140), ("test", test_out, 100)):
        ds = load_dataset("QCRI/CrisisBench-all-lang", "humanitarian", split=hf_split)
        other_cnt = 0
        for row in ds:
            lang = str(row.get("lang", ""))
            event = str(row.get("event", "")).lower()
            lbl = str(row.get("class_label", ""))
            if lang not in ("en", "hi"):
                continue
            txt = clean_social_text(str(row["text"]))
            if not is_clean_text(txt):
                continue
            slice_tag = "open_hindi" if lang == "hi" else "open_corpus_en"

            if lbl == "not_humanitarian":
                if other_cnt < max_other:
                    bucket.append(make_row(txt, "other", "low", "crisisbench_not_hum", slice_tag))
                    other_cnt += 1
            elif lbl == "infrastructure_and_utilities_damage" and ("india" in event or "flood" in event or "nepal" in event):
                cat = "water_flood" if ("flood" in txt.lower() and "flood" in event) else "hazard"
                bucket.append(make_row(txt, cat, "high", "crisisbench_infra", slice_tag))
            elif lbl == "injured_or_dead_people" and ("india" in event or "nepal" in event or lang == "hi"):
                if any(w in txt.lower() for w in ["injured", "hospital", "rescue", "help", "अस्पताल", "घायल", "मदद"]):
                    bucket.append(make_row(txt, "medical", "critical", "crisisbench_med", slice_tag))

    # Extract clean real road_accident / fire / flood / hazard / medical / safety + false-alarm negatives from Disaster Tweets
    kw_map = {
        "collision": ("road_accident", "critical"),
        "derailment": ("road_accident", "critical"),
        "derailed": ("road_accident", "critical"),
        "wreckage": ("road_accident", "high"),
        "ambulance": ("medical", "critical"),
        "injured": ("medical", "high"),
        "injuries": ("medical", "high"),
        "buildings%20on%20fire": ("fire_smoke", "critical"),
        "forest%20fires": ("fire_smoke", "high"),
        "wildfire": ("fire_smoke", "high"),
        "wild%20fires": ("fire_smoke", "high"),
        "arson": ("fire_smoke", "high"),
        "floods": ("water_flood", "high"),
        "flooding": ("water_flood", "high"),
        "flash%20flood": ("water_flood", "critical"),
        "sinkhole": ("hazard", "high"),
        "bridge%20collapse": ("hazard", "critical"),
        "electrocute": ("hazard", "critical"),
        "electrocuted": ("hazard", "critical"),
        "hostages": ("personal_safety", "critical"),
    }

    dt = load_dataset("venetis/disaster_tweets", split="train")
    seen_dt = set()
    for row in dt:
        target = int(row["target"])
        kw = str(row.get("keyword") or "")
        txt = clean_social_text(str(row["text"]))
        if not is_clean_text(txt):
            continue
        key = txt.lower()
        if key in seen_dt:
            continue
        seen_dt.add(key)

        h = int(hashlib.md5(key.encode("utf-8")).hexdigest()[:8], 16) % 100
        if target == 0:
            rec = make_row(txt, "other", "low", "disaster_tweets_neg", "adversarial_false_alarm")
        elif kw in kw_map:
            cat, urg = kw_map[kw]
            rec = make_row(txt, cat, urg, f"disaster_tweets_{kw}", "open_corpus_en")
        else:
            continue

        if h < 80:
            train_out.append(rec)
        elif h < 90:
            val_out.append(rec)
        else:
            test_out.append(rec)

    return train_out, val_out, test_out


def synthesize_indian_rows(
    templates: List[Tuple[str, str, str, str]],
    places: List[str],
    source_prefix: str,
    repeats_per_template: int,
    apply_framing: bool = False,
) -> List[Dict]:
    rows: List[Dict] = []
    seen = set()
    for cat, urg, slice_name, tmpl in templates:
        sampled_places = RNG.sample(places, k=min(len(places), repeats_per_template))
        for p in sampled_places:
            raw = tmpl.format(place=p)
            if apply_framing and cat != "other":
                if slice_name == "indian_english":
                    raw = f"{RNG.choice(TRAIN_PREFIXES_EN)}{raw}{RNG.choice(TRAIN_SUFFIXES_EN)}"
                elif slice_name == "hindi_devanagari":
                    raw = f"{RNG.choice(TRAIN_PREFIXES_HI)}{raw}{RNG.choice(TRAIN_SUFFIXES_HI)}"
                elif slice_name in ("hinglish", "code_mixed"):
                    raw = f"{RNG.choice(TRAIN_PREFIXES_HG)}{raw}{RNG.choice(TRAIN_SUFFIXES_HG)}"
            text = apply_realistic_noise(raw, RNG)
            k = text.lower()
            if k not in seen:
                seen.add(k)
                rows.append(make_row(text, cat, urg, f"{source_prefix}_{slice_name}", slice_name))
    return rows


def balance_split(rows: List[Dict], cap_per_category: int, open_cap_per_category: int) -> List[Dict]:
    by_cat: Dict[str, List[Dict]] = {}
    for r in rows:
        by_cat.setdefault(r["category"], []).append(r)

    out: List[Dict] = []
    for cat, items in by_cat.items():
        RNG.shuffle(items)
        indian_items = [x for x in items if "indian_" in x["source"] or x["source"] == "curated_indian_ood"]
        open_items = [x for x in items if x not in indian_items]
        keep_open = min(len(open_items), open_cap_per_category, max(0, cap_per_category - len(indian_items)))
        selected = indian_items[:cap_per_category] + open_items[:keep_open]
        out.extend(selected)

    RNG.shuffle(out)
    return out


def save_jsonl(path: Path, rows: List[Dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def main() -> None:
    base_dir = Path(__file__).resolve().parent / "processed"
    print("Loading cached open disaster corpora...")
    open_train, open_val, open_test = load_open_disaster_corpora()

    print("Generating disjoint Indian Hinglish / Hindi / Indian English splits...")
    syn_train = synthesize_indian_rows(
        TRAIN_TEMPLATES, TRAIN_PLACES, "indian_syn", repeats_per_template=22, apply_framing=True
    )
    syn_val = synthesize_indian_rows(
        VAL_TEMPLATES, VAL_PLACES, "indian_val", repeats_per_template=8, apply_framing=False
    )
    curated_test = [
        make_row(text, cat, urg, "curated_indian_ood", sl)
        for text, cat, urg, sl in CURATED_INDIAN_OOD_TEST
    ]

    curated_keys = {r["text"].lower() for r in curated_test}
    val_all = [r for r in (syn_val + open_val) if r["text"].lower() not in curated_keys]
    val_keys = {r["text"].lower() for r in val_all} | curated_keys
    train_all = [r for r in (syn_train + open_train) if r["text"].lower() not in val_keys]

    train_final = balance_split(train_all, cap_per_category=850, open_cap_per_category=420)
    val_final = balance_split(val_all, cap_per_category=180, open_cap_per_category=90)
    open_test_balanced = balance_split(
        [r for r in open_test if r["text"].lower() not in val_keys],
        cap_per_category=25,
        open_cap_per_category=25,
    )
    test_final = curated_test + open_test_balanced

    save_jsonl(base_dir / "train.jsonl", train_final)
    save_jsonl(base_dir / "val.jsonl", val_final)
    save_jsonl(base_dir / "test_indian_benchmark.jsonl", test_final)

    summary = {
        "train_total": len(train_final),
        "val_total": len(val_final),
        "test_total": len(test_final),
        "curated_indian_ood_total": len(curated_test),
        "train_categories": dict(Counter(r["category"] for r in train_final)),
        "train_urgencies": dict(Counter(r["urgency"] for r in train_final)),
        "val_categories": dict(Counter(r["category"] for r in val_final)),
        "test_categories": dict(Counter(r["category"] for r in test_final)),
        "test_slices": dict(Counter(r["slice"] for r in test_final)),
    }
    with open(base_dir / "dataset_summary.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
