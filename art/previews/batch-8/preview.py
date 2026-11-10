"""Rebuild review composites from the final PNGs. Requires Pillow; run from repo root."""
import json
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'art/previews/batch-8'
data = json.loads(subprocess.check_output(['node', '-e', "console.log(JSON.stringify({assets:require('./packages/shared/src/assets.ts').ASSETS,...require('./packages/shared/src/rules.ts')}))"], cwd=ROOT))
ASSETS = {a['id']: a for a in data['assets']}
BATCH = [a for a in data['assets'] if a['batch'] == 8]
NEAREST = Image.Resampling.NEAREST
BG = '#36425A'
FONT = ImageFont.load_default(size=10)

def png(path):
    return Image.open(ROOT / path).convert('RGBA')

def sprite(id, frame=0):
    a = ASSETS[id]
    return png('assets/' + a['file']).crop((frame*a['width'], 0, (frame+1)*a['width'], a['height']))

def draw(canvas, id, x, y, frame=0, flip=False):
    a = ASSETS[id]
    im = sprite(id, frame)
    if flip:
        im = im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    canvas.alpha_composite(im, (x-a['anchor'][0], y-a['anchor'][1]))

def label(im, text, xy):
    ImageDraw.Draw(im).text(xy, text, font=FONT, fill='#F4F2EE')

def save2(im, name):
    im.resize((im.width*2, im.height*2), NEAREST).save(OUT / name)

def gif2(frames, name, fps):
    ims = [im.convert('RGB').resize((im.width*2, im.height*2), NEAREST) for im in frames]
    durations=[(round((i+1)*100/fps)-round(i*100/fps))*10 for i in range(len(ims))]
    ims[0].save(OUT / name, save_all=True, append_images=ims[1:], loop=0, duration=durations, disposal=2)

def room():
    im = Image.new('RGBA', (768,448), BG)
    floors = dict(front_desk=['wood_1','wood_2'], weights=['rubber_1','rubber_2'], cardio=['wood_1','wood_2'], mats=['mat_pink','mat_teal'], water_cooler=['wood_1','wood_2'], locker_room=['rubber_1','rubber_2'])
    for row in range(2,14):
        for col in range(24):
            area = 'cardio'
            for key, r in data['AREA_RECTS'].items():
                if r['x'] <= col < r['x']+r['w'] and r['y'] <= row < r['y']+r['h']:
                    area = key
                    break
            im.alpha_composite(sprite('tile.floor_'+floors[area][(col+row)%2]), (col*32,row*32))
    for x in range(0,768,32):
        im.alpha_composite(sprite('tile.wall_back'), (x,0))
    for name,x in [('door',64),('window',224),('window',480),('window',640)]:
        im.alpha_composite(sprite('tile.wall_'+name), (x,0))
    for y in range(64,448,32):
        im.alpha_composite(sprite('tile.wall_side'), (0,y))
        im.alpha_composite(sprite('tile.wall_side'), (760,y))
    for x in range(0,768,32):
        im.alpha_composite(sprite('tile.wall_front'), (x,440))
    props = [('speaker',32,34),('poster_bolt',168,44),('mirror',352,50),('poster_dumbbell',432,44),('clock',592,34),('poster_heart',736,44),('front_desk',96,158),('plant_big',20,104),('dumbbell_rack',300,250),('kettlebells',380,252),('water_cooler',300,330),('plant_small',356,330),('lockers',52,330),('lockers',84,330),('locker_room_door',120,330),('plant_big',748,440)]
    for name,x,y in sorted(props,key=lambda p:p[2]):
        draw(im,'prop.'+name,x,y)
    mat=0
    for m in data['MACHINE_LAYOUT']:
        x,y=m['x']*32+32,m['y']*32+40
        if m['kind']=='bench':
            draw(im,'prop.bench_back',x,y)
        elif m['kind']=='treadmill':
            draw(im,'prop.treadmill_back',x,y)
            draw(im,'prop.treadmill_front',x,y)
        else:
            draw(im,'prop.yoga_mat_'+['pink','teal','purple','green'][mat],x,y+2)
            mat+=1
    return im

BASE = room()
# Same anchors and effect offsets as GymRenderer.drawAgent. Actors are held
# still in per-effect previews so the effect's motion can be judged alone.
draw(BASE,'char.build-1.bench_press',256,168,1)
draw(BASE,'char.build-2.bench_fail',352,168,2)
for build,x,y,direction in [(0,256,230,'down'),(3,402,230,'down'),(1,176,230,'down'),(2,208,340,'up'),(3,392,340,'side')]:
    ImageDraw.Draw(BASE).ellipse((x-7,y-2,x+7,y+2),fill='#3E3450')
    draw(BASE,f'char.build-{build}.idle_{direction}',x,y)
    if (x,y) in [(176,230),(208,340),(392,340)]:
        draw(BASE,'fx.headphones_'+direction,x,y-26)

FX = {'sweat':(266,122), 'cheer':(256,194), 'dust':(352,168), 'sparkle':(402,182), 'notes':(188,188)}
for name,(x,y) in FX.items():
    a=ASSETS['fx.'+name]
    crop=(x-96,y-60,x+96,y+68)
    frames=[]
    sheet=Image.new('RGBA',(192*4,140),BG)
    for f in range(4):
        im=BASE.copy()
        draw(im,'fx.'+name,x,y,f)
        tile=im.crop(crop)
        frames.append(tile)
        sheet.alpha_composite(tile,(f*192,12))
        label(sheet,f'{name}: {f+1}/4', (f*192+6,0))
    save2(sheet,f'{name}.in-room@2x.png')
    gif2(frames,f'{name}.in-room@2x.gif',a['fps'])

