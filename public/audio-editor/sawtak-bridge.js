/*
 * Sawtak ⇄ AudioMass bridge.
 *
 * AudioMass is a self-contained app with no embedding API, so the host page
 * (src/components/editor/audio-editor-frame.tsx) talks to it through
 * postMessage, and this file translates those messages into AudioMass's own
 * calls. Same-origin only: messages from anywhere but the parent window are
 * ignored.
 *
 * Host → editor
 *   { type: 'sawtak:load',   buffer: ArrayBuffer, name }   open a clip
 *   { type: 'sawtak:export' }                               render the edit
 *   { type: 'sawtak:theme',  tokens: {…}, dark: boolean }   recolor
 *   { type: 'sawtak:enhance', options }                     voice polish preset (sawtak-voice.js)
 *   { type: 'sawtak:edit', gainDb?, speed? }                volume / speed on the selection (or the whole file)
 * Editor → host
 *   { type: 'sawtak:ready' }                                scripts booted
 *   { type: 'sawtak:loaded', duration }                     clip is open
 *   { type: 'sawtak:dirty' }                                first edit since load
 *   { type: 'sawtak:exported', blob }                       mono float32 WAV
 *   { type: 'sawtak:error', message }
 *   { type: 'sawtak:notice', message }                      an AudioMass alert()
 *   { type: 'sawtak:enhanced', report }                     preset applied (one undo step)
 *   { type: 'sawtak:edited', duration }                     selection edit applied (one undo step)
 *   { type: 'sawtak:selection', start, end, whole, peakDb } the selection changed (whole: nothing selected)
 */
