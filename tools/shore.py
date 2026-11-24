"""Additional hand-pixelled scenery and the Super Hornet's rear cockpit view."""
from pathlib import Path
from PIL import Image, ImageDraw
import random
from art import cloud
OUT=Path(__file__).resolve().parents[1]/'dist'/'art'
clouds=Image.new('RGBA',(256,4*72))
for i in range(4):
    clouds.paste(cloud(256,72,'bank' if i%2 else 'high',842+i),(0,72*i))
clouds.save(OUT/'weather.png',optimize=True)

rnd=random.Random(160)
im=Image.new('RGBA',(900,179))
d=ImageDraw.Draw(im)
def polygon(points,color):d.polygon(points,fill='#'+color)
def line(points,color,w=1):d.line(points,fill='#'+color,width=w)
def mirror(points):return [(899-x,y) for x,y in points]
def pair(points,c):polygon(points,c);polygon(mirror(points),c)
def rims(points,c,n):line(points,c,n);line(mirror(points),c,n)
# Looking over the shoulder, the twin fins frame the tail deck and its moving shadows.
pair([(316,166),(297,107),(232,38),(240,29),(296,45),(360,136),(371,167)],'374553')
pair([(305,142),(298,104),(237,41),(241,33),(293,47),(350,136)],'817e79')
pair([(306,131),(295,104),(245,48),(278,53),(327,111),(341,140)],'a79f8b')
pair([(234,38),(240,29),(296,45),(300,51),(273,45)],'c7865c')
pair([(267,66),(284,72),(317,112),(307,110)],'525c62')
rims([(236,38),(240,31),(295,46),(355,138)],'c5ae8e',2)
pair([(13,143),(114,124),(253,111),(326,109),(391,135),(390,178),(45,178)],'525d64')
pair([(13,141),(115,123),(253,109),(326,109),(299,116),(125,133)],'b1aaa0')
pair([(68,147),(144,128),(253,118),(285,118),(244,126),(105,148)],'81898b')
rims([(36,152),(136,132),(287,117)],'434d55',1)
pair([(107,148),(147,138),(172,136),(123,149)],'c5a078')
pair([(284,135),(353,114),(384,123),(402,150),(390,177),(258,177)],'454d51')
rims([(284,137),(354,116),(383,124)],'9b9c90',2)
for j in range(8):
    x=300+j*8;rims([(x,145-j*1.4),(x+29,135-j*.65)],'222f37',2)
polygon([(322,178),(352,124),(384,101),(420,95),(480,95),(516,101),(548,124),(578,178)],'394247')
line([(323,178),(354,124),(384,102),(424,97),(480,97),(515,102),(547,125),(577,178)],'92968b',2)
# Prominent seat headrest with leather panels, seams, webbing and yellow grab loops.
polygon([(382,176),(384,123),(395,112),(402,82),(410,74),(488,74),(498,84),(506,113),(517,123),(519,178)],'171e23')
polygon([(401,111),(404,85),(412,78),(487,78),(495,85),(499,112),(490,119),(412,119)],'393d3b')
polygon([(409,101),(412,83),(423,79),(480,80),(489,85),(493,100)],'4a4b43')
line([(411,108),(413,87),(421,83),(482,83),(488,87),(491,108)],'747365',1)
polygon([(393,178),(397,129),(409,119),(489,119),(502,130),(507,178)],'494c44')
for j in range(5):
    y=131+j*8
    polygon([(403,y),(417,y-3),(483,y-3),(496,y),(496,y+3),(404,y+3)],'3b403c')
    line([(407,y),(420,y-2),(480,y-2),(493,y)],'68695c')
for side in [0,1]:
    def xy(pts):return mirror(pts) if side else pts
    polygon(xy([(398,118),(406,116),(418,133),(426,176),(415,179),(408,139)]),'7d7d65')
    line(xy([(399,120),(409,139),(417,176)]),'a2a087',1)
    handle=xy([(405,81),(401,75),(401,69),(406,66),(412,67),(416,75)])
    line(handle,'192229',5);line(handle,'cba466',3)
    for x,y in handle[1:-1]:d.point((x,y),fill='#494c41')
im.save(OUT/'aft.png',optimize=True)
# Each 64 × 80 cell is anchored at the lower centre.
atlas=Image.new('RGBA',(64*5,80))
for i in range(5):
    sprite=Image.new('RGBA',(64,80));g=ImageDraw.Draw(sprite)
    if i==0:
        g.polygon([(7,78),(12,70),(23,66),(44,68),(55,77)],fill='#786e68')
        g.polygon([(18,70),(24,44),(29,22),(37,22),(40,44),(46,70)],fill='#eee0c1')
        g.polygon([(33,22),(37,22),(46,70),(36,70)],fill='#a79d92')
        for y,lo,hi in [(36,26,39),(53,22,42)]:
            g.polygon([(lo,y),(hi,y),(hi+1,y+7),(lo-1,y+7)],fill='#b05b4c')
            g.line([(lo+2,y+1),(32,y+1)],fill='#db8862',width=2)
        g.rectangle((19,21,45,24),fill='#414954')
        g.rectangle((24,13,40,20),fill='#705959')
        g.rectangle((27,14,37,19),fill='#fff0a7')
        g.rectangle((31,13,32,20),fill='#555857')
        g.polygon([(20,13),(32,6),(44,13)],fill='#9d6257')
        g.line([(32,7),(32,2)],fill='#626263')
        g.rectangle((26,62,30,70),fill='#625b56')
    elif i==1:
        g.polygon([(2,66),(58,65),(52,73),(40,78),(13,75),(6,71)],fill='#3f5260')
        g.line([(3,66),(56,65)],fill='#e6bd91',width=2)
        g.rectangle((16,58,44,64),fill='#b77953');g.rectangle((26,49,41,59),fill='#e7c89a')
        g.rectangle((28,51,38,54),fill='#466573');g.rectangle((25,47,42,49),fill='#876852')
        g.line([(21,63),(21,37),(33,43)],fill='#8b7e6d',width=2)
        g.line([(21,40),(8,63)],fill='#9d9982')
        g.rectangle((44,59,48,64),fill='#5b6a66')
    else:
        treeheight=[52,44,37][i-2];x0=32
        g.rectangle((30,66,34,79),fill='#665d51')
        for k in range(5):
            y=79-treeheight+k*6;extent=int(4+k*3.0)
            g.polygon([(x0,y-4),(x0-extent,y+11),(x0-extent//2,y+10),(x0-extent-1,y+15),
                       (x0+extent,y+14),(x0+extent//2,y+9),(x0+extent,y+10)],fill=['#39514d','#4b5b50','#4c5a50'][i-2])
            g.polygon([(x0,y-2),(x0+1,y+8),(x0+extent,y+13),(x0+extent//2,y+7)],fill='#788472')
            if k>1:g.line((x0-extent+2,y+13,x0-2,y+10),fill='#596b5a')
    atlas.paste(sprite,(64*i,0))
atlas.save(OUT/'coast.png',optimize=True)
