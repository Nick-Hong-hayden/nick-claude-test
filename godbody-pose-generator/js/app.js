/* ===== GODBODY Pose Generator: 3D posing, 2D Apply ===== */
(() => {
  paper.setup(new paper.Size(10, 10));
  const $ = (id) => document.getElementById(id);
  const D2R = Math.PI / 180;
  const NICE = { pelvis: 'Lower Body', spine: 'Upper Body', neck: 'Neck', head: 'Head', shoulderL: 'Left Shoulder', elbowL: 'Left Elbow', wristL: 'Left Wrist', shoulderR: 'Right Shoulder', elbowR: 'Right Elbow', wristR: 'Right Wrist', hipL: 'Left Hip', kneeL: 'Left Knee', ankleL: 'Left Ankle', hipR: 'Right Hip', kneeR: 'Right Knee', ankleR: 'Right Ankle' };

  // ---------- 3D scene ----------
  const canvas = $('gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe9e9ee);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a948c, 0.95));
  const key = new THREE.DirectionalLight(0xffffff, 0.55); key.position.set(300, 500, 400); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.2); fill.position.set(-400, 200, -300); scene.add(fill);
  const grid = new THREE.GridHelper(600, 24, 0xc2c2c8, 0xd4d4da); scene.add(grid);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf4efe7, roughness: 0.85, metalness: 0 });
  const selMat = new THREE.MeshStandardMaterial({ color: 0xbcd6ff, roughness: 0.8, metalness: 0 });
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 6000);
  const orbit = { yaw: 25, pitch: 6, dist: 760, target: new THREE.Vector3(0, 140, 0) };

  let style = Object.assign({}, MANNEQUIN.STYLE), fig = null, selected = 'elbowL';
  const markers = new THREE.Group(); scene.add(markers);
  const markerGeo = new THREE.SphereGeometry(1, 16, 12);
  const mk = { n: new THREE.MeshBasicMaterial({ color: 0x007aff, depthTest: false, transparent: true, opacity: 0.95 }), on: new THREE.MeshBasicMaterial({ color: 0xff9500, depthTest: false }) };
  // a dot at each joint end; dragging it turns the joint it hangs from
  const HANDLES = [['pelvisTip', 'pelvis'], ['neck', 'spine'], ['head', 'neck'], ['headTop', 'head'],
    ['elbowL', 'shoulderL'], ['wristL', 'elbowL'], ['handL', 'wristL'], ['elbowR', 'shoulderR'], ['wristR', 'elbowR'], ['handR', 'wristR'],
    ['kneeL', 'hipL'], ['ankleL', 'kneeL'], ['toeL', 'ankleL'], ['kneeR', 'hipR'], ['ankleR', 'kneeR'], ['toeR', 'ankleR']];

  function buildFigure() {
    const pose = fig ? RIG3D.getPose(fig) : {};
    if (fig) scene.remove(fig.root);
    fig = RIG3D.build(style, bodyMat); for (const m of fig.meshes) m.visible = false; DOLL.dress(fig); scene.add(fig.root);
    const pt = new THREE.Object3D(); pt.position.set(0, -59, 12); fig.objs.pelvis.add(pt); fig.tips.pelvisTip = pt;
    // tip points
    markers.clear();
    for (const [h, j] of HANDLES) { const m = new THREE.Mesh(markerGeo, mk.n); m.renderOrder = 10; m.userData = { handle: h, joint: j }; markers.add(m); }
    RIG3D.setPose(fig, pose); highlight(); placeMarkers();
  }
  const anchorOf = (h) => fig.objs[h] || fig.tips[h];
  function placeMarkers() {
    const scale = orbit.dist * Math.tan(camera.fov * D2R / 2) / 95;
    for (const m of markers.children) { anchorOf(m.userData.handle).getWorldPosition(m.position); m.scale.setScalar(scale); m.material = m.userData.joint === selected ? mk.on : mk.n; }
  }
  function highlight() { DOLL.highlight(fig, selected); }

  function updateCamera() {
    const y = orbit.yaw * D2R, p = orbit.pitch * D2R, t = orbit.target;
    camera.position.set(t.x + orbit.dist * Math.sin(y) * Math.cos(p), t.y + orbit.dist * Math.sin(p), t.z + orbit.dist * Math.cos(y) * Math.cos(p));
    camera.lookAt(t); camera.updateMatrixWorld(true);
  }
  function resize() {
    const box = $('view'); const w = box.clientWidth, h = box.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); render3();
  }
  function render3() { updateCamera(); placeMarkers(); renderer.render(scene, camera); }

  // ---------- pointer: orbit, pan, zoom, joint drag ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let drag = null;
  function pick(e) {
    const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hm = ray.intersectObjects(markers.children, false); if (hm.length) return { marker: hm[0].object };
    const hb = ray.intersectObjects(fig.dollParts, false); if (hb.length) return { mesh: hb[0].object };
    return null;
  }
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    const hit = e.button === 0 && !e.shiftKey ? pick(e) : null;
    if (hit && hit.marker) {
      const { joint, handle } = hit.marker.userData; select(joint); snap();
      drag = { kind: 'joint', joint, handle, from: AXES(joint).map(([, i, sg]) => sg * rel(joint, i)) };
    } else if (hit && hit.mesh) { select(hit.mesh.userData.joint); drag = { kind: 'orbit', x: e.clientX, y: e.clientY, moved: false }; }
    else drag = { kind: e.button === 2 || e.shiftKey ? 'pan' : 'orbit', x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (drag.kind === 'joint') { turnToward(drag, e); return; }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
    if (drag.kind === 'orbit') { orbit.yaw -= dx * 0.4; orbit.pitch = Math.max(-80, Math.min(80, orbit.pitch + dy * 0.3)); }
    else { const k = orbit.dist * Math.tan(camera.fov * D2R / 2) * 2 / canvas.clientHeight; const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1); orbit.target.addScaledVector(right, -dx * k).addScaledVector(up, dy * k); }
    syncView(); render3(); scheduleApply();
  });
  const endDrag = () => { if (drag && drag.kind === 'joint') { RIG3D.floor(fig); render3(); scheduleApply(true); } drag = null; };
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); orbit.dist = Math.max(150, Math.min(2500, orbit.dist * Math.exp(e.deltaY * 0.0012))); syncView(); render3(); scheduleApply(); }, { passive: false });

  // turn the joint so its handle follows the pointer, in the plane facing the camera
  function turnToward(d, e) {
    const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const J = fig.objs[d.joint], H = anchorOf(d.handle);
    const P = J.getWorldPosition(new THREE.Vector3()), M = H.getWorldPosition(new THREE.Vector3());
    const n = camera.getWorldDirection(new THREE.Vector3());
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, M), T = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plane, T)) return;
    const v1 = M.sub(P).projectOnPlane(n), v2 = T.sub(P).projectOnPlane(n);
    if (v1.lengthSq() < 1e-6 || v2.lengthSq() < 1) return;
    const q = new THREE.Quaternion().setFromUnitVectors(v1.normalize(), v2.normalize());
    const Qw = J.getWorldQuaternion(new THREE.Quaternion()), Qp = J.parent.getWorldQuaternion(new THREE.Quaternion());
    J.quaternion.copy(Qp.invert().multiply(q.multiply(Qw))); limit(d.joint, d.from);
    fig.root.updateMatrixWorld(true);
    syncJoint(); render3(); scheduleApply();
  }

  // ---------- inspector ----------
  const ui = {};
  const pct = (el) => el.style.setProperty('--p', ((el.value - el.min) / (el.max - el.min) * 100) + '%');
  function sliderRow(list, key, label, min, max, step, fmt, get, set, opts = {}) {
    const row = document.createElement('div'); row.className = 'row';
    const id = 's_' + key;
    row.innerHTML = `<label for="${id}">${label}</label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}"><output for="${id}"></output>`;
    list.appendChild(row);
    const inp = row.querySelector('input'), out = row.querySelector('output');
    inp.addEventListener('pointerdown', snap); inp.addEventListener('keydown', snap);
    inp.addEventListener('input', () => { set(+inp.value); out.textContent = fmt(+inp.value); pct(inp); if (!opts.noPose) { RIG3D.floor(fig); } render3(); scheduleApply(); });
    ui[key] = () => { const v = get(); inp.value = v; out.textContent = fmt(+v); pct(inp); };
  }
  const deg = (v) => (v > 0 ? '+' : '') + Math.round(v) + '°', mul = (v) => v.toFixed(2) + '×';
  // the selected joint's three angles, relative to the standing pose
  const jAngle = (i) => { const o = fig.objs[selected], q = o.userData.restRot; return Math.round(((o.rotation.toArray()[i] / D2R - q[i] + 540) % 360) - 180); };
  const setJ = (i, v) => { const o = fig.objs[selected], q = o.userData.restRot, r = o.rotation; const a = [r.x, r.y, r.z]; a[i] = (v + q[i]) * D2R; o.rotation.set(a[0], a[1], a[2], 'XYZ'); fig.root.updateMatrixWorld(true); };
  // what each kind of joint does, as a wooden mannequin moves: [label, Euler axis, sign]
  const side = (n) => (n.endsWith('L') ? 1 : -1);
  // [label, Euler axis, sign, min, max]: the range a body can really reach, so a knee never folds forward
  const AXES = (n) => {
    const k = n.replace(/[LR]$/, ''), sd = side(n);
    if (k === 'shoulder') return [['Raise', 0, -1, -70, 180], ['Straddle', 2, sd, -35, 180], ['Turn', 1, sd, -90, 90]];
    if (k === 'hip') return [['Raise', 0, -1, -40, 150], ['Straddle', 2, sd, -30, 95], ['Turn', 1, sd, -55, 55]];
    if (k === 'elbow') return [['Bend', 0, -1, -5, 155], ['Turn', 1, sd, -90, 90]];
    if (k === 'knee') return [['Bend', 0, 1, -5, 160]];
    if (k === 'ankle') return [['Point', 0, 1, -35, 70], ['Turn', 1, sd, -30, 30], ['Tilt', 2, sd, -25, 25]];
    if (k === 'wrist') return [['Bend', 0, -1, -80, 80], ['Turn', 1, sd, -70, 70], ['Tilt', 2, sd, -35, 35]];
    if (k === 'spine') return [['Bend', 0, 1, -45, 95], ['Turn', 1, 1, -65, 65], ['Tilt', 2, 1, -45, 45]];
    if (k === 'pelvis') return [['Bend', 0, -1, -50, 70], ['Turn', 1, 1, -55, 55], ['Tilt', 2, -1, -35, 35]];
    if (k === 'neck') return [['Bend', 0, 1, -45, 55], ['Turn', 1, 1, -75, 75], ['Tilt', 2, 1, -40, 40]];
    return [['Nod', 0, 1, -35, 45], ['Turn', 1, 1, -60, 60], ['Tilt', 2, 1, -35, 35]];
  };
  // keep a joint inside its range, as a real body would
  // a pose that already sits past a limit (a preset) may stay there, but is never pushed further out
  function limit(n, from) {
    const o = fig.objs[n], q = o.userData.restRot, a = o.rotation.toArray().slice(0, 3);
    AXES(n).forEach(([, i, sg, lo, hi], k) => {
      const f = from ? from[k] : 0; lo = Math.min(lo, f); hi = Math.max(hi, f);
      let v = ((a[i] / D2R - q[i] + 540) % 360) - 180; v = Math.max(lo, Math.min(hi, v * sg)) * sg; a[i] = (v + q[i]) * D2R; });
    // axes a joint does not have (a knee's twist) stay at rest
    const used = new Set(AXES(n).map((x) => x[1])); for (let i = 0; i < 3; i++) if (!used.has(i)) a[i] = q[i] * D2R;
    o.rotation.set(a[0], a[1], a[2], 'XYZ'); o.updateMatrixWorld(true);
  }
  const rel = (n, i) => { const o = fig.objs[n], q = o.userData.restRot; return Math.round(((o.rotation.toArray()[i] / D2R - q[i] + 540) % 360) - 180); };
  const setRel = (n, i, v) => { const o = fig.objs[n], q = o.userData.restRot, r = o.rotation, a = [r.x, r.y, r.z]; a[i] = (v + q[i]) * D2R; o.rotation.set(a[0], a[1], a[2], 'XYZ'); fig.root.updateMatrixWorld(true); };
  const jrows = [0, 1, 2].map((s) => { sliderRow($('gJoint'), 'j' + s, '', -180, 180, 1, deg, () => { const ax = AXES(selected)[s]; return ax ? ax[2] * rel(selected, ax[1]) : 0; }, (v) => { const ax = AXES(selected)[s]; if (ax) setRel(selected, ax[1], v * ax[2]); }); const row = $('s_j' + s).closest('.row'); return { row, lab: row.querySelector('label'), inp: $('s_j' + s) }; });
  // the torso's three axes, always at hand
  for (const [n, title] of [['spine', 'Upper Body'], ['pelvis', 'Lower Body']]) {
    const h = document.createElement('div'); h.className = 'subhead'; h.textContent = title; $('gTorso').appendChild(h);
    AXES(n).forEach(([l, i, sg, lo, hi]) => sliderRow($('gTorso'), 't_' + n + i, l, lo, hi, 1, deg, () => sg * rel(n, i), (v) => setRel(n, i, v * sg)));
  }
  const rootA = (i) => () => { const o = fig.objs.root; return Math.round(((o.rotation.toArray()[i] / D2R + 540) % 360) - 180); };
  const setRoot = (i) => (v) => { const o = fig.objs.root, r = o.rotation, a = [r.x, r.y, r.z]; a[i] = v * D2R; o.rotation.set(a[0], a[1], a[2], 'XYZ'); };
  sliderRow($('gBody'), 'r1', 'Turn', -180, 180, 1, deg, rootA(1), setRoot(1));
  sliderRow($('gBody'), 'r0', 'Lean', -180, 180, 1, deg, rootA(0), setRoot(0));
  sliderRow($('gBody'), 'r2', 'Tip Sideways', -180, 180, 1, deg, rootA(2), setRoot(2));
  sliderRow($('gView'), 'fov', 'Lens', 10, 60, 1, (v) => Math.round(v) + '°', () => camera.fov, (v) => { camera.fov = v; camera.updateProjectionMatrix(); }, { noPose: true });
  sliderRow($('gView'), 'pitch', 'Height', -80, 80, 1, deg, () => orbit.pitch, (v) => { orbit.pitch = v; }, { noPose: true });
  for (const [k, l, a, b] of [['hips', 'Hips', 0.75, 1.5], ['thighs', 'Thighs', 0.8, 1.8], ['torso', 'Torso', 0.8, 1.3], ['calves', 'Calves', 0.8, 1.6], ['legs', 'Leg Length', 0.8, 1.7], ['arms', 'Arm Weight', 0.8, 1.5], ['reach', 'Arm Length', 0.85, 1.5], ['bust', 'Bust', 0, 1.8], ['head', 'Head', 0.85, 1.25]]) {
    sliderRow($('gStyle'), 'st_' + k, l, a, b, 0.01, mul, () => style[k], (v) => { style[k] = v; }, { noPose: true });
    $('s_st_' + k).addEventListener('change', () => { buildFigure(); render3(); scheduleApply(true); });
  }
  let gap = 4.5, fillet = 7, smooth = 50;
  sliderRow($('gDraw'), 'gap', 'Negative Space', 0, 10, 0.5, (v) => v.toFixed(1), () => gap, (v) => { gap = v; }, { noPose: true });
  sliderRow($('gDraw'), 'fil', 'Fillet', 0, 16, 0.5, (v) => v.toFixed(1), () => fillet, (v) => { fillet = v; }, { noPose: true });
  sliderRow($('gDraw'), 'smo', 'Curve Smoothness', 0, 100, 1, (v) => Math.round(v) + '%', () => smooth, (v) => { smooth = v; }, { noPose: true });
  // view buttons
  for (const [l, y, p] of [['Front', 0, 4], ['3/4', 35, 6], ['Side', 90, 4], ['Back', 180, 4], ['Above', 30, 45]]) {
    const b = document.createElement('button'); b.className = 'btn'; b.type = 'button'; b.textContent = l;
    b.addEventListener('click', () => { orbit.yaw = y; orbit.pitch = p; frame(); syncView(); render3(); scheduleApply(); });
    $('views').appendChild(b);
  }
  const jsel = $('jsel');
  for (const n of MANNEQUIN.JOINT_NAMES) if (n !== 'root' && n !== 'chest') { const o = document.createElement('option'); o.value = n; o.textContent = NICE[n]; jsel.appendChild(o); }
  jsel.addEventListener('change', () => select(jsel.value));
  function select(n) {
    selected = n; jsel.value = n; $('jtitle').textContent = NICE[n] || 'Joint';
    const ax = AXES(n); jrows.forEach((r, i) => { r.row.hidden = !ax[i]; if (ax[i]) { r.lab.textContent = ax[i][0]; } });
    highlight(); syncJoint(); render3();
  }
  // slider ends follow the joint's range, opened just enough to hold a preset that goes past it
  function ranges() {
    const fit = (inp, n, [, i, sg, lo, hi]) => { const v = Math.round(sg * rel(n, i)); inp.min = Math.min(lo, v); inp.max = Math.max(hi, v); };
    AXES(selected).forEach((ax, k) => fit(jrows[k].inp, selected, ax));
    for (const n of ['spine', 'pelvis']) AXES(n).forEach((ax) => fit($('s_t_' + n + ax[1]), n, ax));
  }
  function syncJoint() { ranges(); for (const k in ui) if (/^(j\d|t_)/.test(k)) ui[k](); }
  function syncView() { ui.fov(); ui.pitch(); }
  function syncAll() { ranges(); for (const k in ui) ui[k](); }

  // ---------- undo, reset, mirror ----------
  const hist = [];
  function snap() { hist.push(JSON.stringify({ pose: RIG3D.getPose(fig) })); if (hist.length > 100) hist.shift(); $('undo').disabled = false; }
  $('undo').addEventListener('click', () => { const h = hist.pop(); if (!h) return; RIG3D.setPose(fig, JSON.parse(h).pose); syncAll(); render3(); scheduleApply(true); $('undo').disabled = !hist.length; });
  $('resetPose').addEventListener('click', () => { snap(); RIG3D.setPose(fig, {}); syncAll(); frame(); render3(); scheduleApply(true); });
  $('mirror').addEventListener('click', () => {
    snap(); const p = RIG3D.getPose(fig), m = {};
    for (const k in p) { const v = p[k], o = k.endsWith('L') ? k.slice(0, -1) + 'R' : k.endsWith('R') ? k.slice(0, -1) + 'L' : k; m[o] = [v[0], -v[1], -v[2]]; }
    RIG3D.setPose(fig, m); syncAll(); render3(); scheduleApply(true);
  });

  // ---------- Apply ----------
  let applyT = 0, lastResult = null;
  function scheduleApply(force) { if (!$('live').checked && !force) return; if (!$('live').checked) return; clearTimeout(applyT); applyT = setTimeout(apply, drag ? 120 : 30); }
  function apply() {
    fig.root.updateMatrixWorld(true); updateCamera();
    const P = RIG3D.extract(fig, camera, orbit.dist);
    const r = STYLE2D.render(P, { gap, fillet, res: 480, tolerance: 0.6 + smooth * 0.028, smooth: Math.round(2 + smooth * 0.1) });
    lastResult = r;
    const b = r.path.bounds, m = Math.max(b.width, b.height) * 0.08 + 6, s = Math.max(b.width, b.height) + m * 2;
    $('result').setAttribute('viewBox', `${b.center.x - s / 2} ${b.center.y - s / 2} ${s} ${s}`);
    $('rpath').setAttribute('d', r.d); colors();
    $('rinfo').textContent = `${r.path.children.length} shapes · ${r.path.children.reduce((a, c) => a + c.segments.length, 0)} anchors`;
  }
  function colors() { $('rpath').setAttribute('fill', $('cFig').value); $('rbg').setAttribute('fill', $('cBg').value); document.querySelectorAll('.pre svg').forEach((s) => { s.style.background = $('cBg').value; s.querySelectorAll('path').forEach((p) => p.setAttribute('fill', $('cFig').value)); }); }
  $('apply').addEventListener('click', apply);
  $('live').addEventListener('change', () => { if ($('live').checked) apply(); });
  for (const id of ['cFig', 'cBg']) $(id).addEventListener('input', colors);

  // ---------- frame the figure ----------
  function frame() { fig.root.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(fig.root); box.getCenter(orbit.target); const sz = box.getSize(new THREE.Vector3()); orbit.dist = Math.max(sz.x, sz.y, sz.z) / (2 * Math.tan(camera.fov * D2R / 2)) * 1.35 + 60; }

  // ---------- brand poses ----------
  const seg = $('presetSeg');
  PRESETS.forEach((pr, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'pre';
    const ds = RIG_ASSETS[pr.key], p = new paper.CompoundPath({ pathData: ds.join(' '), insert: false }), bb = p.bounds, m = 8, sz = Math.max(bb.width, bb.height) + m * 2;
    b.innerHTML = `<svg viewBox="${bb.center.x - sz / 2} ${bb.center.y - sz / 2} ${sz} ${sz}">${ds.map((d) => `<path d="${d}"/>`).join('')}</svg><span>${pr.name}</span>`;
    b.addEventListener('click', () => loadPreset(i));
    seg.appendChild(b);
  });
  function loadPreset(i) {
    const pr = PRESETS[i]; snap();
    [...seg.children].forEach((b, j) => b.classList.toggle('on', j === i));
    style = Object.assign({}, MANNEQUIN.STYLE, pr.style || {}); buildFigure(); RIG3D.setPose(fig, pr.pose); camera.fov = pr.cam.fov || 30; camera.updateProjectionMatrix();
    orbit.yaw = pr.cam.yaw; orbit.pitch = pr.cam.pitch; frame();
    syncAll(); render3(); apply();
  }

  // ---------- export ----------
  function svgText() {
    if (!lastResult) apply();
    const p = lastResult.path.clone({ insert: false }), b = p.bounds, m = 12;
    p.translate(new paper.Point(-b.x + m, -b.y + m));
    const w = Math.round((b.width + m * 2) * 100) / 100, h = Math.round((b.height + m * 2) * 100) / 100;
    const bg = $('expBg').checked ? `\n  <rect width="${w}" height="${h}" fill="${$('cBg').value}"/>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${bg}\n  <path fill="${$('cFig').value}" fill-rule="evenodd" d="${p.pathData.replace(/(\d+\.\d{3})\d+/g, '$1')}"/>\n</svg>\n`;
  }
  const say = (t) => { $('msg').textContent = t; clearTimeout(say.t); say.t = setTimeout(() => { $('msg').textContent = ''; }, 3200); };
  $('export').addEventListener('click', () => {
    const on = seg.querySelector('.pre.on span'), name = 'godbody-' + (on ? on.textContent.toLowerCase().replace(/\s+/g, '-') : 'pose') + '.svg';
    const url = URL.createObjectURL(new Blob([svgText()], { type: 'image/svg+xml' }));
    const link = document.createElement('a'); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000); say('Saved ' + name);
  });
  $('copy').addEventListener('click', () => { navigator.clipboard.writeText(svgText()).then(() => say('SVG code copied.'), () => say('Copy was blocked by the browser.')); });

  // ---------- start ----------
  $('undo').disabled = true;
  buildFigure(); select('elbowL'); frame(); syncAll();
  new ResizeObserver(resize).observe($('view'));
  resize(); loadPreset(0);
})();
