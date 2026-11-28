from __future__ import annotations

import json
import random
from collections import Counter
from pathlib import Path
from typing import Dict, List, Tuple

RNG = random.Random(42)

TRAIN_LOCATIONS = [
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
]

VAL_LOCATIONS = [
    "Piplani",
    "Awadhpuri",
    "Saket Nagar",
    "Govindpura",
    "Jahangirabad",
    "Malviya Nagar",
]

# Each cluster represents ONE real-world incident reported by multiple citizens across Hinglish, Devanagari Hindi, and Indian English.
# Format: (cluster_id, category, location_or_none, [paraphrase_variants])
TRAIN_CLUSTERS: List[Tuple[str, str, List[str]]] = [
    ("tr_fire_transformer", "fire_smoke", [
        "{loc} transformer blast hua hai tez aag aur kala dhuwa nikal raha hai",
        "Electric transformer caught fire near {loc} with heavy black smoke and sparks",
        "{loc} के पास बिजली के ट्रांसफार्मर में भीषण आग और काला धुआं निकल रहा है",
        "Sparking and loud explosion in main transformer box at {loc}, thick smoke rising",
    ]),
    ("tr_fire_lpg", "fire_smoke", [
        "{loc} hostel canteen kitchen mein gas cylinder leak se aag lag gayi",
        "LPG cooking cylinder burst into flames inside {loc} mess kitchen",
        "{loc} कैंटीन रसोई में रसोई गैस सिलेंडर से आग लग गई है",
        "Active gas fire and dense smoke coming out of food stall kitchen near {loc}",
    ]),
    ("tr_fire_ev", "fire_smoke", [
        "{loc} basement parking mein electric scooter battery fatne se aag lagi",
        "Parked EV two wheeler battery exploded into fire inside {loc} parking",
        "{loc} पार्किंग में इलेक्ट्रिक स्कूटर की बैटरी फटने से आग लग गई है",
        "Lithium battery thermal fire on e-scooter inside {loc} basement lot",
    ]),
    ("tr_fire_garbage", "fire_smoke", [
        "{loc} market ke peeche sukhe kachre aur jhadiyon mein tej aag fail rahi",
        "Dry bushes and garbage burning rapidly close to parked bikes at {loc}",
        "{loc} के पीछे सूखे कचरे में बड़ी आग भड़क रही है",
        "Open trash fire spreading smoke toward residential lane near {loc}",
    ]),
    ("tr_crash_bus_bike", "road_accident", [
        "{loc} chowk par city bus ne bike ko takkar maari rider road par behosh hai",
        "City bus collided head-on with motorcycle at {loc}, rider unconscious and bleeding",
        "{loc} चौराहे पर सिटी बस और बाइक की टक्कर में युवक गंभीर घायल होकर सड़क पर गिरा",
        "Major crash between bus and two-wheeler at {loc} square, ambulance needed urgently",
    ]),
    ("tr_crash_auto", "road_accident", [
        "{loc} mod par e-rickshaw palat gaya teen sawariyan injured hain traffic jam",
        "Overturned auto rickshaw blocking {loc} turn with commuters hurt on pavement",
        "{loc} मोड़ पर ई-रिक्शा पलट गया है और तीन यात्री घायल हो गए हैं",
        "Three-wheeler flipped over at {loc} intersection injuring passengers",
    ]),
    ("tr_crash_minor", "road_accident", [
        "{loc} signal par do car halki bhid gayi koi chot nahi bas traffic ruka hai",
        "Minor bumper scrape between two cars near {loc} traffic light causing slowdown",
        "{loc} सिग्नल पर दो कारों की हल्की टक्कर से ट्रैफिक जाम लग गया है",
        "Small fender bender at {loc} crossing, zero injuries reported",
    ]),
    ("tr_med_chest", "medical", [
        "{loc} metro gate par ek buzurg ko achanak chest pain aur behosh ho kar gir gaye",
        "Elderly man collapsed with suspected cardiac chest pain outside {loc} gate",
        "{loc} गेट के बाहर बुजुर्ग को अचानक सीने में तेज दर्द के बाद बेहोशी आ गई",
        "Senior commuter fainted holding chest at {loc} entrance, urgent ambulance required",
    ]),
    ("tr_med_seizure", "medical", [
        "{loc} library ke bahar student ko mirgi ka daura pada hai saans lene mein dikkat",
        "College student experiencing epileptic seizure and breathing trouble outside {loc}",
        "{loc} के बाहर छात्र को मिर्गी का दौरा पड़ा है तुरंत एम्बुलेंस भेजें",
        "Person convulsing unresponsive on footpath near {loc}, medical help fast",
    ]),
    ("tr_med_cut", "medical", [
        "{loc} lab mein kaanch tootne se student ke haath se bahut khoon beh raha hai",
        "Deep glass laceration causing steady bleeding on worker hand near {loc}",
        "{loc} में कांच लगने से युवक के हाथ से लगातार खून बह रहा है",
        "Heavy bleeding injury from broken glass near {loc}, trauma first aid needed",
    ]),
    ("tr_safe_stalk", "personal_safety", [
        "raat mein {loc} sunsan gali mein do bike wale ladke mera peecha kar rahe SOS",
        "Being chased and stalked by unknown men on motorcycle in dark alley near {loc}",
        "{loc} की सुनसान गली में दो बाइक सवार मेरा पीछा कर रहे हैं पुलिस मदद भेजें",
        "Scared caller reporting motorcycle stalkers following closely near {loc}",
    ]),
    ("tr_safe_atm", "personal_safety", [
        "{loc} ATM ke bahar kuch gunde chaaku dikha kar paise cheen rahe hain",
        "Armed muggers threatening commuters with knife outside {loc} ATM booth",
        "{loc} एटीएम के बाहर कुछ बदमाश चाकू दिखाकर लूटने की धमकी दे रहे हैं",
        "Knife threat and robbery attempt outside bank ATM at {loc}, send police",
    ]),
    ("tr_safe_hostel", "personal_safety", [
        "{loc} girls hostel gate ke bahar sharabi ladke shor macha kar pareshan kar rahe",
        "Intoxicated group harassing students and shouting abuses outside {loc} hostel gate",
        "{loc} गर्ल्स हॉस्टल गेट के बाहर शराबी लोग लड़कियों को परेशान कर रहे हैं",
        "Rowdy drunk men harassing commuters outside {loc} ladies hostel entrance",
    ]),
    ("tr_flood_underpass", "water_flood", [
        "{loc} railway underpass mein kamar tak paani bhar gaya ek car andar phansi hai",
        "Flash monsoon waterlogging submerged {loc} underpass trapping car inside water",
        "{loc} रेलवे अंडरपास में भारी बारिश का पानी भर गया है और एक कार फंस गई है",
        "Deep floodwater inside {loc} culvert up to vehicle windows, commuters stranded",
    ]),
    ("tr_flood_pipe", "water_flood", [
        "{loc} hospital road par main water pipeline tootne se poori sadak talab ban gayi",
        "Broken municipal supply water main flooding entire main street at {loc}",
        "{loc} मुख्य सड़क पर पानी की पाइपलाइन फूटने से भारी जलभराव हो गया है",
        "Burst water pipe inundating road and entry ramp near {loc}",
    ]),
    ("tr_flood_drain", "water_flood", [
        "{loc} nallah overflow hone se ground floor gharon mein baarish ka paani ghus raha",
        "Overflowing stormwater drain sending floodwater into ground floor homes at {loc}",
        "{loc} नाला ओवरफ्लो होने से निचले घरों में पानी घुस रहा है",
        "Storm drain backflow inundating residential lanes near {loc}",
    ]),
    ("tr_haz_wire", "hazard", [
        "{loc} par bijli ka nanga taar toot kar paani mein gira hai current ka khatra",
        "Snapped live 11kV power wire sparking in rainwater puddle at {loc}",
        "{loc} में बिजली का चालू तार टूटकर बारिश के पानी में गिरा है करंट का खतरा है",
        "Downed live overhead electrical conductor touching wet street near {loc}",
    ]),
    ("tr_haz_manhole", "hazard", [
        "{loc} main road ke beech bada khula manhole hai bina dhakkan ke raat mein khatra",
        "Deep uncovered sewer manhole exposed without barricade in middle of {loc} road",
        "{loc} मुख्य सड़क के बीच बिना ढक्कन का गहरा मेनहोल खुला पड़ा है",
        "Open dangerous drainage pit on dark street at {loc}, warning cone needed",
    ]),
    ("tr_haz_tree", "hazard", [
        "{loc} main chowk par purana bada ped gir gaya hai dono lane band hain",
        "Large fallen neem tree obstructing road traffic lanes at {loc} circle",
        "{loc} चौराहे पर बड़ा पेड़ टूटकर सड़क पर गिर गया है यातायात बंद है",
        "Uprooted tree blocking roadway and dangling wires near {loc}",
    ]),
    ("tr_haz_oil", "hazard", [
        "{loc} turn par truck se diesel leak hoke road chikni ho gayi bike phisal rahi",
        "Slippery diesel oil spill across sharp curve at {loc} endangering scooters",
        "{loc} मोड़ पर डीजल फैलने से सड़क फिसलन भरी हो गई है दोपहिया फिसल रहे हैं",
        "Fuel slick hazard covering asphalt bend at {loc}",
    ]),
]

