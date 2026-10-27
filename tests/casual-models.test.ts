import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createCharacter, animateCharacter, createDefense } from "../src/world-models";

test('residential characters have faceted faces and separately rigged tailored clothing', () => {
  for (const kind of ['hero', 'grunt'] as const) {
    const model = createCharacter(kind);
    for (const name of ['head', 'collar', 'belt', 'hair', 'shoe-left', 'shoe-right']) {
      assert.ok(model.getObjectByName(name), `${kind}: ${name}`);
    }
    const head = model.getObjectByName('head')!;
    assert.ok(head instanceof THREE.Bone);
  }
});

test("household cast has distinct props and keeps animated health/limb contracts", () => {
  const props = { hero: "broom", grunt: "sack", spam: "spam-phone", runner: "proboscis", brute: "speaker", boss: "monday-calendar" } as const;
  for (const [kind, prop] of Object.entries(props)) {
    const model = createCharacter(kind as keyof typeof props);
    assert.ok(model.getObjectByName(prop), `${kind}: ${prop}`);
    assert.ok(model.getObjectByName("hp"));
    const arm = model.getObjectByName("arm-right")!;
    animateCharacter(model, 0.2, true, true);
    assert.ok(Math.abs(arm.rotation.x) > 0.1);
    assert.ok(model.getObjectByName("leg-left")!.rotation.x * model.getObjectByName("leg-right")!.rotation.x < 0);
    const meshes: THREE.SkinnedMesh[] = [];
    model.traverse(object => { if (object instanceof THREE.SkinnedMesh) meshes.push(object); });
    assert.ok(meshes.length > 0 && meshes.length <= 3);
    for (const mesh of meshes) {
      assert.ok(mesh.geometry.attributes.position.count > 0);
      assert.ok(Array.from(mesh.geometry.attributes.position.array).every(Number.isFinite));
    }
  }
  const mosquito = createCharacter("runner");
  animateCharacter(mosquito, 0.1, true, false);
  const wing = mosquito.getObjectByName("wing-left")!;
  const before = wing.rotation.z;
  animateCharacter(mosquito, 0.2, true, false);
  assert.notEqual(wing.rotation.z, before);
});

test("household defenses keep aiming parts and fit the build footprint", () => {
  for (const [kind, prop] of [["arrow", "clothespin"], ["cannon", "parcel-launcher"], ["frost", "household-fan"]] as const) {
    const model = createDefense(kind, 3);
    assert.ok(model.getObjectByName(prop));
    assert.ok(model.getObjectByName(kind === "frost" ? "blades" : "turret"));
    model.updateMatrixWorld(true);
    let meshes = 0;
    model.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      meshes++;
      const position = object.geometry.attributes.position;
      for (let i = 0; i < position.count; i++) {
        const vertex = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld);
        assert.ok(Math.hypot(vertex.x, vertex.z) <= 1.35, `${kind} footprint`);
      }
    });
    assert.ok(meshes <= 7, `${kind} draw calls: ${meshes}`);
  }
});


test("spam phone vibrates with its rig while preserving the grunt-sized visual scale", () => {
  const phone = createCharacter("spam");
  const burglar = createCharacter("grunt");
  assert.equal(phone.scale.x, burglar.scale.x);
  assert.ok(phone.getObjectByName("spam-receiver"));
  animateCharacter(phone, 0.1, true, true);
  const body = phone.getObjectByName("body")!;
  const before = body.rotation.z;
  animateCharacter(phone, 0.2, true, true);
  assert.notEqual(body.rotation.z, before);
  const meshes: THREE.SkinnedMesh[] = [];
  phone.traverse(object => { if (object instanceof THREE.SkinnedMesh) meshes.push(object); });
  assert.equal(meshes.length, 1);
});

test("toy skins preserve saturated vertex colors without adding emission", () => {
  for (const kind of ["hero", "grunt", "spam", "runner", "brute", "boss"] as const) {
    const model = createCharacter(kind);
    model.traverse(object => {
      if (!(object instanceof THREE.SkinnedMesh)) return;
      const material = object.material as THREE.MeshStandardMaterial;
      assert.equal(material.emissive.getHex(), 0, `${kind} must not acquire a glow while baking`);
      assert.equal(material.emissiveIntensity, 0);
      assert.equal(material.vertexColors, true);
      const colors = object.geometry.attributes.color;
      assert.ok(Array.from({ length: colors.count }, (_, i) => [colors.getX(i), colors.getY(i), colors.getZ(i)])
        .some(rgb => Math.max(...rgb) > 0.5 && Math.max(...rgb) - Math.min(...rgb) > 0.4), `${kind} keeps saturated toy colors`);
    });
  }
});
