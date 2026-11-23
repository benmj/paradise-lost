#!/usr/bin/env python3
"""Build data/lexicon.json: Milton's own senses, for the dictionary card.

Sources, in order of priority:
  1. HAND below: words Milton uses in a sense that has shifted or that is Latinate, plus his
     coinages and proper names. Each is (word, Milton's sense, note, root).
  2. data/guide/book-NN.json glosses of a single word (kept with their book and line).

Run after editing HAND or a guide:  python3 scripts/lexicon.py
The server reads data/lexicon.json at start; /api/dict puts the entry first as "Milton's sense".
Output entry: {word, milton, note?, root?, src: 'hand'|'guide', book?, line?}
"""
import glob, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

HAND = [
 ("disobedience", "The act of Adam and Eve in eating the forbidden fruit; the poem's first word and its subject.", "Milton means the whole refusal of God's command, not only a single breach.", "Latin dis- + oboedire 'to obey'"),
 ("fruit", "Both the literal fruit of the forbidden tree and what comes of the act: its consequence.", "'Fruit' plays on both senses in 1.1–2.", "Latin fructus 'enjoyment, produce'"),
 ("amazement", "Bewilderment; being stunned or struck dumb with confusion.", "Much stronger than modern 'surprise'; it is the state of one lost in a maze.", "Middle English amasen, from Old English āmasian 'to stupefy'"),
 ("amaze", "To stupefy, bewilder, strike with confusion.", "", "Old English āmasian 'to stupefy'; later felt as 'a-maze'"),
 ("wanton", "Unrestrained, running riot; playful and sportive, sometimes lascivious.", "Eve's 'wanton ringlets' (4.306) are luxuriant and uncontrolled, not yet sinful.", "Middle English wan- 'un-' + towen 'trained'"),
 ("sad", "Grave, serious, sober; steadfast. Not necessarily sorrowful.", "'Sad cure' and 'sad civility' mean grave or earnest.", "Old English sæd 'sated', then 'steadfast'"),
 ("silly", "Simple, innocent, helpless; harmless.", "Still carries the older sense 'blessed, harmless'.", "Old English sǣlig 'happy, blessed'"),
 ("jealous", "Zealous, vigilant, watchful of one's own honour or rights; suspicious of rivals.", "God is 'jealous' in the Biblical sense of guarding what is his.", "Old French gelos, from Greek zēlos 'zeal'"),
 ("passion", "Any strong feeling or movement of the mind, also suffering.", "Passions are what the soul suffers, as opposed to what reason does.", "Latin passio 'suffering', from pati 'to suffer'"),
 ("conceit", "A conception or thought; an imagining.", "Not yet 'vanity'.", "Middle English conceiven, from Latin concipere 'to take in'"),
 ("ethereal", "Of the aether: the pure fifth element above air and fire, of which the heavens are made.", "", "Greek aithēr 'upper air, blaze'"),
 ("empyreal", "Of the Empyrean, the highest heaven, a region of pure fire and light.", "", "Greek empyros 'in fire'"),
 ("empyrean", "The highest heaven, the region of pure fire and light where God dwells.", "", "Greek empyros 'in fire'"),
 ("pandemonium", "Milton's coinage: the high capital of Hell, built by Mammon and Mulciber: 'the palace of all the demons'.", "First recorded here (1.756); the word later came to mean any uproar.", "Greek pan 'all' + daimōn 'demon, spirit'"),
 ("secure", "Free from care, over-confident, unwary. Not 'safe'.", "'Secure of' = careless about.", "Latin securus 'sine cura', without care"),
 ("admire", "To wonder at, be amazed by.", "Milton often means astonishment, not approval.", "Latin admirari 'to wonder at'"),
 ("virtue", "Power, efficacy, inherent strength; also moral excellence. As 'Virtues': an order of angels.", "", "Latin virtus 'manliness, strength'"),
 ("virtues", "Powers; also the Virtues, one of the orders of angels.", "", "Latin virtus 'strength'"),
 ("argument", "Subject matter, theme of a work; also a proof or evidence.", "Milton's 'adventurous song' has an 'argument' in the sense of subject.", "Latin argumentum 'proof, subject'"),
 ("prevent", "To go before, anticipate; to come first.", "'Prevenient grace' is grace that goes before. Not 'to stop'.", "Latin praevenire 'to come before'"),
 ("kind", "Nature, species, sort.", "'After his kind' is Biblical: according to its species.", "Old English gecynd 'nature'"),
 ("thrall", "Slave, captive, bondman.", "", "Old Norse þræll 'slave'"),
 ("adamantine", "Unbreakable, hard as adamant, the fabled hardest metal or stone.", "'Adamantine chains' (1.48).", "Greek adamas 'untamable'"),
 ("adamant", "A fabled unbreakable stone or metal.", "Not the diamond of later usage alone.", "Greek adamas 'untamable'"),
 ("obnoxious", "Exposed to harm, liable, subject to.", "Not 'offensive'.", "Latin obnoxius 'exposed to harm', from noxa 'injury'"),
 ("humor", "A bodily fluid or moisture (one of the four humours); temperament.", "", "Latin umor 'liquid'"),
 ("humour", "A bodily fluid or moisture (one of the four humours); temperament.", "", "Latin umor 'liquid'"),
 ("orb", "A sphere, circle or ring; a heavenly body or the sphere that carries it; a circular motion.", "", "Latin orbis 'circle, disc'"),
 ("essence", "Being, nature; spiritual substance.", "Angels are pure 'essence', not matter.", "Latin essentia, from esse 'to be'"),
 ("sphere", "One of the concentric transparent shells that carry the planets and stars in the old astronomy.", "", "Greek sphaira 'ball'"),
 ("apostate", "One who has turned from his allegiance, such as a rebel angel.", "", "Greek apostasia 'standing away, defection'"),
 ("mammon", "Wealth personified; the fallen angel who looked downward at the gold of Heaven's pavement.", "", "Aramaic māmōnā 'riches'"),
 ("belial", "Fallen angel of sloth and lewdness; his name means 'worthlessness'.", "", "Hebrew bĕliyyaʿal 'worthless'"),
 ("beelzebub", "Satan's second in command, 'lord of flies'; Satan's chief lieutenant.", "", "Hebrew baʿal zĕvūv 'lord of flies'"),
 ("moloch", "Fallen angel, the god of the Ammonites, worshipped with child sacrifice.", "The first of the rebels to speak in council (book 2).", "Hebrew mōlek 'king'"),
 ("mulciber", "The Roman name of Vulcan, the smith of the gods; here the architect of Pandemonium.", "", "Latin mulcere 'to soften' (metal)"),
 ("chaos", "The formless, unordered abyss before the Creation, and its personified ruler.", "Not 'disorder' alone: the raw matter between Hell and Heaven.", "Greek khaos 'gaping void'"),
 ("erebus", "The primeval darkness of the underworld.", "", "Greek erebos 'darkness'"),
 ("tartarus", "The deepest pit of the classical underworld, here a name for Hell.", "", "Greek Tartaros"),
 ("aught", "Anything.", "", "Old English āwiht 'any whit'"),
 ("naught", "Nothing; worthless.", "", "Old English nāwiht 'no whit'"),
 ("trepidation", "Trembling; in the old astronomy, the supposed wobble of the outermost spheres (3.483).", "", "Latin trepidatio 'agitation'"),
 ("prime", "First, earliest, original.", "'Prime' is also 'the first age of the world'.", "Latin primus 'first'"),
 ("ambrosial", "Divinely sweet or fragrant; belonging to the gods' food.", "", "Greek ambrosios 'immortal'"),
 ("ken", "Range of sight; the distance one can see.", "", "Old English cennan 'to make known'"),
 ("ruth", "Pity, compassion, sorrow for another.", "'Ruthless' is its negative that survived.", "Middle English ruthe, from Old Norse hryggð"),
 ("sovran", "Supreme, chief; Milton's spelling of 'sovereign'.", "He prefers the Italian-shaped sovran.", "Italian sovrano, Latin superanus"),
 ("sovereign", "Supreme, chief, ruling.", "Milton writes it 'sovran'.", "Latin superanus 'above'"),
 ("aspect", "Look, appearance, a gaze; stressed on the second syllable (aspéct).", "In astrology, a position of planets in relation to each other.", "Latin aspectus 'a looking at'"),
 ("prone", "Bent forward or downward; leaning.", "", "Latin pronus 'leaning forward'"),
 ("grisly", "Horrible, dreadful, causing horror. Not 'grey'.", "", "Old English grislic 'horrible'"),
 ("uncouth", "Unknown, strange, unfamiliar.", "Not yet 'rude'.", "Old English uncūþ 'unknown'"),
 ("wonted", "Accustomed, usual.", "", "Old English gewunod 'accustomed'"),
 ("horrid", "Bristling, rough; also dreadful.", "The older sense is physical: standing on end, like hair or spears.", "Latin horridus 'bristling'"),
 ("horrent", "Bristling.", "", "Latin horrere 'to bristle'"),
 ("gloze", "To flatter, to speak smoothly in order to deceive.", "", "Greek glōssa 'tongue' → 'to explain away'"),
 ("glozing", "Flattering; deceiving with fair words.", "", "Greek glōssa 'tongue'"),
 ("sublime", "Lifted up, high, raised aloft.", "Used of physical height, not 'noble' alone.", "Latin sublimis 'uplifted'"),
 ("inordinate", "Disordered, immoderate, out of due rank.", "", "Latin inordinatus 'not set in order'"),
 ("fatal", "Ordained by fate; deadly.", "", "Latin fatalis, from fatum 'fate'"),
 ("fond", "Foolish.", "'Fondly' is foolishly.", "Middle English fonned 'made a fool of'"),
 ("fondly", "Foolishly.", "", "Middle English fonned 'foolish'"),
 ("artillery", "Weapons of any kind that throw missiles; in book 6 the cannon the rebels invent.", "", "Old French artillier 'to equip'"),
 ("engine", "An ingenious contrivance; a machine of war, esp. a cannon.", "", "Latin ingenium 'native talent, device'"),
 ("engines", "Ingenious contrivances; machines of war, esp. cannon (6.484).", "", "Latin ingenium"),
 ("ordnance", "Mounted guns, cannon.", "", "From ordinance 'arrangement'"),
 ("vaunt", "To boast.", "", "Old French vanter, Latin vanitare"),
 ("adverse", "Opposed, hostile, facing.", "", "Latin adversus 'turned against'"),
 ("remorse", "Pity, compassion; also pangs of conscience.", "Latin 'biting back': the sense of pity is the older one.", "Latin remorsus, from mordēre 'to bite'"),
 ("fell", "Cruel, fierce, deadly.", "", "Old French fel 'cruel'"),
 ("wight", "A creature, a person.", "", "Old English wiht 'creature'"),
 ("wrought", "Worked, made, brought about.", "", "Old English worhte, past of wyrcan 'to work'"),
 ("confound", "To ruin, overthrow, bewilder, throw into disorder.", "", "Latin confundere 'to pour together'"),
 ("aerial", "Of the air; airy.", "", "Latin aerius"),
 ("mansion", "A dwelling-place, abode.", "Heavenly 'mansions' are places to dwell, not houses.", "Latin mansio 'a staying'"),
 ("stygian", "Of the river Styx; hellish.", "", "Greek Stygios, from Styx 'the hateful'"),
 ("palpable", "That can be touched or felt.", "'Palpable obscure' (2.406) is darkness that can be felt.", "Latin palpabilis"),
 ("obscure", "Dark, hidden, not seen.", "", "Latin obscurus 'covered over'"),
 ("visage", "Face.", "", "Old French vis 'face'"),
 ("front", "Forehead, face.", "", "Latin frons 'forehead'"),
 ("tract", "A stretch or expanse of space or time.", "", "Latin tractus 'a drawing out'"),
 ("flood", "The sea, a river, any great body of water.", "", "Old English flōd"),
 ("welkin", "The sky.", "", "Old English wolcen 'cloud'"),
 ("lucid", "Bright, shining, transparent.", "", "Latin lucidus, from lux 'light'"),
 ("umbrageous", "Shady, casting shade.", "", "Latin umbra 'shade'"),
 ("disastrous", "Ill-starred, unlucky, boding disaster.", "Literally 'with a bad star'.", "Italian disastro, Greek astron 'star'"),
 ("influence", "The supposed flow of power from the stars upon human affairs.", "An astrological term.", "Latin influere 'to flow in'"),
 ("consort", "Company, partnership, fellowship; a partner.", "", "Latin consors 'sharing a lot'"),
 ("converse", "Company, social intercourse; to keep company.", "", "Latin conversari 'to associate with'"),
 ("conversation", "Behaviour, manner of living.", "'Conversation' is how one conducts oneself, not only talk.", "Latin conversatio 'dwelling with'"),
 ("pregnant", "Teeming with potential; full of meaning; cogent.", "", "Latin praegnans 'with child'"),
 ("gender", "To beget, produce.", "", "Latin generare 'to beget'"),
 ("brute", "An animal without reason; irrational.", "", "Latin brutus 'dull, irrational'"),
 ("sensible", "Perceptible by the senses; sensitive.", "", "Latin sensibilis"),
 ("reason", "The faculty of thought: either 'discursive' (step by step, human) or 'intuitive' (instant, angelic).", "Raphael states the distinction in 5.486–90.", "Latin ratio"),
 ("fantasy", "The imagination, the faculty that forms images.", "In Eve's dream, the 'fancy' is its working part.", "Greek phantasia 'appearance'"),
 ("fancy", "The imagination; the faculty that makes mental images.", "", "Greek phantasia"),
 ("sciential", "Of knowledge; knowing.", "", "Latin scientia 'knowledge'"),
 ("spirit", "Any incorporeal being; breath, the vital power.", "", "Latin spiritus 'breath'"),
 ("spirits", "Immaterial beings (angels or devils); also the vital forces.", "", "Latin spiritus 'breath'"),
 ("vital", "Life-giving; of life.", "", "Latin vitalis"),
 ("genial", "Of marriage or generation; nuptial.", "", "Latin genialis 'of the genius, of birth'"),
 ("enow", "Enough.", "", "Old English genōg; archaic plural of 'enough'"),
 ("nathless", "Nevertheless.", "", "Old English nā þȳ lǣs 'not the less'"),
 ("bower", "A leafy shelter; a private inner room.", "Adam and Eve's 'nuptial bower' is a shaded retreat.", "Old English būr 'dwelling'"),
 ("chivalry", "Knighthood; a body of knights.", "", "Old French chevalerie"),
 ("paynim", "A pagan, a heathen.", "", "Old French paienime 'paganism'"),
 ("gorgeous", "Splendidly adorned, richly dressed.", "", "Old French gorgias"),
 ("quintessence", "The fifth, purest element above earth, water, air and fire.", "", "Latin quinta essentia 'fifth essence'"),
 ("cherub", "An angel of the second order; plural cherubim.", "", "Hebrew kĕrūb"),
 ("cherubim", "Angels of the second order, set to guard Eden.", "", "Hebrew kĕrūbīm"),
 ("seraph", "An angel of the highest order, 'burning one'.", "", "Hebrew śārāf 'burning'"),
 ("seraphim", "The highest order of angels, 'burning ones'.", "", "Hebrew śĕrāfīm"),
 ("hierarchy", "A rank or order of angels.", "", "Greek hieros 'sacred' + arkhē 'rule'"),
 ("dominations", "The Dominions, one of the orders of angels.", "", "Latin dominatio 'rule'"),
 ("princedoms", "The Principalities, one of the orders of angels.", "", "Middle English prince + -dom"),
 ("fiend", "An enemy, an adversary; a devil.", "", "Old English fēond 'enemy'"),
 ("satan", "The Adversary.", "Milton's Satan is first named 'Satan' in 1.82; the word is Hebrew for 'adversary'.", "Hebrew śāṭān 'adversary'"),
 ("lucifer", "Light-bringer, the morning star; Satan's name before the Fall.", "", "Latin lux 'light' + ferre 'to bear'"),
 ("messiah", "The Anointed One.", "", "Hebrew māšīaḥ 'anointed'"),
 ("paradise", "A walled garden of delight.", "", "Old Persian pairidaēza 'walled enclosure'"),
 ("eden", "The garden of God.", "The Hebrew name means 'delight'.", "Hebrew ʿēden 'delight'"),
 ("abyss", "The bottomless depth.", "", "Greek abyssos 'bottomless'"),
 ("limbo", "A region on the edge of Hell for the vain; 'the Paradise of Fools'.", "", "Latin limbus 'edge'"),
 ("cataract", "A waterfall; the floodgates of heaven.", "", "Greek kataraktēs 'downrush'"),
 ("infernal", "Of the lower world; of Hell.", "", "Latin infernus 'lower'"),
 ("temper", "To mix in due proportion; to bring to a right state.", "", "Latin temperare 'to mix'"),
 ("urania", "The Heavenly Muse; Greek 'heavenly'.", "The muse Milton invokes at 7.1, a Christian Urania, not the classical one.", "Greek ourania 'heavenly'"),
 ("heavenly", "Of or from Heaven; divine.", "Milton prints 'Heav'nly' to be read as two syllables.", "Old English heofon"),
 ("reluctant", "Struggling against, resisting.", "", "Latin reluctari 'to struggle against'"),
 ("frequent", "Crowded, thronged.", "", "Latin frequens 'crowded'"),
 ("success", "Outcome, result (good or bad).", "", "Latin successus 'a coming up, outcome'"),
 ("amerce", "To punish with a fine; deprive of.", "", "Old French a merci 'at mercy'"),
 ("involve", "To wrap up, surround, wind around.", "", "Latin involvere 'to roll in'"),
 ("exercise", "To train, torment, or put to trial.", "", "Latin exercere 'to drive on, keep at work'"),
 ("emulation", "Rivalry, jealous contest for superiority.", "", "Latin aemulatio"),
 ("potent", "Powerful.", "", "Latin potens 'being able'"),
 ("prodigious", "Portentous, ominous, monstrous.", "", "Latin prodigiosus 'marvellous, ominous'"),
 ("portentous", "Ominous, foreboding.", "", "Latin portentum 'sign, omen'"),
 ("remove", "A change of place; to shift or withdraw.", "", "Latin removere"),
 ("tempt", "To try, test, put to the proof.", "The older sense: to test.", "Latin temptare 'to test'"),
 ("trophy", "A monument or token of victory.", "", "Greek tropaion 'monument of a rout'"),
 ("irreconcilable", "Not to be made friends again.", "", "Latin reconciliare"),
 ("sovereignty", "Supreme power.", "", "Latin superanus"),
 ("alienate", "To estrange, make foreign.", "", "Latin alienare 'to make another's'"),
 ("pomp", "A solemn procession; splendid display.", "", "Greek pompē 'procession'"),
 ("inhabitant", "A dweller.", "", "Latin inhabitare"),
 ("orient", "Eastern; rising, shining like the dawn.", "'Orient pearl' is lustrous.", "Latin oriens 'rising'"),
 ("glister", "To glitter, shine.", "", "Middle English glisteren"),
 ("sedition", "Open rebellion, revolt.", "", "Latin seditio 'a going apart'"),
 ("wanton", "Unrestrained, running riot; playful and sportive, sometimes lascivious.", "Eve's 'wanton ringlets' (4.306) are luxuriant and uncontrolled, not yet sinful.", "Middle English wan- 'un-' + towen 'trained'"),
]

def main():
    out = {}
    for w, m, n, r in HAND:
        e = {"word": w, "milton": m, "src": "hand"}
        if n: e["note"] = n
        if r: e["root"] = r
        out[w.lower()] = e
    for f in sorted(glob.glob(os.path.join(ROOT, "data", "guide", "book-*.json"))):
        g = json.load(open(f, encoding="utf-8"))
        n = g.get("n") or int(re.search(r"book-(\d+)", f).group(1))
        for x in g["glosses"]:
            w = x["word"].strip()
            if " " in w or "-" in w: continue
            k = w.lower().replace("’", "'")
            if k in out: continue
            note = x["note"].strip()
            out[k] = {"word": w, "milton": note, "src": "guide", "book": n, "line": x["line"]}
    items = sorted(out.values(), key=lambda e: e["word"].lower())
    with open(os.path.join(ROOT, "data", "lexicon.json"), "w", encoding="utf-8") as fh:
        json.dump(items, fh, ensure_ascii=False, indent=0)
        fh.write("\n")
    print(f"lexicon.json: {len(items)} entries ({sum(e['src']=='hand' for e in items)} hand, {sum(e['src']=='guide' for e in items)} from guides)")

if __name__ == "__main__":
    main()
