"""Rebuilds the Lottie animations tools/export.html rendered frame by frame as SVGs that play by SMIL
alone (the Desktop band takes no script, no <style> and no embedded image), into a TypeScript module.

Each stroke or fill becomes one <path> in its own coordinates. Where its layers move it as a whole, the
cumulative transform is kept and animated (translate, rotate, skew and scale, interpolated between
keyframes), so the outline is written once; only an outline that changes shape gets an <animate> of its
`d`, interpolated when its commands keep their shape and discrete otherwise. Visibility and opacity
animate the same way when they change. Coordinates are rounded to what the canvas needs: a thousandth
of it or finer once the layer's scale is applied.

Black and white (and colors all but black or white) become `{L}` and `{F}`, the line and fill colors the plugin swaps for the theme, and
`__DUR__` stands where the loop's duration goes, so the plugin plays a scene at any speed.

A backdrop filling the canvas and a ground line the figure walks on the spot over are left out: the band has a
background of its own, and the plugin draws a ground of its own for the cat to walk across.

usage: python3 tools/lottie_svg.py <frames dir> <out .ts> [keyframes per second, default 10]
"""
import glob, json, math, os, re, sys
import xml.etree.ElementTree as ET

NUM = re.compile(r'-?\d*\.?\d+(?:e-?\d+)?')
PAINT = ('fill', 'stroke', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'fill-opacity', 'stroke-opacity', 'fill-rule', 'stroke-dasharray', 'stroke-dashoffset')
IDENTITY = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)


def matrix_of(transform):
    if not transform:
        return IDENTITY
    m = re.match(r'matrix\(([^)]*)\)', transform.strip())
    if not m:
        raise ValueError(f'unexpected transform {transform}')
    return tuple(float(v) for v in re.split(r'[\s,]+', m.group(1).strip()))


def multiply(p, q):
    a, b, c, d, e, f = p
    A, B, C, D, E, F = q
    return (a * A + c * B, b * A + d * B, a * C + c * D, b * C + d * D, a * E + c * F + e, b * E + d * F + f)


def decompose(m):
    """matrix = translate(e, f) · rotate(θ) · skewX(φ) · scale(sx, sy), in degrees for the angles."""
    a, b, c, d, e, f = m
    sx = math.hypot(a, b)
    if sx < 1e-9:
        return (e, f, 0.0, 0.0, 0.0, 0.0)
    theta = math.atan2(b, a)
    cos, sin = math.cos(theta), math.sin(theta)
    k = c * cos + d * sin  # the second column turned back by θ: (k, sy)
    sy = -c * sin + d * cos
    phi = math.degrees(math.atan2(k, sy)) if abs(sy) > 1e-9 else 0.0
    return (e, f, math.degrees(theta), phi, sx, sy)


def color(v):
    m = re.match(r'rgb\((\d+),\s*(\d+),\s*(\d+)\)', v or '')
    return '#%02x%02x%02x' % tuple(int(x) for x in m.groups()) if m else v


def num(v, decimals):
    s = f'{v:.{decimals}f}'
    if '.' in s:
        s = s.rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def path_data(d, decimals):
    """A path's data with its numbers rounded, and its commands as a signature of its shape."""
    tokens = re.findall(NUM.pattern + r'|[A-Za-z]', d)
    out, sig = [], []
    for t in tokens:
        if t.isalpha():
            out.append(t)
            sig.append(t)
        else:
            out.append(num(float(t), decimals))
    text = ' '.join(out)
    text = re.sub(r' ?([A-Za-z]) ?', r'\1', text)
    return text, tuple(sig)


