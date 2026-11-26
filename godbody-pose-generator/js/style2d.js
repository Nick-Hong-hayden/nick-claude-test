/* ===== Apply: the mannequin's pose, drawn the way the GODBODY assets are drawn =====
   One flat cut-paper silhouette with smooth, fused contours. Where one body part passes in front of another,
   a thin slit of background (negative space) follows the front part's outline; the slit tapers to nothing
   where two parts grow from the same joint. Output: one compound path of cubic Béziers. */
const STYLE2D = (() => {
  const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

  // signed distance to a 2D round cone (two circles and their tangents), plus where along it the point falls
  function sdCone(px, py, q) {
    const bx = q.bx - q.ax, by = q.by - q.ay, h = bx * bx + by * by;
    const dx = px - q.ax, dy = py - q.ay;
    const t = h > 1e-9 ? Math.max(0, Math.min(1, (dx * bx + dy * by) / h)) : 0;
    const L = Math.sqrt(h), b = q.ra - q.rb;
    if (L <= Math.abs(b) + 1e-6) { // one end swallows the other (seen end-on)
      const big = q.ra >= q.rb; const cx = big ? q.ax : q.bx, cy = big ? q.ay : q.by, r = big ? q.ra : q.rb;
      return [Math.hypot(px - cx, py - cy) - r, big ? 0 : 1];
    }
    const qx = Math.abs((dx * by - dy * bx) / h), qy = (dx * bx + dy * by) / h; // in segment units
    const cx = Math.sqrt(h - b * b) / L, cy = b / L; // unit, scaled by L below
    const k = cx * qy - cy * qx, m = cx * qx + cy * qy, n = qx * qx + qy * qy;
    let d;
    if (k < 0) d = Math.sqrt(h * n) - q.ra;
    else if (k > cx) d = Math.sqrt(h * (n + 1 - 2 * qy)) - q.rb;
    else d = m * L - q.ra;
    return [d, t];
  }

  function render(P, opt) {
    const t0 = performance.now();
    const gap = opt.gap, kIn = opt.blend ?? 4.5, kAdj = opt.fillet ?? 7, res = opt.res || 460;
    const groups = [...new Set(P.prims.map((q) => q.g))], G = groups.length, gi = Object.fromEntries(groups.map((g, i) => [g, i]));
    // 2D extent of each volume
    for (const q of P.prims) {
      if (q.t === 'c') q.bb = [q.x - q.r, q.y - q.r, q.x + q.r, q.y + q.r];
      else if (q.t === 'k') q.bb = [Math.min(q.ax - q.ra, q.bx - q.rb), Math.min(q.ay - q.ra, q.by - q.rb), Math.max(q.ax + q.ra, q.bx + q.rb), Math.max(q.ay + q.ra, q.by + q.rb)];
      else { const ex = Math.sqrt(q.cxx), ey = Math.sqrt(q.cyy); q.bb = [q.x - ex, q.y - ey, q.x + ex, q.y + ey];
        // Cholesky of the outline covariance, for distance in ellipse units
        const l11 = Math.sqrt(q.cxx), l21 = q.cxy / l11, l22 = Math.sqrt(Math.max(1e-6, q.cyy - l21 * l21)); q.L = [l11, l21, l22];
        const det = q.cxx * q.cyy - q.cxy * q.cxy; q.Ci = [q.cyy / det, -q.cxy / det, q.cxx / det]; }
    }
    const X0 = Math.min(...P.prims.map((q) => q.bb[0])) - gap - 6, Y0 = Math.min(...P.prims.map((q) => q.bb[1])) - gap - 6;
    const X1 = Math.max(...P.prims.map((q) => q.bb[2])) + gap + 6, Y1 = Math.max(...P.prims.map((q) => q.bb[3])) + gap + 6;
    const step = Math.max(X1 - X0, Y1 - Y0) / res;
    const nx = Math.ceil((X1 - X0) / step) + 1, ny = Math.ceil((Y1 - Y0) / step) + 1, N = nx * ny;
    const dG = new Float32Array(G * N).fill(1e9), rG = new Float32Array(G * N).fill(1e9), zG = new Float32Array(G * N).fill(1e9), cG = new Float32Array(G * N).fill(1e9);
    const margin = gap + kAdj + 4;
    for (const q of P.prims) {
      const g = gi[q.g], off = g * N;
      const i0 = Math.max(0, Math.floor((q.bb[0] - margin - X0) / step)), i1 = Math.min(nx - 1, Math.ceil((q.bb[2] + margin - X0) / step));
      const j0 = Math.max(0, Math.floor((q.bb[1] - margin - Y0) / step)), j1 = Math.min(ny - 1, Math.ceil((q.bb[3] + margin - Y0) / step));
      for (let j = j0; j <= j1; j++) {
        const py = Y0 + j * step;
        for (let i = i0; i <= i1; i++) {
          const px = X0 + i * step, k = j * nx + i;
          let d, z, cz;
          if (q.t === 'c') { const r = Math.hypot(px - q.x, py - q.y); d = r - q.r; cz = q.z; z = q.z - (d < 0 ? Math.sqrt(q.r * q.r - r * r) / q.s : 0); }
          else if (q.t === 'k') {
            const [dd, t] = sdCone(px, py, q); d = dd;
            cz = q.za + (q.zb - q.za) * t; const r2 = q.ra + (q.rb - q.ra) * t, s = q.sa + (q.sb - q.sa) * t;
            const cx = q.ax + (q.bx - q.ax) * t, cy = q.ay + (q.by - q.ay) * t, dp = Math.hypot(px - cx, py - cy);
            z = cz - (dp < r2 ? Math.sqrt(r2 * r2 - dp * dp) / s : 0);
          } else {
            const ex = px - q.x, ey = py - q.y, ux = ex / q.L[0], uy = (ey - q.L[1] * ux) / q.L[2], u = Math.hypot(ux, uy);
            const gx = q.Ci[0] * ex + q.Ci[1] * ey, gy = q.Ci[1] * ex + q.Ci[2] * ey, k1 = Math.hypot(gx, gy);
            d = k1 > 1e-9 ? u * (u - 1) / k1 : -Math.pow(q.cxx * q.cyy, 0.25); cz = q.z; z = q.z - (u < 1 ? q.rz * Math.sqrt(1 - u * u) : 0);
          }
          const o = off + k, prev = dG[o];
          dG[o] = prev > 1e8 ? d : smin(prev, d, q.g === 'torso' ? kIn * 2 : kIn);
          // depth: the nearest surface among the volumes that cover the point, else the nearest volume's edge
          if (d < rG[o]) { rG[o] = d; cG[o] = cz; }
          if (d < 0) { if (zG[o] > 1e8 || z < zG[o]) zG[o] = z; }
          else if (zG[o] > 1e8 || (rG[o] >= 0 && d <= rG[o])) zG[o] = z;
        }
      }
    }
    // joints shared by two groups
    // shoulders and hips get a soft fillet; elbows and knees only a light one
    const adj = P.joints.filter((j) => gi[j.a] !== undefined && gi[j.b] !== undefined).map((j) => ({ a: gi[j.a], b: gi[j.b], x: j.x, y: j.y, r: j.r, k: j.a === 'torso' ? kAdj : kAdj * 0.3 }));
    const pairJoint = new Map(); for (const j of adj) { pairJoint.set(j.a * 64 + j.b, j); pairJoint.set(j.b * 64 + j.a, j); }
    const field = new Float32Array(N);
    for (let j = 0; j < ny; j++) {
      const py = Y0 + j * step;
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i, px = X0 + i * step;
        let cover = 1e9, K = -1, zK = 1e9, best = 1e9, bestG = -1;
        for (let g = 0; g < G; g++) { const d = dG[g * N + k]; if (d < cover) cover = d; if (d < best) { best = d; bestG = g; } if (d < 0 && zG[g * N + k] < zK) { zK = zG[g * N + k]; K = g; } }
        for (const a of adj) { const s = smin(dG[a.a * N + k], dG[a.b * N + k], a.k); if (s < cover) cover = s; }
        let f = cover;
        if (cover < 0 && gap > 0) {
          if (K < 0) { K = bestG; zK = zG[K * N + k]; } // inside a fillet between two parts
          for (let F = 0; F < G; F++) {
            if (F === K) continue;
            const dF = dG[F * N + k]; if (dF < 0 || dF >= gap) continue;
            if (!(cG[F * N + k] < cG[K * N + k] - 1)) continue; // only a part in front cuts (compared at their centre lines)
            let w = gap;
            const jt = pairJoint.get(F * 64 + K);
            if (jt) { const dd = Math.hypot(px - jt.x, py - jt.y), r0 = jt.r * 0.9, r1 = jt.r * 1.9 + gap * 2, t = Math.max(0, Math.min(1, (dd - r0) / (r1 - r0))); w *= t * t * (3 - 2 * t); }
            if (dF < w) f = Math.max(f, Math.min(dF, w - dF));
          }
        }
        field[k] = f;
      }
    }
    if (opt.noContour) return { mask: { field, nx, ny, X0, Y0, step } };
    // outline: marching squares on the field, then curves
    const loops = contour(field, nx, ny, X0, Y0, step);
    const cp = new paper.CompoundPath({ insert: false });
    const shoelace = (l) => { let a = 0; for (let i = 0; i < l.length; i++) { const p = l[i], q = l[(i + 1) % l.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
    const perim = (l) => { let s = 0; for (let i = 0; i < l.length; i++) { const p = l[i], q = l[(i + 1) % l.length]; s += Math.hypot(q[0] - p[0], q[1] - p[1]); } return s; };
    const big = loops.reduce((m, l) => Math.abs(shoelace(l)) > Math.abs(m ? shoelace(m) : 0) ? l : m, null), solid = big ? Math.sign(shoelace(big)) : 1;
    for (const l of loops) {
      const A = shoelace(l), isHole = Math.sign(A) !== solid, a = Math.abs(A);
      if (isHole ? a < 3 : (a < (opt.minArea ?? 30) || (a < 160 && a / perim(l) < 1.1))) continue;
      // drop repeated points (they break the curve fitter), then ease the cell steps a little
      const pts = []; for (const q of l) { const p = pts[pts.length - 1]; if (!p || Math.hypot(q[0] - p[0], q[1] - p[1]) > step * 0.2) pts.push(q); }
      if (pts.length > 2 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < step * 0.2) pts.pop();
      if (pts.length < 6) continue;
      // corners: fingertips and toes (where the mannequin's tips land), plus any very sharp turn such as the end of a slit
      const n = pts.length, w = Math.max(2, Math.round(1.6 / step));
      const turnAt = (arr, k) => { const a = arr[(k - w + n) % n], p = arr[k], b = arr[(k + w) % n]; const ux = p[0] - a[0], uy = p[1] - a[1], vx = b[0] - p[0], vy = b[1] - p[1]; return Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)); };
      const T = pts.map((_, k) => turnAt(pts, k));
      const corner = new Uint8Array(n);
      for (let k = 0; k < n; k++) { if (T[k] < (opt.cornerAngle ?? 1.75)) continue; let peak = true; for (let o = -w; o <= w; o++) if (o && T[(k + o + n) % n] > T[k]) { peak = false; break; } if (peak) corner[k] = 1; }
      for (const tp of (P.tips || [])) { let bi = -1, bd = 1e9; for (let k = 0; k < n; k++) { const d = Math.hypot(pts[k][0] - tp[0], pts[k][1] - tp[1]); if (d < bd) { bd = d; bi = k; } } if (bi >= 0 && bd < (tp[2] || 3) * 1.6) { for (let o = -w; o <= w; o++) corner[(bi + o + n) % n] = 0; let best = bi; for (let o = -w; o <= w; o++) if (T[(bi + o + n) % n] > T[best]) best = (bi + o + n) % n; corner[best] = 1; } }
      // smooth (shape-keeping), holding the corners still and easing less near them
      const hold = new Float32Array(n); for (let k = 0; k < n; k++) if (corner[k]) for (let o = -2 * w; o <= 2 * w; o++) { const j = (k + o + n) % n; hold[j] = Math.max(hold[j], 1 - Math.abs(o) / (2 * w + 1)); }
      let sm = pts;
      for (let it = 0; it < (opt.smooth ?? 6); it++) for (const lam of [0.5, -0.53]) {
        sm = sm.map((p, k) => { if (corner[k]) return p; const a = sm[(k - 1 + n) % n], b = sm[(k + 1) % n], f = lam * (1 - hold[k]); return [p[0] + f * ((a[0] + b[0]) / 2 - p[0]), p[1] + f * ((a[1] + b[1]) / 2 - p[1])]; });
      }
      if (Math.abs(shoelace(sm)) < (opt.minArea ?? 14)) continue;
      const tol = Math.max(0.05, step * (opt.tolerance ?? 1.4));
      const cs = []; for (let k = 0; k < n; k++) if (corner[k]) cs.push(k);
      let path;
      if (!cs.length) {
        // no corner: open the loop at its sharpest turn, fit, close
        let bi = 0; for (let k = 1; k < n; k++) if (T[k] > T[bi]) bi = k;
        path = new paper.Path({ segments: sm.slice(bi).concat(sm.slice(0, bi + 1)), insert: false });
        path.simplify(tol);
        const sg = path.segments; if (sg.length > 2) { sg[0].handleIn = sg[sg.length - 1].handleIn; sg[sg.length - 1].remove(); }
      } else {
        // fit each run between corners on its own; corners keep a sharp point
        path = new paper.Path({ insert: false });
        for (let c = 0; c < cs.length; c++) {
          const a = cs[c], b = cs[(c + 1) % cs.length], run = [];
          for (let k = a; ; k = (k + 1) % n) { run.push(sm[k]); if (k === b && run.length > 1) break; if (run.length > n + 1) break; }
          const part = new paper.Path({ segments: run, insert: false });
          if (run.length > 3) part.simplify(tol);
          const sg = part.segments;
          for (let i = 0; i < sg.length - 1; i++) {
            if (i === 0 && path.segments.length) { path.lastSegment.handleOut = sg[0].handleOut; continue; }
            path.add(sg[i].clone());
          }
          path.add(new paper.Segment(sg[sg.length - 1].point, sg[sg.length - 1].handleIn, null));
        }
        // the last run ends on the first corner: fold it into the start
        const sg = path.segments; if (sg.length > 2) { sg[0].handleIn = sg[sg.length - 1].handleIn; sg[sg.length - 1].remove(); }
      }
      path.closed = true;
      cp.addChild(path);
    }
    return { path: cp, d: cp.pathData, ms: performance.now() - t0, step, mask: opt.wantMask ? { field, nx, ny, X0, Y0, step } : null };
  }

  function contour(F, nx, ny, X0, Y0, st) {
    const segs = [];
    const lerp = (a, b, fa, fb) => { const t = fa / (fa - fb); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = F[j * nx + i], b = F[j * nx + i + 1], c = F[(j + 1) * nx + i + 1], d = F[(j + 1) * nx + i];
      const code = (a < 0 ? 8 : 0) | (b < 0 ? 4 : 0) | (c < 0 ? 2 : 0) | (d < 0 ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const A = [X0 + i * st, Y0 + j * st], B = [A[0] + st, A[1]], C = [A[0] + st, A[1] + st], D = [A[0], A[1] + st];
      const T = () => lerp(A, B, a, b), R = () => lerp(B, C, b, c), Bo = () => lerp(D, C, d, c), L = () => lerp(A, D, a, d);
      const e = (p, q) => segs.push([p, q, `${i},${j}`]);
      // edges keyed by cell side so loops join exactly
      const kT = `h${i},${j}`, kR = `v${i + 1},${j}`, kB = `h${i},${j + 1}`, kL = `v${i},${j}`;
      const S = (k1, p1, k2, p2) => segs.push({ k1, p1, k2, p2 });
      switch (code) {
        case 1: S(kB, Bo(), kL, L()); break; case 2: S(kR, R(), kB, Bo()); break; case 3: S(kR, R(), kL, L()); break;
        case 4: S(kT, T(), kR, R()); break; case 5: S(kT, T(), kL, L()); S(kB, Bo(), kR, R()); break; case 6: S(kT, T(), kB, Bo()); break;
        case 7: S(kT, T(), kL, L()); break; case 8: S(kL, L(), kT, T()); break; case 9: S(kB, Bo(), kT, T()); break;
        case 10: S(kL, L(), kB, Bo()); S(kR, R(), kT, T()); break; case 11: S(kR, R(), kT, T()); break; case 12: S(kL, L(), kR, R()); break;
        case 13: S(kB, Bo(), kR, R()); break; case 14: S(kL, L(), kB, Bo()); break;
      }
    }
    const from = new Map(); for (const s of segs) if (s.k1) from.set(s.k1, s);
    const used = new Set(), loops = [];
    for (const s of segs) {
      if (!s.k1 || used.has(s)) continue;
      const loop = []; let cur = s;
      while (cur && !used.has(cur)) { used.add(cur); loop.push(cur.p1); cur = from.get(cur.k2); }
      loops.push(loop);
    }
    return loops;
  }
  return { render };
})();
