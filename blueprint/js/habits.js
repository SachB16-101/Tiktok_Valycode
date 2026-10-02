/**
 * The corpus.
 *
 * Every habit in the app, with the evidence behind it stated plainly. This
 * file is the reason the app exists: a checklist that treats "sleep 8 hours"
 * and "press your thumbs against your palate" as equivalent is lying to you
 * by omission, because ticking the cheap one feels identical to ticking the
 * one that works.
 *
 * So each habit carries a tier and an evidence grade, and the daily score is
 * computed from graded habits only. Unproven habits are tracked in full,
 * never scored, and can be promoted into a real n=1 experiment with a locked
 * baseline. That is the honest version of "it worked for me".
 *
 * TIERS
 *   foundation    Large effect, well evidenced. Weighted double in the score.
 *   compounding   Real effect, smaller or slower. Weighted single.
 *   experimental  Mechanism disputed or unsupported. Never scored.
 *
 * EVIDENCE
 *   established   Controlled trials, meta-analyses, or consensus guidance.
 *   supported     Reasonable evidence, smaller effect, or standard practice.
 *   contested     A real effect exists but not the one usually claimed.
 *   unproven      No clinical support for the mechanism as stated.
 */

export const TIERS = {
  foundation: { label: "Foundation", weight: 2, scored: true },
  compounding: { label: "Compounding", weight: 1, scored: true },
  experimental: { label: "Experimental", weight: 0, scored: false },
};

export const EVIDENCE = {
  established: { label: "Established", rank: 4 },
  supported: { label: "Supported", rank: 3 },
  contested: { label: "Contested", rank: 2 },
  unproven: { label: "Unproven", rank: 1 },
};

export const GROUPS = [
  { id: "sleep", label: "Sleep and breathing", icon: "moon-stars" },
  { id: "food", label: "Food", icon: "fork-knife" },
  { id: "train", label: "Training", icon: "barbell" },
  { id: "skin", label: "Skin", icon: "drop" },
  { id: "face", label: "Face and jaw", icon: "smiley" },
  { id: "mouth", label: "Mouth", icon: "tooth" },
  { id: "groom", label: "Grooming", icon: "scissors" },
  { id: "mind", label: "Recovery", icon: "wind" },
];

/**
 * Targets that scale with bodyweight are declared as a function of kg so the
 * daily view never shows a number that is wrong for the person reading it.
 */