def leaves(layer_html):
    """Each <path> of a layer: its own data, the transform above it, its opacity, paint and whether it shows."""
    root = ET.fromstring(f'<g xmlns="http://www.w3.org/2000/svg">{layer_html}</g>')
    found = []

    def walk(el, m, opacity, shown):
        tag = el.tag.split('}')[-1]
        shown = shown and 'display: none' not in (el.get('style') or '')
        m = multiply(m, matrix_of(el.get('transform')))
        opacity *= float(el.get('opacity', '1'))
        if tag == 'path':
            d = (el.get('d') or '').strip()
            found.append({
                'd': d, 'm': m, 'opacity': round(opacity, 3),
                'shown': shown and bool(d) and opacity > 0.001,
                'stroke-width': el.get('stroke-width'),
                'paint': {k: color(el.get(k)) for k in PAINT if el.get(k) is not None},
            })
        for child in el:
            walk(child, m, opacity, shown)

    walk(root, IDENTITY, 1.0, True)
    return found


def painted(leaf):
    paint = leaf['paint']
    fills = paint.get('fill') not in (None, 'none') and paint.get('fill-opacity') != '0'
    strokes = paint.get('stroke') not in (None, 'none') and paint.get('stroke-opacity') != '0'
    return leaf['shown'] and leaf['opacity'] > 0.01 and (fills or strokes)


def leaf_bounds(leaf):
    a, b, c, d, e, f = leaf['m']
    coords = [float(v) for v in NUM.findall(leaf['d'])]
    xs = [a * px + c * py + e for px, py in zip(coords[0::2], coords[1::2])]
    ys = [b * px + d * py + f for px, py in zip(coords[0::2], coords[1::2])]
    return (min(xs), min(ys), max(xs), max(ys)) if xs else None


def backdrops(frames, canvas):
    """The paths that fill (most of) the canvas in every frame they show: a backdrop, which the band has its own of."""
    if canvas is None:
        return set()
    cw, ch = canvas
    found = set()
    for idx in range(len(frames[0])):
        shown = [f[idx] for f in frames if f[idx]['shown']]
        if not shown or shown[0]['paint'].get('stroke') not in (None, 'none'):
            continue
        boxes = [leaf_bounds(leaf) for leaf in shown]
        if all(box and (min(box[2], cw) - max(box[0], 0)) * (min(box[3], ch) - max(box[1], 0)) >= 0.9 * cw * ch for box in boxes):
            found.add(idx)
    return found


def grounds(frames, canvas):
    """The stroked lines that lie flat across much of the canvas in every frame they show: the ground a figure walks
    on the spot over, which the plugin draws its own of, lying still for the figure to walk across."""
    if canvas is None:
        return set()
    cw, ch = canvas
    found = set()
    for idx in range(len(frames[0])):
        shown = [f[idx] for f in frames if painted(f[idx])]
        if not shown or shown[0]['paint'].get('stroke') in (None, 'none') or shown[0]['paint'].get('fill') not in (None, 'none'):
            continue
        boxes = [leaf_bounds(leaf) for leaf in shown]
        if all(box and box[3] - box[1] <= 0.01 * ch for box in boxes) and max(box[2] - box[0] for box in boxes) >= 0.3 * cw:
            found.add(idx)
    return found


def hide_scenery(frames, canvas):
    """Hides what is scenery rather than the figure, in every frame: a backdrop, and the ground it walks on.
    Returns the top of that ground, where the figure meets it (the highest line, where there are several), or None."""
    found = grounds(frames, canvas)
    for idx in backdrops(frames, canvas) | found:
        for frame in frames:
            frame[idx]['shown'] = False
    tops = []
    for idx in found:
        leaf = next(f[idx] for f in frames if painted(f[idx]) or f[idx]['d'])
        a, b, c, d, _, _ = leaf['m']
        half = float(leaf['stroke-width'] or 0) * math.sqrt(abs(a * d - b * c)) / 2
        tops.append(leaf_bounds(leaf)[1] - half)
    return round(min(tops), 1) if tops else None


