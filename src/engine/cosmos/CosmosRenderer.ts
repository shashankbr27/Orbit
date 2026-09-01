import { hexToRgb01 } from '../math';
import type { QualitySettings } from '../quality';
import type { ThemeSpec } from '../theme';
import type { Camera } from '../camera';
import {
  COMPOSITE_FRAGMENT,
  NEBULA_FRAGMENT,
  VERTEX_SRC,
  buildDefines,
} from './shaders';

interface Program {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
  aPos: number;
}

const NEBULA_UNIFORMS = [
  'uRes',
  'uPxScale',
  'uCam',
  'uZoom',
  'uTime',
  'uMotion',
  'uAmount',
  'uSeed',
  'uNebA',
  'uNebB',
  'uNebC',
] as const;

const COMPOSITE_UNIFORMS = [
  'uRes',
  'uPxScale',
  'uCam',
  'uZoom',
  'uTime',
  'uMotion',
  'uSeed',
  'uNebula',
  'uNebulaTexel',
  'uBgInner',
  'uBgOuter',
  'uStarWarm',
  'uStarCool',
  'uStarDensity',
  'uDustDensity',
  'uNebulaGain',
  'uGrain',
  'uVignette',
  'uFade',
] as const;

/**
 * Renders the living sky into its own WebGL canvas.
 *
 * Kept as raw WebGL (rather than going through the scene-graph renderer) for
 * three reasons: total control over the two-pass pipeline, no dependence on a
 * library's shader plumbing, and it stays alive even if the object layer fails.
 */
