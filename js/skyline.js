import * as THREE from "three";

// procedural cityscape shader background
const canvas = document.getElementById("skyline");
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const pixelRatioLimit = isMobile ? 1.0 : 1.25;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  powerPreference: "high-performance",
  stencil: false,
  depth: false,
});

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const geometry = new THREE.PlaneGeometry(2, 2);
const material = new THREE.ShaderMaterial({
  uniforms: {
    iTime: { value: 0 },
    iResolution: { value: new THREE.Vector3() },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
    #else
      precision mediump float;
    #endif

    uniform float iTime;
    uniform vec3 iResolution;
    varying vec2 vUv;

    uint seed = 31713U;

    float rand(void) {
      seed = (seed << 13U) ^ seed;
      seed = seed * (seed * seed * 15731U + 789221U) + 1376312589U;
      uint seed2 = seed * seed;
      return float(seed2&0x7fffffffU)/float(0x7fffffffU);
    }

    float Polygon(vec2 uv, float h) {
      float mid = (rand()-.5)*exp2(-h*2.);
      float f = abs(uv.y-rand()+.5)-rand()-2.;
      f = max(f,abs(uv.x-mid)-rand()-.5+h*.4);
      f = max(f,abs(dot(uv,vec2(1,1)/sqrt(2.))-rand()+.5)-rand()-1.);
      f = max(f,abs(dot(uv,vec2(1,-1)/sqrt(2.))-rand()+.5)-rand()-1.);
      return f;
    }

    vec3 Buildings(vec2 uv, int layer) {
      seed = uint(2. + uv.x/4.);
      uv.x = (fract(uv.x/4.)-.5)*4.;
      
      bool cull = (pow(float(layer+1)/8.,.3) < rand());
      seed += 0x1001U*uint(layer);
      
      float a = Polygon(uv-vec2(0,0), 0.);
      float b = Polygon(uv-vec2(0,2), .5);
      float c = Polygon(uv-vec2(0,4), 1.);
      if (cull) { a = 1.; b = 1.; c = 1.; }
      
      a = min(a, uv.y+.5);
      
      vec3 f = vec3(a,min(a,b),min(min(a,b),c)).zyx;
      vec3 col = vec3(.5+.5*f/(.01+abs(f)));
      
      return vec3(dot(col,vec3(.985,.01,.005)));
    }

    void main() {
      vec2 fragCoord = vUv * iResolution.xy;
      vec2 uv = (fragCoord-iResolution.xy*vec2(.5,.5))/iResolution.y;
      
      uv *= 10.;
      uv.y += 3.;
      uv.x -= 8.;
      
      vec3 color = vec3(1);
      
      const float size = .5;
      const float fog = .15;
      const float baseFog = 0.075; 
      
      color = min(color, mix(vec3(1), Buildings(uv*exp2(size*0.)+iTime*vec2(4,0),0), exp2(-fog*0.-baseFog)));
      color = min(color, mix(vec3(1), Buildings(uv*exp2(size*1.)+iTime*vec2(4,0),1), exp2(-fog*1.-baseFog)));
      color = min(color, mix(vec3(1), Buildings(uv*exp2(size*2.)+iTime*vec2(4,0),2), exp2(-fog*2.-baseFog)));
      color = min(color, mix(vec3(1), Buildings(uv*exp2(size*3.)+iTime*vec2(4,0),3), exp2(-fog*3.-baseFog)));
      color = min(color, mix(vec3(1), Buildings(uv*exp2(size*4.)+iTime*vec2(4,0),4), exp2(-fog*4.-baseFog)));
      color = min(color, mix(vec3(1), Buildings(uv*exp2(size*5.)+iTime*vec2(4,0),5), exp2(-fog*5.-baseFog)));
      color = min(color, mix(vec3(1), Buildings(uv*exp2(size*6.)+iTime*vec2(4,0),6), exp2(-fog*6.-baseFog)));
      color = min(color, mix(vec3(1), Buildings(uv*exp2(size*7.)+iTime*vec2(4,0),7), exp2(-fog*7.-baseFog)));
      color = min(color, mix(vec3(1), Buildings(uv*exp2(size*8.)+iTime*vec2(4,0),8), exp2(-fog*8.-baseFog)));
      color = min(color, mix(vec3(1), Buildings(uv*exp2(size*9.)+iTime*vec2(4,0),9), exp2(-fog*9.-baseFog)));
      color = min(color, mix(vec3(1), Buildings(uv*exp2(size*10.)+iTime*vec2(4,0),10), exp2(-fog*10.-baseFog)));
      color = min(color, mix(vec3(1), Buildings(uv*exp2(size*11.)+iTime*vec2(4,0),11), exp2(-fog*11.-baseFog)));
      
      color = pow(color, vec3(1./2.2));
      
      const vec3 bgColor = vec3(0.89, 0.024, 0.075);
      color = mix(bgColor, vec3(0.0), 1.0 - color.r);
      
      gl_FragColor = vec4(color, 1.0);
    }
  `,
  depthTest: false,
  depthWrite: false,
});

const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// resize handler with debounce
let resizeTimeout;

function handleResize() {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioLimit));
    material.uniforms.iResolution.value.set(width, height, 1);
  }, 100);
}

// animation loop
function animate(currentTime) {
  requestAnimationFrame(animate);
  material.uniforms.iTime.value = currentTime * 0.001;
  renderer.render(scene, camera);
}

// cleanup on page unload
function cleanup() {
  geometry.dispose();
  material.dispose();
  renderer.dispose();
  window.removeEventListener("resize", handleResize);
  window.removeEventListener("beforeunload", cleanup);
}

// initialize
handleResize();
window.addEventListener("resize", handleResize);
window.addEventListener("beforeunload", cleanup);
requestAnimationFrame(animate);
