/* ===== GODBODY mannequin =====
   A jointed 3D figure built to the brand drawings' proportions (standing height ≈ 281 units, as in the Stand asset).
   y is up, the figure faces +z, its left side is +x. Every body volume is a primitive tied to one joint:
   'ell' ellipsoid [centre, radii], 'sph' sphere [centre, r], 'cone' round cone [a, b, ra, rb].
   Each primitive belongs to a group; groups are the shapes the drawing keeps apart with negative space. */
const MANNEQUIN = (() => {
  const S = (side) => (side === 'L' ? 1 : -1);
  function joints(st) {
    const h = st.hips, t = st.thighs, a = st.arms, hd = st.head, bu = st.bust, to = st.torso ?? 1, c = st.calves ?? 1, L = st.legs ?? 1, A = st.reach ?? 1;
    const J = [
      { n: 'root', p: null, o: [0, 150, 0], prims: [] },
      { n: 'pelvis', p: 'root', o: [0, 0, 0], prims: [
        ['ell', [0, 8, -1], [33 * h, 22, 24 * h], 'torso'],
        ['sph', [13 * h, 3, -13 * h], 20 * h, 'torso'], ['sph', [-13 * h, 3, -13 * h], 20 * h, 'torso'],
        ['ell', [0, 25, 6], [17 * to, 15, 14.5 * to], 'torso']] },
      { n: 'spine', p: 'root', o: [0, 32, 0], prims: [['ell', [0, 6, 1.5], [21 * to, 16, 18 * to], 'torso']] },
      { n: 'chest', p: 'spine', o: [0, 24, 0], prims: [
        ['ell', [0, 13, -1], [21 * to, 19, 15.5 * to], 'torso'],
        ['sph', [8, 6, 9.5], 7 * bu, 'torso'], ['sph', [-8, 6, 9.5], 7 * bu, 'torso'],
        ['ell', [0, 25, -2], [24 * to, 9, 12 * to], 'torso']] },
      { n: 'neck', p: 'chest', o: [0, 34, -1.5], prims: [['cone', [0, -5, 0], [0, 11, 1.5], 6, 5, 'head']] },
      { n: 'head', p: 'neck', o: [0, 10, 1.5], prims: [['ell', [0, 13 * hd, 1.5], [10.5 * hd, 13.5 * hd, 12 * hd], 'head'], ['ell', [0, 6 * hd, 4 * hd], [7.5 * hd, 7 * hd, 8 * hd], 'head']] },
    ];
    for (const s of ['L', 'R']) {
      const x = S(s);
      J.push(
        { n: 'shoulder' + s, p: 'chest', o: [22 * x, 26, -2], r: [0, 0, 13 * x], prims: [['cone', [0, 0, 0], [0, -48 * A, 0], 8 * a, 5.4 * a, 'uarm' + s]] },
        { n: 'elbow' + s, p: 'shoulder' + s, o: [0, -48 * A, 0], r: [-6, 0, -3 * x], prims: [['cone', [0, 0, 0], [0, -44 * A, 0], 5 * a, 3.2 * a, 'farm' + s]] },
        { n: 'wrist' + s, p: 'elbow' + s, o: [0, -44 * A, 0], prims: [['cone', [0, 0, 0], [0, -7, 0.5], 3.2 * a, 3.55 * a, 'farm' + s], ['cone', [0, -7, 0.5], [0, -20, 1.5], 3.55 * a, 0.4, 'farm' + s]] },
        { n: 'hip' + s, p: 'pelvis', o: [11 * x, -4, 0], prims: [['cone', [0, 0, 0], [0, -24 * L, 0], 25 * t, 21.5 * t, 'thigh' + s], ['cone', [0, -24 * L, 0], [0, -61 * L, 0.5], 21.5 * t, 11 * t, 'thigh' + s]] },
        { n: 'knee' + s, p: 'hip' + s, o: [0, -66 * L, 0], prims: [['cone', [0, 2, 0], [0, -17 * L, -2], 10.5 * c, 12 * c, 'shin' + s], ['cone', [0, -17 * L, -2], [0, -59 * L, 0], 12 * c, 4.3, 'shin' + s]] },
        { n: 'ankle' + s, p: 'knee' + s, o: [0, -62 * L, 0], prims: [['cone', [0, 0, 0], [0, -6, -2.5], 4.4, 4.3, 'shin' + s], ['cone', [0, -6, -1], [0, -8, 18], 4.3, 0.5, 'shin' + s]] },
      );
    }
    return J;
  }
  // which group grows from which, and at which joint (the cut between them fades out there)
  const ADJ = [['torso', 'head', 'neck'], ['torso', 'uarmL', 'shoulderL'], ['torso', 'uarmR', 'shoulderR'], ['uarmL', 'farmL', 'elbowL'], ['uarmR', 'farmR', 'elbowR'],
    ['torso', 'thighL', 'hipL'], ['torso', 'thighR', 'hipR'], ['thighL', 'shinL', 'kneeL'], ['thighR', 'shinR', 'kneeR']];
  // end points that can be dragged, and the joint they turn
  const TIPS = [['headTop', 'head', [0, 27, 1.5]], ['handL', 'wristL', [0, -20, 1.5]], ['handR', 'wristR', [0, -20, 1.5]], ['toeL', 'ankleL', [0, -8, 18]], ['toeR', 'ankleR', [0, -8, 18]]];
  const STYLE = { hips: 1.08, thighs: 1.15, torso: 1, calves: 1, arms: 1.08, head: 1, bust: 1, legs: 1, reach: 1 };
  const JOINT_NAMES = ['root', 'pelvis', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR', 'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR'];
  return { joints, ADJ, TIPS, STYLE, JOINT_NAMES };
})();
