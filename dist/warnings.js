// Ordered by priority. The warning clock runs only while the sortie is live.
export const WARNINGS = [
  { id:'pull-up', bit:1, urgent:true, repeat:3.6, rearm:2, notes:[523,784], active:g=>g.groundWarning,
    ru:{label:'ТЯНИ ВВЕРХ',speech:'Тяни вверх! Тяни вверх!',action:'W · тяни вверх'},
    en:{label:'PULL UP',speech:'Pull up! Pull up!',action:'W · pull up'} },
  { id:'over-g', bit:4096, urgent:true, repeat:4.2, rearm:2.5, notes:[1175,880], active:g=>g.highG,
    ru:{label:'ПЕРЕГРУЗКА',speech:'Перегрузка!',action:'Ослабь манёвр'},
    en:{label:'OVER G',speech:'Over G! Over G!',action:'Ease the turn'} },
  { id:'roll-left', bit:16384, urgent:true, repeat:4, rearm:1.8, notes:[880,659], active:g=>g.rollCue===-1,
    ru:{label:'КРЕН ВЛЕВО',speech:'Крен влево!',action:'A · влево'},
    en:{label:'ROLL LEFT',speech:'Roll left!',action:'A · roll left'} },
  { id:'roll-right', bit:32768, urgent:true, repeat:4, rearm:1.8, notes:[659,880], active:g=>g.rollCue===1,
    ru:{label:'КРЕН ВПРАВО',speech:'Крен вправо!',action:'D · вправо'},
    en:{label:'ROLL RIGHT',speech:'Roll right!',action:'D · roll right'} },
  { id:'missile', bit:2, urgent:true, repeat:5, rearm:1.5, notes:[988,988,1319], active:g=>g.threats.some(t=>!t.free),
    ru:{label:'РАКЕТА',speech:'Ракета! Ракета!',action:'F · ловушки'},
    en:{label:'MISSILE',speech:'Missile! Missile!',action:'F · flares'} },
  { id:'engine', bit:4, urgent:true, repeat:6.4, rearm:3, notes:[415,311], active:g=>g.engineFire,
    ru:{label:'ПОЖАР ДВИГАТЕЛЯ',speech:'Пожар двигателя!',action:'O · выключи тягу'},
    en:{label:'ENGINE FIRE',speech:'Fire in engine! Fire in engine!',action:'O · cut thrust'} },
  { id:'stall', bit:8192, urgent:true, repeat:5.5, rearm:3, notes:[349,294,233], active:g=>g.stalled,
    ru:{label:'СВАЛИВАНИЕ',speech:'Сваливание!',action:'Ослабь манёвр · Shift'},
    en:{label:'STALL',speech:'Stall! Stall!',action:'Ease off · Shift'} },
  { id:'sink', bit:64, repeat:7, rearm:3.5, notes:[880,659,494], active:g=>g.sinkWarning,
    ru:{label:'СНИЖЕНИЕ',speech:'Слишком быстрое снижение!',action:'W · выровняйся'},
    en:{label:'SINK RATE',speech:'Sink rate! Sink rate!',action:'W · level out'} },
  { id:'bank-angle', bit:65536, repeat:8, rearm:3, notes:[622,466], active:g=>g.bankWarning&&!g.roll,
    ru:{label:'БОЛЬШОЙ КРЕН',speech:'Большой крен!',action:'Выровняй крылья'},
    en:{label:'BANK ANGLE',speech:'Bank angle!',action:'Level the wings'} },
  { id:'low-altitude', bit:131072, repeat:15, rearm:5, notes:[523,392], active:g=>g.lowAltitude,
    ru:{label:'ВЫСОТА ОПАСНАЯ',speech:'Высота опасная!',action:'Следи за рельефом'},
    en:{label:'LOW ALTITUDE',speech:'Low altitude!',action:'Watch the terrain'} },
  { id:'six', bit:128, repeat:12, rearm:5, notes:[554,831,554], active:g=>g.sixWarning,
    ru:{label:'ПРОВЕРЬ ХВОСТ',speech:'Проверь хвост!',action:'C · обзор назад'},
    en:{label:'CHECK SIX',speech:'Check six!',action:'C · look back'} },
  { id:'hull', bit:256, repeat:Infinity, rearm:4, notes:[330,277,220], active:g=>g.hull>0&&g.hull<=32,
    ru:{label:'КОРПУС ПОВР.',speech:'Корпус повреждён!',action:'Береги корпус'},
    en:{label:'HULL CRIT',speech:'Hull critical!',action:'Protect the airframe'} },
  { id:'aoa', bit:8, repeat:5, rearm:2.5, notes:[659,831], active:g=>g.highAoa,
    ru:{label:'КРИТИЧЕСКИЙ УГОЛ АТАКИ',speech:'Критический угол атаки!',action:'Ослабь манёвр'},
    en:{label:'AOA',speech:'A. O. A.! A. O. A.!',action:'Ease the turn'} },
  { id:'speed', bit:16, repeat:9, rearm:4, notes:[494,370], active:g=>g.lowSpeed,
    ru:{label:'МАЛАЯ СКОРОСТЬ',speech:'Малая скорость!',action:'Shift · разгон'},
    en:{label:'LOW SPEED',speech:'Low airspeed!',action:'Shift · accelerate'} },
  { id:'overspeed', bit:512, repeat:14, rearm:5, notes:[587,784,1046], active:g=>g.overspeed,
    ru:{label:'ПРЕВ. СКОРОСТИ',speech:'Превышение скорости!',action:'X · тормоз'},
    en:{label:'OVERSPEED',speech:'Overspeed!',action:'X · airbrake'} },
  { id:'flares', bit:32, repeat:Infinity, rearm:1.5, notes:[740,440,294], active:g=>g.flares===0,
    ru:{label:'НЕТ ЛОВУШЕК',speech:'Нет ловушек!',action:'Q · бочка'},
    en:{label:'NO FLARES',speech:'Flares empty!',action:'Q · barrel roll'} },
  { id:'rockets', bit:1024, repeat:Infinity, rearm:3, notes:[698,466,349], active:g=>g.rockets===0,
    ru:{label:'НЕТ РАКЕТ',speech:'Нет ракет!',action:'E · пулемёт'},
    en:{label:'NO MISSILES',speech:'Missiles empty!',action:'E · gun'} },
  { id:'ammo', bit:2048, repeat:Infinity, rearm:3, notes:[440,440,330], active:g=>g.rounds>0&&g.rounds<=48&&g.reload<=0,
    ru:{label:'МАЛО ПАТРОНОВ',speech:'Мало патронов!',action:'Короткие очереди'},
    en:{label:'LOW AMMO',speech:'Gun ammo low!',action:'Short bursts'} }
];

