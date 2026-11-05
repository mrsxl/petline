# Third-party assets

Every animation in `assets/lottie/` is a free animation from LottieFiles, kept as it was downloaded. Each is
rendered frame by frame (`tools/export.html`) and rebuilt as an SVG that plays by SMIL, its black and white made
swappable for the theme and the ground line it walks or lies on left out, the plugin drawing a ground of its own
(`tools/lottie_svg.py`), written to `hooks/scenes.ts`.

The animations, and the drawings rebuilt from them in `hooks/scenes.ts`, are distributed under the Lottie Simple
License, whose full text is in [lottie/LICENSE.md](lottie/LICENSE.md); not under the MIT License that covers the
rest of this repository.

## Line cat, by Stefan Lamprecht

- [cat walking](https://lottiefiles.com/free-animation/cat-walking-7Fw16fjIY8) (`cat-walking.json`)
- [relaxing cat](https://lottiefiles.com/free-animation/relaxing-cat-PP9g19zWST) (`relaxing-cat.json`)
