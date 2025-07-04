import * as THREE from "https://esm.sh/three";
import Lenis from "https://esm.sh/@studio-freight/lenis";
import { getScreenFov, Maku, MakuGroup } from "https://esm.sh/maku.js";
import gsap from "https://esm.sh/gsap";
import { InteractionManager } from "https://esm.sh/three.interactive";

const vertexShader = /* glsl */ `
uniform float iTime;
uniform vec2 iResolution;

varying vec2 vUv;

uniform vec2 uMediaSize;
uniform vec2 uHoverUv;
uniform float uHoverState;

varying float vOffset;

const float PI=3.14159265359;

// https://en.wikipedia.org/wiki/Gaussian_function
float gaussian(float mu,float sigma){
    return(1./(sigma*sqrt(2.*PI)))*exp(-.5*(pow(mu,2.)/pow(sigma,2.)));
}

vec3 distort(vec3 p){
    vec2 uv1=uv;
    vec2 uv2=uHoverUv;
    float aspect=uMediaSize.x/uMediaSize.y;
    uv1.x*=aspect;
    uv2.x*=aspect;
    float d=distance(uv1,uv2);
    float offset=sin(d*10.)*.1;
    offset=gaussian(d*3.,.6);
    
    // Smoother distortion effect that extends to edges
    float effectStrength = 0.65; // Increased from 0.6
    p*=(1.+offset*effectStrength*uHoverState);
    
    // Pass offset to fragment shader for edge effects
    vOffset=offset;
    return p;
}

void main(){
    vec3 p=position;
    p=distort(p);
    gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
    
    vUv=uv;
}
`;

const fragmentShader = /* glsl */ `
varying vec2 vUv;

uniform sampler2D iChannel0;

uniform float uClipProgress;
uniform float uHoverState;

varying float vOffset;

void main(){
    vec2 uv=vUv;
    vec4 tex=texture(iChannel0,uv);
    vec4 col=tex;
    
    // Add a slight effect to edges during hover
    float edgeEffect = smoothstep(0.0, 0.15, vOffset) * uHoverState;
    col.rgb += edgeEffect * 0.05; // Subtle brightness boost on edges
    
    // Original animation for intro
    col=mix(col,vec4(0.),step(uClipProgress,uv.y));
    
    gl_FragColor=col;
}
`;

const sleep = (time) => new Promise((resolve) => setTimeout(resolve, time));

const width = window.innerWidth,
  height = window.innerHeight;

const z = 600;
const fov = getScreenFov(z, height);
const camera = new THREE.PerspectiveCamera(fov, width / height, 100, 2000);
camera.position.z = z;

const scene = new THREE.Scene();

const canvas = document.querySelector("#sketch");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true
});
renderer.setSize(width, height);
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setAnimationLoop(animation);

const clock = new THREE.Clock();

const textureLoader = new THREE.TextureLoader();

const material = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms: {
    iChannel0: {
      value: null
    },
    iTime: {
      value: clock.getElapsedTime()
    },
    iResolution: {
      value: new THREE.Vector2(window.innerWidth, window.innerHeight)
    },
    uDistort: {
      value: 1
    },
    uMediaSize: {
      value: new THREE.Vector2(0, 0)
    },
    uClipProgress: {
      value: 0
    },
    uHoverState: {
      value: 0
    },
    uHoverUv: {
      value: new THREE.Vector2(0, 0)
    }
  }
});
const elList = [...document.querySelectorAll(".gallery-item-img")];
const makuGroup = new MakuGroup();
const makus = elList.map(
  (image) =>
    new Maku(image, material, scene, {
      meshSizeType: "scale",
      textureUniform: "iChannel0",
      textureLoader
    })
);
makuGroup.addMultiple(makus);

makuGroup.syncPositions();

