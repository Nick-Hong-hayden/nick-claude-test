/* ===== the mannequin in three.js: build, pose, and hand its volumes to the 2D renderer ===== */
const RIG3D = (() => {
  const D2R = Math.PI / 180;
  const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

  // a round cone (two spheres joined by their tangent cone) as one mesh
  function roundConeGeometry(ra, rb, len, seg = 20) {
    const pts = [];
    // profile from the bottom pole (y = -ra, at a) round to the top pole (y = len + rb, at b)
    const b = ra - rb, L = Math.max(len, 1e-4), sinA = Math.max(-0.999, Math.min(0.999, b / L)), A = Math.asin(sinA);
    const N = 10;
    for (let i = 0; i <= N; i++) { const t = -Math.PI / 2 + (Math.PI / 2 + A) * i / N; pts.push(new THREE.Vector2(Math.max(1e-3, ra * Math.cos(t)), ra * Math.sin(t))); }
    for (let i = 0; i <= N; i++) { const t = A + (Math.PI / 2 - A) * i / N; pts.push(new THREE.Vector2(Math.max(1e-3, rb * Math.cos(t)), len + rb * Math.sin(t))); }
    return new THREE.LatheGeometry(pts, seg);
  }

  function build(style, material) {
    const defs = MANNEQUIN.joints(style), objs = {}, prims = [], meshes = [];
    const root = new THREE.Group();
    for (const j of defs) {
      const o = new THREE.Object3D(); o.name = j.n; o.position.set(...j.o); o.userData.rest = j.o.slice(); o.userData.restRot = j.r || [0, 0, 0];
      (j.p ? objs[j.p] : root).add(o); objs[j.n] = o;
      for (const pr of j.prims) {
        let m;
        if (pr[0] === 'sph') { m = new THREE.Mesh(new THREE.SphereGeometry(pr[2], 28, 18), material); m.position.set(...pr[1]); }
        else if (pr[0] === 'ell') { m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), material); m.position.set(...pr[1]); m.scale.set(...pr[2]); }
        else {
          const a = v3(pr[1]), b = v3(pr[2]), d = b.clone().sub(a), len = d.length();
          m = new THREE.Mesh(roundConeGeometry(pr[3], pr[4], len), material);
          m.position.copy(a); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
        }
        m.userData.joint = j.n; o.add(m); meshes.push(m);
        prims.push({ def: pr, obj: o });
      }
    }
    const tips = {};
    for (const [n, j, p] of MANNEQUIN.TIPS) { const t = new THREE.Object3D(); t.position.set(...p); objs[j].add(t); tips[n] = t; }
    return { root, objs, prims, meshes, style, tips };
  }

  // pose: { joint: [x, y, z] degrees }, applied on top of the rest pose; the figure then rests on the floor
  function setPose(fig, pose) {
    for (const n of MANNEQUIN.JOINT_NAMES) { const r = pose[n] || [0, 0, 0], o = fig.objs[n], q = o.userData.restRot; o.rotation.set((r[0] + q[0]) * D2R, (r[1] + q[1]) * D2R, (r[2] + q[2]) * D2R, 'XYZ'); }
    floor(fig);
  }
  function getPose(fig) {
    const out = {};
    for (const n of MANNEQUIN.JOINT_NAMES) { const o = fig.objs[n], e = o.rotation, q = o.userData.restRot; const v = [e.x, e.y, e.z].map((a, i) => Math.round((a / D2R - q[i]) * 10) / 10); if (v.some((x) => x)) out[n] = v; }
    return out;
  }
  function floor(fig) {
    const o = fig.objs.root; o.position.y = o.userData.rest[1]; fig.root.updateMatrixWorld(true);
    let lo = Infinity; const p = new THREE.Vector3();
    for (const pr of fig.prims) {
      const d = pr.def, M = pr.obj.matrixWorld;
      if (d[0] === 'cone') { for (const [q, r] of [[d[1], d[3]], [d[2], d[4]]]) { p.set(...q).applyMatrix4(M); lo = Math.min(lo, p.y - r); } }
      else if (d[0] === 'sph') { p.set(...d[1]).applyMatrix4(M); lo = Math.min(lo, p.y - d[2]); }
      else { // lowest point of a turned ellipsoid
        p.set(...d[1]).applyMatrix4(M); const R = new THREE.Matrix3().setFromMatrix4(M).elements; // column-major
        const ry = Math.sqrt((R[1] * d[2][0]) ** 2 + (R[4] * d[2][1]) ** 2 + (R[7] * d[2][2]) ** 2); lo = Math.min(lo, p.y - ry);
      }
    }
    o.position.y -= lo; fig.root.updateMatrixWorld(true);
  }

  // every volume in camera space, projected; s scales a volume by its own depth (D / depth)
  function extract(fig, camera, D) {
    fig.root.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    const V = camera.matrixWorldInverse, out = [], p = new THREE.Vector3();
    const persp = camera.isPerspectiveCamera;
    const proj = (q) => { p.set(...q); return p; };
    const toView = (q, M) => { const w = proj(q).applyMatrix4(M).applyMatrix4(V); const depth = -w.z, s = persp ? D / depth : 1; return { x: w.x * s, y: -w.y * s, z: depth, s }; };
    for (const pr of fig.prims) {
      const d = pr.def, M = pr.obj.matrixWorld;
      if (d[0] === 'sph') { const c = toView(d[1], M); out.push({ t: 'c', g: d[3], x: c.x, y: c.y, r: d[2] * c.s, z: c.z, rz: d[2], s: c.s }); }
      else if (d[0] === 'cone') { const a = toView(d[1], M), b = toView(d[2], M); out.push({ t: 'k', g: d[5], ax: a.x, ay: a.y, bx: b.x, by: b.y, ra: d[3] * a.s, rb: d[4] * b.s, za: a.z, zb: b.z, ra3: d[3], rb3: d[4], sa: a.s, sb: b.s }); }
      else {
        const c = toView(d[1], M);
        // ellipsoid axes in camera space: A = Rv * Rw * diag(radii); outline covariance = A Aᵀ (top 2×2), depth spread = row z
        const R = new THREE.Matrix4().multiplyMatrices(V, M).elements; // column-major, includes the joint's rotation
        const ax = [0, 1, 2].map((i) => [R[i * 4] * d[2][i], R[i * 4 + 1] * d[2][i], R[i * 4 + 2] * d[2][i]]);
        let cxx = 0, cxy = 0, cyy = 0, czz = 0; for (const a of ax) { cxx += a[0] * a[0]; cxy += a[0] * a[1]; cyy += a[1] * a[1]; czz += a[2] * a[2]; }
        const s2 = c.s * c.s;
        out.push({ t: 'e', g: d[3], x: c.x, y: c.y, cxx: cxx * s2, cxy: -cxy * s2, cyy: cyy * s2, z: c.z, rz: Math.sqrt(czz), s: c.s });
      }
    }
    // joints between groups, where cuts fade
    const joints = MANNEQUIN.ADJ.map(([a, b, j]) => {
      const o = fig.objs[j]; const w = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).applyMatrix4(V); const s = persp ? D / -w.z : 1;
      const child = fig.prims.find((q) => q.obj === o || (q.def[q.def.length - 1] === b));
      const r = child && child.def[0] === 'cone' ? child.def[3] : 10;
      return { a, b, x: w.x * s, y: -w.y * s, r: r * s };
    });
    // fingertips and toes: the drawing keeps them pointed
    const tips = ['handL', 'handR', 'toeL', 'toeR'].map((n) => { const w = new THREE.Vector3().setFromMatrixPosition(fig.tips[n].matrixWorld).applyMatrix4(V); const s = persp ? D / -w.z : 1; return [w.x * s, -w.y * s, 3]; });
    return { prims: out, joints, tips };
  }
  return { build, setPose, getPose, floor, extract };
})();
