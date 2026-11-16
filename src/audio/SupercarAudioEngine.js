/**
 * Multi-Marque Procedural Web Audio Synthesizer for VELOCE PRIVÉ (Zero external MP3s).
 * Dynamically retunes for all 5 supercar powertrains:
 *   1. Red Spider — 4.5L Flat-Plane V8 (9,000 RPM, 1.5x fifth harmonic bark)
 *   2. Yellow Wedge — 5.2L Odd-Fire V10 (8,500 RPM, 1.25x fifth-order howl)
 *   3. White Track Car — 4.0L Twin-Turbo V8 (8,200 RPM, wastegate spool & aggressive overrun crackles)
 *   4. Silver Coupe / Turbo S — 4.0L Boxer-6 (9,000 RPM, 1.66x metallic boxer rasp)
 *   5. Blue Hypercar — 8.0L Quad-Turbo W16 (6,900 RPM, deep baritone 16-cylinder thunder + quad-turbo whistle)
 */
export class SupercarAudioEngine {
  constructor() {
    this.ctx = null;
    this.isArmed = false;
    this.isMuted = false;
    this.lastRpm = 0;
    this.lastArmedTimeMs = 0;
    this.lastGearIndex = -1;

    this.profile = {
      type: 'V8_FLAT',
      redlineRpm: 9000,
      idleRpm: 1050,
      baseFireFreq: 54.0,
      harmonicMultiplier: 1.5,
      exhaustCutoffBase: 260,
      exhaustCutoffSpan: 540,
      turboWhistle: 0.0,
      crackleIntensity: 0.72,
    };
  }

  setAudioProfile(profile) {
    if (!profile) return;
    this.profile = { ...this.profile, ...profile };
  }

  init() {
    const nowMs = performance.now();
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
        this.lastArmedTimeMs = nowMs;
      }
      this.isArmed = true;
      return;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.lastArmedTimeMs = nowMs;
    const ctx = this.ctx;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0.76;

    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -16;
    this.compressor.knee.value = 14;
    this.compressor.ratio.value = 5;
    this.compressor.attack.value = 0.004;
    this.compressor.release.value = 0.14;

    this.masterGain.connect(this.compressor);
    this.compressor.connect(ctx.destination);

    // 1. MULTI-BANK ENGINE OSCILLATORS & CABINET FILTERING
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.0;

    this.subBassBoost = ctx.createBiquadFilter();
    this.subBassBoost.type = 'lowshelf';
    this.subBassBoost.frequency.value = 140;
    this.subBassBoost.gain.value = 9.5;

    this.exhaustResonance = ctx.createBiquadFilter();
    this.exhaustResonance.type = 'peaking';
    this.exhaustResonance.frequency.value = 220;
    this.exhaustResonance.Q.value = 1.3;
    this.exhaustResonance.gain.value = 7.0;

    this.intakeFormant = ctx.createBiquadFilter();
    this.intakeFormant.type = 'peaking';
    this.intakeFormant.frequency.value = 720;
    this.intakeFormant.Q.value = 1.8;
    this.intakeFormant.gain.value = 5.0;

    this.warmthLowpass = ctx.createBiquadFilter();
    this.warmthLowpass.type = 'lowpass';
    this.warmthLowpass.frequency.value = 320;
    this.warmthLowpass.Q.value = 0.9;

    this.waveshaper = ctx.createWaveShaper();
    this.waveshaper.curve = this._createWarmTubeCurve(15);
    this.waveshaper.oversample = '2x';

    this.oscCrank = ctx.createOscillator();
    this.oscCrank.type = 'sine';

    this.oscBankLeft = ctx.createOscillator();
    this.oscBankLeft.type = 'triangle';

    this.oscBankRight = ctx.createOscillator();
    this.oscBankRight.type = 'sawtooth';

    this.oscHarmonic = ctx.createOscillator();
    this.oscHarmonic.type = 'triangle';

    // Turbocharger spool oscillator (for White Track Car, Silver Turbo, Blue W16)
    this.oscTurbo = ctx.createOscillator();
    this.oscTurbo.type = 'sine';
    this.gainTurbo = ctx.createGain();
    this.gainTurbo.gain.value = 0.0;

    this.gainCrank = ctx.createGain();
    this.gainCrank.gain.value = 0.52;
    this.gainBankLeft = ctx.createGain();
    this.gainBankLeft.gain.value = 0.42;
    this.gainBankRight = ctx.createGain();
    this.gainBankRight.gain.value = 0.25;
    this.gainHarmonic = ctx.createGain();
    this.gainHarmonic.gain.value = 0.18;