VAL_CLUSTERS: List[Tuple[str, str, List[str]]] = [
    ("val_fire_bakery", "fire_smoke", [
        "{loc} ki bakery mein oven fatne se laptein aur kala dhuan fail raha",
        "Bakery oven explosion causing active flames and black smoke at {loc}",
        "{loc} की बेकरी में ओवन फटने से आग की लपटें और धुआं निकल रहा है",
    ]),
    ("val_crash_suv", "road_accident", [
        "{loc} bypass par SUV ne scooty ko uda diya do log zameen par ghayal pade",
        "Speeding SUV rammed two-wheeler near {loc} bypass leaving two critically hurt",
        "{loc} बाईपास पर एसयूवी ने स्कूटी को टक्कर मारी दो लोग गंभीर घायल हैं",
    ]),
    ("val_med_heat", "medical", [
        "{loc} bus stand par tez dhoop se ek aadmi chakkar kha kar behosh ho gaya",
        "Passenger fainted from severe heatstroke outside {loc} bus stand",
        "{loc} बस स्टैंड पर तेज गर्मी से यात्री चक्कर खाकर बेहोश हो गया",
    ]),
    ("val_safe_lane", "personal_safety", [
        "{loc} dark lane mein badmash rasta rok kar bag cheenne ki koshish kar rahe",
        "Muggers blocking unlit lane at {loc} trying to snatch commuter bag",
        "{loc} की अंधेरी गली में बदमाश रास्ता रोककर बैग छीनने की कोशिश कर रहे हैं",
    ]),
    ("val_flood_school", "water_flood", [
        "{loc} railway bridge niche paani bharne se school van beech mein phans gayi",
        "Deep waterlogging under {loc} rail bridge stranded a school van",
        "{loc} रेलवे पुल के नीचे पानी भरने से स्कूल वैन फंस गई है",
    ]),
    ("val_haz_wall", "hazard", [
        "{loc} gali mein puraani brick wall jhuki hui hai kabhi bhi gir sakti hai",
        "Leaning cracked brick boundary wall threatening to collapse on footpath at {loc}",
        "{loc} गली में पुरानी ईंट की दीवार झुकी हुई है कभी भी गिर सकती है",
    ]),
]

