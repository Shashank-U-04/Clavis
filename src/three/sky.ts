/**
 * The sky behind the 3D view: a large dome shaded from a pale horizon up to a deeper zenith,
 * with a soft glow round the sun. It is cheap to draw and reads as a clear day (or a dusk,
 * per studio theme); the same dome, rendered once into an environment map, is what glass and
 * glossy surfaces reflect.
 */

import * as THREE from "three";

export interface SkyColours {
  zenith: string;
  horizon: string;
  /** the light round the sun */
  glow: string;
}

const vertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww; // always at the far plane
  }
`;

const fragment = /* glsl */ `
  uniform vec3 zenith;
  uniform vec3 horizon;
  uniform vec3 glow;
  uniform vec3 sunDir;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float up = max(d.y, 0.0);
    // most of the change happens near the horizon, as in a real sky
    vec3 col = mix(horizon, zenith, pow(up, 0.55));
    float sun = max(dot(d, normalize(sunDir)), 0.0);
    col += glow * (pow(sun, 8.0) * 0.35 + pow(sun, 200.0) * 0.6);
    // below the horizon: the haze colour, so the lawn's far edge melts into it
    col = d.y < 0.0 ? horizon : col;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export interface SkyDome {
  mesh: THREE.Mesh;
  paint(colours: SkyColours, sunDir: THREE.Vector3): void;
  dispose(): void;
}

export function skyDome(): SkyDome {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      zenith: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      glow: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const geometry = new THREE.SphereGeometry(1000, 32, 16);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "sky";
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return {
    mesh,
    paint(c, sunDir) {
      material.uniforms.zenith.value.set(c.zenith);
      material.uniforms.horizon.value.set(c.horizon);
      material.uniforms.glow.value.set(c.glow);
      material.uniforms.sunDir.value.copy(sunDir);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