export class CosmosRenderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null = null;
  private nebulaProg: Program | null = null;
  private compositeProg: Program | null = null;
  private quad: WebGLBuffer | null = null;

  private fbo: WebGLFramebuffer | null = null;
  private nebTex: WebGLTexture | null = null;
  private nebW = 1;
  private nebH = 1;

  private pixelW = 1;
  private pixelH = 1;
  private cssW = 1;
  private cssH = 1;
  private dpr = 1;

  private quality: QualitySettings;
  private theme: ThemeSpec;
  private seed = 0;

  private frame = 0;
  private lastCamRevision = -1;
  private contextLost = false;
  private disposed = false;

  /** 0..1 intro fade. */
  fade = 0;

  onContextRestored?: () => void;

  constructor(canvas: HTMLCanvasElement, quality: QualitySettings, theme: ThemeSpec, seed = 0) {
    this.canvas = canvas;
    this.quality = quality;
    this.theme = theme;
    this.seed = seed;
    this.initContext();

    canvas.addEventListener('webglcontextlost', this.handleLost, false);
    canvas.addEventListener('webglcontextrestored', this.handleRestored, false);
  }

  get ok() {
    return this.gl !== null && !this.contextLost;
  }

  private handleLost = (e: Event) => {
    e.preventDefault();
    this.contextLost = true;
    this.nebulaProg = null;
    this.compositeProg = null;
    this.quad = null;
    this.fbo = null;
    this.nebTex = null;
  };

  private handleRestored = () => {
    if (this.disposed) return;
    this.contextLost = false;
    this.initContext();
    this.resize(this.cssW, this.cssH, this.dpr);
    this.onContextRestored?.();
  };

  private initContext() {
    const opts: WebGLContextAttributes = {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false,
    };
    const gl =
      (this.canvas.getContext('webgl', opts) as WebGLRenderingContext | null) ??
      (this.canvas.getContext('experimental-webgl', opts) as WebGLRenderingContext | null);
    if (!gl) {
      this.gl = null;
      return;
    }
    this.gl = gl;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 1);

    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
      gl.STATIC_DRAW,
    );

    this.buildPrograms();
  }

  private compile(src: string, type: number): WebGLShader | null {
    const gl = this.gl!;
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[cosmos] shader compile failed:', gl.getShaderInfoLog(sh));
      }
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  private link(
    fragSrc: string,
    uniformNames: readonly string[],
    defines: string,
  ): Program | null {
    const gl = this.gl!;
    const vs = this.compile(defines + VERTEX_SRC, gl.VERTEX_SHADER);
    const fs = this.compile(defines + fragSrc, gl.FRAGMENT_SHADER);
    if (!vs || !fs) return null;
    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[cosmos] program link failed:', gl.getProgramInfoLog(program));
      }
      gl.deleteProgram(program);
      return null;
    }
    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    for (const n of uniformNames) uniforms[n] = gl.getUniformLocation(program, n);
    return { program, uniforms, aPos: gl.getAttribLocation(program, 'aPos') };
  }

  private buildPrograms() {
    const gl = this.gl;
    if (!gl) return;
    const q = this.quality;
    const defines = buildDefines({
      nebOctaves: q.nebulaOctaves,
      starLayers: q.starLayers,
      dustLayers: q.dustLayers,
      focalStars: q.focalStars,
    });
    if (this.nebulaProg) gl.deleteProgram(this.nebulaProg.program);
    if (this.compositeProg) gl.deleteProgram(this.compositeProg.program);
    this.nebulaProg = this.link(NEBULA_FRAGMENT, NEBULA_UNIFORMS, defines);
    this.compositeProg = this.link(COMPOSITE_FRAGMENT, COMPOSITE_UNIFORMS, defines);
  }

  setQuality(q: QualitySettings) {
    const needsRebuild =
      q.nebulaOctaves !== this.quality.nebulaOctaves ||
      q.starLayers !== this.quality.starLayers ||
      q.dustLayers !== this.quality.dustLayers ||
      q.focalStars !== this.quality.focalStars;
    const needsResize = q.nebulaDivisor !== this.quality.nebulaDivisor;
    this.quality = q;
    if (needsRebuild) this.buildPrograms();
    if (needsResize) this.allocNebulaTarget();
  }

  setTheme(theme: ThemeSpec) {
    this.theme = theme;
  }

  setSeed(seed: number) {
    this.seed = seed;
  }

  resize(cssW: number, cssH: number, dpr: number) {
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
    const eff = Math.min(dpr, this.quality.maxDpr);
    this.pixelW = Math.max(1, Math.round(cssW * eff));
    this.pixelH = Math.max(1, Math.round(cssH * eff));
    this.canvas.width = this.pixelW;
    this.canvas.height = this.pixelH;
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.allocNebulaTarget();
  }

  private allocNebulaTarget() {
    const gl = this.gl;
    if (!gl) return;
    const div = Math.max(1, this.quality.nebulaDivisor);
    this.nebW = Math.max(2, Math.ceil(this.pixelW / div));
    this.nebH = Math.max(2, Math.ceil(this.pixelH / div));

    if (!this.nebTex) this.nebTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.nebTex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      this.nebW,
      this.nebH,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    if (!this.fbo) this.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.nebTex,
      0,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.lastCamRevision = -1; // force a nebula refresh
  }

  private bindQuad(prog: Program) {
    const gl = this.gl!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(prog.aPos);
    gl.vertexAttribPointer(prog.aPos, 2, gl.FLOAT, false, 0, 0);
  }

  private c3(hex: string): [number, number, number] {
    return hexToRgb01(hex);
  }

  render(camera: Camera, time: number, motion: number) {
    const gl = this.gl;
    if (!gl || this.contextLost || !this.nebulaProg || !this.compositeProg) return;

    const t = this.theme;
    const camMoved = camera.revision !== this.lastCamRevision;
    const everyN = Math.max(1, this.quality.nebulaEveryNFrames);
    const refreshNebula = camMoved || this.frame % everyN === 0;
    this.frame++;

    const res: [number, number] = [this.pixelW, this.pixelH];
    // The shader converts device pixels to CSS pixels with uPxScale, so the
    // camera can stay in CSS pixels and a star keeps its apparent size on any
    // display density.
    const pxScale = this.pixelW / Math.max(1, this.cssW);
    const camVec: [number, number] = [camera.x, camera.y];
    const zoom = camera.zoom;
    const motionAmt = motion * t.animation;

    if (refreshNebula) {
      const p = this.nebulaProg;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.viewport(0, 0, this.nebW, this.nebH);
      gl.useProgram(p.program);
      this.bindQuad(p);
      gl.uniform2f(p.uniforms.uRes!, res[0], res[1]);
      gl.uniform1f(p.uniforms.uPxScale!, pxScale);
      gl.uniform2f(p.uniforms.uCam!, camVec[0], camVec[1]);
      gl.uniform1f(p.uniforms.uZoom!, zoom);
      gl.uniform1f(p.uniforms.uTime!, time);
      gl.uniform1f(p.uniforms.uMotion!, motionAmt);
      gl.uniform1f(p.uniforms.uAmount!, t.nebulaAmount);
      gl.uniform1f(p.uniforms.uSeed!, this.seed);
      gl.uniform3fv(p.uniforms.uNebA!, this.c3(t.nebA));
      gl.uniform3fv(p.uniforms.uNebB!, this.c3(t.nebB));
      gl.uniform3fv(p.uniforms.uNebC!, this.c3(t.nebC));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    {
      const p = this.compositeProg;
      gl.viewport(0, 0, this.pixelW, this.pixelH);
      gl.useProgram(p.program);
      this.bindQuad(p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.nebTex);
      gl.uniform1i(p.uniforms.uNebula!, 0);
      gl.uniform2f(p.uniforms.uNebulaTexel!, 1 / this.nebW, 1 / this.nebH);
      gl.uniform2f(p.uniforms.uRes!, res[0], res[1]);
      gl.uniform1f(p.uniforms.uPxScale!, pxScale);
      gl.uniform2f(p.uniforms.uCam!, camVec[0], camVec[1]);
      gl.uniform1f(p.uniforms.uZoom!, zoom);
      gl.uniform1f(p.uniforms.uTime!, time);
      gl.uniform1f(p.uniforms.uMotion!, motionAmt);
      gl.uniform1f(p.uniforms.uSeed!, this.seed);
      gl.uniform3fv(p.uniforms.uBgInner!, this.c3(t.bgInner));
      gl.uniform3fv(p.uniforms.uBgOuter!, this.c3(t.bgOuter));
      gl.uniform3fv(p.uniforms.uStarWarm!, this.c3(t.starWarm));
      gl.uniform3fv(p.uniforms.uStarCool!, this.c3(t.starCool));
      gl.uniform1f(p.uniforms.uStarDensity!, t.starDensity);
      gl.uniform1f(p.uniforms.uDustDensity!, t.dustDensity);
      gl.uniform1f(p.uniforms.uNebulaGain!, t.nebulaGain);
      gl.uniform1f(p.uniforms.uGrain!, this.quality.grain + t.grain);
      gl.uniform1f(p.uniforms.uVignette!, t.vignette);
      gl.uniform1f(p.uniforms.uFade!, this.fade);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    this.lastCamRevision = camera.revision;
  }

  dispose() {
    this.disposed = true;
    this.canvas.removeEventListener('webglcontextlost', this.handleLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleRestored);
    const gl = this.gl;
    if (!gl) return;
    if (this.nebulaProg) gl.deleteProgram(this.nebulaProg.program);
    if (this.compositeProg) gl.deleteProgram(this.compositeProg.program);
    if (this.quad) gl.deleteBuffer(this.quad);
    if (this.nebTex) gl.deleteTexture(this.nebTex);
    if (this.fbo) gl.deleteFramebuffer(this.fbo);
    this.gl = null;
  }
}
