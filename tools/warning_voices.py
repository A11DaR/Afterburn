"""Render the offline AFTERBURN cockpit warnings.

    python tools/warning_voices.py --language all --rhvoice RHVoice-test

Install NumPy, SciPy, CMU Flite 2.2 (libflite and its US SLT voice), and
RHVoice with the Russian Elena voice. The reference Russian voice and engine
are from RHVoice/RHVoice commit cbc87267cb7597e61d36c9cf1962546b6593821e,
24 kHz Elena format 2, revision 0. Set `stress_marker=+` and `hts_engine=mage`
in the RHVoice configuration when reproducing those renders. The plus signs
below are pronunciation markup. No synthesizer, model or network is needed
at game time. CMU SLT and Elena are recording-derived statistical voices.
"""
import argparse
import ctypes as ct
from ctypes.util import find_library
from math import gcd
from pathlib import Path
import shutil
import subprocess
import tempfile
from xml.sax.saxutils import escape

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, resample_poly, sosfilt


RATE = 22050
OUTPUT = Path(__file__).resolve().parents[1] / 'dist' / 'art' / 'voice'
# ID, English utterance and count, stress-marked Russian utterance and count.
CALLS = [
    ('pull-up', 'Pull up!', 2, 'Тян+и вв+ерх!', 2),
    ('over-g', 'Over G!', 2, 'Перегр+узка!', 1),
    ('roll-left', 'Roll left!', 1, 'Кр+ен вл+ево!', 1),
    ('roll-right', 'Roll right!', 1, 'Кр+ен впр+аво!', 1),
    ('missile', 'Missile!', 2, 'Рак+ета!', 2),
    ('engine', 'Fire in engine!', 2, 'Пож+ар дв+игателя!', 1),
    ('stall', 'Stall!', 2, 'Св+аливание!', 1),
    ('sink', 'Sink rate!', 2, 'Сл+ишком б+ыстрое сниж+ение!', 1),
    ('bank-angle', 'Bank angle!', 1, 'Больш+ой кр+ен!', 1),
    ('low-altitude', 'Low altitude!', 1, 'Высот+а оп+асная!', 1),
    ('six', 'Check six!', 1, 'Пров+ерь хв+ост!', 1),
    ('hull', 'Hull critical!', 1, 'К+орпус поврежд+ён!', 1),
    ('aoa', 'A. O. A.!', 2, 'Крит+ический +угол ат+аки!', 1),
    ('speed', 'Low airspeed!', 1, 'М+алая ск+орость!', 1),
    ('overspeed', 'Overspeed!', 1, 'Превыш+ение ск+орости!', 1),
    ('flares', 'Flares empty!', 1, 'Н+ет лов+ушек!', 1),
    ('rockets', 'Missiles empty!', 1, 'Н+ет рак+ет!', 1),
    ('ammo', 'Gun ammo low!', 1, 'М+ало патр+онов!', 1),
]
URGENT = {'pull-up', 'over-g', 'roll-left', 'roll-right', 'missile', 'engine', 'stall'}


class FliteVoice(ct.Structure):
    # The first two fields of the public cst_voice structure in cst_voice.h.
    _fields_ = [('name', ct.c_char_p), ('features', ct.c_void_p)]


def load_english():
    flite = ct.CDLL(find_library('flite') or 'libflite.so.1')
    slt = ct.CDLL(find_library('flite_cmu_us_slt') or 'libflite_cmu_us_slt.so.1')
    voice_type = ct.POINTER(FliteVoice)
    flite.flite_init()
    slt.register_cmu_us_slt.argtypes = [ct.c_char_p]
    slt.register_cmu_us_slt.restype = voice_type
    voice = slt.register_cmu_us_slt(b'')
    flite.flite_feat_set_float.argtypes = [ct.c_void_p, ct.c_char_p, ct.c_float]
    flite.flite_feat_set_float.restype = None
    flite.flite_ssml_text_to_speech.argtypes = [ct.c_char_p, voice_type, ct.c_char_p]
    flite.flite_ssml_text_to_speech.restype = ct.c_float
    return flite, voice


