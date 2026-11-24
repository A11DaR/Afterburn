"""Paint the fictional twin-engine opponents from a faceted model into a pixel sprite atlas."""
from pathlib import Path
from math import cos,sin,pi
import numpy as np
from PIL import Image,ImageDraw
OUT=Path(__file__).resolve().parents[1]/'dist'/'art'
faces=[]
def face(points,colour,edge=None):
    faces.append((np.array(points,dtype=float),colour,edge))
def loft(stations,colors):
    for j in range(len(stations)-1):
        for i in range(len(stations[0])):
            k=(i+1)%len(stations[0])
            face([stations[j][i],stations[j][k],stations[j+1][k],stations[j+1][i]],colors[i%len(colors)])
def fuselage():
    stations=[]
    for z,rx,ry,oy in [(7.0,.04,.03,.17),(5.0,.47,.34,.18),(3.0,.78,.52,.19),(1.4,1.13,.58,.13),(-1.8,1.36,.53,.06),(-4.65,1.16,.34,-.02)]:
        stations.append([(rx*cos(a*2*pi/8),oy+ry*sin(a*2*pi/8),z) for a in range(8)])
    loft(stations,['#93a4ad','#c7cacc','#98a6af','#687987','#3d4d5d','#293743','#384b58','#60717b'])
    face(stations[-1],'#323c46')
def patch(outline,y,col,sign=1):face([(x*sign,y,z) for x,z in outline],col)
def wing(s):
    outline=[(.72,2.32),(2.16,1.0),(5.92,-1.22),(5.73,-1.92),(1.45,-2.80),(.82,-2.51)]
    patch(outline,-.19,'#384751',s)
    patch(outline,-.04,'#aab4b6' if s>0 else '#8e9ba5',s)
    patch([(.84,2.34),(2.16,1.0),(5.94,-1.22),(5.57,-1.36),(2.09,.72)],.00,'#c4c5bf',s)
    patch([(1.40,-2.47),(5.72,-1.75),(5.73,-1.92),(1.45,-2.80)],.01,'#475a69',s)
    patch([(2.69,-.12),(3.35,-.46),(4.05,-1.86),(3.60,-1.91)],.014,'#647986',s)
    patch([(5.38,-.98),(5.94,-1.22),(5.74,-1.90),(5.28,-1.98)],.018,'#b47867',s)
    # Slender wingtip pods and stabilizers.
    patch([(5.77,-.76),(5.97,-.61),(6.02,-2.05),(5.84,-2.31)],.045,'#4a5a63',s)
    tail=[(.85,-2.83),(1.32,-2.57),(3.49,-3.93),(3.40,-4.55),(1.22,-4.49)]
    patch(tail,.08,'#8d9aa2',s);patch([(1.3,-2.66),(3.5,-3.93),(3.32,-4.0)],.10,'#c4c4b9',s)
    # Canted fin planes and markings.
    pts=[(.70,.31,-3.84),(.79,.49,-2.11),(1.44,2.48,-3.75),(1.52,2.45,-4.42),(1.07,.4,-4.38)]
    face([(x*s,y,z) for x,y,z in pts],'#7e909a' if s>0 else '#627582','#485665')
    face([(1.25*s,1.95,-3.38),(1.44*s,2.48,-3.75),(1.51*s,2.45,-4.41),(1.42*s,2.12,-4.37)],'#d6aa89')
    face([(1.02*s,1.22,-3.4),(1.1*s,1.49,-3.51),(1.32*s,1.81,-4.17),(1.23*s,1.54,-4.01)],'#424f60')
def nacelle(s):
    stat=[]
    for z,rad in [(1.75,.22),(.76,.53),(-2.56,.58),(-4.32,.51),(-4.82,.42)]:
        stat.append([(s*.72+rad*cos(a*2*pi/8),-.13+rad*.88*sin(a*2*pi/8),z) for a in range(8)])
    loft(stat,['#899ca2','#a6b0b1','#738592','#536674','#364650','#2b3946','#45515a','#5e707b'])
    face(stat[-1],'#252c37')
    for r,col in [(.31,'#85594c'),(.21,'#f2a460'),(.105,'#ffdda0')]:
        face([(s*.72+r*cos(a*2*pi/8),-.13+r*.85*sin(a*2*pi/8),-4.85-(.32-r)*.1) for a in range(8)],col)
def canopy():
    stations=[]
    for z,wx,hh in [(5.05,.07,.06),(4.43,.36,.30),(3.37,.52,.52),(2.18,.51,.42),(1.76,.30,.13)]:
        stations.append([(wx*cos(a*pi/5),.49+hh*sin(a*pi/5),z) for a in range(6)])
    loft(stations,['#334a57','#82a4ab','#c4d6cd','#648894','#314959','#364b54'])
    face([(-.4,.81,3.88),(.37,.85,3.9),(.4,.85,3.72),(-.4,.83,3.69)],'#495b65')
fuselage()
for sign in [-1,1]: wing(sign);nacelle(sign)
canopy()
# Full azimuth coverage, including a belly, level and elevated view of each airframe.
# Rows are grouped by airframe. Columns represent equal steps around the aircraft.
from PIL import ImageFilter
size = 112
azimuths = 32
elevations = [-52, -22, 4, 26, 53]
types = 2
atlas = Image.new('RGBA', (size * azimuths, size * len(elevations) * types))
for kind in range(types):
    model = []
    for points,colour,edge in faces:
        points = points.copy()
        if kind == 1:
            wing = np.maximum(0, np.abs(points[:,0]) - 1.35)
            points[:,2] -= wing * .37
            points[:,0] *= 1.05
            points[:,2] *= 1.06
            points[:,1] *= .90
            if colour == '#b47867': colour = '#db9a57'
            elif colour == '#aab4b6': colour = '#b9b4a8'
        model.append((points, colour, edge))
    for row, degrees in enumerate(elevations):
        el = degrees*pi/180
        for col in range(azimuths):
            yaw = col*2*pi/azimuths
            right = np.array([cos(yaw), 0, sin(yaw)])
            up = np.array([-sin(yaw)*sin(el), cos(el), cos(yaw)*sin(el)])
            camera = np.array([sin(yaw)*cos(el), sin(el), -cos(yaw)*cos(el)])
            im = Image.new('RGBA',(size,size))
            d = ImageDraw.Draw(im)
            for points,colour,edge in sorted(model, key=lambda face: np.mean(face[0]@camera)):
                xy = list(zip(np.rint(points@right*7.2+56).astype(int), np.rint(57-points@up*7.2).astype(int)))
                d.polygon(xy, fill=colour)
                if edge: d.line(xy+[xy[0]], fill=edge, width=1)
            border = im.getchannel('A').filter(ImageFilter.MaxFilter(3))
            sprite = Image.new('RGBA', im.size,'#35424e')
            sprite.putalpha(border)
            sprite.alpha_composite(im)
            atlas.paste(sprite, (size*col,size*(row+kind*len(elevations))))
atlas.save(OUT/'bandits.png',optimize=True)
im=Image.new('RGBA',(40,40),'#1c272a');d=ImageDraw.Draw(im)
for pts in [[(1,9),(14,11),(20,19),(26,11),(39,9),(35,14),(28,15),(20,28),(12,15),(5,14)],[(4,18),(12,19),(18,27),(14,25),(8,23)],[(36,18),(28,19),(22,27),(26,25),(32,23)]]:
    d.polygon(pts,fill='#ffab61')
im.save(OUT/'icon.png')