def painted_bounds(frames, canvas):
    """The box round every painted path in every frame, by its points and control points. Specks (confetti,
    sparkles flying off) frame nothing: where one strays past the box it is cut, and the cat stays large."""
    speck = 0.002 * canvas[0] * canvas[1] if canvas else 0
    x0 = y0 = math.inf
    x1 = y1 = -math.inf
    for frame in frames:
        for leaf in frame:
            if not painted(leaf):
                continue
            box = leaf_bounds(leaf)
            if box and (box[2] - box[0]) * (box[3] - box[1]) >= speck:
                x0, y0, x1, y1 = min(x0, box[0]), min(y0, box[1]), max(x1, box[2]), max(y1, box[3])
    return None if x0 == math.inf else (x0, y0, x1 - x0, y1 - y0)


def paint_attrs(leaf):
    """A path's paint as attributes, defaults left out."""
    attrs = dict(leaf['paint'])
    if attrs.get('fill-opacity') == '0':
        attrs['fill'] = 'none'
        del attrs['fill-opacity']
    for k in ('fill-opacity', 'stroke-opacity'):
        if attrs.get(k) == '1':
            del attrs[k]
    if attrs.get('stroke-miterlimit') == '4':
        del attrs['stroke-miterlimit']
    if leaf['stroke-width'] is not None and attrs.get('stroke'):
        attrs['stroke-width'] = leaf['stroke-width']
    return attrs


def theme_token(hex6):
    """Black and white, and the colors all but black or white, as the tokens the plugin swaps for the theme."""
    channels = [int(hex6[i:i + 2], 16) for i in (0, 2, 4)]
    if max(channels) <= 0x20:
        return '{L}'
    if min(channels) >= 0xf0:
        return '{F}'
    return '#' + hex6


def retheme(markup, rename):
    """Markup with its gradients under their new names and black and white as theme tokens."""
    markup = re.sub(r'url\(#([^)]+)\)', lambda m: f'url(#{rename.get(m.group(1), m.group(1))})', markup)
    return re.sub(r'#([0-9a-f]{6})', lambda m: theme_token(m.group(1)), markup)


def finish(data, body, frames):
    """The markup with its gradients and theme tokens, and the frame round what it paints."""
    rename, defs = gradients(data)
    markup = retheme((f'<defs>{defs}</defs>' if defs else '') + body, rename)
    x, y, w, h = painted_bounds(frames, data.get('canvas')) or data['bbox']
    if 'canvas' in data:
        cw, ch = data['canvas']
        x0, y0, x1, y1 = max(x, 0), max(y, 0), min(x + w, cw), min(y + h, ch)
        x, y, w, h = x0, y0, x1 - x0, y1 - y0
    pad = max(w, h) * 0.02
    return markup, [round(x - pad, 1), round(y - pad, 1), round(w + 2 * pad, 1), round(h + 2 * pad, 1)]


def static_path(leaf, unit):
    """One path as it stands in one frame, no animation, its numbers kept to `unit` of the canvas."""
    attrs = paint_attrs(leaf)
    m = leaf['m']
    if m != IDENTITY:
        attrs['transform'] = 'matrix(' + ' '.join(num(v, 4 if i < 4 else max(0, math.ceil(-math.log10(unit)))) for i, v in enumerate(m)) + ')'
    if leaf['opacity'] < 1:
        attrs['opacity'] = num(leaf['opacity'], 3)
    scale = math.sqrt(abs(m[0] * m[3] - m[1] * m[2])) or 1
    d_decimals = min(3, max(0, math.ceil(-math.log10(unit / scale))))
    return f'<path d="{path_data(leaf["d"], d_decimals)[0]}"' + ''.join(f' {k}="{v}"' for k, v in attrs.items()) + '/>'


