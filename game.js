import * as THREE from 'three';
import * as CANNON from 'cannon-es';

const BLOCK_HEIGHT = 0.25;
const ORIGINAL_BLOCK_SIZE = 1;

export class Game {
    constructor(scene, world, defaultMaterial, camera, callbacks) {
        this.scene = scene;
        this.world = world;
        this.defaultMaterial = defaultMaterial;
        this.camera = camera;
        this.callbacks = callbacks;

        this.stack = [];
        this.overhangs = [];
        this.activeBlock = null;
        this.gameState = 'loading';
    }

    start() {
        this.addBlock(0, 0, ORIGINAL_BLOCK_SIZE, ORIGINAL_BLOCK_SIZE, 'base');
        this.spawnNewBlock();
        this.gameState = 'playing';
    }

    restart() {
        this.overhangs.forEach(o => this.removeObject(o));
        this.stack.forEach(b => this.removeObject(b));
        if (this.activeBlock) {
            this.scene.remove(this.activeBlock);
            this.activeBlock.geometry.dispose();
            this.activeBlock.material.dispose();
            this.activeBlock = null;
        }

        this.stack = [];
        this.overhangs = [];

        this.camera.position.set(4, 4, 4);
        this.camera.lookAt(0, 0, 0);
    }

    removeObject(obj) {
        if (obj.mesh) {
            this.scene.remove(obj.mesh);
            obj.mesh.geometry.dispose();
            obj.mesh.material.dispose();
        }
        if (obj.body) this.world.removeBody(obj.body);
    }

    getState() {
        return this.gameState;
    }

    onPointerDown() {
        if (this.gameState === 'playing') {
            this.placeBlock();
        }
    }

    addBlock(x, z, width, depth, type) {
        const y = BLOCK_HEIGHT * this.stack.length;
        const geometry = new THREE.BoxGeometry(width, BLOCK_HEIGHT, depth);
        const color = new THREE.Color(`hsl(${this.stack.length * 8}, 70%, 50%)`);
        const material = new THREE.MeshLambertMaterial({ color });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        this.scene.add(mesh);

        if (type === 'active') {
            this.activeBlock = mesh;
        } else {
            const blockData = { mesh, width, depth };
            if (type !== 'base') {
                const shape = new CANNON.Box(new CANNON.Vec3(width / 2, BLOCK_HEIGHT / 2, depth / 2));
                const body = new CANNON.Body({ mass: 0, shape, position: new CANNON.Vec3(x, y, z), material: this.defaultMaterial });
                this.world.addBody(body);
                blockData.body = body;
            }
            this.stack.push(blockData);
        }
    }

    spawnNewBlock() {
        if (this.stack.length === 0) return;
        const prevBlock = this.stack[this.stack.length - 1];
        const direction = this.stack.length % 2 === 0 ? 'z' : 'x';
        const newWidth = prevBlock.width;
        const newDepth = prevBlock.depth;

        const x = direction === 'x' ? -2 : prevBlock.mesh.position.x;
        const z = direction === 'z' ? -2 : prevBlock.mesh.position.z;

        this.addBlock(x, z, newWidth, newDepth, 'active');
        this.activeBlock.userData.direction = direction;
        this.activeBlock.userData.speed = 0.02 + this.stack.length * 0.001;
    }

    placeBlock() {
        if (!this.activeBlock) return;

        const prevBlock = this.stack[this.stack.length - 1];
        const direction = this.activeBlock.userData.direction;

        let overlap, overhangSide;
        let newWidth, newDepth;

        if (direction === 'x') {
            const activePos = this.activeBlock.position.x;
            const prevPos = prevBlock.mesh.position.x;
            overlap = prevBlock.width - Math.abs(activePos - prevPos);
            overhangSide = activePos > prevPos ? 1 : -1;
            newWidth = overlap;
            newDepth = prevBlock.depth;
        } else {
            const activePos = this.activeBlock.position.z;
            const prevPos = prevBlock.mesh.position.z;
            overlap = prevBlock.depth - Math.abs(activePos - prevPos);
            overhangSide = activePos > prevPos ? 1 : -1;
            newWidth = prevBlock.width;
            newDepth = overlap;
        }

        if (overlap <= 0) {
            this.gameOver();
            return;
        }

        const newX = direction === 'x' ? (this.activeBlock.position.x + prevBlock.mesh.position.x) / 2 : prevBlock.mesh.position.x;
        const newZ = direction === 'z' ? (this.activeBlock.position.z + prevBlock.mesh.position.z) / 2 : prevBlock.mesh.position.z;

        this.scene.remove(this.activeBlock);
        this.addBlock(newX, newZ, newWidth, newDepth, 'stacked');

        const overhangWidth = direction === 'x' ? Math.abs(prevBlock.width - overlap) : prevBlock.width;
        const overhangDepth = direction === 'z' ? Math.abs(prevBlock.depth - overlap) : prevBlock.depth;

        if (overhangWidth > 0.01 && overhangDepth > 0.01) {
            this.createOverhang(overhangWidth, overhangDepth, newX, newZ, overlap, overhangSide);
        }

        this.callbacks.onScoreUpdate(this.stack.length - 1);
        this.spawnNewBlock();
    }