def render_english(engine, path, name, phrase, take):
    flite, voice = engine
    # The second delivery settles slightly lower and gives the stressed vowel
    # a little more time. These are native acoustic model controls.
    urgent = name in URGENT
    values = {
        'int_f0_target_mean': (196 if urgent else 188) - 7 * take,
        'int_f0_target_stddev': 23 if urgent else 20,
        'duration_stretch': (0.96 if urgent else 1.02) + 0.055 * take,
    }
    for key, value in values.items():
        flite.flite_feat_set_float(voice.contents.features, key.encode(), value)
    if name == 'aoa':
        words = '<phoneme ph="ey1">A</phoneme> <phoneme ph="ow1">O</phoneme> <phoneme ph="ey1">A</phoneme>!'
    elif name == 'over-g':
        words = 'Over <phoneme ph="jh iy1">G</phoneme>!'
    elif name == 'overspeed':
        words = 'Over speed!'
    else:
        words = escape(phrase)
    if flite.flite_ssml_text_to_speech(words.encode(), voice, str(path).encode()) <= 0:
        raise ValueError(f'Flite could not render {name}')


def render_russian(executable, path, name, phrase, take):
    speed = (100 if name in URGENT else 97) - 4 * take
    pitch = 102 if name in URGENT and take == 0 else 98
    ssml = f'<speak><prosody rate="{speed}%" pitch="{pitch}%">{escape(phrase)}</prosody></speak>'
    subprocess.run([executable, '-s', '-p', 'Elena', '-o', str(path)],
                   input=ssml.encode(), check=True)


def clean_take(path):
    rate, pcm = wavfile.read(path)
    if pcm.ndim != 1 or pcm.dtype != np.int16:
        raise ValueError(f'Expected mono PCM16 from {path.name}')
    audio = pcm.astype(np.float64) / 32768
    if rate != RATE:
        divisor = gcd(rate, RATE)
        audio = resample_poly(audio, RATE // divisor, rate // divisor)
    audio = sosfilt(butter(2, 70, 'highpass', fs=RATE, output='sos'), audio)
    window = round(0.006 * RATE)
    power = np.convolve(audio * audio, np.ones(window) / window, mode='same')
    if power.max(initial=0) < 1e-6:
        raise ValueError(f'Silent audio in {path.name}')
    sounding = np.flatnonzero(power > power.max() * 0.0002)
    start = max(0, sounding[0] - round(0.019 * RATE))
    end = min(len(audio), sounding[-1] + round(0.045 * RATE))
    audio = audio[start:end].copy()
    fade = min(round(0.004 * RATE), len(audio) // 2)
    audio[:fade] *= np.linspace(0, 1, fade)
    audio[-fade:] *= np.linspace(1, 0, fade)
    return audio


def write_warning(path, takes, pause):
    parts = [takes[0]]
    for take in takes[1:]:
        parts.extend([np.zeros(round(pause * RATE)), take])
    audio = np.concatenate(parts)
    block = round(0.020 * RATE)
    frames = np.pad(audio, (0, -len(audio) % block)).reshape(-1, block)
    power = np.mean(frames ** 2, axis=1)
    active = power > power.max() * 0.0063
    gain = min(0.165 / np.sqrt(power[active].mean()), 0.87 / np.max(np.abs(audio)))
    wavfile.write(path, RATE, np.rint(audio * gain * 32767).astype('<i2'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--language', choices=('en', 'ru', 'all'), default='all')
    parser.add_argument('--rhvoice', default=shutil.which('RHVoice-test'))
    parser.add_argument('--output', type=Path, default=OUTPUT)
    args = parser.parse_args()
    if args.language in ('ru', 'all') and not args.rhvoice:
        parser.error('Install RHVoice-test with Elena or pass --rhvoice PATH.')
    english = load_english() if args.language in ('en', 'all') else None
    languages = ('en', 'ru') if args.language == 'all' else (args.language,)
    with tempfile.TemporaryDirectory() as temp:
        for language in languages:
            output = args.output / 'ru' if language == 'ru' else args.output
            output.mkdir(parents=True, exist_ok=True)
            for name, en, en_count, ru, ru_count in CALLS:
                phrase, count = (ru, ru_count) if language == 'ru' else (en, en_count)
                takes = []
                for index in range(count):
                    path = Path(temp) / f'{language}-{name}-{index}.wav'
                    if language == 'ru':
                        render_russian(args.rhvoice, path, name, phrase, index)
                    else:
                        render_english(english, path, name, phrase, index)
                    takes.append(clean_take(path))
                write_warning(output / (name + '.wav'), takes, 0.20 if name == 'missile' else 0.25)
                print(f'{language} {name}  {" ".join([phrase.replace("+", "")] * count)}')


if __name__ == '__main__':
    main()
