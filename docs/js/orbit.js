(function () {
  const hero = document.getElementById('hero');
  const stage = hero.querySelector('.hero-sticky');
  const visual = hero.querySelector('.orbit-visual');
  const canvas = document.getElementById('orbitCanvas');
  const intro = document.getElementById('orbitIntro');
  const arrival = document.getElementById('orbitArrival');
  const arrivalHeading = arrival.querySelector('h2');
  const target = document.getElementById('orbitTarget');
  const phase = document.getElementById('orbitPhase');
  const scrollButton = document.getElementById('orbitScroll');
  const sections = document.getElementById('overview-stats');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const radians = Math.PI / 180;
  const india = { lat: 22, lon: 80 };
  const markers = [...visual.querySelectorAll('.orbit-marker')].map(node => ({
    node,
    lat: Number(node.dataset.lat),
    lon: Number(node.dataset.lon)
  }));
  const textures = window.KSOrbitTextures;
  const clamp = value => Math.max(0, Math.min(1, value));
  const mix = (a, b, ratio) => a + (b - a) * ratio;
  const ease = (start, end, value) => {
    const t = clamp((value - start) / (end - start));
    return t * t * (3 - 2 * t);
  };

  const vertexSource = `
    attribute vec2 vertex;
    void main() { gl_Position = vec4(vertex, 0.0, 1.0); }
  `;
  const fragmentSource = `
    precision highp float;
    uniform sampler2D earth;
    uniform sampler2D region;
    uniform sampler2D borders;
    uniform vec3 frame;
    uniform vec2 axis;
    uniform vec3 zoom;

    void main() {
      vec2 p = (gl_FragCoord.xy - frame.xy) / frame.z;
      float radial = length(p);
      if (radial > 1.04) discard;

      float z = sqrt(max(0.0, 1.0 - dot(p, p)));
      vec3 n = vec3(p, z);
      float sinLat = sin(axis.x);
      float cosLat = cos(axis.x);
      float lat = asin(clamp(n.y * cosLat + n.z * sinLat, -1.0, 1.0));
      float lon = axis.y + atan(n.x, n.z * cosLat - n.y * sinLat);
      vec2 uv = vec2(fract(lon / 6.2831853 + 0.5), 0.5 - lat / 3.14159265);
      vec3 color = texture2D(earth, uv).rgb;

      // The regional texture shares the global mosaic's plate carrée projection.
      vec2 degrees = vec2(uv.x * 360.0 - 180.0, 90.0 - uv.y * 180.0);
      vec2 localUV = (vec2(degrees.x, -degrees.y) - vec2(46.0, -49.0)) / vec2(64.0, 50.0);
      float margin = min(min(localUV.x, 1.0 - localUV.x), min(localUV.y, 1.0 - localUV.y));
      color = mix(color, texture2D(region, localUV).rgb, smoothstep(0.0, 0.09, margin) * zoom.y);

      float day = clamp(dot(n, normalize(vec3(-0.54, 0.47, 0.79))), 0.0, 1.0);
      vec3 orbital = color * (0.21 + 1.06 * smoothstep(0.0, 0.85, day));
      orbital = mix(orbital, vec3(0.34, 0.48, 0.40), pow(1.0 - z, 3.0) * 0.47);
      vec3 satellite = color * vec3(0.87, 0.98, 0.81) + vec3(0.007, 0.018, 0.013);
      color = mix(orbital, satellite, zoom.x);

      vec2 stepDistance = abs(fract(degrees / 5.0 + 0.5) - 0.5);
      float line = 1.0 - smoothstep(0.0, 0.009, min(stepDistance.x, stepDistance.y));
      color = mix(color, vec3(0.75, 0.88, 0.66), line * 0.23 * zoom.z);
      float outline = texture2D(borders, localUV).a * zoom.z;
      color = mix(color, vec3(0.85, 0.95, 0.58), outline * 0.76);

      float edge = 1.0 - smoothstep(1.0 - 1.0 / frame.z, 1.0 + 1.0 / frame.z, radial);
      float halo = (1.0 - edge) * exp(-max(0.0, radial - 1.0) * 128.0)
        * (1.0 - zoom.x) * 0.25;
      gl_FragColor = vec4(color * edge + vec3(0.47, 0.68, 0.57) * halo, edge + halo);
    }
  `;

  function bindTexture(gl, unit) {
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return texture;
  }

  function loadTexture(gl, unit, source, onReady) {
    const texture = bindTexture(gl, unit);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    const image = new Image();
    image.onload = () => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
      onReady();
    };
    image.src = source;
  }

  function boundaryMask() {
    const mask = document.createElement('canvas');
    mask.width = 1920;
    mask.height = 1500;
    const ink = mask.getContext('2d');
    const pixelsPerDegree = 1200 / 29.27;
    const mercatorAtCape = Math.asinh(Math.tan(8.079 * radians));
    ink.strokeStyle = '#fff';
    ink.lineWidth = 2.6;
    ink.lineJoin = 'round';

    // Reproject the dashboard's simplified state paths from Web Mercator into the regional imagery grid.
    Object.values(window.INDIA_PATHS).forEach(path => {
      ink.beginPath();
      for (const part of path.matchAll(/M([^lMz]+)(?:l([^Mz]+))?z?/g)) {
        const values = text => (text.match(/-?\d+/g) || []).map(Number);
        let [x, y] = values(part[1]);
        const project = (method) => {
          const lon = 68.13 + x / pixelsPerDegree;
          const lat = Math.atan(Math.sinh(mercatorAtCape + (1306 - y) / pixelsPerDegree * radians)) / radians;
          ink[method]((lon - 46) * 30, (49 - lat) * 30);
        };
        project('moveTo');
        const offsets = values(part[2] || '');
        for (let i = 0; i < offsets.length; i += 2) {
          x += offsets[i];
          y += offsets[i + 1];
          project('lineTo');
        }
        ink.closePath();
      }
      ink.stroke();
    });
    return mask;
  }

  function makeRenderer(onReady) {
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false, powerPreference: 'low-power' });
    if (!gl) return null;
    const program = gl.createProgram();
    const sources = [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]];
    for (const [type, source] of sources) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return null;
      gl.attachShader(program, shader);
      gl.deleteShader(shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const vertex = gl.getAttribLocation(program, 'vertex');
    gl.enableVertexAttribArray(vertex);
    gl.vertexAttribPointer(vertex, 2, gl.FLOAT, false, 0, 0);

    const uniform = name => gl.getUniformLocation(program, name);
    const frame = uniform('frame');
    const axis = uniform('axis');
    const zoom = uniform('zoom');
    gl.uniform1i(uniform('earth'), 0);
    gl.uniform1i(uniform('region'), 1);
    gl.uniform1i(uniform('borders'), 2);
    bindTexture(gl, 2);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, boundaryMask());
    let earthReady = false;
    let regionReady = false;
    loadTexture(gl, 0, textures.earth, () => { earthReady = true; onReady(); });
    loadTexture(gl, 1, textures.region, () => { regionReady = true; onReady(); });

    return (width, height, camera, approach) => {
      if (!earthReady || gl.isContextLost()) return false;
      const scale = Math.min(window.devicePixelRatio || 1, 1.35, 2000 / width, 1600 / height);
      const pixelWidth = Math.max(1, Math.round(width * scale));
      const pixelHeight = Math.max(1, Math.round(height * scale));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      gl.viewport(0, 0, pixelWidth, pixelHeight);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform3f(frame, camera.x * scale, (height - camera.y) * scale, camera.radius * scale);
      gl.uniform2f(axis, camera.lat * radians, camera.lon * radians);
      gl.uniform3f(zoom, approach, regionReady ? approach : 0, ease(.38, .92, approach));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return true;
    };
  }

  // Project labels with the same orthographic camera used for the imagery.
  function positionMarker(node, point, camera, width, opacity) {
    const latitude = point.lat * radians;
    const tilt = camera.lat * radians;
    const delta = (point.lon - camera.lon) * radians;
    const east = Math.cos(latitude) * Math.sin(delta);
    const north = Math.sin(latitude) * Math.cos(tilt) - Math.cos(latitude) * Math.sin(tilt) * Math.cos(delta);
    const front = Math.sin(latitude) * Math.sin(tilt) + Math.cos(latitude) * Math.cos(tilt) * Math.cos(delta);
    const x = camera.x + camera.radius * east;
    const y = camera.y - camera.radius * north - 11;
    node.classList.toggle('is-flipped', x > width - (node === target ? 65 : 140));
    node.style.translate = `${x}px ${y}px`;
    node.style.opacity = front > 0 ? opacity : 0;
  }

  let drawScene;
  let animation = 0;
  let lastPhase = '';
  let reducedSatellite = false;
  let orbitTime = 0;
  let previousTime;
  let cameraProgress;
  let focusArrival = false;
  function schedule() {
    if (!animation) animation = requestAnimationFrame(render);
  }

  function render(time) {
    animation = 0;
    if (hero.closest('[hidden]')) {
      previousTime = undefined;
      cameraProgress = undefined;
      return;
    }
    const bounds = hero.getBoundingClientRect();
    if (bounds.bottom <= 0 || bounds.top >= innerHeight) {
      previousTime = undefined;
      cameraProgress = undefined;
      return;
    }

    const width = stage.clientWidth;
    const height = stage.clientHeight;
    const mobile = width <= 820;
    const travel = Math.max(1, hero.offsetHeight - height);
    const targetProgress = clamp(-bounds.top / travel);
    const delta = previousTime === undefined ? 16 : Math.min(time - previousTime, 50);
    if (motion.matches) cameraProgress = Number(reducedSatellite);
    else if (cameraProgress === undefined || Math.abs(targetProgress - cameraProgress) < .001) cameraProgress = targetProgress;
    else cameraProgress = mix(cameraProgress, targetProgress, 1 - Math.exp(-delta / 58));
    const progress = cameraProgress;
    const turn = ease(0, .52, progress);
    const approach = ease(.25, .92, progress);
    if (previousTime !== undefined && !motion.matches && progress < .55) {
      orbitTime += delta;
    }
    previousTime = time;
    const drift = motion.matches ? 0 : 10 * Math.sin(orbitTime / 8200);
    const camera = {
      lat: mix(15, india.lat, turn),
      lon: mix(29 + drift, india.lon, turn),
      x: width * (mobile ? mix(.64, .47, approach) : mix(.70, .65, approach)),
      y: height * (mobile ? mix(.36, .40, approach) : mix(.51, .49, approach)),
      radius: mix(
        Math.min(width * (mobile ? .335 : .289), height * .375),
        mobile ? width * 1.45 : Math.min(width * 1.04, height * 1.35),
        approach
      )
    };
    const hasImagery = drawScene?.(width, height, camera, approach);
    visual.classList.toggle('ready', Boolean(hasImagery));
    const introOpacity = 1 - ease(.19, .58, progress);
    const arrivalOpacity = ease(.55, .86, progress);
    hero.style.setProperty('--orbit-progress', progress);
    hero.style.setProperty('--instrument-opacity', ease(.49, .83, progress));
    hero.style.setProperty('--satellite-opacity', ease(.29, .80, progress));
    intro.style.setProperty('--copy-opacity', introOpacity);
    intro.style.setProperty('--copy-offset', `${-38 * (1 - introOpacity)}px`);
    arrival.style.setProperty('--copy-opacity', arrivalOpacity);
    arrival.style.setProperty('--copy-offset', `${24 * (1 - arrivalOpacity)}px`);
    intro.inert = introOpacity <= .25;
    arrival.inert = arrivalOpacity <= .25;
    if (focusArrival && progress >= .96) {
      focusArrival = false;
      arrivalHeading.focus({ preventScroll: true });
    }

    positionMarker(target, india, camera, width, hasImagery ? .92 * (1 - ease(.44, .65, progress)) : 0);
    markers.forEach(point => positionMarker(point.node, point, camera, width, hasImagery ? ease(.58, .91, progress) : 0));

    const currentPhase = progress >= .80 ? 'India satellite view' : progress >= .27 ? 'Approach to India' : 'Earth orbit';
    if (lastPhase !== currentPhase) {
      lastPhase = currentPhase;
      phase.textContent = currentPhase;
      scrollButton.lastElementChild.textContent = progress >= .80 ? 'Continue to overview' : 'Scroll to India';
    }
    if (!motion.matches && (progress !== targetProgress || (hasImagery && progress < .55))) schedule();
  }

  function afterResize() {
    if (!motion.matches) reducedSatellite = false;
    cameraProgress = undefined;
    schedule();
  }

  scrollButton.addEventListener('click', () => {
    const behavior = motion.matches ? 'instant' : 'smooth';
    focusArrival = lastPhase !== 'India satellite view' && scrollButton.matches(':focus-visible');
    if (lastPhase === 'India satellite view') {
      window.scrollTo({ top: sections.offsetTop, behavior });
    } else if (motion.matches) {
      reducedSatellite = true;
      schedule();
    } else {
      window.scrollTo({ top: hero.offsetTop + hero.offsetHeight - stage.clientHeight, behavior });
    }
  });

  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    drawScene = null;
    schedule();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    drawScene = makeRenderer(schedule);
    schedule();
  });
  motion.addEventListener('change', afterResize);

  window.KSOrbit = {
    update() {
      if (!drawScene && !canvas.dataset.attempted) {
        canvas.dataset.attempted = 'true';
        drawScene = makeRenderer(schedule);
      }
      schedule();
    }
  };
})();
