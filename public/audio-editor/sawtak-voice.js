/*
 * Sawtak voice polish — the editor's «تحسين احترافي» preset.
 *
 * One pass of the chain a voice-over engineer runs on a narration, in the
 * usual order:
 *
 *   1. high-pass 75 Hz      rumble and handling noise nobody hears as voice
 *   2. noise reduction      RNNoise (AudioMass's own wasm), latency-compensated
 *   4. tone EQ              depth/warmth low, less mud, presence, air
 *   5. de-esser             tames the "s"/"sh" the presence boost sharpens
 *   6. compression          3:1, evens out loud and soft syllables
 *   7. loudness             -19 LUFS integrated (the mono voice norm; -16 is stereo)
 *   8. peak limiter         -1.5 dBFS ceiling, look-ahead, never clips
 *
 * Before all of it, the breath & silence gate (step 0): it erases what is
 * under the user's threshold as measured on the audio *as it is shown* —
 * the peak level, which is what the editor's dB axis reads — so a number
 * read off the axis means the same thing to the gate.
 *
 * Pure JavaScript over Float32Arrays — no AudioContext — so it runs the same
 * in the editor and in Node (where it is tested), at any sample rate.
 * Dynamics (de-esser, compressor, limiter, gate) are detected on the mono
 * mix and applied to every channel alike, so a stereo image never shifts.
 *
 * `process(channels, rate, options, hooks)` modifies `channels` in place and
 * returns a report. `hooks.denoise(f32, rate)` supplies noise reduction; with
 * none, that step is skipped.
 */