# Completely unseen Indian OOD evaluation pairs covering:
# - Cross-script positives (Hinglish<->English, Hindi<->Hinglish, Hindi<->English)
# - Same-location different-incident hard negatives (MUST NOT falsely merge!)
# - Different-location same-category negatives
CURATED_OOD_TEST_PAIRS: List[Tuple[str, str, int, str]] = [
    # POSITIVES (label=1)
    ("Chuna Bhatti square pe e-rickshaw mein battery blast hoke aag aur dhuwa fail gaya",
     "E-rickshaw battery explosion fire and dense smoke reported at Chuna Bhatti crossing", 1, "hinglish_to_english_pos"),
    ("चूना भट्टी चौराहे के पास दुकान में शॉर्ट सर्किट से भीषण आग लग गई है",
     "Chuna Bhatti chowk ki dukan mein short circuit se bhayanak aag aur dhuan faila", 1, "hindi_to_hinglish_pos"),
    ("रेलवे स्टेशन के बाहर तेज रफ्तार कार ने दोपहिया को टक्कर मार दी दो लोग घायल हैं",
     "Speeding car struck a two-wheeler outside Rani Kamalapati railway station leaving two injured", 1, "hindi_to_english_pos"),
    ("Misrod highway pe truck aur car ki bhayankar takkar ho gayi driver andar phasa hua hai",
     "Severe highway crash between truck and car at Misrod, driver trapped inside cab", 1, "hinglish_to_english_pos"),
    ("Katara Hills park mein daudte waqt buzurg ko chest pain aur chakkar aa ke gir gaye",
     "Elderly jogger collapsed with acute chest pain inside Katara Hills park", 1, "hinglish_to_english_pos"),
    ("अचानक सीने में तेज दर्द के कारण बुजुर्ग जमीन पर बेहोश गिर गए एम्बुलेंस भेजें",
     "Senior citizen fainted on ground with sudden chest pain near park, send ambulance", 1, "hindi_to_english_pos"),
    ("raat ke 11 baje Narela mod pe do ladke bike se peecha kar rahe dar lag raha help",
     "Two men on motorbike stalking solo commuter late at night near Narela turn, SOS", 1, "hinglish_to_english_pos"),
    ("अंधेरी गली में अज्ञात लोग मेरा पीछा कर रहे हैं मुझे तुरंत सुरक्षा सहायता चाहिए",
     "Narela sunsan gali mein anjaan log peecha kar rahe jaldi police madad bhejein", 1, "hindi_to_hinglish_pos"),
    ("Misrod underpass mein 4 feet paani bhar gaya ek bus beech mein ruk ke doob rahi",
     "Deep monsoon floodwater inside Misrod underpass trapping a passenger bus", 1, "hinglish_to_english_pos"),
    ("लगातार बारिश से अंडरपास में पानी भर गया है और कई गाड़ियां फंस गई हैं",
     "Heavy continuous rainfall submerged culvert underpass stranding multiple vehicles", 1, "hindi_to_english_pos"),
    ("bijli ka live wire toot ke baarish ke paani mein gira hua chingari maar raha",
     "Live electric power cable snapped into rainwater puddle sparking dangerously", 1, "hinglish_to_english_pos"),
    ("सड़क किनारे बिजली का चालू केबल बारिश के पानी में गिरा है करंट का खतरा",
     "barish ke paani mein nanga electric cable gira hai current lagne ka khatra", 1, "hindi_to_hinglish_pos"),
    ("main road ke beech ek khula deep manhole hai bina dhakkan ke raat mein dikhta nahi",
     "Uncovered deep sewer manhole exposed in middle of main road without cover", 1, "hinglish_to_english_pos"),
    ("hostel mess ki chimney se tez kaala dhuan aur flames aa rahi fire unit bhejo",
     "Thick black smoke and fire erupting from hostel mess kitchen chimney", 1, "hinglish_to_english_pos"),
    ("paani ki main pipeline tootne se Bhopal Talkies chauraha poora talab ban gaya",
     "Burst main water supply pipe flooding entire Bhopal Talkies intersection", 1, "hinglish_to_english_pos"),
    ("girls PG gate ke saamne anjaan ladke shor macha ke pareshan kar rahe",
     "Rowdy strangers harassing women outside girls PG entrance gate", 1, "hinglish_to_english_pos"),
    ("coaching class mein ladki achanak behosh ho gayi saans lene mein takleef hai",
     "Female student fainted inside coaching center struggling to breathe", 1, "hinglish_to_english_pos"),
    ("10 number market turn par do bike takra gayi ek ladke ke kandhe mein chot aayi",
     "Two motorcycles collided at 10 Number Market corner, rider suffered shoulder injury", 1, "hinglish_to_english_pos"),
    ("mod par truck se diesel leak hoke sadak chikni ho gayi bike phisal sakti hai",
     "Diesel fuel leak on road curve creating dangerous slippery surface for two-wheelers", 1, "hinglish_to_english_pos"),
    ("बाजार के गोदाम में धुआं भर गया है और अंदर आग सुलग रही है तुरंत दमकल भेजें",
     "Warehouse in market filled with smoke and active fire, send fire brigade immediately", 1, "hindi_to_english_pos"),

    # HARD NEGATIVES (label=0: same location OR same emergency theme, DIFFERENT real incidents!)
    ("Chuna Bhatti square pe e-rickshaw mein battery blast hoke aag aur dhuwa fail gaya",
     "Chuna Bhatti square par bike phisal gayi rider ke pair mein chot lagi hai", 0, "same_place_diff_event_neg"),
    ("Chuna Bhatti chowk ke paas dukan mein short circuit se aag lagi hai",
     "Chuna Bhatti road par barish ka paani bharne se school bus phans gayi hai", 0, "same_place_diff_event_neg"),
    ("Misrod highway pe truck aur car ki bhayankar takkar ho gayi driver phasa hai",
     "Misrod main road ke beech bina dhakkan ka khula manhole hai raat mein khatra", 0, "same_place_diff_event_neg"),
    ("Rani Kamalapati station gate par ek buzurg ko chest pain aur behosh ho gaye",
     "Rani Kamalapati parking outside drunk men threatening commuters near ATM", 0, "same_place_diff_event_neg"),
    ("Narela mod pe do ladke bike se peecha kar rahe dar lag raha help",
     "Narela flyover ke paas bijli ka nanga taar toot kar road par gira hai", 0, "same_place_diff_event_neg"),
    ("Bhopal Talkies chauraha par water pipeline tootne se paani bhar gaya hai",
     "Bhopal Talkies signal par gas cylinder shop mein chingari aur aag lagi hai", 0, "same_place_diff_event_neg"),
    ("10 number market ke transformer se chingari giri aur thele mein aag lag gayi",
     "10 number market park mein daudte waqt buzurg gir gaye pair mein fracture hai", 0, "same_place_diff_event_neg"),
    ("Bittan Market ke showroom ke AC compressor se halka smoke aa raha hai",
     "Bittan Market parking mein minor bumper touch se traffic jam laga hai", 0, "same_place_diff_event_neg"),
    ("Katara Hills park mein daudte waqt buzurg ko chest pain aur behosh ho gaye",
     "Katara Hills chowk par purana bada ped toot kar road par gir gaya hai", 0, "same_place_diff_event_neg"),
    ("girls PG gate ke saamne anjaan ladke pareshan kar rahe security bhejo",
     "girls PG road par streetlight kharab hai aur paani pipe leak ho raha", 0, "same_place_diff_event_neg"),
    ("LPG cylinder caught fire inside canteen kitchen near Chuna Bhatti",
     "Two-wheeler hit divider and rider injured near Rani Kamalapati station", 0, "diff_place_diff_event_neg"),
    ("Hostel mess ki chimney se tez kaala dhuan aur flames aa rahi",
     "Hostel Wi-Fi router down since morning and mess tea is cold", 0, "same_place_false_alarm_neg"),
    ("रेलवे स्टेशन के बाहर कार ने दोपहिया को टक्कर मार दी दो लोग घायल हैं",
     "रेलवे स्टेशन के बाहर भारी जलभराव हो गया है और अंडरपास बंद है", 0, "hindi_same_place_diff_event_neg"),
    ("अंधेरी गली में अज्ञात लोग मेरा पीछा कर रहे हैं मुझे पुलिस सहायता चाहिए",
     "अंधेरी गली में स्ट्रीट लाइट खराब है और सड़क पर कीचड़ फैला है", 0, "hindi_same_place_diff_event_neg"),
    ("Electric scooter battery caught fire inside basement parking",
     "Basement parking flooded with stormwater after drain overflowed", 0, "same_place_diff_event_neg"),
    ("Snapped 11kV power cable sparking in rainwater puddle",
     "Elderly passenger collapsed with severe asthma attack on platform", 0, "diff_event_neg"),
    ("Flash flooding submerging railway underpass trapping auto",
     "LPG gas cylinder fire inside restaurant kitchen", 0, "diff_event_neg"),
    ("Student collapsed with epileptic seizure outside library gate",
     "Armed muggers threatening commuters outside ATM booth", 0, "diff_event_neg"),
    ("False alarm triggered by mistake while checking pocket phone lock",
     "Massive transformer explosion with thick smoke engulfing corner shops", 0, "false_alarm_vs_real_neg"),
    ("Testing ResQAi notification latency only, no active emergency here",
     "Head-on collision between bus and scooter with heavy bleeding", 0, "false_alarm_vs_real_neg"),
]