export const HABITS = [
  /* ---------------------------------------------------------------- sleep */
  {
    id: "wake-time",
    name: "Fixed wake time",
    short: "Up at the same time, including weekends",
    group: "sleep",
    tier: "foundation",
    evidence: "established",
    cadence: "daily",
    defaultOn: true,
    why:
      "The keystone. A stable wake time anchors every other circadian variable, and it is the one input that makes the rest of the sleep advice possible rather than aspirational.",
    source: "Chronobiology consensus; the dinacharya scaffolding minus the metaphysics",
  },
  {
    id: "sleep-hours",
    name: "Sleep 7.5 to 9 hours",
    short: "Log what you actually got",
    group: "sleep",
    tier: "foundation",
    evidence: "established",
    cadence: "daily",
    defaultOn: true,
    input: { kind: "number", unit: "h", mode: "floor", target: 7.5, step: 0.5, max: 12 },
    why:
      "The highest return appearance intervention there is, and the fastest to show in the face. Photographed after normal sleep and after deprivation, the same faces were rated less healthy, less attractive and more tired, and others wanted to socialise with them less.",
    source: "Axelsson et al. 2010, BMJ 341:c6614; Sundelin et al. follow-up",
  },
  {
    id: "wind-down",
    name: "Wind down before bed",
    short: "Screens down 45 minutes before lights out",
    group: "sleep",
    tier: "compounding",
    evidence: "supported",
    cadence: "daily",
    defaultOn: true,
    why: "Protects sleep onset and therefore total sleep time, which is the variable that actually matters.",
    source: "Standard sleep hygiene guidance",
  },
  {
    id: "slow-breathing",
    name: "Slow breathing, 5 minutes",
    short: "About 6 breaths per minute, before sleep",
    group: "sleep",
    tier: "compounding",
    evidence: "supported",
    cadence: "daily",
    defaultOn: true,
    why:
      "Decent acute evidence for heart rate variability and stress. A genuinely useful free pre-sleep tool. It will not move your cheekbones.",
    source: "Pranayama and slow-paced breathing literature",
  },
  {
    id: "nasal-breathing",
    name: "Nasal breathing",
    short: "Nose closed-lip through the day",
    group: "sleep",
    tier: "compounding",
    evidence: "supported",
    cadence: "daily",
    defaultOn: true,
    why:
      "Treating airway and sleep quality as an appearance variable is legitimate. If you snore, wake unrefreshed, or mouth-breathe at night, that is a referral worth having.",
    source: "Airway and sleep-quality literature",
  },
  {
    id: "myofunctional",
    name: "Myofunctional exercises",
    short: "The clinician-prescribed set, not a video",
    group: "sleep",
    tier: "compounding",
    evidence: "supported",
    cadence: "daily",
    defaultOn: false,
    why:
      "This is the evidence-based version of the whole tongue-and-face genre. A 2024 meta-analysis of randomised trials found structured orofacial myofunctional therapy reduced apnoea events and improved sleep quality in adults, and a systematic review found reduced pain and better function in temporomandibular disorders.",
    caution:
      "The evidence is for clinician-led programmes matched to your assessment. Blanket routines from a video are the version that gets people jaw pain and headaches.",
    source: "2024 meta-analysis of RCTs, orofacial myofunctional therapy in OSA",
  },
  {
    id: "mouth-tape",
    name: "Mouth taping at night",
    short: "Tape or a chin strap to force nasal breathing",
    group: "sleep",
    tier: "experimental",
    evidence: "unproven",
    cadence: "daily",
    defaultOn: false,
    claim:
      "Forcing the mouth shut overnight keeps the tongue up, holds the jaw forward, and improves both sleep and facial structure.",
    counter:
      "Nasal breathing during sleep is a reasonable goal, but taping has little trial evidence and does not remodel bone. The structural claim rides on the same suture argument that fails in adults.",
    caution:
      "Do not tape if you snore heavily, wake gasping, or have not been assessed for sleep apnoea. Obstructing the mouth in undiagnosed apnoea is the one genuinely risky item in this app. Get assessed first.",
    source: "Patel case study, his mother, over one year",
  },

  /* ----------------------------------------------------------------- food */
  {
    id: "protein",
    name: "Protein floor",
    short: "Hit the number before anything else",
    group: "food",
    tier: "foundation",
    evidence: "established",
    cadence: "daily",
    defaultOn: true,
    input: { kind: "number", unit: "g", mode: "floor", perKg: 2.0, step: 5, max: 350 },
    why:
      "Does three jobs at once. It suppresses appetite measurably, it preserves lean mass in a deficit, and it is the single plate-level fix for a South Asian diet. Dal, rice and roti is roughly 15 g of protein and 700 calories, which feels like a full meal and is not one.",
    source: "Meta-analysis of 49 acute trials on protein and satiety; controlled feeding meta-analyses on lean-mass retention",
  },
  {
    id: "protein-first",
    name: "Protein anchored first",
    short: "Pick the protein, then build the plate around it",
    group: "food",
    tier: "foundation",
    evidence: "established",
    cadence: "daily",
    defaultOn: true,
    why:
      "The whole model-diet system in one habit. Dropping protein from 15 to 10 percent of energy raised total intake by about 12 percent, mostly from savoury snacking between meals. The leverage is at the bottom end, so clearing the floor matters far more than going very high.",
    source: "Protein leverage trial, disguised macronutrient composition",
  },
  {
    id: "fat-floor",
    name: "Fat floor",
    short: "Clear it and stop thinking about it",
    group: "food",
    tier: "foundation",
    evidence: "supported",
    cadence: "daily",
    defaultOn: true,
    input: { kind: "number", unit: "g", mode: "floor", perKg: 0.8, step: 5, max: 250 },
    why:
      "A floor, not a dial. Very low fat intake is associated with modestly lower testosterone, so there is a real reason to clear the number. Going from adequate to high does not push it higher, and the extra calories come straight out of the budget that controls your waist.",
    source: "Dietary fat and androgen literature; effect sits at the low end of intake",
  },
  {
    id: "whole-foods",
    name: "Whole foods, 80 percent",
    short: "Eat food you could name the parts of",
    group: "food",
    tier: "compounding",
    evidence: "supported",
    cadence: "daily",
    defaultOn: true,
    why:
      "The 80/20 structure that working models actually run. Note the mechanism is scheduling, not willpower: the indulgence is planned into the week rather than resisted daily.",
    source: "Model maintenance-diet pattern",
  },
  {
    id: "veg",
    name: "Vegetables, uncapped",
    short: "Three servings minimum, no ceiling",
    group: "food",
    tier: "compounding",
    evidence: "established",
    cadence: "daily",
    defaultOn: true,
    why:
      "Volume over density is how you eat a lot and stay lean without tracking. Higher carotenoid intake does shift skin spectra, but a large multi-trait study found skin colour did not predict attractiveness. Eat them for the health effect and treat any glow as a bonus.",
    source: "Carotenoid and skin-spectra work; Scott et al. multi-trait analysis",
  },
  {
    id: "fibre",
    name: "Fibre, 30 g",
    short: "You have the cuisine for it",
    group: "food",
    tier: "compounding",
    evidence: "established",
    cadence: "daily",
    defaultOn: true,
    input: { kind: "number", unit: "g", mode: "floor", target: 30, step: 5, max: 120 },
    why:
      "Dal and chana are the cheapest protein and fibre you have access to. Ignore the fibre scare stories; the widely repeated one came from a man eating 100 g a day, which is an outlier and not a warning about plants.",
    source: "Standard intake guidance",
  },
  {
    id: "measured-oil",
    name: "Measure the oil",
    short: "Spoon it into the pan, do not pour",
    group: "food",
    tier: "compounding",
    evidence: "supported",
    cadence: "daily",
    defaultOn: true,
    why:
      "A tablespoon of ghee is 120 calories and a home curry can carry four of them. This single habit is often 300 to 400 calories a day, invisible, every day.",
    source: "Practical audit of South Asian home cooking",
  },
  {
    id: "front-load",
    name: "Front-load the day",
    short: "Biggest meal midday, dinner before 8",
    group: "food",
    tier: "compounding",
    evidence: "supported",
    cadence: "daily",
    defaultOn: true,
    why:
      "The meal-timing half of dinacharya is the part chrononutrition now echoes. It also removes the 10pm dinner, which is where late eating quietly costs you sleep quality.",
    source: "Chrononutrition literature; dinacharya scaffolding",
  },
  {
    id: "alcohol-free",
    name: "Alcohol-free day",
    short: "Tick it on the days you did not drink",
    group: "food",
    tier: "foundation",
    evidence: "established",
    cadence: "daily",
    defaultOn: true,
    why:
      "The cost is not mainly calories, it is sleep architecture, and sleep is your top facial variable. One or two nights a week is fine. Three is the thing that actually undoes the rest of this list.",
    source: "Alcohol and sleep architecture; see the sleep evidence above",
  },
  {
    id: "vitamin-d",
    name: "Vitamin D",
    short: "With the largest fat-containing meal",
    group: "food",
    tier: "foundation",
    evidence: "established",
    cadence: "daily",
    defaultOn: true,
    why:
      "Close to a default rather than a supplement decision. In 6,433 UK South Asian adults, 55 percent were severely deficient and 92 percent were insufficient, with median levels in Northern England around 19 to 20 nmol/l. NHS guidance already says people with dark skin should consider a daily supplement year round.",
    caution:
      "NHS guidance: 10 micrograms daily is the baseline, and adults should not exceed 100 micrograms (4,000 IU) a day. If a test shows you are deficient, let a GP set the dose rather than guessing.",
    source: "Darling et al. 2021, Br J Nutr, UK Biobank; NHS vitamin D guidance",
  },
  {
    id: "packed-food",
    name: "Pack the bag",
    short: "Protein in the bag before you leave",
    group: "food",
    tier: "compounding",
    evidence: "supported",
    cadence: "daily",
    defaultOn: true,
    why:
      "The highest leverage habit in the entire model-diet literature and the least glamorous. The real constraint on eating well is not discipline, it is time. Whoever packs the bag eats well; whoever does not, forfeits the meal.",
    source: "Working model, on fashion-week logistics",
  },
  {
    id: "hydration",
    name: "Water",
    short: "Through the day, not all at 9pm",
    group: "food",
    tier: "compounding",
    evidence: "supported",
    cadence: "daily",
    defaultOn: true,
    why: "Unglamorous, and it is also the cheapest input into how your face looks in the morning.",
    source: "Model maintenance-diet pattern",
  },
  {
    id: "zinc-food",
    name: "Zinc from food",
    short: "Seeds, dairy, meat, legumes",
    group: "food",
    tier: "compounding",
    evidence: "supported",
    cadence: "daily",
    defaultOn: false,
    why:
      "Adequacy matters for skin and hormones. Note the honest limit: correcting a shortfall helps, and taking more once you are replete does nothing. This is a floor like the others, not a lever.",
    source: "Patel nutrition stack; zinc adequacy literature",
  },
  {
    id: "salt-window",
    name: "48-hour rule",
    short: "Before anything that matters: no salt, no alcohol, nothing new",
    group: "food",
    tier: "compounding",
    evidence: "supported",
    cadence: "daily",
    defaultOn: false,
    why:
      "The only half of the pre-shoot manipulation worth copying. Cutting sodium, alcohol and hard-to-digest vegetables for two days is free, safe and visibly effective. The multi-day carb-zero and water-loading protocols are not: they change how much fluid you are carrying for a few hours and nothing else.",
    source: "Pre-show practice, the transferable half",
  },

  /* ---------------------------------------------------------------- train */
  {
    id: "lift",
    name: "Lift",
    short: "Two hard working sets, reverse pyramid, logged",
    group: "train",
    tier: "foundation",
    evidence: "established",
    cadence: "daily",
    defaultOn: true,
    why:
      "The biggest single variable in male bodily attractiveness. Rated strength accounts for about 70 percent of the variance, and height and leanness take it to 80. Critically the effect is linear: the strongest men were the most attractive in every sample, so there is no threshold to gamble on and every increment gets paid.",
    source: "Sell, Lukaszewski and Townsley 2017, Proc. R. Soc. B",
  },
  {
    id: "steps",
    name: "Steps",
    short: "Take calls standing",
    group: "train",
    tier: "foundation",
    evidence: "established",
    cadence: "daily",
    defaultOn: true,
    input: { kind: "number", unit: "steps", mode: "floor", target: 8000, step: 500, max: 40000 },
    why:
      "The base layer under everything else. 8,000 is where most of the mortality benefit sits and it is the number you will actually hit with a desk job, which makes it better than a 12,000 target you miss.",
    source: "Step-count and mortality literature",
  },
  {
    id: "sport",
    name: "Wrestling or sport",
    short: "The session you would do anyway",
    group: "train",
    tier: "compounding",
    evidence: "established",
    cadence: "daily",
    defaultOn: true,
    why:
      "Adherence beats optimisation. The best training is the one you keep turning up to, and a sport gives you a reason to turn up that a programme cannot.",
    source: "Jules Horn, the one idea on his channel worth keeping",
  },
  {
    id: "neck",
    name: "Neck work",
    short: "Harness or bridging, progressive, supervised",
    group: "train",
    tier: "compounding",
    evidence: "supported",
    cadence: "daily",
    defaultOn: false,
    why:
      "One of the two most underrated things you can do to your face, and nobody in the looksmaxxing space sells it. A thicker neck reads as strength from across a room, and wrestling already gives you the vehicle.",
    caution: "Bridging loads the cervical spine. Build slowly and have a coach watch it.",
    source: "Blueprint section 4.5; pehlwani neck tradition",
  },
  {
    id: "mace",
    name: "Mace or clubs",
    short: "10 to 15 minutes of 360s and 10-to-2s",
    group: "train",
    tier: "compounding",
    evidence: "supported",
    cadence: "daily",
    defaultOn: false,
    why:
      "Your inheritance, and it happens to be excellent conditioning. Nothing in a commercial gym builds shoulder girdle endurance, grip and rotational control the way a gada does, and it complements lateral raises rather than duplicating them.",
    source: "Akhara practice; absorbed into Western catch wrestling via Karl Gotch",
  },
  {
    id: "dand-bethak",
    name: "Dand and bethak",
    short: "10 minutes, no gym needed",
    group: "train",
    tier: "compounding",
    evidence: "supported",
    cadence: "daily",
    defaultOn: false,
    why:
      "The daily-movement layer that lifting three times a week leaves out. 100 dands and 200 baithaks is a real working target. Skip the thousand-rep classical volumes; that is junk fatigue for someone with a job.",
    source: "Traditional akhara ratio, two baithaks per dand",
  },
  {
    id: "rings",
    name: "Ring work",
    short: "Dips or push-ups on rings",
    group: "train",
    tier: "compounding",
    evidence: "supported",
    cadence: "daily",
    defaultOn: false,
    why:
      "Close to unbeatable for the shoulder girdle, scapular control and grip, and it transfers directly to wrestling. Ring dips also load the triceps in a stretched position.",
    source: "Calisthenics and gymnastic ring training",
  },
  {
    id: "zone2",
    name: "Zone 2",
    short: "30 minutes, conversational pace",
    group: "train",
    tier: "compounding",
    evidence: "established",
    cadence: "daily",
    defaultOn: false,
    why: "Cardio as support rather than as the fat-loss engine. Steps are the base layer; this is the top-up.",
    source: "Standard aerobic base training",
  },
  {
    id: "posture",
    name: "Posture reset",
    short: "Forward head and rounded shoulders, checked and corrected",
    group: "train",
    tier: "compounding",
    evidence: "supported",
    cadence: "daily",
    defaultOn: true,
    why:
      "Worth doing on its own terms. Desk posture is real, it affects how you carry yourself and how you breathe, and it costs nothing to fix. Note what it is not: there is no good evidence that correcting it remodels your facial bones.",
    source: "Posture and desk-work literature",
  },
  {
    id: "hang-stretch",
    name: "Hang and stretch",
    short: "Bar hang, cobra, bridge",
    group: "train",
    tier: "compounding",
    evidence: "supported",
    cadence: "daily",
    defaultOn: false,
    why:
      "Good for shoulder health, thoracic extension and grip. Worth keeping from the looksmaxxing stack for reasons that have nothing to do with your face.",
    source: "Patel stretching stack",
  },

  /* ----------------------------------------------------------------- skin */
  {
    id: "am-skin",
    name: "Morning routine",
    short: "Cleanse, moisturise, tinted mineral SPF with iron oxides",
    group: "skin",
    tier: "foundation",
    evidence: "established",
    cadence: "daily",
    defaultOn: true,
    why:
      "In Fitzpatrick IV to VI skin the enemy is post-inflammatory hyperpigmentation, the dark mark that outlives the spot, not wrinkles. Visible light drives it, not just UV, and iron oxide formulations significantly outperformed even a mineral SPF 50+ against visible-light pigmentation.",
    caution:
      "Look for at least two of the three iron oxide numbers, CI 77491 red, CI 77492 yellow, CI 77499 black, ideally alongside zinc oxide or titanium dioxide. A tint alone is cosmetic, not photoprotective.",
    source: "Taylor et al. 2023 JAAD Delphi consensus; visible-light photoprotection trials",
  },
  {
    id: "pm-skin",
    name: "Night routine",
    short: "Cleanse, retinoid, moisturise",
    group: "skin",
    tier: "foundation",
    evidence: "established",
    cadence: "daily",
    defaultOn: true,
    why:
      "Standard dermatology and it works. Adapalene 0.1 percent is over the counter and cheap. Start twice a week and build to nightly.",
    caution:
      "Apply acne treatment to the whole face, not just to spots. In deeper skin, subclinical inflammation can be invisible and still be driving pigment.",
    source: "Delphi consensus on PIH in skin of colour",
  },
  {
    id: "no-picking",
    name: "Nothing picked",
    short: "Hands off, all day",
    group: "skin",
    tier: "foundation",
    evidence: "established",
    cadence: "daily",
    defaultOn: true,
    why:
      "In your skin type every insult buys you about three months of dark mark. Avoiding excoriation is the first line of the dermatology consensus, ahead of any product.",
    source: "Delphi consensus on PIH in skin of colour",
  },
  {
    id: "actives",
    name: "Pigment actives",
    short: "Azelaic acid or niacinamide, where you have marks",
    group: "skin",
    tier: "compounding",
    evidence: "supported",
    cadence: "daily",
    defaultOn: false,
    why: "Azelaic 10 to 20 percent or niacinamide 5 percent. Both well tolerated on deeper skin.",
    source: "Dermatology practice in skin of colour",
  },
  {
    id: "post-train-shower",
    name: "Shower after training",
    short: "Straight after, not after dinner",
    group: "skin",
    tier: "compounding",
    evidence: "supported",
    cadence: "daily",
    defaultOn: true,
    why:
      "Truncal acne on the back and shoulders is a pigmentation factory in the same way facial acne is. Sitting in a wet training top is the avoidable half.",
    source: "Blueprint section 4.3",
  },
  {
    id: "vit-c",
    name: "Vitamin C serum",
    short: "Morning, before moisturiser",
    group: "skin",
    tier: "compounding",
    evidence: "supported",
    cadence: "daily",
    defaultOn: false,
    why: "Part of the standard stack. Reasonable antioxidant and pigment evidence, well below SPF and retinoid in effect size.",
    source: "Patel skincare stack; standard dermatology",
  },

  /* ----------------------------------------------------------------- face */
  {
    id: "thumbpulling",
    name: "Thumbpulling",
    short: "Thumbs against the palate, several minutes",
    group: "face",
    tier: "experimental",
    evidence: "unproven",
    cadence: "daily",
    defaultOn: false,
    claim:
      "Sustained thumb pressure on the mid-palatal suture expands the palate and brings the maxilla forward at any age, restoring the jawline. Presented with case studies at 28 and at 58.",
    counter:
      "The mid-palatal suture begins fusing in the mid-teens and is typically fully ossified by the mid-twenties. There are no peer-reviewed clinical trials showing facial bone remodelling from applied oral pressure in adults. The case studies are self-selected, self-reported, uncontrolled and photographed by the person selling the outcome, which is the weakest evidence tier there is.",
    caution: "Stop if you get jaw pain, headaches, tooth movement, or a bite that feels different.",
    source: "Oscar Patel, signature technique. Counter-evidence: orthodontic literature on suture fusion",
  },
  {
    id: "mewing",
    name: "Tongue posture",
    short: "Tongue up, lips sealed, teeth resting light",
    group: "face",
    tier: "experimental",
    evidence: "contested",
    cadence: "daily",
    defaultOn: false,
    claim: "Correct resting tongue posture makes the face grow forward and builds a real jawline at any age.",
    counter:
      "Split verdict. The lip-seal and nasal-breathing half is sound and worth keeping. The adult bone-remodelling half is the load-bearing claim of orthotropics and it does not survive the literature. Orthodontic associations warn that forcing bite or posture without supervision can worsen alignment.",
    source: "Orthotropics. Counter-evidence: absence of adult remodelling trials",
  },
  {
    id: "mastic-gum",
    name: "Hard gum",
    short: "Mastic or another hard gum, timed",
    group: "face",
    tier: "experimental",
    evidence: "contested",
    cadence: "daily",
    defaultOn: false,
    claim: "Chewing hard gum grows the jaw and widens the lower face.",
    counter:
      "Half true, and the half that is true is not the half being sold. It hypertrophies the masseter, which can slightly widen the lower face. It does not grow bone.",
    caution: "Overdoing this is a known route to TMJ pain. Cap the time and stop at the first sign of joint soreness.",
    source: "Masseter hypertrophy literature",
  },
  {
    id: "masseter",
    name: "Masseter exercises",
    short: "Resisted jaw work",
    group: "face",
    tier: "experimental",
    evidence: "unproven",
    cadence: "daily",
    defaultOn: false,
    claim: "Training the facial muscles remodels the bone underneath them.",
    counter:
      "Muscle responds to training, which is real. Adult facial bone responding to that muscle training in a visible way is the claim, and it is unsupported.",
    caution: "Same TMJ risk as hard gum.",
    source: "Patel practical stack",
  },
  {
    id: "fascia-release",
    name: "Facial fascia release",
    short: "The thumbpull and release routine",
    group: "face",
    tier: "experimental",
    evidence: "unproven",
    cadence: "daily",
    defaultOn: false,
    claim: "Tight fascia is the bottleneck holding your face back. Releasing it lets the structure move.",
    counter:
      "Fascia is real tissue. The idea that self-massage releases it and reshapes you is not established. The honest claim is that manual work feels good and reduces perceived tension.",
    source: "Patel and Jules Horn fascia content",
  },
  {
    id: "depuff",
    name: "De-puff routine",
    short: "Morning drainage and massage",
    group: "face",
    tier: "experimental",
    evidence: "contested",
    cadence: "daily",
    defaultOn: false,
    claim: "A morning massage routine drains the face and reveals the structure underneath.",
    counter:
      "De-puffing is real. The mechanism is sleep, alcohol, sodium and having been lying flat, not the massage. If your face is puffy, the fix is upstream in this app, on the sleep and food screens.",
    source: "Patel morning routine",
  },
  {
    id: "gait",
    name: "Gait and foot posture",
    short: "Feet forward, no duck walk",
    group: "face",
    tier: "experimental",
    evidence: "contested",
    cadence: "daily",
    defaultOn: false,
    claim: "Feet that point outwards roll inwards, and that collapse propagates up the chain and recesses the jaw.",
    counter:
      "Walking mechanics are worth attention for your knees, hips and back. The chain from foot position to facial structure is asserted, not demonstrated, and the celebrity examples used to argue it are picked after the fact.",
    source: "Patel posture chain",
  },

  /* ---------------------------------------------------------------- mouth */
  {
    id: "tongue-scrape",
    name: "Tongue scraping",
    short: "90 seconds, back to front",
    group: "mouth",
    tier: "compounding",
    evidence: "established",
    cadence: "daily",
    defaultOn: true,
    why:
      "The best-supported item in the whole traditional-routine category. Scraping cut volatile sulphur compounds, the actual cause of bad breath, by 75 percent, against 45 percent for brushing alone.",
    source: "Journal of Periodontology, tongue scraping and VSC",
  },
  {
    id: "brush-floss",
    name: "Brush and floss",
    short: "Twice and once",
    group: "mouth",
    tier: "compounding",
    evidence: "established",
    cadence: "daily",
    defaultOn: true,
    why:
      "Dentistry is the underrated half of the lower face. Alignment and colour genuinely change how the bottom third of your face reads, and nobody in the looksmaxxing space talks about it because you cannot sell it as a course.",
    source: "Standard oral health guidance",
  },
  {
    id: "oil-pulling",
    name: "Oil pulling",
    short: "Adjunct only, and do not swallow it",
    group: "mouth",
    tier: "experimental",
    evidence: "supported",
    cadence: "daily",
    defaultOn: false,
    claim: "Swilling oil draws toxins and transforms oral health.",
    counter:
      "There is real evidence for reduced oral bacterial load and better gum health. Reviews are clear it belongs alongside brushing and flossing, never instead of them. The detox framing has no basis.",
    source: "Oil pulling systematic reviews",
  },

  /* ---------------------------------------------------------------- groom */
  {
    id: "beard-line",
    name: "Beard line",
    short: "Maintain the shape you had set",
    group: "groom",
    tier: "compounding",
    evidence: "supported",
    cadence: "weekly",
    defaultOn: true,
    why:
      "Grooming is the highest-leverage twenty minutes a month in the whole document. Get the line shaped professionally once, then hold it.",
    caution: "You shave and you train, so watch for pseudofolliculitis. Single blade or electric on the neck.",
    source: "Blueprint section 7",
  },
  {
    id: "nails",
    name: "Nails",
    short: "Cut and clean",
    group: "groom",
    tier: "compounding",
    evidence: "supported",
    cadence: "weekly",
    defaultOn: true,
    why: "Nobody consciously notices good nails. Everybody notices bad ones.",
    source: "Blueprint section 7",
  },
  {
    id: "haircut",
    name: "Haircut",
    short: "Every 3 to 4 weeks, not 6 to 8",
    group: "groom",
    tier: "compounding",
    evidence: "supported",
    cadence: "monthly",
    defaultOn: true,
    why:
      "A cut looks best for about three weeks. Going every six means you spend half your life in the bad half of the cycle.",
    source: "Blueprint section 7",
  },
  {
    id: "brows",
    name: "Brows",
    short: "Tidied, not shaped",
    group: "groom",
    tier: "compounding",
    evidence: "supported",
    cadence: "monthly",
    defaultOn: false,
    why: "Strays and the middle. That is the whole job.",
    source: "Blueprint section 7",
  },

  /* ----------------------------------------------------------------- mind */
  {
    id: "daylight",
    name: "Daylight",
    short: "Outside early, eyes open",
    group: "mind",
    tier: "compounding",
    evidence: "supported",
    cadence: "daily",
    defaultOn: true,
    why: "Anchors the circadian rhythm that the fixed wake time is trying to hold, and in a UK winter it is also the only free vitamin D you will get.",
    source: "Circadian entrainment literature",
  },
  {
    id: "self-massage",
    name: "Self-massage",
    short: "Abhyanga, or just your training-sore parts",
    group: "mind",
    tier: "compounding",
    evidence: "supported",
    cadence: "daily",
    defaultOn: false,
    why:
      "Massage and bathing were built into akhara practice daily rather than treated as extras. One small study reported a 16 percent drop in subjective stress with measurable falls in heart rate and blood pressure. The honest claim is recovery feels better and you stay consistent. The skin benefit is emollient, not magic.",
    source: "2011 abhyanga study, small sample; traditional pehlwani practice",
  },
  {
    id: "cold-shower",
    name: "Cold shower",
    short: "Morning, not after lifting",
    group: "mind",
    tier: "experimental",
    evidence: "contested",
    cadence: "daily",
    defaultOn: false,
    claim: "Daily cold exposure improves skin, circulation and appearance.",
    counter:
      "Evidence for an appearance benefit is essentially nil. Evidence for mood and alertness is modest and real, which is a fine reason to do it.",
    caution:
      "Cold immersion straight after a hypertrophy session can blunt muscle adaptation. Do it in the morning, not after you lift.",
    source: "Cold exposure literature; post-exercise cooling and hypertrophy",
  },
];

