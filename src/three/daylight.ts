/**
 * The light a model is seen in: a sky dome, the sun (which casts the shadows), soft light from
 * the sky, and an environment map of that same sky for glass and glossy surfaces to reflect.
 * Shared by the studio's 3D view and the landing page's model, so both look alike.
 */

import * as THREE from "three";
import { skyDome, type SkyColours } from "./sky";
import { groundMaterial } from "./materials";

export type SceneTheme = "light" | "dark" | "sunset";

/**
 * The light per theme: a clear day; dusk with the lamps on (the studio's dark theme); and a
 * sunset, the sun low in the west behind the camera of the landing page's model, warming the
 * house's front and stretching its shadows across the lawn (the site's dark theme).
 * `elevation` and `azimuth` place the sun (degrees); `ground` tints the lawn.
 */
export const SCENE_THEMES: Record<SceneTheme, { elevation: number; azimuth: number; sun: string; sunIntensity: number; skyLight: number; exposure: number; envIntensity: number; ground: string; sky: SkyColours }> = {
  light: { elevation: 38, azimuth: 215, sun: "#fff1dc", sunIntensity: 3.1, skyLight: 0.55, exposure: 0.95, envIntensity: 0.55, ground: "#ffffff", sky: { zenith: "#4f86c6", horizon: "#cfe1ee", glow: "#fff6e6" } },
  dark: { elevation: 12, azimuth: 250, sun: "#ffb27a", sunIntensity: 1.6, skyLight: 0.5, exposure: 0.75, envIntensity: 0.45, ground: "#c3cbbd", sky: { zenith: "#1b2340", horizon: "#e49a6a", glow: "#ffcf9a" } },
  sunset: { elevation: 9, azimuth: 255, sun: "#ff9d5c", sunIntensity: 2.6, skyLight: 0.42, exposure: 0.86, envIntensity: 0.6, ground: "#e2c9a8", sky: { zenith: "#2b2f5e", horizon: "#f2925e", glow: "#ffd9a8" } },
};

export class Daylight {
  readonly sun = new THREE.DirectionalLight("#fff0d8", 2.2);
  private skyLight = new THREE.HemisphereLight("#dbe8f5", "#5c6b4a", 0.55);
  private sky = skyDome();
  private pmrem: THREE.PMREMGenerator;
  private env: THREE.WebGLRenderTarget | null = null;
  /** a unit vector from the model towards the sun */
  private sunDir = new THREE.Vector3(0.5, 0.7, 0.4).normalize();
  /** where the sun's shadows were last aimed, so a new theme's sun can follow */
  private aimed: { centre: THREE.Vector3; radius: number } | null = null;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
  ) {
    this.pmrem = new THREE.PMREMGenerator(renderer);
    scene.fog = new THREE.Fog(SCENE_THEMES.light.sky.horizon, 120, 700);
    const sun = this.sun;
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(this.sky.mesh, this.skyLight, sun, sun.target);
  }

  /** Light the scene for a theme; the house itself does not change. */
  setTheme(theme: SceneTheme) {
    const t = SCENE_THEMES[theme];
    this.sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - t.elevation), THREE.MathUtils.degToRad(t.azimuth));
    this.sky.paint(t.sky, this.sunDir);
    this.sun.color.set(t.sun);
    this.sun.intensity = t.sunIntensity;
    this.skyLight.intensity = t.skyLight;
    this.renderer.toneMappingExposure = t.exposure;
    this.scene.fog?.color.set(t.sky.horizon);
    groundMaterial.color.set(t.ground);
    // glass and glossy surfaces reflect this same sky
    const skyScene = new THREE.Scene();
    const reflected = skyDome();
    reflected.paint(t.sky, this.sunDir);
    skyScene.add(reflected.mesh);
    this.env?.dispose();
    this.env = this.pmrem.fromScene(skyScene, 0, 0.1, 1100);
    reflected.dispose();
    this.scene.environment = this.env.texture;
    this.scene.environmentIntensity = t.envIntensity;
    // the sun has moved: its shadows come from its new side
    if (this.aimed) this.aim(this.aimed.centre, this.aimed.radius);
  }

  /** Put the sun's shadow camera over everything within `radius` of `centre`, from the sun's side. */
  aim(centre: THREE.Vector3, radius: number) {
    this.aimed = { centre: centre.clone(), radius };
    this.sun.target.position.copy(centre);
    this.sun.position.copy(centre).addScaledVector(this.sunDir, radius * 3);
    Object.assign(this.sun.shadow.camera, { left: -radius, right: radius, top: radius, bottom: -radius, near: 0.5, far: radius * 6 });
    this.sun.shadow.camera.updateProjectionMatrix();
  }

  dispose() {
    this.env?.dispose();
    this.pmrem.dispose();
    this.sky.dispose();
  }
}