for direction,(x,y) in {'down':(176,230),'up':(208,340),'side':(392,340)}.items():
    save2(BASE.crop((x-96,y-80,x+96,y+48)),f'headphones_{direction}.in-room@2x.png')

room_frames=[]
for tick in range(40):
    im=BASE.copy()
    for name,(x,y) in FX.items():
        a=ASSETS['fx.'+name]
        draw(im,'fx.'+name,x,y,int(tick/20*a['fps'])%4)
    room_frames.append(im)
save2(room_frames[4],'room.all-effects@2x.png')
gif2(room_frames,'room.all-effects@2x.gif',20)

# All idle frames, all builds, all views, plus the mirrored side view.
heads=[]
for f in range(4):
    im=Image.new('RGBA',(272,280),BG)
    for b in range(4):
        label(im,['Noodle','Toned','Buff','Maxxed'][b],(b*68+4,0))
        for row,direction in enumerate(['down','up','side','left']):
            dr='side' if direction=='left' else direction
            actor=sprite(f'char.build-{b}.idle_{dr}',f)
            actor.alpha_composite(sprite('fx.headphones_'+dr),(6,9))
            if direction=='left':
                actor=actor.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            im.alpha_composite(actor,(b*68+18,row*66+20))
            label(im,direction,(b*68+18,row*66+10))
    heads.append(im)
save2(heads[0],'headphones.all-builds@2x.png')
gif2(heads,'headphones.all-builds@2x.gif',6)

INSETS={'bubble':(8,8),'bubble_whisper':(8,8),'bubble_shout':(8,8),'name_tag':(4,4),'progress_frame':(8,2)}
SIZES={'bubble':[(24,24),(56,32),(104,48)],'bubble_whisper':[(24,24),(56,32),(104,48)],'bubble_shout':[(32,32),(64,40),(112,56)],'name_tag':[(16,12),(48,12),(88,20)],'progress_frame':[(24,8),(64,8),(120,12)],'progress_fill':[(4,4),(32,4),(80,8)]}

def sliced(src, size, inset, repeat_edges=False):
    w,h=size;cx,cy=inset;sw,sh=src.size
    out=Image.new('RGBA',size)
    sx,sy=[0,cx,sw-cx,sw],[0,cy,sh-cy,sh]
    dx,dy=[0,cx,w-cx,w],[0,cy,h-cy,h]
    for row in range(3):
        for col in range(3):
            part=src.crop((sx[col],sy[row],sx[col+1],sy[row+1]))
            target=(dx[col+1]-dx[col],dy[row+1]-dy[row])
            if repeat_edges and ((row==1) != (col==1)):
                tiled=Image.new('RGBA',target)
                for py in range(0,target[1],part.height):
                    for px in range(0,target[0],part.width):
                        tiled.alpha_composite(part,(px,py))
                part=tiled
            else:
                part=part.resize(target,NEAREST)
            out.alpha_composite(part,(dx[col],dy[row]))
    # The four caps are byte-identical at every requested size.
    for x,y,tx,ty in [(0,0,0,0),(sw-cx,0,w-cx,0),(0,sh-cy,0,h-cy),(sw-cx,sh-cy,w-cx,h-cy)]:
        assert src.crop((x,y,x+cx,y+cy)).tobytes()==out.crop((tx,ty,tx+cx,ty+cy)).tobytes()
    return out

ui_sheet=Image.new('RGBA',(352,16*78),BG)
ui_checks=[]
for row,a in enumerate(a for a in BATCH if a['id'].startswith('ui.')):
    name=a['id'][3:];src=sprite(a['id'])
    sizes=SIZES.get(name,[(src.width,src.height),(src.width*2,src.height*2),(src.width*3,src.height*3)])
    im=Image.new('RGBA',(352,78),BG);label(im,a['id'],(4,0))
    for i,size in enumerate(sizes):
        piece=sliced(src,size,INSETS[name],name=='bubble_whisper') if name in INSETS else src.resize(size,NEAREST)
        x=[8,72,200][i];im.alpha_composite(piece,(x,24))
        label(im,f'{size[0]}x{size[1]}',(x,12))
    save2(im,name+'.stretched@2x.png')
    ui_sheet.alpha_composite(im,(0,row*78))
    if name in INSETS:
        cx,cy=INSETS[name];middle=src.crop((cx,cy,src.width-cx,src.height-cy))
        colours=set(middle.get_flattened_data())
        assert len(colours)==1,(name,colours)
        ui_checks.append({'id':a['id'],'insets':[cx,cy],'plainCenter':True,'cornerPixelsPreserved':True,'previewSizes':sizes})
save2(ui_sheet,'ui.all-stretches@2x.png')

style=png('art/reference/style-tile.png')
save2(style,'style-tile@2x.png')
contact=Image.new('RGBA',(576,610),BG)
contact.alpha_composite(style,(0,18));label(contact,'Approved style tile',(4,2))
for i,a in enumerate(BATCH):
    col=0 if i<8 else 1
    row=i if col==0 else i-8
    x=280 if col==0 else 428
    y=16+row*37
    label(contact,a['id'],(x,y))
    contact.alpha_composite(png('assets/'+a['file']),(x,y+12))
save2(contact,'all-assets.with-style@2x.png')
(OUT/'ui-checks.json').write_text(json.dumps(ui_checks,indent=2)+'\n')
print('Rendered room composites, every effect, headphone fits and 16 UI size comparisons.')