/* ------------------------------------------------------------------ */

export const BY_ID = Object.fromEntries(HABITS.map((h) => [h.id, h]));

/** Resolve a habit's target for a given bodyweight. */
export function targetFor(habit, bodyweightKg) {
  const input = habit.input;
  if (!input) return null;
  if (typeof input.perKg === "number") return Math.round(input.perKg * bodyweightKg);
  return input.target;
}

/** A numeric habit counts as met once it clears its floor. */
export function meetsTarget(habit, value, bodyweightKg) {
  if (!habit.input) return Boolean(value);
  const target = targetFor(habit, bodyweightKg);
  if (typeof value !== "number" || Number.isNaN(value)) return false;
  return input_mode(habit) === "cap" ? value <= target : value >= target;
}

function input_mode(habit) {
  return habit.input?.mode ?? "floor";
}

export const DEFAULT_ACTIVE = HABITS.filter((h) => h.defaultOn).map((h) => h.id);

/**
 * The measurements. Not habits: these are the feedback loop, and they are the
 * only numbers in the app that can tell you whether any of the rest worked.
 */
export const MEASURES = [
  {
    id: "waist",
    name: "Waist at navel",
    unit: "cm",
    cadence: "monthly",
    step: 0.5,
    threshold: { over: 90, label: "At or above the action threshold for Asian men" },
    why:
      "A better dashboard than the scale, and for you specifically it is the better metric than BMI. South Asians carry more abdominal and ectopic fat at the same BMI, so you can look slim in a shirt and be metabolically in trouble. The WHO and IDF action threshold for Asian men is 90 cm.",
    source: "WHO/IDF waist thresholds; South Asian thin-fat phenotype literature",
  },
  {
    id: "weight",
    name: "Bodyweight",
    unit: "kg",
    cadence: "monthly",
    step: 0.1,
    why:
      "Useful as a trend, useless as a daily verdict. NICE sets the increased-risk BMI threshold at 23 and high-risk at 27.5 for South Asian and other Asian groups, not the usual 25 and 30.",
    source: "NICE NG246; UK cohort of 1.4 million on ethnicity-specific risk",
  },
  {
    id: "sleepavg",
    name: "Sleep average",
    unit: "h",
    cadence: "weekly",
    step: 0.1,
    derived: true,
    why: "Computed from your daily logs. The one number that moves your face fastest.",
    source: "Axelsson et al. 2010, BMJ",
  },
];

/**
 * Blood panel. One GP appointment, then annually. This is the metric set the
 * blueprint argues should be the real scoreboard, ahead of the mirror.
 */
export const BLOODS = [
  { id: "hba1c", name: "HbA1c", note: "Risk starts rising from about age 25 in South Asian men, not 40" },
  { id: "lipids", name: "Fasting lipids", note: "" },
  { id: "vitd", name: "Vitamin D (25-OH-D)", note: "92 percent of UK South Asians measured insufficient" },
  { id: "ferritin", name: "Ferritin and full blood count", note: "" },
  { id: "b12", name: "B12", note: "Relevant if your diet is vegetarian-heavy" },
  { id: "tsh", name: "TSH", note: "" },
  { id: "lft", name: "Liver function", note: "Fatty liver is the ectopic-fat canary" },
  { id: "lpa", name: "Lipoprotein(a)", note: "Once in a lifetime. Commonly raised in South Asian populations" },
];