def build_pairs_from_clusters(
    clusters: List[Tuple[str, str, List[str]]],
    places: List[str],
    repeats_per_place: int,
) -> List[Dict]:
    instances: List[Dict] = []
    for cid, cat, variants in clusters:
        chosen_places = RNG.sample(places, k=min(len(places), repeats_per_place))
        for p in chosen_places:
            rendered = [v.format(loc=p) for v in variants]
            instances.append(
                {
                    "cluster_key": f"{cid}::{p}",
                    "cluster_id": cid,
                    "category": cat,
                    "place": p,
                    "texts": rendered,
                }
            )

    pairs: List[Dict] = []
    seen = set()

    def add_pair(t1: str, t2: str, label: int, ptype: str) -> None:
        key = tuple(sorted([t1.lower(), t2.lower()])) + (label,)
        if key in seen:
            return
        seen.add(key)
        pairs.append({"text_a": t1, "text_b": t2, "label": label, "pair_type": ptype})

    # 1. Positive pairs within same (cluster, place) instance
    for inst in instances:
        texts = inst["texts"]
        for i in range(len(texts)):
            for j in range(i + 1, len(texts)):
                add_pair(texts[i], texts[j], 1, "cross_lingual_duplicate")

    # Index by place for hard negatives (same place, different emergency!)
    by_place: Dict[str, List[Dict]] = {}
    by_cat: Dict[str, List[Dict]] = {}
    for inst in instances:
        by_place.setdefault(inst["place"], []).append(inst)
        by_cat.setdefault(inst["category"], []).append(inst)

    for inst in instances:
        t1 = RNG.choice(inst["texts"])
        # Same-place hard negative (different cluster!)
        same_place_others = [x for x in by_place[inst["place"]] if x["cluster_id"] != inst["cluster_id"]]
        for neg in RNG.sample(same_place_others, k=min(len(same_place_others), 2)):
            add_pair(t1, RNG.choice(neg["texts"]), 0, "same_place_diff_incident")

        # Same-category different-cluster hard negative
        same_cat_others = [x for x in by_cat[inst["category"]] if x["cluster_id"] != inst["cluster_id"]]
        if same_cat_others:
            neg = RNG.choice(same_cat_others)
            add_pair(t1, RNG.choice(neg["texts"]), 0, "same_cat_diff_incident")

        # Different-category & different-place negative
        diff_others = [x for x in instances if x["category"] != inst["category"] and x["place"] != inst["place"]]
        if diff_others:
            neg = RNG.choice(diff_others)
            add_pair(t1, RNG.choice(neg["texts"]), 0, "diff_cat_diff_place")

    RNG.shuffle(pairs)
    return pairs


