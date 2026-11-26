/* ===== a GESTALTA-style wooden artist's mannequin, dressed onto the figure's skeleton =====
   Faceless egg head, a peg neck, chest / abdomen / pelvis blocks with ball joints between them,
   ball joints at shoulders, elbows, wrists, hips, knees and ankles, tapered limbs, mitten hands and wedge feet.
   It shares the brand body's bones, so a pose here is exactly the pose Apply draws. */
const DOLL = (() => {
  // pine: pale wood with soft grain
  function woodTexture(seed, tone) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = tone; g.fillRect(0, 0, 256, 256);
    let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 46; i++) {
      const y0 = rnd() * 256, a = 0.035 + rnd() * 0.07, w = 0.6 + rnd() * 2.2, ph = rnd() * 6.28, f = 1 + rnd() * 2.5;
      g.strokeStyle = `rgba(150,105,60,${a})`; g.lineWidth = w; g.beginPath();
      for (let x = 0; x <= 256; x += 4) { const y = y0 + Math.sin(x / 256 * 6.28 * f + ph) * 5; x ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  }
  let mats = null;
  function materials() {
    if (mats) return mats;
    const wood = new THREE.MeshStandardMaterial({ color: 0xffffff, map: woodTexture(7, '#e8cfa6'), roughness: 0.72, metalness: 0 });
    const ball = new THREE.MeshStandardMaterial({ color: 0xffffff, map: woodTexture(11, '#dcbd8e'), roughness: 0.6, metalness: 0 });
    const sel = new THREE.MeshStandardMaterial({ color: 0xb9d4ff, roughness: 0.6, metalness: 0 });
    mats = { wood, ball, sel }; return mats;
  }
  // a rounded, tapered segment along +y from 0 to len (lathe), optionally flattened front-to-back
  function segment(r0, r1, len, round = 0.9, seg = 28) {
    const pts = [], N = 12, ra = Math.min(r0, len / 2) * round, rb = Math.min(r1, len / 2) * round;
    for (let i = 0; i <= N; i++) { const t = i / N * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(1e-3, (r0 - ra) + ra * Math.sin(t)), ra - ra * Math.cos(t))); }
    for (let i = 0; i <= N; i++) { const t = i / N * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(1e-3, (r1 - rb) + rb * Math.cos(t)), len - rb + rb * Math.sin(t))); }
    return new THREE.LatheGeometry(pts, seg);
  }
  const Y = new THREE.Vector3(0, 1, 0);
  function between(mesh, a, b) { const d = new THREE.Vector3().subVectors(b, a); mesh.position.copy(a); mesh.quaternion.setFromUnitVectors(Y, d.clone().normalize()); }

  // add the wooden parts to each joint of a built figure
  function dress(fig) {
    const M = materials(), parts = [];
    const add = (joint, mesh, mat) => { mesh.material = mat; mesh.userData.joint = joint; mesh.castShadow = true; fig.objs[joint].add(mesh); parts.push(mesh); return mesh; };
    const off = (n) => new THREE.Vector3().copy(fig.objs[n].position); // a joint's place in its parent
    const ball = (joint, r, at) => { const m = add(joint, new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16)), M.ball); if (at) m.position.copy(at); return m; };
    const seg = (joint, from, to, r0, r1, gap0, gap1, flat = 1, round = 0.9) => {
      const d = new THREE.Vector3().subVectors(to, from), L = d.length(), u = d.clone().normalize();
      const a = from.clone().addScaledVector(u, gap0), b = to.clone().addScaledVector(u, -gap1);
      const m = add(joint, new THREE.Mesh(segment(r0, r1, a.distanceTo(b), round)), M.wood);
      between(m, a, b); m.scale.set(1, 1, flat); return m;
    };
    const O = new THREE.Vector3();
    // pelvis block: a short wide rounded block with the hip sockets at its lower corners
    seg('pelvis', new THREE.Vector3(0, -15, -1), new THREE.Vector3(0, 20, 0), 21, 16.5, 0, 0, 0.72, 0.7);
    ball('spine', 10.5, O);                                        // waist ball
    seg('spine', new THREE.Vector3(0, 4, 0), off('chest'), 15.5, 16.5, 4, 2, 0.74, 0.8);   // abdomen
    ball('chest', 9, O);                                           // ball under the ribcage
    // chest: wide at the shoulders, narrowing to the waist
    seg('chest', new THREE.Vector3(0, 3, -1), new THREE.Vector3(0, 33, -1.5), 16, 22.5, 0, 0, 0.62, 0.75);
    ball('neck', 5.2, O);
    seg('neck', O, off('head'), 4.6, 4.2, 1, 0, 1, 0.5);           // peg neck
    // faceless egg head
    const head = add('head', new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28)), M.wood); head.position.set(0, 14, 1); head.scale.set(11.5, 15, 12.5);
    for (const s of ['L', 'R']) {
      ball('shoulder' + s, 7.2, O);
      seg('shoulder' + s, O, off('elbow' + s), 5.8, 4.6, 6, 4.8);
      ball('elbow' + s, 4.6, O);
      seg('elbow' + s, O, off('wrist' + s), 4.5, 3.4, 4.2, 3.4);
      ball('wrist' + s, 3.4, O);
      // mitten hand: a flat paddle with a thumb nub
      const hand = add('wrist' + s, new THREE.Mesh(segment(3.6, 2.6, 15, 0.9)), M.wood); hand.position.set(0, -3, 0.5); hand.rotation.x = Math.PI; hand.scale.set(1, 1, 0.45);
      const thumb = add('wrist' + s, new THREE.Mesh(segment(1.5, 1.2, 6, 0.9)), M.wood); thumb.position.set(0, -5, 2); thumb.rotation.set(Math.PI * 0.8, 0, 0);
      ball('hip' + s, 9.5, O);
      seg('hip' + s, O, off('knee' + s), 10.5, 7.2, 8.5, 6.6);
      ball('knee' + s, 6.8, O);
      seg('knee' + s, O, off('ankle' + s), 6.6, 4.4, 6.2, 4.4);
      ball('ankle' + s, 4.4, O);
      // wedge foot: low, longer toward the toes
      const foot = add('ankle' + s, new THREE.Mesh(segment(4.6, 3.2, 22, 0.9)), M.wood); foot.position.set(0, -5.5, -5); foot.rotation.x = Math.PI / 2 + 0.12; foot.scale.set(1.05, 1, 0.62);
    }
    fig.dollParts = parts;
    return parts;
  }
  function highlight(fig, joint) { const M = materials(); for (const m of fig.dollParts) { const isBall = m.geometry.type === 'SphereGeometry' && m.userData.joint !== 'head'; m.material = m.userData.joint === joint ? M.sel : (isBall ? M.ball : M.wood); } }
  return { dress, highlight };
})();