    this.oscCrank.connect(this.gainCrank);
    this.oscBankLeft.connect(this.gainBankLeft);
    this.oscBankRight.connect(this.gainBankRight);
    this.oscHarmonic.connect(this.gainHarmonic);
    this.oscTurbo.connect(this.gainTurbo);

    this.gainCrank.connect(this.waveshaper);
    this.gainBankLeft.connect(this.waveshaper);
    this.gainBankRight.connect(this.waveshaper);
    this.gainHarmonic.connect(this.waveshaper);
    this.gainTurbo.connect(this.engineGain);

    // Brown-Noise Cylinder Combustion Layer
    this.noiseBuffer = this._createBrownPinkNoiseBuffer();
    this.combustionNoise = ctx.createBufferSource();
    this.combustionNoise.buffer = this.noiseBuffer;
    this.combustionNoise.loop = true;

    this.combustionBandpass = ctx.createBiquadFilter();
    this.combustionBandpass.type = 'bandpass';
    this.combustionBandpass.frequency.value = 180;
    this.combustionBandpass.Q.value = 0.9;

    this.combustionGain = ctx.createGain();
    this.combustionGain.gain.value = 0.52;

    this.combustionNoise.connect(this.combustionBandpass);
    this.combustionBandpass.connect(this.combustionGain);
    this.combustionGain.connect(this.waveshaper);

