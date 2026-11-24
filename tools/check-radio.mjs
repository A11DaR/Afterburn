import assert from 'node:assert/strict';
import {Radio} from '../dist/audio.js';
import {WARNINGS} from '../dist/warnings.js';

const voice=(name,lang,localService=true)=>({name,lang,localService,voiceURI:name,default:false});
const ru=voice('Microsoft Irina','ru-RU'),en=voice('Samantha (Enhanced)','en-US');
const remote=voice('Online Natural','ru-RU',false);
let voices=[remote,en,ru],spoken=[],played=[];
globalThis.window={
  speechSynthesis:{
    getVoices:()=>voices,
    speak(line){spoken.push(line);line.onstart();},
    cancel(){}
  },
  SpeechSynthesisUtterance:class {constructor(text){this.text=text;}}
};
const gain=()=>({gain:{setTargetAtTime(){}},connect(){},disconnect(){}});
const radio=new Radio(), pull=WARNINGS.find(w=>w.id==='pull-up');
radio.ctx={currentTime:0,createGain:gain,createBufferSource:()=>({
  connect(){},disconnect(){},start(){played.push(this);},stop(){}
})};
radio.output=gain();radio.effects=gain();radio.tone=()=>{};
radio.voiceBuffer=async w=>({id:w.id});
// Keep playback synchronous apart from the next event-loop turn.
const sample={...pull,notes:[]};
const tick=()=>new Promise(resolve=>setTimeout(resolve,30));
radio.announce(sample);await tick();
assert.equal(spoken[0].voice,ru);assert.equal(spoken[0].text,'Тяни вверх! Тяни вверх!');
radio.setLanguage('en');
spoken[0].onerror();assert.equal(played.length,0);
radio.announce(sample);await tick();
assert.equal(spoken[1].voice,en);assert.equal(spoken[1].text,'Pull up! Pull up!');
spoken[1].onerror();await tick();
assert.equal(played.length,1);assert.equal(played[0].buffer.id,'pull-up');
spoken[1].onend();assert.ok(radio.warning);
played[0].onended();assert.equal(radio.warning,null);
radio.announce(sample);await tick();
assert.equal(spoken.length,2);assert.equal(played.length,2);
radio.stopWarning();
radio.setLanguage('ru');voices=[remote,en];
radio.announce(sample);await tick();
assert.equal(spoken.length,2);assert.equal(played.length,3);
radio.stopWarning();
console.log('Russian and English voice choice, offline recordings and interrupted speech passed.');
