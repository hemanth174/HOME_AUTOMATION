/** Parse supported DXF entities into line-segment vertex coordinates. */
export function parseDXF(text) {
  const lines = text.split(/\r?\n/);
  const segments = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line) {
      i++;
      continue;
    }

    const code = parseInt(line.trim(), 10);
    const val = lines[i + 1] ? lines[i + 1].trim() : '';

    if (code === 0 && val === 'LINE') {
      let x1 = 0, y1 = 0, z1 = 0, x2 = 0, y2 = 0, z2 = 0;
      i += 2;
      while (i < lines.length) {
        if (!lines[i]) { i++; continue; }
        const c = parseInt(lines[i].trim(), 10);
        const v = lines[i + 1] ? lines[i + 1].trim() : '';
        if (c === 0) { i -= 2; break; }
        if (c === 10) x1 = parseFloat(v);
        if (c === 20) y1 = parseFloat(v);
        if (c === 30) z1 = parseFloat(v);
        if (c === 11) x2 = parseFloat(v);
        if (c === 21) y2 = parseFloat(v);
        if (c === 31) z2 = parseFloat(v);
        i += 2;
      }
      segments.push(x1, y1, z1, x2, y2, z2);
    } else if (code === 0 && val === 'LWPOLYLINE') {
      const vertices = [];
      let elevation = 0;
      let closed = false;
      i += 2;
      while (i < lines.length) {
        if (!lines[i]) { i++; continue; }
        const c = parseInt(lines[i].trim(), 10);
        const v = lines[i + 1] ? lines[i + 1].trim() : '';
        if (c === 0) { i -= 2; break; }
        if (c === 70) closed = (parseInt(v, 10) & 1) === 1;
        if (c === 10) vertices.push({ x: parseFloat(v), y: 0 });
        if (c === 20 && vertices.length > 0) vertices[vertices.length - 1].y = parseFloat(v);
        if (c === 38) elevation = parseFloat(v);
        i += 2;
      }
      for (let k = 0; k < vertices.length - 1; k++) {
        segments.push(vertices[k].x, vertices[k].y, elevation, vertices[k + 1].x, vertices[k + 1].y, elevation);
      }
      if (closed && vertices.length > 1) {
        segments.push(vertices[vertices.length - 1].x, vertices[vertices.length - 1].y, elevation, vertices[0].x, vertices[0].y, elevation);
      }
    } else if (code === 0 && (val === 'CIRCLE' || val === 'ARC')) {
      let cx = 0, cy = 0, cz = 0, r = 0, startAngle = 0, endAngle = 360;
      i += 2;
      while (i < lines.length) {
        if (!lines[i]) { i++; continue; }
        const c = parseInt(lines[i].trim(), 10);
        const v = lines[i + 1] ? lines[i + 1].trim() : '';
        if (c === 0) { i -= 2; break; }
        if (c === 10) cx = parseFloat(v);
        if (c === 20) cy = parseFloat(v);
        if (c === 30) cz = parseFloat(v);
        if (c === 40) r = parseFloat(v);
        if (c === 50) startAngle = parseFloat(v);
        if (c === 51) endAngle = parseFloat(v);
        i += 2;
      }
      if (val === 'CIRCLE') {
        startAngle = 0;
        endAngle = 360;
      } else if (endAngle < startAngle) {
        endAngle += 360;
      }
      const steps = val === 'CIRCLE' ? 32 : 16;
      for (let k = 0; k < steps; k++) {
        const t1 = startAngle + (k / steps) * (endAngle - startAngle);
        const t2 = startAngle + ((k + 1) / steps) * (endAngle - startAngle);
        const theta1 = (t1 * Math.PI) / 180;
        const theta2 = (t2 * Math.PI) / 180;
        segments.push(cx + Math.cos(theta1) * r, cy + Math.sin(theta1) * r, cz, cx + Math.cos(theta2) * r, cy + Math.sin(theta2) * r, cz);
      }
    }
    i += 2;
  }
  return segments;
}