    createOverhang(width, depth, newX, newZ, overlap, side) {
        const direction = this.activeBlock.userData.direction;
        const y = this.activeBlock.position.y;

        const overhangX = direction === 'x' ? newX + (overlap / 2 * side) + (width / 2 * side) : newX;
        const overhangZ = direction === 'z' ? newZ + (overlap / 2 * side) + (depth / 2 * side) : newZ;

        const geometry = new THREE.BoxGeometry(width, BLOCK_HEIGHT, depth);
        const material = this.activeBlock.material.clone();
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(overhangX, y, overhangZ);
        this.scene.add(mesh);

        const shape = new CANNON.Box(new CANNON.Vec3(width / 2, BLOCK_HEIGHT / 2, depth / 2));
        const body = new CANNON.Body({
            mass: 1,
            shape,
            position: new CANNON.Vec3(overhangX, y, overhangZ),
            linearDamping: 0.1,
            angularDamping: 0.2,
            material: this.defaultMaterial
        });

        const speed = this.activeBlock.userData.speed;
        if (direction === 'x') {
            body.velocity.set(speed * 40 * side, -1, 0);
        } else {
            body.velocity.set(0, -1, speed * 40 * side);
        }

        this.world.addBody(body);

        this.overhangs.push({ 
            mesh, 
            body,
            spawnTime: Date.now(),
            stuckCounter: 0,
            originalColor: material.color.clone()
        });
    }

    gameOver() {
        this.gameState = 'gameover';

        if (this.activeBlock) {
            const { width, depth } = this.activeBlock.geometry.parameters;
            const shape = new CANNON.Box(new CANNON.Vec3(width / 2, BLOCK_HEIGHT / 2, depth / 2));
            const body = new CANNON.Body({ mass: 1, shape, position: new CANNON.Vec3().copy(this.activeBlock.position) });
            body.velocity.x = this.activeBlock.userData.speed * 50;
            this.world.addBody(body);

            this.overhangs.push({ mesh: this.activeBlock, body: body, spawnTime: Date.now() });
            this.activeBlock = null;
        }
        this.callbacks.onGameOver(this.stack.length - 1);
    }

    update() {
        if (this.gameState === 'playing' && this.activeBlock) {
            this.updateActiveBlock();
        }
        this.updateOverhangs();
    }

    updateActiveBlock() {
        const speed = this.activeBlock.userData.speed;
        if (this.activeBlock.userData.direction === 'x') {
            this.activeBlock.position.x += speed;
            if (this.activeBlock.position.x > 2 || this.activeBlock.position.x < -2) {
                this.activeBlock.userData.speed *= -1;
            }
        } else {
            this.activeBlock.position.z += speed;
            if (this.activeBlock.position.z > 2 || this.activeBlock.position.z < -2) {
                this.activeBlock.userData.speed *= -1;
            }
        }

        const targetCameraY = BLOCK_HEIGHT * this.stack.length + 4;
        this.camera.position.y += (targetCameraY - this.camera.position.y) * 0.1;
        this.camera.lookAt(0, this.stack.length * BLOCK_HEIGHT * 0.5, 0);
    }

    updateOverhangs() {
        const newOverhangs = [];
        for (const overhang of this.overhangs) {
            if (this.handleStuckOrFallen(overhang)) {
                newOverhangs.push(overhang);
            }
        }
        this.overhangs = newOverhangs;
    }

    handleStuckOrFallen(overhang) {
        overhang.mesh.position.copy(overhang.body.position);
        overhang.mesh.quaternion.copy(overhang.body.quaternion);

        // Particle logic
        if (overhang.life !== undefined) {
            overhang.life--;
            if (overhang.life <= 0 || overhang.mesh.position.y < -10) {
                this.removeObject(overhang);
                return false;
            }
            return true;
        }

        // Off-screen cleanup
        if (overhang.mesh.position.y < -10) {
            this.removeObject(overhang);
            return false;
        }

        // Stuck logic
        const timeSinceSpawn = Date.now() - overhang.spawnTime;
        const hasntFallenMuch = overhang.body.position.y >= overhang.mesh.position.y - 0.3;

        if (timeSinceSpawn > 1500 && hasntFallenMuch) {
            const particles = this.shatterBlock(overhang);
            this.overhangs.push(...particles);
            this.removeObject(overhang);
            return false;
        }

        return true;
    }

    shatterBlock(overhang) {
        const particleCount = 20;
        const particles = [];
        const color = overhang.originalColor || overhang.mesh.material.color;

        for (let i = 0; i < particleCount; i++) {
            const size = Math.random() * 0.08 + 0.04;
            const geometry = new THREE.BoxGeometry(size, size, size);
            const material = new THREE.MeshLambertMaterial({ color });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.copy(overhang.mesh.position);
            this.scene.add(mesh);

            const shape = new CANNON.Box(new CANNON.Vec3(size / 2, size / 2, size / 2));
            const body = new CANNON.Body({
                mass: 0.1,
                shape,
                position: new CANNON.Vec3().copy(overhang.mesh.position),
                linearDamping: 0.3,
                angularDamping: 0.3,
                collisionFilterGroup: 2, // Don't collide with anything
                collisionFilterMask: 0
            });

            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 3 + 2;
            body.velocity.set(
                Math.cos(angle) * speed,
                Math.random() * 2 + 1,
                Math.sin(angle) * speed
            );

            this.world.addBody(body);
            particles.push({ mesh, body, life: 120 });
        }
        return particles;
    }
}