"""Original artwork for Afterburn. Run from anywhere with Pillow, NumPy, SciPy and fontTools."""
from pathlib import Path
import json
import math
import random
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import gaussian_filter, zoom, distance_transform_edt
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

OUT = Path(__file__).resolve().parents[1] / "dist" / "art"
OUT.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(2871)
random.seed(181)
def rgb(s):
    return tuple(bytes.fromhex(s.lstrip('#')))
def mixes(a,b,t):
    return tuple(int(round(x*(1-t)+y*t)) for x,y in zip(a,b))
def noises(h,w,sy,sx):
    v=rng.uniform(-1,1,(sy,sx))
    return zoom(v,(h/sy,w/sx),order=3,mode='grid-wrap',grid_mode=True)[:h,:w]
def centered_noise(size, freq):
    return noises(size,size,freq,freq)

def terrain():
    n=1024
    z,x=np.mgrid[:n,:n]
    a=z*2*np.pi/n
    river=525+64*np.sin(a-.65)+41*np.sin(2*a+.8)
    offset=(x-river+n/2)%n-n/2
    width=108+24*np.sin(a+1.7)+15*np.cos(a*3-.5)
    large=centered_noise(n,7)
    medium=centered_noise(n,22)
    rock=centered_noise(n,68)
    grain=centered_noise(n,190)
    base=(np.abs(offset)-width+large*16+medium*7)
    rise=np.clip(base/152,0,1)
    terrace=24*(.5+.5*np.tanh((base-20+8*medium)/9))
    slope=rise*(62+52*large+15*medium+4.0*rock+1.2*grain)
    mass=np.maximum(0, (base+14)*.24) * (1-rise)
    h=np.maximum(0,terrace+slope+mass-2)
    # Inlets rise steeply out of the water. Break up the farther massif with eroded spines.
    folds=1-np.abs(centered_noise(n,12))
    h+=rise*(11*folds+7*np.sin(base*.18+medium*3))
    h=np.maximum(0,h)
    h=np.where(base<-8,0,h)
    # Low rock islands mark the bend; one side is cut back into a sandy shelf.
    for ix,iz,rx,rz,peak in [(612,425,23,38,15),(595,461,9,15,7),(475,789,26,48,23),(458,750,11,22,10),(552,150,13,32,10)]:
        ex=(x-ix+n/2)%n-n/2;ez=(z-iz+n/2)%n-n/2
        mound=1-(ex/rx)**2-(ez/rz)**2+medium*.23+rock*.12
        h=np.maximum(h,np.maximum(0,mound)**.72*peak)
    water=h<1
    hz,hx=np.gradient(gaussian_filter(h,1.1,mode='wrap'))
    sun=np.clip((.88*hx+.48*hz+.58)/(np.sqrt(hx*hx+hz*hz+1)),-1,1)
    # Bedding follows elevation while runoff follows the fall line. Both stay fixed in world space.
    bedding=h*.60+large*5.1+medium*2.8
    strata=np.sin(bedding)*.070 + np.sin(bedding*.29+.9)*.063 + np.sin(h*1.55+rock*.8)*.024
    strata-=np.exp(-((np.sin(bedding*.56)-.45)/.22)**2)*.095
    scree=np.abs(rock-medium*.13)
    strata+=np.where((scree<.15)&(h>17),.07,0)+grain*.027
    val=np.clip(.27+.49*sun+.09*medium+.055*rock+.026*grain+strata,0,1)
    level=np.uint8(np.rint(val*15))
    materials=np.zeros_like(level)
    materials[(sun<.28)&(h>8)]=1
    materials[(h>39)&(sun>.51)&(np.abs(hx)+np.abs(hz)<1.7)&(large+medium*.35>.00)]=2
    materials[(base<18)&(~water)]=3
    # Sixteen hand-mixed tonal steps for sunlit stone, shade, scrub and the shoreline.
    color_ramps=[
        ('353a47','8b6158','eda56d'), ('2a3949','555467','aa7a74'),
        ('303f41','666b55','ab9d6c'), ('5b5054','a78468','e9c192')]
    palette=[]
    for lo,mid,hi in color_ramps:
        for i in range(16):
            palette.append(mixes(rgb(lo),rgb(mid),i/8) if i<=8 else mixes(rgb(mid),rgb(hi),(i-8)/7))
    water_shade=gaussian_filter(rng.normal(size=(n,n)),(.48,4.9),mode='wrap')
    shore_distance=distance_transform_edt(water)
    shelf=np.clip((18-shore_distance)/18,0,1)
    breakers=(shore_distance>1)&(shore_distance<3.2)&(medium+rock*.71>-.25)
    water_level=np.clip(np.rint(5.0+water_shade*12+medium*1.65+shelf*5.1+breakers*7),0,15).astype('uint8')
    water_stops=[(0,'28485a'),(7,'416c79'),(11,'749994'),(14,'acb5a2'),(15,'dfd2ae')]
    for i in range(16):
        for (lo,a),(hi,b) in zip(water_stops,water_stops[1:]):
            if lo<=i<=hi:
                palette.append(mixes(rgb(a),rgb(b),(i-lo)/(hi-lo)))
                break
    encoded=np.zeros((n,n,3),dtype='uint8')
    encoded[:,:,0]=np.rint(np.minimum(249,h))
    encoded[:,:,1]=np.where(water,64+water_level,materials*16+level)
    encoded[:,:,2]=np.uint8(np.clip(np.round((water_shade+1)*115),0,255))
    Image.fromarray(encoded).save(OUT/'terrain.png',optimize=True)
    (OUT/'palette.json').write_text(json.dumps(palette,separators=(',',':')))