export const WARNING_UI = {
  ru: { normal:'В норме',test:'Нажми на сигнал',testLabel:'Проверить',on:'сработало',off:'погашено',
    terrain:'РЕЛЬЕФ · ТЯНИ ВВЕРХ!', altTitle:'Высота над землёй',altLabel:'НАД ЗЕМЛЁЙ',metres:'м',rateUnit:'м/с',rateTitle:'Вертикальная скорость',
    engineReady:'Двигатель запущен',fireOut:'Пожар потушен',cutFirst:'Сначала выключи тягу · O',
    engine:{
      fire:{title:'ПОЖАР ДВИГАТЕЛЯ',key:'O',action:'Выключить тягу'},
      isolated:{title:'ПОЖАР · ТЯГА ОТКЛЮЧЕНА',key:'P',action:'Потушить пожар'},
      off:{title:'ДВИГАТЕЛЬ ВЫКЛЮЧЕН',key:'W ×2',action:'Дважды для запуска'},
      starting:{title:'ДВИГАТЕЛЬ ЗАПУСКАЕТСЯ'}},
    front:'РАКЕТА ВПЕРЕДИ',back:'РАКЕТА СЗАДИ',flares:'F · ловушки',ready:'Готовь манёвр',roll:'Q · бочка сейчас',turn:'Резкий вираж',seconds:'с',
    wing:'ПОТЕРЯ КРЫЛА', damage:'Попадание · Корпус',leftWing:'Левое крыло оторвано',rightWing:'Правое крыло оторвано' },
  en: { normal:'All clear',test:'Press a light to test',testLabel:'Test',on:'active',off:'off',
    terrain:'TERRAIN · PULL UP',altTitle:'Height above ground',altLabel:'ABOVE GROUND',metres:'m',rateUnit:'m/s',rateTitle:'Vertical speed',
    engineReady:'Engine running',fireOut:'Fire extinguished',cutFirst:'Cut thrust first · O',
    engine:{
      fire:{title:'ENGINE FIRE',key:'O',action:'Cut thrust'},
      isolated:{title:'ENGINE FIRE · THRUST OFF',key:'P',action:'Extinguish fire'},
      off:{title:'ENGINE OFF',key:'W ×2',action:'Double-tap to restart'},
      starting:{title:'ENGINE STARTING'}},
    front:'MISSILE AHEAD',back:'MISSILE BEHIND',flares:'F · flares',ready:'Prepare to turn',roll:'Q · roll now',turn:'Break turn',seconds:'s',
    wing:'WING LOST',damage:'Hit · Hull',leftWing:'Left wing lost',rightWing:'Right wing lost' }
};

export function warningClip(warning, language) {
  return './art/voice/' + (language === 'ru' ? 'ru/' : '') + warning.id + '.wav';
}

export function warningMask(game) {
  if(game.mode!=='live')return 0;
  return WARNINGS.reduce((mask,w)=>w.active(game)?mask|w.bit:mask,0);
}

export class WarningQueue {
  constructor(){this.reset();}
  reset(){
    this.previous=0;
    this.last=WARNINGS.map(()=>-Infinity);
    this.due=WARNINGS.map(()=>0);
  }
  interrupted(w,time){
    const i=WARNINGS.indexOf(w);
    this.due[i]=Math.min(this.due[i],time+w.rearm);
  }
  next(mask,time,playing) {
    for(const [i,w] of WARNINGS.entries()){
      if((mask&w.bit) && !(this.previous&w.bit))this.due[i]=Math.max(time,this.last[i]+w.rearm);
    }
    this.previous=mask;
    const limit=playing?WARNINGS.indexOf(playing):WARNINGS.length;
    for(let i=0;i<limit;i++){
      const w=WARNINGS[i];
      if(!(mask&w.bit) || time<this.due[i] || (playing&&!w.urgent))continue;
      this.last[i]=time;this.due[i]=time+w.repeat;
      return w;
    }
    return null;
  }
}