def save_jsonl(path: Path, rows: List[Dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def main() -> None:
    out_dir = Path(__file__).resolve().parent / "processed"
    train_pairs = build_pairs_from_clusters(TRAIN_CLUSTERS, TRAIN_LOCATIONS, repeats_per_place=10)
    val_pairs = build_pairs_from_clusters(VAL_CLUSTERS, VAL_LOCATIONS, repeats_per_place=5)
    test_pairs = [
        {"text_a": a, "text_b": b, "label": lbl, "pair_type": pt}
        for a, b, lbl, pt in CURATED_OOD_TEST_PAIRS
    ]

    save_jsonl(out_dir / "train_pairs.jsonl", train_pairs)
    save_jsonl(out_dir / "val_pairs.jsonl", val_pairs)
    save_jsonl(out_dir / "test_indian_duplicate_benchmark.jsonl", test_pairs)

    summary = {
        "train_total": len(train_pairs),
        "train_labels": dict(Counter(r["label"] for r in train_pairs)),
        "train_types": dict(Counter(r["pair_type"] for r in train_pairs)),
        "val_total": len(val_pairs),
        "val_labels": dict(Counter(r["label"] for r in val_pairs)),
        "test_total": len(test_pairs),
        "test_labels": dict(Counter(r["label"] for r in test_pairs)),
        "test_types": dict(Counter(r["pair_type"] for r in test_pairs)),
    }
    (out_dir / "dataset_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
