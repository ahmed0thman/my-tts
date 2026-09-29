/*
 * Sawtak dB axis for the AudioMass waveform.
 *
 * A column of dBFS numbers in the empty gutter left of the waveform, faint
 * grid lines across it at the same levels, and a toggle between a dB-scaled
 * waveform (default) and AudioMass's linear one. On a linear waveform
 * everything under about -30 dB is a flat line, so the dB view is what makes
 * a breath or a word's tail readable: follow the top of a wave to the axis,
 * and that number is what the «تحسين احترافي» gate compares against its
 * threshold (sawtak-voice.js measures the same thing — the peak).
 *
 * The drawing itself is the patched `sawtakAmp` in dist/wavesurfer.js; this
 * file only sets `window.SawtakWave` and lays the labels out with the same
 * geometry wavesurfer uses (prepareDraw / drawWave: a 20 px timeline strip,
 * lanes of params.height / 2 per channel, halved for more than one channel).
 */
(function (w) {
	'use strict';

	var FLOOR = -60;
	var STORE = 'sawtak:wave-db';
	var saved = null;
	try { saved = w.localStorage.getItem (STORE); } catch (e) {}
	w.SawtakWave = { log: saved !== 'linear', floor: FLOOR };

	var editor = w.PKAudioEditor;
	var axis = null, grid = null, toggle = null;

	function wavesurfer () {
		return editor && editor.engine && editor.engine.wavesurfer;
	}

	function el (tag, cls, parent) {
		var e = document.createElement (tag);
		e.className = cls;
		parent.appendChild (e);
		return e;
	}

	function ensure (ws) {
		var c = ws.container, parent = c.parentElement;
		if (axis && axis.parentElement === parent) return true;
		if (!parent) return false;
		if (getComputedStyle (parent).position === 'static') parent.style.position = 'relative';
		axis = el ('div', 'sawtak-db-axis', parent);
		grid = el ('div', 'sawtak-db-grid', c);
		toggle = el ('button', 'sawtak-db-toggle', axis);
		toggle.type = 'button';
		toggle.addEventListener ('click', function (e) {
			e.stopPropagation ();
			w.SawtakWave.log = !w.SawtakWave.log;
			try { w.localStorage.setItem (STORE, w.SawtakWave.log ? 'db' : 'linear'); } catch (err) {}
			var s = wavesurfer ();
			if (s && s.backend && s.backend.buffer) s.drawBuffer ();
			render ();
		});
		return true;
	}

	function levels (log, topDb) {
		var out = [];
		if (log) {
			for (var db = Math.floor (topDb / 10) * 10; db > FLOOR; db -= 10) out.push (db);
		} else {
			[0, -3, -6, -12, -20].forEach (function (db) { if (db <= topDb + 0.01) out.push (db); });
		}
		return out;
	}

	function render () {
		var ws = wavesurfer ();
		if (!ws || !ws.container || !ensure (ws)) return;
		var c = ws.container;

		axis.style.top = c.offsetTop + 'px';
		axis.style.width = Math.max (0, c.offsetLeft - 2) + 'px';
		axis.style.height = c.offsetHeight + 'px';
		toggle.textContent = w.SawtakWave.log ? 'dB' : 'LIN';
		toggle.title = w.SawtakWave.log ? 'Waveform in dB — click for linear' : 'Linear waveform — click for dB';
		toggle.classList.toggle ('on', w.SawtakWave.log);

		Array.prototype.slice.call (axis.querySelectorAll ('.sawtak-db-label')).forEach (function (n) { n.remove (); });
		grid.innerHTML = '';

		var buffer = ws.backend && ws.backend.buffer;
		if (!buffer) return;

		var pr = ws.params.pixelRatio || 1, H = ws.params.height, timeline = !!ws.params.timeline;
		var channels = buffer.numberOfChannels, absmax = ws.params.verticalZoom || 1;
		var log = w.SawtakWave.log, topDb = 20 * Math.log10 (absmax);
		var dbs = levels (log, topDb);
		var fracOf = function (db) {
			return log ? (db - FLOOR) / (topDb - FLOOR) : Math.pow (10, db / 20) / absmax;
		};

		for (var ch = 0; ch < channels; ++ch) {
			var height = H / 2 * pr, offsetY = height * ch, halfH = channels === 1 ? height : height / 2;
			if (timeline) { offsetY += 20; halfH -= 10; }
			offsetY /= pr; halfH /= pr;
			var centre = offsetY + halfH, lastY = -1e9;
			var marks = [];
			dbs.forEach (function (db) {
				var f = fracOf (db);
				if (f > 1.0001 || f < 0.03) return;
				marks.push ({ y: centre - f * halfH, db: db });
			});
			marks.push ({ y: centre, db: log ? FLOOR : null, centre: true });
			dbs.slice ().reverse ().forEach (function (db) {
				var f = fracOf (db);
				if (f > 1.0001 || f < 0.03) return;
				marks.push ({ y: centre + f * halfH, db: db });
			});
			marks.forEach (function (m) {
				if (m.y - lastY < 11) return;
				lastY = m.y;
				var label = el ('div', 'sawtak-db-label' + (m.centre ? ' centre' : ''), axis);
				label.style.top = m.y + 'px';
				label.textContent = m.db === null ? '−∞' : (m.db === 0 ? '0' : '−' + Math.abs (m.db));
				if (!m.centre) {
					var line = el ('div', 'sawtak-db-line', grid);
					line.style.top = m.y + 'px';
				}
			});
		}
	}

	var queued = false;
	function later () {
		if (queued) return;
		queued = true;
		setTimeout (function () { queued = false; render (); }, 60);
	}

	['DidLoadFile', 'DidZoom', 'RequestResize', 'DidUpdateLen', 'StateDidPop'].forEach (function (ev) {
		editor.listenFor (ev, later);
	});
	w.addEventListener ('resize', later);
	w.SawtakDbAxis = { render: render };
}) (window);