(function (root, factory) {
	var api = factory ();
	if (typeof module === 'object' && module.exports) module.exports = api;
	else root.SawtakVoice = api;
}) (typeof self !== 'undefined' ? self : this, function () {
	'use strict';

	// Tone curves. «عميق» is what a warm, close-mic'd narrator sounds like;
	// «واضح» keeps less low end and more presence, for fast or dense speech.
	var PRESETS = {
		deep: [
			{ type: 'peaking', freq: 110, q: 0.8, gain: 2.5 },   // depth / chest
			{ type: 'peaking', freq: 300, q: 1.0, gain: -2.5 },  // mud, boxiness
			{ type: 'peaking', freq: 3200, q: 0.9, gain: 2 },    // presence
			{ type: 'highshelf', freq: 9000, q: 0.707, gain: 1.5 } // air
		],
		clear: [
			{ type: 'peaking', freq: 120, q: 0.8, gain: 1.5 },
			{ type: 'peaking', freq: 300, q: 1.0, gain: -2.5 },
			{ type: 'peaking', freq: 3500, q: 0.9, gain: 3 },
			{ type: 'highshelf', freq: 9000, q: 0.707, gain: 2.5 }
		]
	};

	var DEFAULTS = {
		preset: 'deep',
		denoise: true,
		breaths: true,
		tone: true,
		deess: true,
		compress: true,
		loudness: true,
		targetLufs: -19,
		ceilingDb: -1.5,
		// dBFS peak on the audio as loaded — read it off the editor's dB axis.
		gateThresholdDb: -40,
		// Breath detection above the threshold; off, because ح / ه read as breaths.
		removeBreaths: false,
		// A little of the dry signal keeps RNNoise from sounding processed.
		denoiseMix: 0.9
	};

	// ---- helpers ---------------------------------------------------------------

	function db (v) { return v > 0 ? 20 * Math.log10 (v) : -150; }
	function powDb (p) { return p > 0 ? 10 * Math.log10 (p) : -150; }
	function fromDb (d) { return Math.pow (10, d / 20); }
	/** One-pole smoothing coefficient for a time constant in ms. */
	function coef (ms, rate) { return Math.exp (-1 / (Math.max (ms, 0.01) * 0.001 * rate)); }

	/** RBJ audio-EQ-cookbook biquad, normalised. `freq` is clamped below Nyquist. */
	function biquad (type, freq, rate, q, gainDb) {
		var f = Math.min (freq, rate * 0.45);
		var w0 = 2 * Math.PI * f / rate;
		var cs = Math.cos (w0), sn = Math.sin (w0);
		var alpha = sn / (2 * (q || 0.7071));
		var A = Math.pow (10, (gainDb || 0) / 40);
		var sa = 2 * Math.sqrt (A) * alpha;
		var b0, b1, b2, a0, a1, a2;
		switch (type) {
			case 'highpass':
				b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2;
				a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha; break;
			case 'lowpass':
				b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2;
				a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha; break;
			case 'peaking':
				b0 = 1 + alpha * A; b1 = -2 * cs; b2 = 1 - alpha * A;
				a0 = 1 + alpha / A; a1 = -2 * cs; a2 = 1 - alpha / A; break;
			case 'highshelf':
				b0 = A * ((A + 1) + (A - 1) * cs + sa);
				b1 = -2 * A * ((A - 1) + (A + 1) * cs);
				b2 = A * ((A + 1) + (A - 1) * cs - sa);
				a0 = (A + 1) - (A - 1) * cs + sa;
				a1 = 2 * ((A - 1) - (A + 1) * cs);
				a2 = (A + 1) - (A - 1) * cs - sa; break;
			default: throw new Error ('unknown filter ' + type);
		}
		return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
	}

	/** Transposed direct form II, in place. */
	function run (x, c) {
		var z1 = 0, z2 = 0;
		for (var i = 0, n = x.length; i < n; ++i) {
			var xi = x[i];
			var y = c.b0 * xi + z1;
			z1 = c.b1 * xi - c.a1 * y + z2;
			z2 = c.b2 * xi - c.a2 * y;
			x[i] = y;
		}
		return x;
	}

	function reverse (x) { Array.prototype.reverse.call (x); return x; }

	/** Zero-phase (forward-backward) filtering, so a band split recombines cleanly. */
	function runZeroPhase (x, c) { return reverse (run (reverse (run (x, c)), c)); }

	function mono (chs) {
		if (chs.length === 1) return Float32Array.from (chs[0]);
		var n = chs[0].length, out = new Float32Array (n);
		for (var c = 0; c < chs.length; ++c) {
			var x = chs[c];
			for (var i = 0; i < n; ++i) out[i] += x[i];
		}
		for (var j = 0; j < n; ++j) out[j] /= chs.length;
		return out;
	}

	function applyGains (chs, g) {
		for (var c = 0; c < chs.length; ++c) {
			var x = chs[c];
			for (var i = 0, n = x.length; i < n; ++i) x[i] *= g[i];
		}
	}

	function scale (chs, gain) {
		for (var c = 0; c < chs.length; ++c) {
			var x = chs[c];
			for (var i = 0, n = x.length; i < n; ++i) x[i] *= gain;
		}
	}

	function percentile (values, p) {
		if (!values.length) return -150;
		var s = values.slice ().sort (function (a, b) { return a - b; });
		return s[Math.min (s.length - 1, Math.max (0, Math.round (p * (s.length - 1))))];
	}

	function peakDb (chs) {
		var m = 0;
		for (var c = 0; c < chs.length; ++c) {
			var x = chs[c];
			for (var i = 0, n = x.length; i < n; ++i) { var a = Math.abs (x[i]); if (a > m) m = a; }
		}
		return db (m);
	}

	// ---- loudness (ITU-R BS.1770 integrated, gated) ---------------------------------

	function integratedLufs (chs, rate) {
		var n = chs[0].length;
		if (!n) return -Infinity;
		var shelf = biquad ('highshelf', 1681.974450955533, rate, 0.7071752369554196, 3.999843853973347);
		var hp = biquad ('highpass', 38.13547087602444, rate, 0.5003270373238773);
		var cum = new Float64Array (n + 1);
		for (var c = 0; c < chs.length; ++c) {
			var k = run (run (Float32Array.from (chs[c]), shelf), hp);
			var acc = 0;
			for (var i = 0; i < n; ++i) { acc += k[i] * k[i]; cum[i + 1] += acc; }
		}
		var block = Math.min (n, Math.round (0.4 * rate)), hop = Math.max (1, Math.round (0.1 * rate));
		var loud = function (e) { return -0.691 + 10 * Math.log10 (e); };
		var energies = [];
		for (var s = 0; s + block <= n; s += hop) energies.push ((cum[s + block] - cum[s]) / block);
		var absGated = energies.filter (function (e) { return e > 0 && loud (e) > -70; });
		if (!absGated.length) return -Infinity;
		var mean = absGated.reduce (function (a, b) { return a + b; }, 0) / absGated.length;
		var rel = loud (mean) - 10;
		var gated = absGated.filter (function (e) { return loud (e) > rel; });
		return loud (gated.reduce (function (a, b) { return a + b; }, 0) / gated.length);
	}

	// ---- 2. noise reduction ---------------------------------------------------------

	/**
	 * RNNoise delays its output by exactly one 10 ms frame (measured: 240, 441
	 * and 480 samples at 24, 44.1 and 48 kHz), so each block is padded by that
	 * much and read back shifted — without it, the dry/wet mix would comb-filter.
	 * Long files go in 30 s blocks with a 0.5 s crossfade, which bounds the wasm
	 * heap and hides RNNoise's warm-up at each block start.
	 */
	function denoise (chs, rate, fn, mix) {
		var D = Math.round (rate / 100);
		var chunk = Math.round (rate * 30), ov = Math.round (rate * 0.5), step = chunk - ov;
		for (var c = 0; c < chs.length; ++c) {
			var x = chs[c], n = x.length, out = new Float32Array (n);
			for (var s = 0; s < n; s += step) {
				var len = Math.min (chunk, n - s);
				var input = new Float32Array (len + D);
				input.set (x.subarray (s, s + len));
				var y = fn (input, rate);
				for (var k = 0; k < len; ++k) {
					var v = y[k + D];
					if (s > 0 && k < ov) {
						var w = k / ov;
						out[s + k] = out[s + k] * (1 - w) + v * w;
					} else out[s + k] = v;
				}
				if (s + len >= n) break;
			}
			for (var i = 0; i < n; ++i) x[i] = x[i] * (1 - mix) + out[i] * mix;
		}
	}

	// ---- speech map ----------------------------------------------------------------

	/**
	 * Per 10 ms frame: peak level (dBFS over a 30 ms window — the height the
	 * waveform draws, so it matches the editor's dB axis), whether it is voiced (a pitch
	 * in 60–400 Hz by normalised autocorrelation on an ~8 kHz copy), and how
	 * much of its energy sits above 3 kHz. Voicing — not level — is what tells
	 * a word from a breath: an inhale can be as loud as a soft syllable, but it
	 * has no pitch.
	 *
	 * Measured on VoiceTut output: breaths sit ~33 dB under the voice, last
	 * 250–600 ms, peak at a pitch correlation of ~0.55 and put 4.5–7 dB less
	 * energy above 3 kHz than below; /s/ /sh/ /f/ are within ~3.5 dB. Hence a
	 * voiced cut of 0.65 held for 30 ms, and the -3.5 dB high-band test.
	 */
	function speechMap (side, rate) {
		var n = side.length;
		var hop = Math.max (1, Math.round (rate * 0.01));
		var half = Math.round (rate * 0.015);
		var frames = Math.floor (n / hop);
		if (frames < 20) return null;

		var hpC = biquad ('highpass', 3000, rate, 0.7071);
		var hf = run (run (Float32Array.from (side), hpC), hpC);
		var cum = new Float64Array (n + 1), cumH = new Float64Array (n + 1);
		for (var i = 0; i < n; ++i) {
			cum[i + 1] = cum[i] + side[i] * side[i];
			cumH[i + 1] = cumH[i] + hf[i] * hf[i];
		}
		var lev = new Float32Array (frames), hfr = new Float32Array (frames);
		for (var f = 0; f < frames; ++f) {
			var c0 = f * hop + (hop >> 1);
			var a = Math.max (0, c0 - half), b = Math.min (n, c0 + half), e = cum[b] - cum[a];
			var pk = 0;
			for (var q = a; q < b; ++q) { var av = side[q] < 0 ? -side[q] : side[q]; if (av > pk) pk = av; }
			lev[f] = db (pk);
			hfr[f] = e > 0 ? powDb ((cumH[b] - cumH[a]) / e) : -150;
		}

		var dec = Math.max (1, Math.floor (rate / 8000)), r8 = rate / dec;
		var lp = Float32Array.from (side);
		var aa = biquad ('lowpass', Math.min (3400, r8 * 0.42), rate, 0.7071);
		run (run (lp, aa), aa);
		var m = Math.floor (n / dec), d = new Float32Array (m);
		for (var j = 0; j < m; ++j) d[j] = lp[j * dec];
		var W = Math.round (r8 * 0.04), lagMin = Math.floor (r8 / 400), lagMax = Math.ceil (r8 / 60);
		var floorDb = percentile (Array.prototype.slice.call (lev), 0.1);

		var pitched = new Uint8Array (frames);
		for (f = 0; f < frames; ++f) {
			if (lev[f] < floorDb + 10) continue;
			var start = Math.round ((f * hop + (hop >> 1)) / dec) - (W >> 1);
			if (start < 0 || start + W + lagMax >= m) continue;
			var e0 = 0;
			for (var t = 0; t < W; ++t) e0 += d[start + t] * d[start + t];
			if (e0 <= 0) continue;
			var best = 0;
			for (var lag = lagMin; lag <= lagMax; ++lag) {
				var num = 0, e1 = 0;
				for (t = 0; t < W; ++t) {
					var u = d[start + t + lag];
					num += d[start + t] * u;
					e1 += u * u;
				}
				var r = e1 > 0 ? num / Math.sqrt (e0 * e1) : 0;
				if (r > best) best = r;
			}
			if (best > 0.65) pitched[f] = 1;
		}
		// A voiced stretch shorter than 30 ms is a flicker inside a breath, not a vowel.
		var voiced = new Uint8Array (frames);
		for (f = 0; f < frames;) {
			if (!pitched[f]) { ++f; continue; }
			var g = f;
			while (g < frames && pitched[g]) ++g;
			if (g - f >= 3) for (var k = f; k < g; ++k) voiced[k] = 1;
			f = g;
		}

		var voicedLev = [];
		for (f = 0; f < frames; ++f) if (voiced[f]) voicedLev.push (lev[f]);
		if (voicedLev.length < 10) return null;

		var since = new Int32Array (frames), until = new Int32Array (frames);
		var last = -1e6;
		for (f = 0; f < frames; ++f) { if (voiced[f]) last = f; since[f] = f - last; }
		var next = 1e6;
		for (f = frames - 1; f >= 0; --f) { if (voiced[f]) next = f; until[f] = next - f; }

		return {
			hop: hop, frames: frames, lev: lev, hfr: hfr, voiced: voiced,
			since: since, until: until, speechDb: percentile (voicedLev, 0.9)
		};
	}

	// ---- 9. breath & silence gate ---------------------------------------------------

	/**
	 * Which 10 ms frames the gate keeps (1) or erases (0), from a `speechMap`
	 * of the finished audio. Split from the gain curve so the editor can
	 * preview the decision for any threshold without re-processing.
	 *
	 * Erased: frames whose peak is under `thresholdDb` (dBFS — the level the
	 * editor's dB axis shows). With `removeBreaths`, also breath-like frames above it: inside a
	 * long unvoiced run, little energy above 3 kHz, 12 dB+ under the voice.
	 * That test cannot tell a breath from ح / ه — they are the same sound — so
	 * it is opt-in.
	 *
	 * Never erased, because cutting them is what clips letters: voiced frames;
	 * gaps inside a phrase (voiced on both sides within 300 ms — geminates and
	 * stop closures run 100–200 ms); the 100 ms after a word (its tail) and the
	 * 50 ms before one (its attack).
	 */
	function gateOpen (map, thresholdDb, removeBreaths) {
		var F = map.frames, open = new Uint8Array (F);
		var longRun = new Uint8Array (F);
		for (var f = 0; f < F;) {
			if (map.voiced[f]) { ++f; continue; }
			var g = f;
			while (g < F && !map.voiced[g]) ++g;
			if (g - f >= 12) for (var k = f; k < g; ++k) longRun[k] = 1;
			f = g;
		}
		for (f = 0; f < F; ++f) {
			var s = map.since[f], u = map.until[f];
			var protectedFrame = map.voiced[f] || s + u <= 30 || s <= 10 || u <= 5;
			var breathy = false;
			if (removeBreaths && longRun[f]) {
				// High band smoothed over 30 ms, judged per frame: judging the
				// whole run erased the /s/ at its edge with the pause before it.
				var hf = (map.hfr[Math.max (0, f - 1)] + map.hfr[f] + map.hfr[Math.min (F - 1, f + 1)]) / 3;
				breathy = hf < -3.5 && map.lev[f] < map.speechDb - 12;
			}
			open[f] = protectedFrame || (map.lev[f] >= thresholdDb && !breathy) ? 1 : 0;
		}
		return open;
	}

	/**
	 * Per-sample gain for a frame decision: opens with a ~1 ms ramp that ends
	 * where the sound begins, closes over ~6 ms, and settles to true silence.
	 */
	function gateGains (open, hop, n, rate) {
		var F = open.length, gain = new Float32Array (n);
		for (var i = 0; i < n; ++i) gain[i] = open[Math.min (F - 1, Math.floor (i / hop))];
		var rel = coef (6, rate), att = coef (1, rate);
		for (i = 1; i < n; ++i) if (gain[i] < gain[i - 1]) gain[i] = rel * gain[i - 1] + (1 - rel) * gain[i];
		for (i = n - 2; i >= 0; --i) if (gain[i] < gain[i + 1]) gain[i] = att * gain[i + 1] + (1 - att) * gain[i];
		for (i = 0; i < n; ++i) if (gain[i] < 0.001) gain[i] = 0;
		return gain;
	}

	function gate (chs, rate, thresholdDb, removeBreaths) {
		var map = speechMap (mono (chs), rate);
		if (!map) return null;
		var open = gateOpen (map, thresholdDb, removeBreaths);
		applyGains (chs, gateGains (open, map.hop, chs[0].length, rate));
		var erased = 0;
		for (var f = 0; f < open.length; ++f) if (!open[f]) ++erased;
		return { erasedSeconds: erased * map.hop / rate };
	}

	// ---- 5. de-esser --------------------------------------------------------------------

	/**
	 * Split-band: where the top band (above ~4.5 kHz) carries most of the energy
	 * and is loud, fade toward a zero-phase low-passed copy — at most 4 dB, with
	 * 1 ms attack and 40 ms release. Only loud sibilants are touched.
	 */
	function deess (chs, rate, speechRefDb) {
		if (rate < 16000) return 0;
		var fc = Math.min (4500, rate * 0.3);
		var side = mono (chs);
		var hp = biquad ('highpass', fc, rate, 0.7071);
		var sib = run (run (Float32Array.from (side), hp), hp);
		var n = side.length, aA = coef (1, rate), rA = coef (40, rate);
		var eS = 0, eF = 0, gr = 0, g = new Float32Array (n), active = 0;
		for (var i = 0; i < n; ++i) {
			var ps = sib[i] * sib[i], pf = side[i] * side[i];
			eS = ps > eS ? aA * eS + (1 - aA) * ps : rA * eS + (1 - rA) * ps;
			eF = pf > eF ? aA * eF + (1 - aA) * pf : rA * eF + (1 - rA) * pf;
			var sDb = powDb (eS), ratioDb = sDb - powDb (eF);
			var want = sDb > speechRefDb - 25 ? Math.min (4, Math.max (0, (ratioDb + 12) * 0.4)) : 0;
			gr = want > gr ? aA * gr + (1 - aA) * want : rA * gr + (1 - rA) * want;
			g[i] = fromDb (-gr);
			if (gr > 1) ++active;
		}
		var lp = biquad ('lowpass', fc, rate, 0.7071);
		for (var c = 0; c < chs.length; ++c) {
			var x = chs[c], low = runZeroPhase (Float32Array.from (x), lp);
			for (i = 0; i < n; ++i) x[i] = g[i] * x[i] + (1 - g[i]) * low[i];
		}
		return active / rate;
	}

	// ---- 6. compressor --------------------------------------------------------------------

	/** Feed-forward, soft knee, RMS-ish detector; thresholds assume the input sits near -20 LUFS. */
	function compress (chs, rate, o) {
		var side = mono (chs), n = side.length;
		var dA = coef (5, rate), dR = coef (60, rate), gA = coef (o.attackMs, rate), gR = coef (o.releaseMs, rate);
		var env = 0, gr = 0, g = new Float32Array (n), maxGr = 0, slope = 1 / o.ratio - 1, sumGr = 0, cntGr = 0;
		for (var i = 0; i < n; ++i) {
			var p = side[i] * side[i];
			env = p > env ? dA * env + (1 - dA) * p : dR * env + (1 - dR) * p;
			var over = powDb (env) - o.thresholdDb, want;
			if (2 * over < -o.kneeDb) want = 0;
			else if (2 * Math.abs (over) <= o.kneeDb) want = slope * Math.pow (over + o.kneeDb / 2, 2) / (2 * o.kneeDb);
			else want = slope * over;
			gr = want < gr ? gA * gr + (1 - gA) * want : gR * gr + (1 - gR) * want;
			g[i] = fromDb (gr);
			if (gr < maxGr) maxGr = gr;
			if (gr < -0.5) { sumGr += gr; ++cntGr; }
		}
		applyGains (chs, g);
		return { maxDb: -maxGr, avgDb: cntGr ? -sumGr / cntGr : 0, seconds: cntGr / rate };
	}

	// ---- 8. limiter ---------------------------------------------------------------------------

	/**
	 * Look-ahead peak limiter. For each sample, the gain that keeps it under the
	 * ceiling; its minimum over the next L samples, averaged over the previous
	 * L, is guaranteed to be at or below what every peak needs — so the gain is
	 * already down when the peak arrives, with an L-sample ramp instead of a
	 * click. Release 60 ms.
	 */
	function limit (chs, rate, ceilingDb) {
		var n = chs[0].length, ceil = fromDb (ceilingDb), L = Math.max (1, Math.round (rate * 0.0015));
		var req = new Float32Array (n);
		for (var i = 0; i < n; ++i) {
			var a = 0;
			for (var c = 0; c < chs.length; ++c) { var v = Math.abs (chs[c][i]); if (v > a) a = v; }
			req[i] = a > ceil ? ceil / a : 1;
		}
		// Sliding minimum over [i, i + L] (monotonic deque, filled from the end).
		var mn = new Float32Array (n), dq = new Int32Array (n), head = 0, tail = 0;
		for (i = n - 1; i >= 0; --i) {
			while (tail > head && req[dq[tail - 1]] >= req[i]) --tail;
			dq[tail++] = i;
			while (dq[head] > i + L) ++head;
			mn[i] = req[dq[head]];
		}
		var rel = coef (60, rate), sum = 0, g = new Float32Array (n), prev = 1, touched = 0, minG = 1;
		for (i = 0; i < n; ++i) {
			sum += mn[i] - (i - L - 1 >= 0 ? mn[i - L - 1] : 1);
			var s = (sum + L + 1) / (L + 1); // window [i-L, i], padded with 1 before the start
			var gi = s < prev ? s : Math.min (s, rel * prev + (1 - rel) * s);
			g[i] = prev = gi;
			if (gi < 0.891) ++touched; // more than 1 dB
			if (gi < minG) minG = gi;
		}
		applyGains (chs, g);
		for (c = 0; c < chs.length; ++c) {
			var x = chs[c];
			for (i = 0; i < n; ++i) if (x[i] > ceil) x[i] = ceil; else if (x[i] < -ceil) x[i] = -ceil;
		}
		return { seconds: touched / rate, maxDb: -db (minG) };
	}

	// ---- selection edits (the editor's volume / speed controls) ------------------------

	/**
	 * Multiply by `gainDb`, easing in and out over 5 ms at the edges so the
	 * step never clicks against the untouched audio around a selection.
	 */
	function gainEdit (chs, rate, gainDb) {
		var g = fromDb (gainDb), n = chs[0].length, ramp = Math.min (Math.round (rate * 0.005), n >> 1);
		for (var c = 0; c < chs.length; ++c) {
			var x = chs[c];
			for (var i = 0; i < n; ++i) {
				var t = i < ramp ? i / ramp : i >= n - ramp ? (n - 1 - i) / ramp : 1;
				x[i] *= 1 + (g - 1) * t;
			}
		}
	}

	/**
	 * Pitch-preserving time stretch (WSOLA). `speed` 1.25 plays 25% faster,
	 * 0.8 slower; the pitch — the voice — stays the same.
	 *
	 * 30 ms Hann frames laid 15 ms apart in the output; each is read from the
	 * input near `speed` times its output position, shifted by up to ±10 ms to
	 * where it best continues the previous frame's waveform. That alignment is
	 * what plain overlap-add (AudioMass's own stretcher) lacks, and why it
	 * sounds phasey on speech. The first and last frames keep a flat outer
	 * half, so the result starts and ends on the input's own samples and
	 * joins the surrounding audio without a click. The alignment is found on
	 * the mono mix and applied to every channel, so stereo stays coherent.
	 */
	function stretch (chs, rate, speed) {
		var n = chs[0].length;
		var N = Math.max (4, Math.round (rate * 0.03) & ~1), Hs = N >> 1;
		var outLen = Math.max (1, Math.round (n / speed));
		if (n < N * 2) {
			// Too short to stretch meaningfully: resample the length only.
			return chs.map (function (x) {
				var y = new Float32Array (outLen);
				for (var i = 0; i < outLen; ++i) y[i] = x[Math.min (n - 1, Math.floor (i * n / outLen))];
				return y;
			});
		}
		var tol = Math.round (rate * 0.01), side = mono (chs);
		var win = new Float32Array (N);
		for (var i = 0; i < N; ++i) win[i] = 0.5 - 0.5 * Math.cos (2 * Math.PI * i / N);

		var outs = chs.map (function () { return new Float32Array (outLen + N); });
		var norm = new Float32Array (outLen + N);
		var prev = 0;
		for (var k = 0; k * Hs < outLen; ++k) {
			var at = k * Hs, pos;
			var last = at + N >= outLen;
			if (k === 0) pos = 0;
			else if (last) pos = Math.max (0, n - (outLen - at));
			else {
				var nominal = Math.round (at * speed), natural = prev + Hs;
				var lo = Math.max (0, nominal - tol), hi = Math.min (n - N, nominal + tol);
				pos = Math.max (0, Math.min (n - N, nominal));
				if (hi >= lo && natural + Hs <= n) {
					var best = -Infinity;
					for (var p = lo; p <= hi; ++p) {
						var num = 0, e = 0;
						for (var j = 0; j < Hs; j += 4) { var v = side[p + j]; num += side[natural + j] * v; e += v * v; }
						var score = e > 0 ? num / Math.sqrt (e) : 0;
						if (score > best) { best = score; pos = p; }
					}
				}
			}
			for (i = 0; i < N; ++i) {
				var o = at + i;
				if (o >= outLen + N || pos + i >= n) break;
				var wv = (k === 0 && i < Hs) || (last && i >= Hs) ? 1 : win[i];
				for (var c = 0; c < chs.length; ++c) outs[c][o] += chs[c][pos + i] * wv;
				norm[o] += wv;
			}
			prev = pos;
			if (last) break;
		}
		return outs.map (function (y) {
			var out = new Float32Array (outLen);
			for (var i = 0; i < outLen; ++i) out[i] = norm[i] > 1e-3 ? y[i] / norm[i] : 0;
			return out;
		});
	}

	// ---- the chain --------------------------------------------------------------------------------

	function process (chs, rate, options, hooks) {
		var o = {};
		for (var key in DEFAULTS) o[key] = DEFAULTS[key];
		for (key in options || {}) if (options[key] !== undefined) o[key] = options[key];
		hooks = hooks || {};

		var report = { inputLufs: integratedLufs (chs, rate), steps: [] };
		var t0 = Date.now ();

		if (o.breaths) {
			var gated = gate (chs, rate, o.gateThresholdDb, o.removeBreaths);
			if (gated) {
				report.breathSeconds = gated.erasedSeconds;
				report.steps.push ('gate');
			}
		}

		var hp = biquad ('highpass', 75, rate, 0.5412), hp2 = biquad ('highpass', 75, rate, 1.3066);
		chs.forEach (function (x) { run (run (x, hp), hp2); });
		report.steps.push ('highpass');

		if (o.denoise && hooks.denoise) {
			denoise (chs, rate, hooks.denoise, o.denoiseMix);
			report.steps.push ('denoise');
		}

		var map = speechMap (mono (chs), rate);
		// No voicing found: assume speech sits ~10 dB over the average.
		var speechRef = map ? map.speechDb : db (Math.sqrt (meanSquare (mono (chs)))) + 10;

		if (o.tone) {
			var curve = PRESETS[o.preset] || PRESETS.deep;
			curve.forEach (function (band) {
				var cf = biquad (band.type, band.freq, rate, band.q, band.gain);
				chs.forEach (function (x) { run (x, cf); });
			});
			report.steps.push ('tone:' + (PRESETS[o.preset] ? o.preset : 'deep'));
		}

		if (o.deess) {
			report.deessSeconds = deess (chs, rate, speechRef);
			report.steps.push ('deess');
		}

		if (o.compress) {
			var pre = integratedLufs (chs, rate);
			if (isFinite (pre)) scale (chs, fromDb (-20 - pre));
			report.compressor = compress (chs, rate, {
				// 10 ms attack lets each syllable's first consonant through before the
				// gain comes down; 5 ms flattened word starts.
				thresholdDb: -18, ratio: 2.5, kneeDb: 6, attackMs: 10, releaseMs: 150
			});
			report.steps.push ('compress');
		}

		// Limiting takes a little loudness back, so measure → gain → limit
		// again until the result lands within 0.2 LU of the target.
		report.limiter = limit (chs, rate, o.ceilingDb);
		if (o.loudness) {
			for (var pass = 0; pass < 4; ++pass) {
				var now = integratedLufs (chs, rate);
				if (!isFinite (now) || Math.abs (o.targetLufs - now) < 0.2) break;
				scale (chs, fromDb (o.targetLufs - now));
				report.limiter = limit (chs, rate, o.ceilingDb);
			}
			report.steps.push ('loudness');
		}
		report.steps.push ('limit');


		report.outputLufs = integratedLufs (chs, rate);
		report.peakDb = peakDb (chs);
		report.ms = Date.now () - t0;
		return report;
	}

	function meanSquare (x) {
		var s = 0;
		for (var i = 0, n = x.length; i < n; ++i) s += x[i] * x[i];
		return x.length ? s / x.length : 0;
	}

	return {
		process: process,
		gainEdit: gainEdit,
		stretch: stretch,
		peakDb: peakDb,
		speechMap: speechMap,
		integratedLufs: integratedLufs,
		PRESETS: PRESETS,
		DEFAULTS: DEFAULTS
	};
});