    this.waveshaper.connect(this.subBassBoost);
    this.subBassBoost.connect(this.exhaustResonance);
    this.exhaustResonance.connect(this.intakeFormant);
    this.intakeFormant.connect(this.warmthLowpass);
    this.warmthLowpass.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);

    this.oscCrank.start();
    this.oscBankLeft.start();
    this.oscBankRight.start();
    this.oscHarmonic.start();
    this.oscTurbo.start();
    this.combustionNoise.start();

    // 2. LASER SCAN HARMONIC SWELL (During Fleet Switching)
    this.scanGain = ctx.createGain();
    this.scanGain.gain.value = 0.0;

    this.scanSubOsc = ctx.createOscillator();
    this.scanSubOsc.type = 'sine';
    this.scanSubOsc.frequency.value = 72;

    this.scanWarmOsc = ctx.createOscillator();
    this.scanWarmOsc.type = 'triangle';
    this.scanWarmOsc.frequency.value = 144;

    this.scanLowpass = ctx.createBiquadFilter();
    this.scanLowpass.type = 'lowpass';
    this.scanLowpass.frequency.value = 320;

    this.scanSubOsc.connect(this.scanLowpass);
    this.scanWarmOsc.connect(this.scanLowpass);
    this.scanLowpass.connect(this.scanGain);
    this.scanGain.connect(this.masterGain);

    this.scanSubOsc.start();
    this.scanWarmOsc.start();

    this.isArmed = true;
  }

  ensureUnlocked() {
    if (!this.isArmed) {
      this.init();
    } else if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
      this.lastArmedTimeMs = performance.now();
    }
  }

  _createWarmTubeCurve(amount = 14) {
    const n = 44100;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = Math.tanh(x * (amount * 0.18));
    }
    return curve;
  }

  _createBrownPinkNoiseBuffer() {
    const ctx = this.ctx;
    const bufferSize = ctx.sampleRate * 3;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.06 * white) / 1.06;
      data[i] = lastOut * 2.8;
    }
    return buffer;
  }

  toggleMute() {
    const nowMs = performance.now();
    if (!this.isArmed) {
      this.init();
      this.isMuted = false;
      return false;
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
      this.isMuted = false;
      if (this.masterGain) {
        this.masterGain.gain.setTargetAtTime(0.76, this.ctx.currentTime, 0.04);
      }
      return false;
    }
    if (nowMs - this.lastArmedTimeMs < 350 && !this.isMuted) {
      return false;
    }

    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        this.isMuted ? 0.0 : 0.76,
        this.ctx.currentTime,
        0.05
      );
    }
    return this.isMuted;
  }

  triggerExhaustBurble(intensity = 0.7) {
    if (!this.isArmed || this.isMuted || !this.ctx || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(110 + Math.random() * 90, now);
    filter.Q.value = 1.5;

    const g = this.ctx.createGain();
    const peak = Math.min(0.32, 0.16 * intensity * (this.profile.crackleIntensity || 0.75));
    g.gain.setValueAtTime(peak, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    src.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain);
    src.start(now, Math.random() * 2.0, 0.095);
  }

  update(
    dt,
    {
      rpm = 0,
      throttle = 0,
      gear = 1,
      speedKmh = 0,
      isScanning = false,
      scanProgress = 0,
      elapsedTime = 0,
    }
  ) {
    if (!this.isArmed) {
      this.init();
    }
    if (this.isMuted || !this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    const now = this.ctx.currentTime;
    const prof = this.profile;

    if (speedKmh > 40) {
      if (gear !== this.lastGearIndex && this.lastGearIndex !== -1) {
        this.triggerExhaustBurble(0.95);
      }
      this.lastGearIndex = gear;
    } else {
      this.lastGearIndex = -1;
    }

    const activeEngine = rpm > 80 ? 1.0 : 0.0;
    const rpmClamped = Math.max(800, rpm);
    const rpmNorm = Math.min(1.0, rpmClamped / (prof.redlineRpm || 9000));

    const fFire =
      (prof.baseFireFreq || 52.0) + Math.pow(rpmNorm, 0.86) * 185.0;
    const firingPulse =
      1.0 +
      Math.sin(elapsedTime * 54.0) * 0.013 +
      Math.cos(elapsedTime * 89.0) * 0.009 * (0.4 + throttle * 0.6);

    this.oscCrank.frequency.setTargetAtTime(fFire * 0.5 * firingPulse, now, 0.022);
    this.oscBankLeft.frequency.setTargetAtTime(fFire * firingPulse, now, 0.022);
    this.oscBankRight.frequency.setTargetAtTime(
      fFire * 1.008 * firingPulse,
      now,
      0.022
    );
    this.oscHarmonic.frequency.setTargetAtTime(
      fFire * (prof.harmonicMultiplier || 1.5) * firingPulse,
      now,
      0.022
    );

    // Subtle turbocharger spool whistle for Twin-Turbo / Quad-Turbo models
    const turboLevel = prof.turboWhistle || 0.0;
    this.oscTurbo.frequency.setTargetAtTime(
      520 + rpmNorm * 1150 + throttle * 260,
      now,
      0.04
    );
    this.gainTurbo.gain.setTargetAtTime(
      activeEngine * turboLevel * (0.012 + throttle * 0.032) * rpmNorm,
      now,
      0.04
    );

    this.combustionBandpass.frequency.setTargetAtTime(
      115 + Math.pow(rpmNorm, 0.9) * 280,
      now,
      0.03
    );
    this.combustionGain.gain.setTargetAtTime(
      0.46 + throttle * 0.28 + (speedKmh / 320.0) * 0.16,
      now,
      0.035
    );

    const cutoff =
      (prof.exhaustCutoffBase || 240) +
      Math.pow(rpmNorm, 1.15) * (prof.exhaustCutoffSpan || 500) +
      throttle * 220;
    this.warmthLowpass.frequency.setTargetAtTime(cutoff, now, 0.03);
    this.exhaustResonance.frequency.setTargetAtTime(
      180 + rpmNorm * 105,
      now,
      0.035
    );
    this.intakeFormant.frequency.setTargetAtTime(
      380 + rpmNorm * 440,
      now,
      0.035
    );

    // Keep idle purr understated in showroom mode unless user is revving or driving on the Midnight Highway
    const isIdleShowroom = throttle < 0.05 && speedKmh < 10;
    const basePresence = isIdleShowroom ? 0.055 : 0.16;
    const targetEngineGain =
      activeEngine * (basePresence + rpmNorm * 0.24 + throttle * 0.28);
    this.engineGain.gain.setTargetAtTime(targetEngineGain, now, 0.045);

    const dRpm = (rpm - this.lastRpm) / Math.max(dt, 0.008);
    if (dRpm < -3200 && rpm > 2200 && Math.random() < 0.58) {
      this.triggerExhaustBurble(rpmNorm);
    }
    this.lastRpm = rpm;

    // Laser Gantry Harmonic Swell when switching cars
    const scanTargetGain = isScanning ? 0.22 : 0.0;
    this.scanGain.gain.setTargetAtTime(scanTargetGain, now, 0.06);
    if (isScanning) {
      const baseFreq = 70 + Math.sin(scanProgress * Math.PI) * 32;
      this.scanSubOsc.frequency.setTargetAtTime(baseFreq, now, 0.05);
      this.scanWarmOsc.frequency.setTargetAtTime(baseFreq * 2.0, now, 0.05);
      this.scanLowpass.frequency.setTargetAtTime(
        260 + Math.sin(scanProgress * Math.PI) * 240,
        now,
        0.05
      );
    }
  }
}