def cloud(w,h,kind,seed):
    # A hand-shaped cluster of lobes with pixel-stepped edges and directional light.
    cr=np.random.default_rng(seed)
    yy,xx=np.mgrid[0:h,0:w]; u=(xx+.5)/w; v=(yy+.5)/h
    dens=np.full((h,w),-2.)
    count=16 if kind=='bank' else 11
    for i in range(count):
        px=.08+.84*i/(count-1)+cr.uniform(-.03,.03)
        envelope=.31+.69*np.sin(np.pi*px)**.6
        cy=cr.uniform(.51,.68)+.06*np.sin(px*7)
        ry=cr.uniform(.19,.49)*envelope
        rx=cr.uniform(.062,.16)*envelope
        cap=1-((u-px)/rx)**2-((v-cy)/ry)**2
        dens=np.maximum(dens,cap)
    rough=noises(h,w,max(3,h//10),max(7,w//14))
    detail=noises(h,w,max(3,h//4),max(7,w//5))
    dens+=rough*.31+detail*.15
    base=.83+.028*np.sin(u*16)+.042*rough
    mask=(dens>0)&(v<base)
    gy,gx=np.gradient(gaussian_filter(dens,1.45))
    brightness=.46+.25*(.60-v)+.19*rough+.057*detail+.03*dens+2.6*gy+2.1*gx
    brightness-=np.maximum(0,(v-.59)*1.6)
    colors=([rgb(s) for s in ('867583','a78387','c29490','dda394','f4b59a','ffcc9e','ffdfa9')]
            if kind=='bank' else [rgb(s) for s in ('776f85','997f8b','b58c93','d29895','eda998','ffbf9c','ffd9a4')])
    idx=np.clip(np.floor((brightness+.14)*8),0,6).astype(int)
    ar=np.zeros((h,w,4),dtype='uint8'); ar[:,:,:3]=np.array(colors)[idx]
    ar[:,:,3]=mask*255
    return Image.fromarray(ar)

def panorama():
    w,h,hy=4096,620,471
    y,x=np.mgrid[:h,:w]
    sx=729
    dx=(x-sx+w/2)%w-w/2
    sy=hy-75
    stops=[(0,'29344f'),(105,'344967'),(215,'365a7b'),(303,'62869d'),(366,'a5a2a2'),(410,'d3a4a0'),(448,'efae8e'),(473,'f9c090'),(503,'dba49b'),(619,'9d8692')]
    back=np.zeros((h,w,3))
    for c in range(3):
        back[:,:,c]=np.interp(y[:,0],[p for p,_ in stops],[rgb(k)[c] for _,k in stops])[:,None]
    glow=np.exp(-((dx/255)**2+((y-sy)/116)**2))*.50
    for c,v in enumerate(rgb('ffcd91')):
        back[:,:,c]=back[:,:,c]*(1-glow)+v*glow
    # Subtle ordered dithering between deliberately limited sky colours.
    ordered=np.array([[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]])/16-.45
    dither=np.tile(ordered,(h//4+1,w//4+1))[:h,:w]
    back=np.uint8(np.clip(np.round(back/2+dither[:,:,None]*.65)*2,0,255))
    bg=Image.fromarray(back).convert('RGBA')
    d=ImageDraw.Draw(bg)
    for rad,col in [(41,'ffd597'),(39,'ffdf9e'),(36,'ffe3a3'),(31,'ffe6ac')]:
        d.ellipse((sx-rad,sy-rad,sx+rad,sy+rad),fill='#'+col)
    # Narrow haze cuts the bottom of the disc; the upper edge stays luminous.
    for oy,hh in [(15,1),(23,2),(33,3)]:
        span=int(np.sqrt(39**2-oy**2))
        d.rectangle((sx-span,sy+oy,sx+span,sy+oy+hh-1),fill='#f8be94')
    # Thin, irregular cirrus across the sky.
    for _ in range(205):
        xx=random.randrange(w); yy=random.randrange(240,456)
        ll=random.randint(7,90); ht=random.choice([1,1,2,2,3])
        col=mixes(bg.getpixel((xx,yy))[:3],rgb(random.choice(['f9bca0','dda3a1','fff0b0'])),random.uniform(.13,.43))
        d.polygon([(xx,yy+ht),(xx+ll//5,yy),(xx+ll,yy),(xx+ll*3//4,yy+ht)],fill=col)
    fixed=[(46,264,215,49),(187,345,184,36),(353,219,192,54),(610,326,139,29),
           (887,245,369,88),(672,416,225,25),(1123,379,220,32),(9,400,251,37)]
    others=[(random.randint(1170,w-45),random.randint(244,414),random.randint(85,279),random.randint(22,60)) for _ in range(28)]
    for i,(xx,yy,ww,hh) in enumerate(others+fixed):
        im=cloud(ww,hh,'bank' if yy>358 else 'high',110+i*11)
        bg.alpha_composite(im,(xx,yy))
        if xx+ww>w: bg.alpha_composite(im,(xx-w,yy))
    d=ImageDraw.Draw(bg)
    # Overlapping distant massifs, each with faceted ridges on the sunward side.
    for k,(base,amp,wide,col,lit,shade) in enumerate([
        (467,53,100,'b497a3','d3a6a2','a58b9b'),(472,40,79,'aa8896','ce9b94','977e91'),
        (480,31,61,'927e90','b48d91','87788b')]):
        count=round(w/wide)
        xs=np.round(np.linspace(0,w,count+1)).astype(int)
        vals=rng.uniform(.1,1,count); vals=np.append(vals,vals[0])
        profile=[]
        for i in range(count):
            x0,x1=xs[i],xs[i+1]
            ya=base-amp*vals[i]; yb=base-amp*vals[i+1]
            for xx in range(x0,x1):
                u=(xx-x0)/(x1-x0)
                # Piecewise straight ridges with small broken scree ledges.
                profile.append(int(ya*(1-u)+yb*u+2.1*math.sin(xx*.11+k)+1.2*math.sin(xx*.39+k)))
        d.polygon([(0,h),(0,profile[0])]+list(enumerate(profile))+[(w,h)],fill='#'+col)
        for i in range(1,count):
            xx=xs[i]; py=profile[xx]
            if vals[i]>vals[i-1] and vals[i]>vals[i+1]:
                r=min(w-1,xs[i+1]-2)
                d.polygon([(xx,py),(xx+4,py+2),(xx+12,py+14),(xx+8,py+12),(xx+27,base+8),(r,base+10),(r,profile[r])]+[(u,profile[u]) for u in range(r,xx,-1)],fill='#'+lit)
                d.line([(xx,py+2),(xx-9,py+15),(xx-7,py+13),(xx-18,base+3)],fill='#'+shade,width=2)
    bg.convert('RGB').save(OUT/'horizon.png',optimize=True)

def cockpit():
    w,h=900,156
    im=Image.new('RGBA',(w,h)); d=ImageDraw.Draw(im)
    def poly(pts,color): d.polygon(pts,fill='#'+color)
    def ln(pts,color,th=1): d.line(pts,fill='#'+color,width=th)
    def rect(box,color): d.rectangle(box,fill='#'+color)
    def mirror(pts): return [(w-1-x,y) for x,y in pts]
    def both(pts,c):
        poly(pts,c);poly(mirror(pts),c)
    def bothline(pts,c,n=1):
        ln(pts,c,n);ln(mirror(pts),c,n)
    profile=[(0,68),(34,64),(54,69),(103,77),(152,66),(193,42),(245,38),(267,44),(322,43),(344,33),(365,29),(377,16),(408,12),(492,12),(523,16),(535,29),(556,33),(578,43),(633,44),(655,38),(707,42),(748,66),(797,77),(846,69),(866,64),(900,68)]
    poly(profile+[(900,h),(0,h)],'182327')
    ln(profile,'2b3236',5);ln([(x,y-1) for x,y in profile],'797772',2)
    ln([(x,y+3) for x,y in profile],'43484a',3)
    # Fabric anti-glare shroud in overlapping angular folds.
    both([(34,72),(80,75),(107,80),(150,71),(190,50),(198,51),(161,76),(116,93),(52,84)],'323a3b')
    both([(125,88),(194,48),(250,45),(233,53),(190,56),(156,84)],'474b49')
    both([(179,59),(217,46),(263,48),(304,46),(324,45),(310,54),(247,58)],'384145')
    bothline([(194,51),(234,46),(264,49)],'78746b',1)
    bothline([(36,75),(73,78),(103,82)],'666663',2)
    # Fine dashes suggest woven material along the leading edges.
    for _ in range(255):
        x=random.randint(4,896); y=random.randint(15,92)
        if im.getpixel((x,y))[3] and (x+y)%3==0:
            d.line((x,y,x+random.randint(1,3),y),fill=random.choice(['#4d5351','#282f34','#5a5b54']))
    both([(0,87),(43,83),(99,91),(143,86),(155,100),(144,153),(0,155)],'30383b')
    both([(0,93),(43,88),(96,96),(139,90),(146,98),(127,105),(34,98),(0,102)],'495052')
    both([(152,82),(187,60),(309,55),(336,64),(350,151),(128,156)],'0f191e')
    both([(159,84),(187,65),(304,61),(329,70),(340,150),(137,150)],'52595a')
    both([(163,86),(189,69),(303,65),(324,74),(332,148),(143,148)],'2a3438')
    # Main displays, inset in a deep bezel.
    for lx in (187,900-187-118):
        rect((lx-8,76,lx+124,151),'151f22');rect((lx-4,78,lx+121,149),'62635a')
        rect((lx-2,79,lx+119,149),'0e171a');rect((lx,82,lx+117,147),'17342f')
        for bx in range(lx+9,lx+118,20):
            rect((bx-1,69,bx+8,73),'101b20');rect((bx,69,bx+7,70),'8a8c79')
        for by in range(88,146,13):
            for xx in (lx-13,lx+125):
                rect((xx,by,xx+6,by+5),'69706a');rect((xx+1,by+1,xx+5,by+5),'323d3f')
    # HUD projector housing and central instrument pedestal.
    poly([(321,146),(335,69),(351,47),(376,36),(524,36),(549,47),(565,69),(579,146)],'353e40')
    poly([(341,119),(348,60),(371,44),(529,44),(552,60),(559,119)],'192328')
    ln([(347,61),(371,44),(529,44),(552,61)],'636763',2)
    poly([(359,37),(378,19),(409,15),(491,15),(522,19),(541,37),(524,43),(374,43)],'41494a')
    poly([(376,35),(389,22),(410,19),(490,19),(511,22),(524,35)],'101e22')
    poly([(388,32),(400,24),(499,24),(513,32)],'38483f')
    ln([(398,25),(500,25)],'90977c',2)
    rect((376,53,522,72),'111a1d')
    for i in range(13):
        px=382+i*10
        rect((px,56,px+6,61),['535a4a','748653','b38f4f','66684c'][i%4])
        rect((px,64,px+6,68),'354340')
    d.ellipse((410,74,491,155),fill='#111c20',outline='#686d66',width=3)
    d.ellipse((417,81,484,148),fill='#263937',outline='#454e49',width=2)
    for dx in (354,516):
        rect((dx,83,dx+26,145),'192328')
        for i in range(5):
            by=89+i*11
            rect((dx+3,by,dx+20,by+4),'4a5551')
            rect((dx+3,by,dx+8+(i*2)%8,by+3),['8e9c68','b79a5d','79a482'][i%3])
    # Side grilles, emergency handles, rotary knobs and recessed bolts.
    for side in (0,1):
        def xx(p):return w-1-p if side else p
        for i in range(8):
            p=35+i*8; ln([(xx(p),111),(xx(p+9),125)],'171e22',3)
            ln([(xx(p),110),(xx(p+6),119)],'61706b',1)
        for i in range(5):
            p=12+i*8
            poly([(xx(p),141),(xx(p+4),141),(xx(p+10),148),(xx(p+6),148)],'b79759')
        for px,py in [(10,103),(115,103),(149,144),(320,80),(341,66),(386,75),(371,144),(59,85)]:
            xp=xx(px)
            rect((xp-2,py-2,xp+2,py+2),'131e22');ln([(xp-1,py-1),(xp+1,py-1)],'858c80')
            ln([(xp-1,py+1),(xp+1,py)],'65706b')
        xp=xx(114)
        d.ellipse((xp-8,117,xp+8,133),fill='#111a1e',outline='#67716c',width=2)
        ln([(xp-2,124),(xp+3,120)],'a9a48b',2)
    im.save(OUT/'cockpit.png',optimize=True)

# A compact bitmap typeface. Each glyph is drawn on a seven-row grid.
GLYPHS={
'A':'0e11111f111111','B':'1e11111e11111e','C':'0f10101010100f','D':'1e11111111111e','E':'1f10101e10101f','F':'1f10101e101010',
'G':'0f10101311110f','H':'1111111f111111','I':'0e04040404040e','J':'0702020212120c','K':'11121418141211','L':'1010101010101f',
'M':'111b1515111111','N':'11191915131311','O':'0e11111111110e','P':'1e11111e101010','Q':'0e11111115120d','R':'1e11111e141211',
'S':'0f10100e01011e','T':'1f040404040404','U':'1111111111110e','V':'11111111110a04','W':'1111111515150a','X':'11110a040a1111',
'Y':'11110a04040404','Z':'1f01020408101f',
'А':'0e11111f111111','Б':'1f10101e11111e','В':'1e11111e11111e','Г':'1f101010101010','Д':'0e0a0a0a0a1f11','Е':'1f10101e10101f',
'Ё':'0a001f101e101f','Ж':'15150e040e1515','З':'1e01010e01011e','И':'11111315191111','Й':'0a041113151911','К':'11121418141211',
'Л':'0f090909091911','М':'111b1515111111','Н':'1111111f111111','О':'0e11111111110e','П':'1f111111111111','Р':'1e11111e101010',
'С':'0f10101010100f','Т':'1f040404040404','У':'1111110f01011e','Ф':'040e1515150e04','Х':'11110a040a1111','Ц':'12121212121f01',
'Ч':'1111110f010101','Ш':'1515151515151f','Щ':'15151515151f01','Ъ':'1810080e09090e','Ы':'1111111d15151d','Ь':'1010101e11111e',
'Э':'1e01010f01011e','Ю':'1215151d151512','Я':'0f11110f050911',
'0':'0e11131519110e','1':'040c040404040e','2':'0e11010204081f','3':'1e01010e01011e','4':'02060a121f0202',
'5':'1f10101e01011e','6':'0e10101e11110e','7':'1f010204080808','8':'0e11110e11110e','9':'0e11110f01010e',
'-':'0000001f000000','/':'01010204081010','.':'00000000000c0c',' ':'00000000000000'}
def font():
    names=['.notdef']+['uni%04X'%ord(c) for c in GLYPHS]
    fb=FontBuilder(800,isTTF=True);fb.setupGlyphOrder(names)
    cmap={ord(c):'uni%04X'%ord(c) for c in GLYPHS};fb.setupCharacterMap(cmap)
    glyphs={'.notdef':TTGlyphPen(None).glyph()};metrics={'.notdef':(600,0)}
    for c,rows in GLYPHS.items():
        pen=TTGlyphPen(None)
        for r,row in enumerate(bytes.fromhex(rows)):
            for i in range(5):
                if row & 1<<(4-i):
                    left=i*100; bot=(6-r)*100
                    pen.moveTo((left,bot));pen.lineTo((left,bot+100));pen.lineTo((left+100,bot+100));pen.lineTo((left+100,bot));pen.closePath()
        name=cmap[ord(c)];glyphs[name]=pen.glyph();metrics[name]=(600 if c!=' ' else 330,0)
    fb.setupGlyf(glyphs);fb.setupHorizontalMetrics(metrics);fb.setupHorizontalHeader(ascent=740,descent=-60)
    fb.setupNameTable({'familyName':'Afterburn Grid','styleName':'Regular','uniqueFontIdentifier':'AfterburnGrid-Regular','fullName':'Afterburn Grid','psName':'AfterburnGrid-Regular'})
    fb.setupOS2(sTypoAscender=740,sTypoDescender=-60,usWinAscent=740,usWinDescent=60)
    fb.setupPost();fb.setupMaxp();fb.save(OUT/'afterburn-grid.ttf')

if __name__=='__main__':
    terrain();panorama();cockpit();font()
