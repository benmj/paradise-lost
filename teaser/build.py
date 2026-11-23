import os, subprocess, json
S=os.environ['S']; W=S+'/w'; V=S+'/v5'; ART=os.path.expanduser('~/code/paradise-lost/art/web')
def sh(c):
    r=subprocess.run(c,shell=True,capture_output=True,text=True)
    if r.returncode: print(r.stderr[-1500:]); raise SystemExit(1)
    return r.stdout
def dims(n):
    f=sorted(os.listdir(f'{W}/{n}'))[0]; o=sh(f"ffprobe -v error -show_entries stream=width,height -of csv=p=0 {W}/{n}/{f}").strip().split(','); return int(o[0]),int(o[1])
send=json.load(open(W+'/chat/marks.json'))['marks']['send']
# name, src, t, s, badge, act, [(ss,to,speed)], total
spec=[
 ('phone','phone','On your phone','Scroll the poem','Phone · 390 × 844','Scroll',[(0.0,99,1.0)],3.4),
 ('tablet','tablet','On a tablet','Choose the layout that suits you','Tablet · 820 × 1180','Page',[(0.3,99,1.0)],5.2),
 ('desktop','desktop','On a desktop','Two pages, with a spine','Desktop · 1280 × 800','Two pages',[(0.3,99,1.0)],4.2),
 ('theme','theme','Your view, your way','Convenient, customizable view options','Text size · Theme · Layout',None,[(0.0,99,1.0)],6.4),
 ('gloss','gloss','Tap any word','Glosses and notes, in the line','Plus notes on famous passages',None,[(0.1,99,1.0)],3.0),
 ('plates','plates','Fifty Doré plates','Set at the lines they illustrate','Tap a plate to enlarge',None,[(0.1,99,1.0)],2.8),
 ('chat','chat','Ask the Reader','A tutor for the passage you’re on','Optional · Bring your own key',None,[(0.9,send+0.9,1.3),(send+5.5,send+11.5,3.0)],5.0),
]
cfg=[]
for name,src,t,s,badge,act,segs,total in spec:
    sw,sh_=dims(src); sc=min(880/sw,820/sh_); w=int(sw*sc)//2*2; h=int(sh_*sc)//2*2; x=(1080-w)//2; y=330
    cfg.append(dict(name=name,x=x,y=y,w=w,h=h,t=t,s=s,badge=badge,act=act))
json.dump(cfg,open(V+'/cfg.json','w')); sh(f"node {V}/assets.mjs")
for (name,src,t,s,badge,act,segs,total),c in zip(spec,cfg):
    ins=''.join(f"-f concat -safe 0 -i {W}/{src}/list.txt " for _ in segs)
    fc=''
    for i,(ss,to,sp) in enumerate(segs):
        fc+=f"[{i}:v]fps=30,trim=start={ss}:end={to},setpts=(PTS-STARTPTS)/{sp},scale={c['w']}:{c['h']}:flags=lanczos[s{i}];"
    n=len(segs)
    fc+=''.join(f'[s{i}]' for i in range(n))+f"concat=n={n}:v=1:a=0,tpad=stop_mode=clone:stop_duration=8,trim=duration={total},setpts=PTS-STARTPTS,format=rgba[scr];"
    fc+=f"[{n}:v]format=gray[m];[scr][m]alphamerge[rs];[{n+1}:v][rs]overlay={c['x']}:{c['y']}[bgv];[{n+2}:v]format=rgba,fade=in:st=0.3:d=0.7:alpha=1[c];[bgv][c]overlay,format=yuv420p[o]"
    sh(f"ffmpeg -v error -y {ins} -i {V}/mask_{name}.png -loop 1 -i {V}/bg_{name}.png -loop 1 -i {V}/cap_{name}.png -filter_complex \"{fc}\" -map '[o]' -t {total} -r 30 -c:v libx264 -crf 16 -preset fast {V}/c_{name}.mp4")
    print('clip',name)
# intro: slow plate
sh(f"""ffmpeg -v error -y -loop 1 -t 4.2 -i {ART}/01.jpg -loop 1 -t 4.2 -i {V}/i1.png -loop 1 -t 4.2 -i {V}/i2.png -filter_complex "[0:v]scale=1296:1620:flags=lanczos,fps=30,crop=1080:1350:x='(iw-1080)/2':y='(ih-1350)/2-24*t',eq=contrast=1.1:brightness=-0.1,vignette=PI/4,setsar=1,format=rgba[b];[1:v]format=rgba,fade=in:st=0.6:d=1.0:alpha=1[a];[2:v]format=rgba,fade=in:st=1.9:d=1.0:alpha=1[c];[b][a]overlay[x];[x][c]overlay,format=yuv420p[o]" -map '[o]' -t 4.2 -r 30 -c:v libx264 -crf 16 -preset fast {V}/c_intro.mp4""")
sh(f"""ffmpeg -v error -y -loop 1 -t 3.6 -i {ART}/01.jpg -loop 1 -t 3.6 -i {V}/end.png -filter_complex "[0:v]scale=1188:1485:flags=lanczos,fps=30,crop=1080:1350:x=54:y='67-10*t',eq=brightness=-0.4:contrast=1.1,vignette=PI/3,setsar=1,format=rgba[b];[1:v]format=rgba,fade=in:st=0.3:d=0.8:alpha=1[e];[b][e]overlay,format=yuv420p[o]" -map '[o]' -t 3.6 -r 30 -c:v libx264 -crf 16 -preset fast {V}/c_end.mp4""")
order=['intro']+[s[0] for s in spec]+['end']
T=0.6
durs=[float(sh(f"ffprobe -v error -show_entries format=duration -of csv=p=0 {V}/c_{n}.mp4")) for n in order]
ins=''.join(f"-i {V}/c_{n}.mp4 " for n in order)
fc=''; cum=durs[0]; last='[0:v]'
for k in range(1,len(order)):
    off=cum-T; tr='fadeblack' if k==len(order)-1 else 'fade'
    fc+=f"{last}[{k}:v]xfade=transition={tr}:duration={T}:offset={off:.3f}[x{k}];"; last=f'[x{k}]'; cum=off+durs[k]
fc=fc.rstrip(';'); total=cum
sh(f"ffmpeg -v error -y {ins} -filter_complex \"{fc}\" -map '{last}' -c:v libx264 -crf 16 -preset fast -pix_fmt yuv420p {V}/silent.mp4")
print('total',round(total,1))
# music: Ben's pick is Brahms, Intermezzo Op. 118 No. 2 (public domain, Musopen via Wikimedia Commons). Never the synthesized score.
MUSIC = os.environ.get("TEASER_MUSIC", S + "/cl/c4.ogg")
sh(f"""ffmpeg -v error -y -i {V}/silent.mp4 -i {MUSIC} -filter_complex "[1:a]atrim=0:{total:.2f},asetpts=PTS-STARTPTS,afade=in:d=1.5,afade=out:st={total-3.5:.2f}:d=3.5,loudnorm=I=-18:TP=-2[a]" -map 0:v -map '[a]' -c:v copy -c:a aac -b:a 160k -movflags +faststart -t {total:.2f} {V}/paradise-teaser-v10.mp4""")
