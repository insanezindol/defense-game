import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCharacter, animateCharacter, createDefense } from '../src/world-models';

test('military cast keeps animated rigs and distinct combat equipment', () => {
  for (const kind of ['hero', 'grunt', 'runner', 'brute', 'boss'] as const) {
    const model = createCharacter(kind);
    for (const name of ['helmet', 'armor', 'rifle', 'hp', 'leg-left', 'leg-right']) assert.ok(model.getObjectByName(name), `${kind}: ${name}`);
    animateCharacter(model, 0.2, true, true);
    assert.ok(model.getObjectByName('leg-left')!.rotation.x * model.getObjectByName('leg-right')!.rotation.x < 0);
    let meshes = 0;
    model.traverse(object => {
      if (!(object instanceof THREE.SkinnedMesh)) return;
      meshes++;
      assert.ok(Array.from(object.geometry.attributes.position.array).every(Number.isFinite));
      assert.equal((object.material as THREE.MeshStandardMaterial).vertexColors, true);
    });
    assert.ok(meshes > 0 && meshes <= 3);
    for (const name of ['broom', 'spam-phone', 'speaker', 'monday-calendar', 'proboscis']) assert.equal(model.getObjectByName(name), undefined);
  }
});

test('defense silhouettes fit pads and level three branches alter their weapon geometry', () => {
  for (const [kind, prop] of [['arrow', 'gatling'], ['cannon', 'mortar'], ['frost', 'cryo-emitter']] as const) {
    const branches = ['primary', 'secondary'] as const;
    const counts: number[] = [];
    for (const branch of branches) {
      const model = createDefense(kind, 3, new Map(), branch);
      assert.ok(model.getObjectByName(prop));
      assert.ok(model.getObjectByName('turret'));
      assert.ok(model.getObjectByName(`branch-${branch}`));
      model.updateMatrixWorld(true);
      let meshes = 0, vertices = 0;
      model.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        meshes++;
        const positions = object.geometry.attributes.position;
        vertices += positions.count;
        for (let i = 0; i < positions.count; i++) {
          const p = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
          assert.ok(Number.isFinite(p.y) && Math.hypot(p.x, p.z) <= 1.35, `${kind} footprint`);
        }
      });
      assert.ok(meshes <= 7);
      counts.push(vertices);
    }
    assert.notEqual(counts[0], counts[1], `${kind} branches need distinct geometry`);
    assert.equal(createDefense(kind, 2, new Map(), 'secondary').getObjectByName('branch-secondary'), undefined);
  }
});