def dial(data, steps=25):
    """A gauge whose needle the plugin points: the dial drawn once, and the needle at `steps` angles from its
    rest to the farthest it swings. The needle is whatever the animation turns; the rest keeps its first frame."""
    frames = [[p for layer in fr['layers'] for p in leaves(layer)] for fr in data['frames']]
    hide_scenery(frames, data.get('canvas'))
    count = len(frames[0])
    needle = [i for i in range(count) if len({f[i]['m'] for f in frames}) > 1 and any(f[i]['shown'] for f in frames)]
    if not needle:
        raise ValueError(f"{data['name']}: nothing turns, so there is no needle")
    angles = [decompose(f[needle[0]]['m'])[2] for f in frames]
    unwrapped = [angles[0]]
    for a in angles[1:]:
        while a - unwrapped[-1] > 180:
            a -= 360
        while a - unwrapped[-1] < -180:
            a += 360
        unwrapped.append(a)
    rest, far = unwrapped[0], max(unwrapped, key=lambda a: abs(a - unwrapped[0]))
    unit = max(data['bbox'][2], data['bbox'][3]) / 1000
    first, last = min(needle), max(needle)
    shown = lambda i: frames[0][i]['shown']
    before = ''.join(static_path(frames[0][i], unit) for i in range(first) if shown(i) and i not in needle)
    after = ''.join(static_path(frames[0][i], unit) for i in range(last + 1, count) if shown(i) and i not in needle)
    needles = []
    for k in range(steps):
        target = rest + (far - rest) * k / (steps - 1)
        f = min(range(len(frames)), key=lambda j: abs(unwrapped[j] - target))
        needles.append(''.join(static_path(frames[f][i], unit) for i in needle if frames[f][i]['shown']))
    markup, view = finish(data, '\u0001'.join([before, after]), frames)
    before_m, after_m = markup.split('\u0001')
    rename, _ = gradients(data)
    needles = [retheme(n, rename) for n in needles]
    print(f"{data['name']}: a dial, {len(needle)} needle paths over {round(far - rest)}°, {len(markup) + sum(map(len, needles))} chars")
    return {'viewBox': view, 'before': before_m, 'after': after_m, 'needles': needles}


def gradients(data):
    """The gradients the paths paint with, renamed for this scene so drawings side by side never share an id.
    Taken from the first frame: a gradient that changes over the loop keeps its first look."""
    gradient = re.compile(r'<(linearGradient|radialGradient)\b.*?</\1>', re.S)
    frames_defs = [f.get('defs', '') for f in data['frames']]
    defs = frames_defs[0] if frames_defs else ''
    if any([m.group(0) for m in gradient.finditer(d)] != [m.group(0) for m in gradient.finditer(defs)] for d in frames_defs):
        print(f"{data['name']}: its gradients change over the loop; they keep their first frame")
    used = set(re.findall(r'url\(#([^)]+)\)', ''.join(data['frames'][0]['layers'])))
    prefix = 'g' + re.sub(r'[^A-Za-z0-9]', '', data['name'])[-8:] + '_'
    rename, kept = {}, []
    for m in re.finditer(r'<(linearGradient|radialGradient)\b[^>]*\bid="([^"]+)"[^>]*>.*?</\1>', defs, re.S):
        if m.group(2) not in used:
            continue
        new_id = f'{prefix}{len(rename)}'
        rename[m.group(2)] = new_id
        element = m.group(0).replace(f'id="{m.group(2)}"', f'id="{new_id}"')
        element = re.sub(r'rgb\((\d+),\s*(\d+),\s*(\d+)\)', lambda c: '#%02x%02x%02x' % tuple(int(x) for x in c.groups()), element)
        element = re.sub(r'(-?\d+\.\d{3,})', lambda n: num(float(n.group(1)), 2), element)
        element = element.replace(' spreadMethod="pad"', '').replace('></stop>', '/>')
        kept.append(element)
    return rename, ''.join(kept)