(function (w) {
	'use strict';

	var editor = w.PKAudioEditor;
	var host = w.parent !== w ? w.parent : null;
	var awaitingExport = false;
	var trackingEdits = false;
	var reportedDirty = false;

	function post (msg) {
		if (host) host.postMessage (msg, w.location.origin);
	}

	// Called from the one patched line in actions.js (forceDownload). Returns
	// true when the export was ours, so AudioMass skips its download.
	w.SawtakBridge = {
		captureExport: function (blob) {
			if (!awaitingExport) return false;
			awaitingExport = false;
			post ({ type: 'sawtak:exported', blob: blob });
			return true;
		}
	};

	// AudioMass reports a few failures with window.alert (a missing mic
	// permission, an unsupported effect). The browser's alert box looks
	// nothing like the app, so the message goes to the host's toasts instead.
	// Its one confirm() (reload for a newer version) belongs to the service
	// worker, which is not shipped, so it never runs.
	w.alert = function (message) {
		post ({ type: 'sawtak:notice', message: String (message) });
	};

	function wavesurfer () {
		return editor && editor.engine && editor.engine.wavesurfer;
	}

	// ---- Loading --------------------------------------------------------------

	editor.listenFor ('DidLoadFile', function () {
		var ws = wavesurfer ();
		reportedDirty = false;
		// Loading itself fires state changes; only edits after it count.
		trackingEdits = false;
		setTimeout (function () { trackingEdits = true; }, 400);
		post ({ type: 'sawtak:loaded', duration: ws ? ws.getDuration () : 0 });
	});

	editor.listenFor ('DidStateChange', function () {
		if (!trackingEdits || reportedDirty) return;
		reportedDirty = true;
		post ({ type: 'sawtak:dirty' });
	});

	// ---- Theme ------------------------------------------------------------------

	// AudioMass keeps its whole palette in CSS variables (main.css :root), so the
	// app's tokens map straight onto them. Canvas colors are not CSS, so the
	// waveform is recolored through wavesurfer.
	function mix (color, pct) {
		return 'color-mix(in srgb, ' + color + ' ' + pct + '%, transparent)';
	}

	function applyTheme (t, dark) {
		var root = document.documentElement;
		var vars = {
			'--bg-0': t.background,
			'--bg-1': t.card,
			'--bg-2': t.elevated,
			'--bg-3': t.secondary,
			'--bg-4': t.borderStrong,
			'--fg-0': t.foreground,
			'--fg-1': t.mutedForeground,
			'--fg-2': mix (t.mutedForeground, 75),
			'--fg-3': t.borderStrong,
			'--ac': t.primary,
			'--ac-2': t.primary,
			'--ac-soft': mix (t.primary, 12),
			'--ac-glow': mix (t.primary, 45),
			'--ac-ink': t.primaryForeground,
			'--rec': t.destructive,
			'--rec-glow': mix (t.destructive, 45),
			'--solo': t.primary,
			'--solo-glow': mix (t.primary, 45),
			'--ok': t.success,
			'--pl': t.foreground,
			'--bd': t.border,
			'--bd-s': mix (t.border, 60),
			'--bd-h': mix (t.primary, 40),
			'--r-lg': '12px'
		};
		for (var k in vars) if (vars[k]) root.style.setProperty (k, vars[k]);
		root.classList.toggle ('sawtak-light', !dark);
		root.style.colorScheme = dark ? 'dark' : 'light';

		var ws = wavesurfer ();
		if (ws && ws.params) {
			ws.params.waveColor = t.primary;
			ws.params.progressColor = mix (t.primary, 55);
			ws.params.cursorColor = t.foreground;
			if (ws.backend && ws.backend.buffer) ws.drawBuffer ();
		}
		// Redraws the overview and ruler canvases, which read the variables
		// only when they paint.
		editor.fireEvent ('RequestResize');
	}

	// ---- Voice polish -----------------------------------------------------------

	// RNNoise is AudioMass's own noise-reduction wasm, loaded on first use as
	// AudioMass itself does. Already loaded (AudioMass's Noise RNN ran) → reuse.
	var rnnLoading = null;
	function rnnReady () {
		return typeof wasm_rnnDenoise_rawmem !== 'undefined' && w.Module && w.Module.asm && w.Module.asm.malloc;
	}
	function loadRnn () {
		if (rnnReady ()) return Promise.resolve ();
		if (rnnLoading) return rnnLoading;
		rnnLoading = new Promise (function (resolve, reject) {
			var s = document.createElement ('script');
			s.src = 'rnn_denoise.js';
			s.onload = function () {
				var tries = 0;
				(function wait () {
					if (rnnReady ()) resolve ();
					else if (++tries > 100) reject (new Error ('Noise reduction did not start'));
					else setTimeout (wait, 100);
				}) ();
			};
			s.onerror = function () { reject (new Error ('Could not load noise reduction')); };
			document.head.appendChild (s);
		});
		rnnLoading.catch (function () { rnnLoading = null; });
		return rnnLoading;
	}

	// One call per block; both buffers are freed, unlike AudioMass's wrapper,
	// so repeated runs on a long episode do not grow the wasm heap.
	function rnnDenoise (x, rate) {
		var n = x.length, p = w.Module._malloc (n * 4);
		new Float32Array (w.wasmMemory.buffer, p, n).set (x);
		var out = wasm_rnnDenoise_rawmem (p, rate, 1, n);
		var y = new Float32Array (w.wasmMemory.buffer, out, n).slice ();
		w.Module._free (p);
		wasm_freeBuffer ();
		return y;
	}

	/**
	 * Runs the preset over the whole file and swaps the result in as one
	 * undo step, the way AudioMass's own effects do: the current buffer is
	 * pushed as the undo snapshot and never modified — the chain works on
	 * copies — so Ctrl/⌘+Z restores it exactly.
	 */
	function enhance (options) {
		var ws = wavesurfer ();
		var buffer = ws && ws.backend && ws.backend.buffer;
		if (!buffer) return Promise.reject (new Error ('No audio is loaded'));
		editor.fireEvent ('RequestPause');

		var wantsDenoise = !options || options.denoise !== false;
		return (wantsDenoise ? loadRnn () : Promise.resolve ()).then (function () {
			// Let the host's spinner paint before the synchronous work.
			return new Promise (function (r) { setTimeout (r, 30); });
		}).then (function () {
			var rate = buffer.sampleRate, chs = [];
			for (var c = 0; c < buffer.numberOfChannels; ++c) chs.push (Float32Array.from (buffer.getChannelData (c)));

			var report = w.SawtakVoice.process (chs, rate, options || {}, wantsDenoise ? { denoise: rnnDenoise } : {});

			var out = ws.backend.ac.createBuffer (chs.length, buffer.length, rate);
			for (c = 0; c < chs.length; ++c) out.getChannelData (c).set (chs[c]);

			var duration = ws.getDuration ();
			if (!ws.loadDecodedBuffer (out)) throw new Error ('Could not apply the result');
			// Only once the new audio is in, so a failed load leaves no dangling undo step.
			editor.fireEvent ('StateRequestPush', { desc: 'Voice polish', meta: [0, duration], data: buffer });
			ws.regions && ws.regions.clear ();
			editor.fireEvent ('DidUpdateLen', ws.getDuration ());
			setTimeout (function () { ws.drawBuffer (); }, 40);
			// wavesurfer's 'ready' pops AudioMass's "Loaded Successfully"; say what happened instead.
			if (typeof w.OneUp === 'function') setTimeout (function () { w.OneUp ('Applied Voice polish'); }, 60);
			return report;
		});
	}

	// ---- Selection edits ---------------------------------------------------------

	/** The selected range in samples, or the whole file when nothing is selected. */
	function selectionRange (buffer) {
		var ws = wavesurfer ();
		var region = ws.regions && ws.regions.list[0];
		var n = buffer.length, rate = buffer.sampleRate;
		if (!region || region.end - region.start < 0.005) return { from: 0, to: n, whole: true };
		var from = Math.max (0, Math.min (n, Math.round (region.start * rate)));
		var to = Math.max (from, Math.min (n, Math.round (region.end * rate)));
		return { from: from, to: to, whole: false };
	}

	function reportSelection () {
		var ws = wavesurfer ();
		var buffer = ws && ws.backend && ws.backend.buffer;
		if (!buffer) return;
		var r = selectionRange (buffer), chs = [];
		for (var c = 0; c < buffer.numberOfChannels; ++c) chs.push (buffer.getChannelData (c).subarray (r.from, r.to));
		post ({
			type: 'sawtak:selection',
			start: r.from / buffer.sampleRate,
			end: r.to / buffer.sampleRate,
			whole: r.whole,
			peakDb: w.SawtakVoice.peakDb (chs)
		});
	}

	var selectionQueued = false;
	function selectionChanged () {
		if (selectionQueued) return;
		selectionQueued = true;
		setTimeout (function () { selectionQueued = false; reportSelection (); }, 80);
	}
	['DidCreateRegion', 'DidDestroyRegion', 'DidLoadFile', 'DidUpdateLen', 'StateDidPop'].forEach (function (ev) {
		editor.listenFor (ev, selectionChanged);
	});

	/**
	 * Volume (`gainDb`) or speed (`speed`) on the selection — or the whole
	 * file when nothing is selected — swapped in as one undo step, with the
	 * edited range left selected so it can be heard or nudged again.
	 */
	function applyEdit (msg) {
		var ws = wavesurfer ();
		var buffer = ws && ws.backend && ws.backend.buffer;
		if (!buffer) throw new Error ('No audio is loaded');
		editor.fireEvent ('RequestPause');

		var rate = buffer.sampleRate, n = buffer.length, r = selectionRange (buffer);
		var part = [];
		for (var c = 0; c < buffer.numberOfChannels; ++c) part.push (Float32Array.from (buffer.getChannelData (c).subarray (r.from, r.to)));

		var desc;
		if (typeof msg.speed === 'number' && msg.speed !== 1) {
			part = w.SawtakVoice.stretch (part, rate, msg.speed);
			desc = 'Speed ' + Math.round (msg.speed * 100) + '%';
		} else if (typeof msg.gainDb === 'number' && msg.gainDb !== 0) {
			w.SawtakVoice.gainEdit (part, rate, msg.gainDb);
			desc = 'Volume ' + (msg.gainDb > 0 ? '+' : '') + msg.gainDb + ' dB';
		} else return ws.getDuration ();

		var newLen = n - (r.to - r.from) + part[0].length;
		var out = ws.backend.ac.createBuffer (buffer.numberOfChannels, newLen, rate);
		for (c = 0; c < buffer.numberOfChannels; ++c) {
			var src = buffer.getChannelData (c), dst = out.getChannelData (c);
			dst.set (src.subarray (0, r.from), 0);
			dst.set (part[c], r.from);
			dst.set (src.subarray (r.to), r.from + part[c].length);
		}

		var start = r.from / rate, oldLen = (r.to - r.from) / rate;
		if (!ws.loadDecodedBuffer (out)) throw new Error ('Could not apply the edit');
		editor.fireEvent ('StateRequestPush', { desc: desc, meta: [start, oldLen], data: buffer });
		ws.regions.clear ();
		if (!r.whole) ws.regions.add ({ start: start, end: start + part[0].length / rate, id: 't' });
		editor.fireEvent ('DidUpdateLen', ws.getDuration ());
		setTimeout (function () { ws.drawBuffer (); }, 40);
		if (typeof w.OneUp === 'function') setTimeout (function () { w.OneUp ('Applied ' + desc); }, 60);
		selectionChanged ();
		return ws.getDuration ();
	}

	// ---- Messages ---------------------------------------------------------------

	w.addEventListener ('message', function (e) {
		if (e.origin !== w.location.origin || e.source !== host) return;
		var msg = e.data || {};

		if (msg.type === 'sawtak:load') {
			var blob = new Blob ([msg.buffer], { type: 'audio/wav' });
			editor.engine.LoadArrayBuffer (blob);
		}
		else if (msg.type === 'sawtak:export') {
			var ws = wavesurfer ();
			if (!ws || !ws.backend || !ws.backend.buffer) {
				post ({ type: 'sawtak:error', message: 'No audio is loaded' });
				return;
			}
			awaitingExport = true;
			// Whole file (no selection), mono, 32-bit float, no dither — the
			// engine resamples to the app's format when it is saved.
			editor.engine.DownloadFile ('edit.wav', 'wav', 0, false, false, 32, false);
		}
		else if (msg.type === 'sawtak:enhance') {
			enhance (msg.options).then (function (report) {
				post ({ type: 'sawtak:enhanced', report: report });
			}, function (err) {
				post ({ type: 'sawtak:error', message: (err && err.message) || String (err) });
			});
		}
		else if (msg.type === 'sawtak:edit') {
			try { post ({ type: 'sawtak:edited', duration: applyEdit (msg) }); }
			catch (err) { post ({ type: 'sawtak:error', message: (err && err.message) || String (err) }); }
		}
		else if (msg.type === 'sawtak:theme') {
			applyTheme (msg.tokens || {}, !!msg.dark);
		}
	});

	post ({ type: 'sawtak:ready' });
}) (window);