makuGroup.makus.forEach((maku) => {
  // Get the gallery item (parent of the image)
  const galleryItem = maku.el.closest('.gallery-item');
  
  galleryItem.addEventListener("mouseenter", () => {
    // Add active class to the gallery item
    galleryItem.classList.add('effect-active');
    
    gsap.to(maku.mesh.material.uniforms.uHoverState, {
      value: 1,
      duration: 0.75
    });
  });

  galleryItem.addEventListener("mouseleave", () => {
    // Start the transition out
    gsap.to(maku.mesh.material.uniforms.uHoverState, {
      value: 0,
      duration: 0.75,
      onComplete: () => {
        galleryItem.classList.remove('effect-active');
      }
    });
  });
});

const raycaster = new THREE.Raycaster();

const interactionManager = new InteractionManager(
  renderer,
  camera,
  renderer.domElement
);

window.addEventListener("mousemove", () => {
  raycaster.setFromCamera(interactionManager.mouse, camera);
  const intersect = raycaster.intersectObjects(scene.children, true)[0];
  if (!intersect || !intersect.face) {
    return;
  }
  const obj = intersect.object;
  if (obj.material.uniforms) {
    obj.material.uniforms.uHoverUv.value = intersect.uv;
  }
});

async function onLoaded() {
  document.querySelector("body").style.overflow = "visible";
  document.querySelector(".loader-screen").classList.add("hollow");
  document.querySelector(".container").style.opacity = "1";
  await sleep(500);
  introAnime();
}

const loadEvent = new THREE.EventDispatcher();
loadEvent.addEventListener("loaded", onLoaded);

const params = {
  distort: 1,
  clipProgress: 0
};

const lenis = new Lenis({
  smoothTouch: true,
  syncTouch: true
});

function animation(time) {
  lenis.raf(time);

  makuGroup.makus.forEach((maku) => {
    const { mesh } = maku;
    mesh.material.uniforms.iTime.value = clock.getElapsedTime();
    mesh.material.uniforms.iResolution.value = new THREE.Vector2(
      window.innerWidth,
      window.innerHeight
    );
    const mediaEl = maku.el;
    mesh.material.uniforms.uMediaSize.value = new THREE.Vector2(
      mediaEl.naturalWidth,
      mediaEl.naturalHeight
    );
    mesh.material.uniforms.uClipProgress.value = params.clipProgress;
  });
  makuGroup.syncPositions();

  if (
    makuGroup.makus
      .map((maku) => {
        return maku.mesh.material.uniforms.iChannel0.value.image?.complete;
      })
      .every((item) => item)
  ) {
    loadEvent.dispatchEvent({
      type: "loaded"
    });
    loadEvent.removeEventListener("loaded", onLoaded);
  }

  renderer.render(scene, camera);
}

// 缩放
function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));

  if (camera.isPerspectiveCamera) {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.fov = getScreenFov(camera.position.z, window.innerHeight);
    camera.updateProjectionMatrix();
  }

  makuGroup.syncPositions();
  makuGroup.syncScales();
}

window.addEventListener("resize", resize);

const introAnime = () => {
  const t1 = gsap.timeline();
  t1.to(params, {
    clipProgress: 1,
    ease: "power3.inOut",
    duration: 1.5
  })
    .to(
      ".slide-in-text-child.text-1",
      {
        y: 0,
        ease: "power3.inOut",
        duration: 1.2,
        stagger: 0.05
      },
      "-=1.25"
    )
    .to(
      ".slide-in-text-child.text-2,.slide-in-text-child.top-bar-text",
      {
        y: 0,
        ease: "power3.inOut",
        duration: 1.2,
        stagger: 0.05
      },
      "-=1"
    )
    .to(
      ".categories",
      {
        opacity: 1,
        duration: 1,
        stagger: 0.02
      },
      "-=0.8"
    )
    .call(showImages);
};

// Make images visible when loaded
function showImages() {
  const images = document.querySelectorAll('.gallery-item-img');
  images.forEach(img => {
    if (img.complete) {
      img.style.opacity = '1';
    } else {
      img.addEventListener('load', () => {
        img.style.opacity = '1';
      });
    }
  });
}

window.addEventListener("load", showImages);
window.addEventListener("resize", () => {
  // Only needed for responsive adjustments
});