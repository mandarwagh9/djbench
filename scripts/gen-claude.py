# Claude Opus 5's answers to the identical prompt in scripts/prompt.mjs.
# Authored directly by the model running this session: same brief, same rules, no extra tools.
import json, io, os, datetime

STAMP = datetime.datetime.now(datetime.timezone.utc).isoformat()
DJ = "claude-opus-5"

SETS = {
"warehouse-3am": {
 "read": "They are bright-fatigued, not tired; I hold the tempo and take away the top end until the low mids do the work.",
 "tracks": [
  ("Objekt","Ganzfeld",2014,128,"Kills the brightness in one bar without dropping tempo","Let its texture rot underneath the next kick"),
  ("Donato Dozzy","Parola",2011,126,"Pure hypnosis; the floor stops watching and starts sinking","Ride the loop, swap kicks on the bar"),
  ("Ben Klock","Subzero",2009,128,"Reintroduces weight from below, not brightness from above","Long blend, hold both hats for sixteen"),
  ("Function","Voiceprint",2013,129,"Adds a human ghost so the depth stops feeling clinical","Filter its pads up as the next intro lands"),
  ("Skudge","Phantom",2010,127,"Dub-techno swing loosens hips that had locked rigid","Cut the low, let reverb carry the gap"),
  ("Rrose","Waterfall",2012,130,"Ends deeper and harder. Going down was going forward","Hand over at 130 with all top end still stripped")]},

"wedding-1015": {
 "read": "The floor is half full because no generation wants to commit first; I play one record all three already love so they arrive together.",
 "tracks": [
  ("Earth, Wind & Fire","September",1978,126,"The single record no generation in this room refuses","Straight cut on the horn stab, no gap"),
  ("Stevie Wonder","Signed, Sealed, Delivered I'm Yours",1970,108,"Pulls the oldest guests in while the young stay moving","Ride the outro clap into the next intro"),
  ("ABBA","Dancing Queen",1976,101,"The grandmothers now own the floor and everyone allows it","Let the piano ring, drop straight in"),
  ("Whitney Houston","I Wanna Dance with Somebody",1987,119,"Hands the room back to the middle generation without ejecting anyone","Cut on the last chorus, no long tail"),
  ("Michael Jackson","Wanna Be Startin' Somethin'",1982,122,"Raises tempo where nobody notices they are working harder","Run the chant under the next four bars"),
  ("Outkast","Hey Ya!",2003,160,"Ends on the groomsmen without ever having lost the grandmother","Leave them shouting; house lights, not another record")]},

"rooftop-golden": {
 "read": "Nobody should be dancing yet; I am building a room people refuse to leave at nine, not a floor that peaks at half seven.",
 "tracks": [
  ("Khruangbin","White Gloves",2015,96,"Warm, wordless, asks nothing of anyone still finding a drink","Let the guitar hang, fade under strings"),
  ("Sade","Cherish the Day",1992,100,"First voice of the night; conversation gets quieter on its own","Blend on the pad, no percussive landmark"),
  ("Nightmares on Wax","Les Nuits",1999,92,"Introduces a pulse the room can ignore or accept","Loop the break, raise the low end slowly"),
  ("Fela Kuti","Water No Get Enemy",1975,108,"Live horns as the sun actually goes; the room looks up","Long ride on the groove, no rush"),
  ("Bonobo","Kiara",2010,110,"First record that could be danced to, offered not insisted","Filter sweep into the piano intro"),
  ("St Germain","Rose Rouge",2000,120,"The night formally begins; two people start and it is enough","Hand to peak-time DJ mid-loop, floor already warm")]},

"closing-540": {
 "read": "Forty people chose to still be here; I owe them honesty, not another peak. Records that say goodbye out loud.",
 "tracks": [
  ("Moderat","A New Error",2009,120,"Signals the descent without announcing that it is over","Let the arp thin out to nothing"),
  ("Kiasmos","Blurred",2014,118,"Strings arrive; the room quietly understands what this is","Hold the piano over the next intro"),
  ("Four Tet","Angel Echoes",2010,112,"A human voice, chopped. The first real emotion of the hour","Fade in on the vocal loop, no beat"),
  ("Burial","Archangel",2007,138,"The lights are already up; this is the sound of that","Drop the drums, keep the vocal in reverb"),
  ("Jon Hopkins","Immunity",2013,100,"Piano and breath. Nobody is dancing and nobody minds","Let it end fully; give the room two seconds of silence"),
  ("Brian Eno","An Ending (Ascent)",1983,60,"Not a track, a door held open. They walk out through it","No transition. House lights.")]},

"mainstage-peak": {
 "read": "Legibility is the entire job: every record must be recognised in four bars by someone who does not like dance music.",
 "tracks": [
  ("Daft Punk","One More Time",2000,123,"Fifteen thousand people know bar one; nobody is excluded","Ride the horns, slam the next kick on the drop"),
  ("Avicii","Levels",2011,126,"Phones go up on the Etta sample, exactly as intended","Cut to the next intro on the last bar of the build"),
  ("Swedish House Mafia","Don't You Worry Child",2012,129,"Buys a singalong, which is the only rest a peak set gets","Hold the vocal a cappella over the next four bars"),
  ("Zombie Nation","Kernkraft 400",1999,138,"Wordless, tempo jumps twelve BPM and nobody objects","Straight cut, no blend, let the gap land"),
  ("Darude","Sandstorm",1999,136,"The most legible record ever made from 200 metres back","Loop the riser, hold it four bars too long"),
  ("The Prodigy","Firestarter",1996,140,"Ends hardest, on a guitar, so even the sceptics get it","Kill it dead on the last stab. CO2. Done.")]},

"basement-1am": {
 "read": "One clipping speaker and no monitors: I need records that survive distortion and get shouted rather than danced to.",
 "tracks": [
  ("Sister Nancy","Bam Bam",1982,96,"Establishes immediately that tonight is not cheap nostalgia","Let the dub delay wash into the next intro"),
  ("Outkast","Ms. Jackson",2000,95,"Everyone in this basement knows every word of verse one","Ride the outro, drop new bass under it"),
  ("Gorillaz","Feel Good Inc.",2005,138,"The bassline is the only thing this speaker reproduces well","Cut on the laugh, straight into the synth"),
  ("MGMT","Kids",2007,124,"Somebody is now standing on the sofa; that is correct","Hold the arpeggio, bring the next kick underneath"),
  ("LCD Soundsystem","Dance Yrself Clean",2010,115,"The quiet intro makes 45 people lean in, then detonates","Let the drop run full; do not touch anything"),
  ("Robyn","Dancing On My Own",2010,117,"Ends on the only record everyone here will scream","No mix out. Let it finish. Somebody will cry.")]},
}

os.makedirs("data/raw", exist_ok=True)
for brief_id, payload in SETS.items():
    tracks = [{"artist": a, "title": t, "year": y, "bpm": b, "why": w, "transition": tr}
              for (a, t, y, b, w, tr) in payload["tracks"]]
    assert len(tracks) == 6, brief_id
    assert len({t["artist"] for t in tracks}) == 6, f"duplicate artist in {brief_id}"
    doc = {"djId": DJ, "briefId": brief_id, "model": "claude-opus-5",
           "generatedAt": STAMP, "read": payload["read"], "tracks": tracks}
    p = f"data/raw/{DJ}__{brief_id}.json"
    io.open(p, "w", encoding="utf8").write(json.dumps(doc, indent=2, ensure_ascii=False))
    print("wrote", p)
print("ok")