def scene(data, keys_per_second, tolerance_share=0.015):
    frames = [[p for layer in fr['layers'] for p in leaves(layer)] for fr in data['frames']]
    count = len(frames[0])
    assert all(len(f) == count for f in frames), f"{data['name']}: the layers changed shape between frames"
    ground = hide_scenery(frames, data.get('canvas'))
    n = len(frames)
    seconds = n / data['fps']
    step = max(1, round(n / max(2, seconds * keys_per_second)))
    keys = list(range(0, n, step))
    canvas = max(data['bbox'][2], data['bbox'][3])
    # Numbers keep a fifteenth of the tolerance: a thousandth of the canvas at the finest setting
    unit = canvas * tolerance_share / 15
    canvas_decimals = max(0, math.ceil(-math.log10(unit)))

    def compress(values, mode, times):
        kept = [0]
        for i in range(1, len(values) - 1):
            if mode == 'linear' and values[i] == values[i - 1] == values[i + 1]:
                continue
            if mode == 'discrete' and values[i] == values[i - 1]:
                continue
            kept.append(i)
        kept.append(len(values) - 1)
        return [values[i] for i in kept], [times[i] for i in kept]

    def timing(ts):
        return ';'.join(num(t, 4) for t in ts)

    def animate(attr, values, mode, times):
        vals, ts = compress(values, mode, times)
        return f'<animate attributeName="{attr}" values="{";".join(vals)}" keyTimes="{timing(ts)}" calcMode="{mode}" dur="__DUR__" repeatCount="indefinite"/>'

    def animate_transform(kind, values, first, times):
        vals, ts = compress(values, 'linear', times)
        additive = '' if first else ' additive="sum"'
        return f'<animateTransform attributeName="transform" type="{kind}" values="{";".join(vals)}" keyTimes="{timing(ts)}" dur="__DUR__" repeatCount="indefinite"{additive}/>'

    def held_frames(seq):
        """Each frame's leaf, a hidden one standing in for the last shown (it draws nothing, so any value does)."""
        out, last = [], next(s for s in seq if s['shown'])
        for s in seq:
            if s['shown']:
                last = s
            out.append(last)
        return out

    def unwrap(angles):
        out = [angles[0]]
        for a in angles[1:]:
            while a - out[-1] > 180:
                a -= 360
            while a - out[-1] < -180:
                a += 360
            out.append(a)
        return out

    def compose(p):
        e, f, theta, phi, sx, sy = p
        t, k = math.radians(theta), math.tan(math.radians(phi))
        cos, sin = math.cos(t), math.sin(t)
        # rotate · skewX · scale
        a, b = cos * sx, sin * sx
        c, d = (cos * k - sin) * sy, (sin * k + cos) * sy
        return (a, b, c, d, e, f)

    def points(d):
        coords = [float(v) for v in NUM.findall(d)]
        return list(zip(coords[0::2], coords[1::2]))

    def lerp(u, v, t):
        return tuple(x + (y - x) * t for x, y in zip(u, v))

    def transform_error(params, leaves_all, a, b):
        """How far, in canvas units, the transform interpolated from frame a to b strays from each frame's own."""
        worst = 0.0
        for f in range(a + 1, b):
            t = (f - a) / (b - a)
            m_true, m_lerp = compose(params[f]), compose(lerp(params[a], params[b], t))
            for x, y in points(leaves_all[f]['d'])[:32]:
                ax, ay = m_true[0] * x + m_true[2] * y + m_true[4], m_true[1] * x + m_true[3] * y + m_true[5]
                bx, by = m_lerp[0] * x + m_lerp[2] * y + m_lerp[4], m_lerp[1] * x + m_lerp[3] * y + m_lerp[5]
                worst = max(worst, math.hypot(ax - bx, ay - by))
        return worst

    def outline_error(leaves_all, a, b, linear, scale):
        """How far, in canvas units, the outline from frame a to b strays from each frame's own."""
        start, stop = points(leaves_all[a]['d']), points(leaves_all[b]['d'])
        worst = 0.0
        for f in range(a + 1, b):
            true = points(leaves_all[f]['d'])
            guess = [lerp(p, q, (f - a) / (b - a)) for p, q in zip(start, stop)] if linear else start
            if len(guess) != len(true):
                return math.inf
            worst = max([worst] + [math.hypot(u[0] - v[0], u[1] - v[1]) * scale for u, v in zip(true, guess)])
        return worst

    def refine(keys, error):
        """Splits every stretch between keyframes whose in-between frames stray past the tolerance, until none do."""
        while True:
            out = [keys[0]]
            for a, b in zip(keys, keys[1:]):
                if b - a > 1 and error(a, b) > tolerance:
                    out.append((a + b) // 2)
                out.append(b)
            if len(out) == len(keys):
                return keys
            keys = out

    tolerance = canvas * tolerance_share
    sparse = list(range(0, n, step)) + [n]

    body = []
    for idx in range(count):
        leaves_all = [frames[f][idx] for f in range(n)]
        if not any(s['shown'] for s in leaves_all):
            continue
        leaves_all = held_frames(leaves_all) + [None]
        shown_all = [frames[f][idx]['shown'] for f in range(n)] + [frames[0][idx]['shown']]
        leaves_all[n] = leaves_all[0] if leaves_all[0] is not None else leaves_all[n - 1]
        matrices_all = [s['m'] for s in leaves_all]
        moves = len(set(matrices_all)) > 1
        signatures = {path_data(s['d'], 0)[1] for s in leaves_all}
        morphs = len({s['d'] for s in leaves_all}) > 1
        scale = max(math.sqrt(abs(m[0] * m[3] - m[1] * m[2])) for m in matrices_all) or 1

        params = None
        if moves:
            decomposed = [decompose(m) for m in matrices_all]
            angles = unwrap([p[2] for p in decomposed])
            params = [(p[0], p[1], a, p[3], p[4], p[5]) for p, a in zip(decomposed, angles)]

        # Keyframes for this path: the sparse set, split wherever interpolating strays from the frames (a flip, a snap)
        def error(a, b):
            worst = transform_error(params, leaves_all, a, b) if moves else 0.0
            if morphs:
                worst = max(worst, outline_error(leaves_all, a, b, len(signatures) == 1, scale))
            return worst

        keys = refine(sparse, error) if moves or morphs else sparse
        times = [k / n for k in keys]
        seq = [leaves_all[k] for k in keys]
        shown = [shown_all[k] for k in keys]

        first = next(s for s in leaves_all if s is not None and s['shown'])
        attrs = paint_attrs(first)
        inner = []

        # Paint that changes over the loop (a color fading in, a stroke thickening) animates; the rest is fixed
        for key in ('fill', 'stroke', 'fill-opacity', 'stroke-opacity', 'stroke-width'):
            values = [s['paint'].get(key) if key != 'stroke-width' else s['stroke-width'] for s in seq]
            if None not in values and len(set(values)) > 1 and attrs.get(key) != 'none':
                inner.append(animate(key, values, 'linear', times))

        # The transform: written once when it holds still, else its parts animated between keyframes
        d_decimals = min(3, max(0, math.ceil(-math.log10(unit / scale))))
        if not moves:
            m = matrices_all[0]
            if m != IDENTITY:
                attrs['transform'] = 'matrix(' + ' '.join(num(v, 4 if i < 4 else canvas_decimals) for i, v in enumerate(m)) + ')'
        else:
            parts = [params[k] for k in keys]
            tx = [f'{num(p[0], canvas_decimals)} {num(p[1], canvas_decimals)}' for p in parts]
            rot = [num(p[2], 2) for p in parts]
            skew = [num(p[3], 2) for p in parts]
            sc = [f'{num(p[4], 4)} {num(p[5], 4)}' for p in parts]
            inner.append(animate_transform('translate', tx, True, times))
            if any(r != '0' for r in rot):
                inner.append(animate_transform('rotate', rot, False, times))
            if any(v != '0' for v in skew):
                inner.append(animate_transform('skewX', skew, False, times))
            if any(v != '1 1' for v in sc):
                inner.append(animate_transform('scale', sc, False, times))

        ds = [path_data(s['d'], d_decimals) for s in seq]
        if len({text for text, _ in ds}) > 1:
            inner.append(animate('d', [text for text, _ in ds], 'linear' if len(signatures) == 1 else 'discrete', times))
        if len(set(shown)) > 1:
            inner.append(animate('visibility', ['visible' if v else 'hidden' for v in shown], 'discrete', times))
        ops = [num(s['opacity'], 3) for s in seq]
        if len(set(ops)) > 1:
            inner.append(animate('opacity', ops, 'linear', times))
        elif ops[0] != '1':
            attrs['opacity'] = ops[0]

        attr_text = ''.join(f' {k}="{v}"' for k, v in attrs.items())
        vis = '' if shown[0] else ' visibility="hidden"'
        open_tag = f'<path d="{ds[0][0]}"{attr_text}{vis}'
        body.append(f'{open_tag}>{"".join(inner)}</path>' if inner else f'{open_tag}/>')

    markup, view = finish(data, ''.join(body), frames)
    print(f"{data['name']}: {count} paths, {n} frames -> {len(keys)} keys, {len(markup)} chars")
    built = {'viewBox': view, 'seconds': round(seconds, 3), 'body': markup}
    return built if ground is None else {**built, 'ground': ground}


if __name__ == '__main__':
    src_dir, out_ts = sys.argv[1], sys.argv[2]
    keys_per_second = float(sys.argv[3]) if len(sys.argv) > 3 and not sys.argv[3].startswith('--') else 10
    dial_names = set(sys.argv[sys.argv.index('--dials') + 1].split(',')) if '--dials' in sys.argv else set()
    # A scene must fit the band's 131072-character SVG with room for its wrapper: one that doesn't is
    # rebuilt with fewer keyframes and a looser tolerance until it does
    budget = 120_000
    settings = [(keys_per_second, 0.015), (keys_per_second * 0.7, 0.025), (keys_per_second * 0.5, 0.04), (keys_per_second * 0.3, 0.06), (keys_per_second * 0.2, 0.1), (keys_per_second * 0.15, 0.15)]
    scenes, dials = {}, {}
    for path in sorted(glob.glob(os.path.join(src_dir, '*.json'))):
        data = json.load(open(path))
        if data['name'] in dial_names:
            dials[data['name']] = dial(data)
            continue
        for kps, share in settings:
            built = scene(data, kps, share)
            if len(built['body']) <= budget:
                break
        else:
            print(f"{data['name']}: over the budget even at its coarsest; left out")
            continue
        scenes[data['name']] = built
    with open(out_ts, 'w') as fh:
        fh.write('// Generated by tools/lottie_svg.py from the animations in assets/lottie/. Do not edit by hand.\n')
        fh.write('//\n')
        fh.write('// These drawings are derived from LottieFiles animations and are distributed under the Lottie Simple License\n')
        fh.write('// (assets/lottie/LICENSE.md), not under the MIT License that covers the rest of this repository. Their\n')
        fh.write('// authors are listed in assets/NOTICE.md.\n\n')
        fh.write("// One animation as SVG markup that plays by SMIL: its viewBox, one loop's length in seconds, and its\n")
        fh.write("// paths, with {L} and {F} for black and white (swappable for the theme) and __DUR__ for the loop's duration;\n")
        fh.write("// and where it drew a ground to walk on (left out: the plugin draws its own), the top of it, where the figure meets it\n")
        fh.write('export type Scene = { viewBox: readonly [number, number, number, number]; seconds: number; body: string; ground?: number }\n\n')
        fh.write("// A gauge: the dial before and after its needle in paint order, and the needle at evenly spaced angles\n")
        fh.write('export type Dial = { viewBox: readonly [number, number, number, number]; before: string; after: string; needles: readonly string[] }\n\n')
        fh.write('export const SCENES = ')
        fh.write(json.dumps(scenes, indent=2, ensure_ascii=False))
        fh.write(' as const satisfies Record<string, Scene>\n\n')
        fh.write('export const DIALS = ')
        fh.write(json.dumps(dials, indent=2, ensure_ascii=False))
        fh.write(' as const satisfies Record<string, Dial>\n')
